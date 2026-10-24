#!/usr/bin/env node
'use strict';

/**
 * 塊ごとの Stryker 報告を、1 つの `reports/mutation/mutation.json` へ併合する。
 *
 * ## なぜ要るか (2026-09-30 · パス 501e)
 *
 * 週次の全掃引は、全件を 1 つの job で測る形が **6 時間で cancel された**
 * (2026-09-27 の #172・対象は 304 本・45,547 変異体)。push 側は 501d で対象を
 * 行数で塊に分けて別々の job で測るようにしたので、週次・手動も同じ塊
 * (`scripts/mutate-changed.cjs --all --chunks`) で測る。ところが塊ごとに報告が
 * 別々になり、報告を読む 4 つの道具は 1 つのファイルを前提にしている:
 *
 *   - `scripts/quality-report.cjs`  — `docs/QUALITY.md` の表と分母の範囲
 *   - `scripts/triage-mutations.cjs` / `scripts/suggest-next-kill.cjs` — 生存の一覧
 *   - `scripts/verify-survivors.cjs` — 生存の当て直し
 *
 * この 4 つが読むのは `files[].mutants[]` の status / location / replacement /
 * mutatorName・`coveredBy` の長さ・`config.mutate` だけなので、塊の報告を**その形の
 * まま 1 つに戻す**。
 *
 * ## 守ること
 *
 * 1. **揃っていない併合を「全体」と名乗らせない** — 塊が欠ける・`mutate` の一部が
 *    どの塊にも無いときは何も書かず落ちる (`--allow-partial` は手元の試しだけ)。
 *    欠けた塊を黙って落として点数を出すと、生存を含む塊ほど欠けやすいので
 *    **点数が実物より良く出る**。
 * 2. **併合した報告は `.stryker-incremental.json` として使わない** — 差分検査は
 *    変異体の id でテストを引くが、併合は 1 回の実行ではない。
 * 3. **上書きも連結もしない** — 同じ鍵が 2 つの塊に在れば落とす。
 * 4. 併合した時刻は `mergedAt` に持つ (`gh run download` は mtime を保たないので、
 *    最大 90 日前の併合報告が「今日の日時」として頁に載るのを防ぐ)。
 *
 * ## 使い方
 *
 *   node scripts/merge-mutation-reports.cjs --self-test
 *   node scripts/merge-mutation-reports.cjs --dir chunk-reports --out reports/mutation/mutation.json \
 *       [--expect-chunks N] [--chunks-result success|failure|cancelled|skipped] \
 *       [--config stryker.config.json] [--allow-partial]
 *   node scripts/merge-mutation-reports.cjs --files a.json b.json --out reports/mutation/mutation.json --allow-partial
 *
 * `--dir` は `download-artifact` の置き方 (`<dir>/<artifact 名>/mutation.json`) を
 * 再帰で探す。`--files` は手元で塊を順に測ったとき。
 *
 * 終了コード: 0 = 併合でき判定も通った / 1 = 構造が揃わず何も書かなかった、または
 * 書いたが判定が赤 (塊の失敗・全体の点数が break 未満) / 2 = 使い方の誤り。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** Stryker 9.6.1 の報告の鍵の並び。併合報告はこの並びの後ろに `mergedAt` を足す。 */
const REPORT_KEYS = ['files', 'schemaVersion', 'thresholds', 'testFiles', 'projectRoot', 'config', 'framework'];

/** 1 つの塊の報告を読む前の大きさの門。実測は 1 塊 10 MB 前後。 */
const MAX_REPORT_BYTES = 256 * 1024 * 1024;

/** config の比較から外す鍵。塊ごとに違うのは `mutate` だけ。 */
const IGNORED_CONFIG_KEYS = new Set(['mutate']);

/** `mutation.yml` の全件の塊の artifact 名。 */
const CHUNK_LABEL = /^mutation-report-full-chunk-(\d+)$/;

/** 数字の並びを数として比べる (chunk-2 < chunk-10)。入力の順序に依らない並びのため。 */
function naturalCompare(a, b) {
  const pa = String(a).match(/\d+|\D+/g) || [];
  const pb = String(b).match(/\d+|\D+/g) || [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (/^\d/.test(x) && /^\d/.test(y)) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** 鍵をソートして直列化する (比較用)。 */
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * `mutate` の項が実在するファイルのパスの形か (glob と `:行` を含まない)。
 * `scripts/quality-report.cjs` の同名の関数と同じ規則 —— 併合報告が
 * quality-report から「比べられる形」に見えるための写しで、同じ標本を両方へ通して
 * 一致を `mergeMutationReports.test.ts` が留める。
 */
function isLiteralPath(p) {
  return typeof p === 'string' && p.length > 0 && !/[*?{}[\]!]/.test(p) && !/:\d/.test(p);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** dir を再帰で歩き、名前が mutation.json のファイルを集める (label の natural order)。 */
function findChunkReports(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return; // dir が無い = 0 件。main が「塊の報告が 0 件」を名指しして落とす。
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'mutation.json') out.push(p);
    }
  };
  walk(dir);
  return out.sort((a, b) => naturalCompare(labelOf(a), labelOf(b)) || naturalCompare(a, b));
}

/** 塊の名前。`<dir>/<artifact 名>/mutation.json` なら artifact 名、それ以外は basename。 */
function labelOf(p) {
  const base = path.basename(p);
  return base === 'mutation.json' ? path.basename(path.dirname(p)) : base;
}

/**
 * 塊の報告を読む。**例外を投げず**、読めなかった物は problems に積む
 * (呼び出し側が全部を 1 度に表示して落とせるように)。
 */
function readChunkReports(paths) {
  const chunks = [];
  const problems = [];
  const seen = new Set();
  for (const p of paths) {
    const label = labelOf(p);
    if (seen.has(label)) {
      problems.push(`${label}: 塊の名前が重複しています (${p})`);
      continue;
    }
    seen.add(label);
    let size;
    try {
      size = fs.statSync(p).size;
    } catch (e) {
      problems.push(`${label}: 報告を読めません (${e.message})`);
      continue;
    }
    if (size > MAX_REPORT_BYTES) {
      problems.push(`${label}: 報告が ${size} byte あり、読む前の上限 ${MAX_REPORT_BYTES} を超えます`);
      continue;
    }
    let report;
    try {
      report = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      problems.push(`${label}: 報告が JSON として読めません (${e.message})`);
      continue;
    }
    if (!isObject(report) || !isObject(report.files)) {
      problems.push(`${label}: 報告の形が違います (files が object ではありません)`);
      continue;
    }
    chunks.push({ label, report });
  }
  return { chunks, problems };
}

/** id の型 (number / string) を保って n 番目の id を作る。 */
function idLike(sample, n) {
  return typeof sample === 'number' ? n : String(n);
}

/**
 * 塊の報告を 1 つへ併合する。
 *
 * 返り値の fatal は構造の矛盾 (何も書かない)・partial は揃っていない (allowPartial なら
 * warnings へ降格して書く)・warnings は読み手に影響しない食い違い。
 *
 * @param opts.expectMutate  scope が測ると言った全件 (config の mutate)
 * @param opts.expectChunks  scope が出した塊の数
 * @param opts.allowPartial  揃っていなくても書く (手元の試し)
 * @param opts.nowIso        併合の時刻 (self-test の差し込み口)
 */
function mergeReports(chunkList, opts = {}) {
  const fatal = [];
  const partial = [];
  const warnings = [];
  const chunks = [...chunkList].sort((a, b) => naturalCompare(a.label, b.label));
  const stats = { chunks: chunks.length, files: 0, mutants: 0, tests: 0, dropped: 0 };
  const result = () => ({ report: null, fatal, partial, warnings, stats });

  // 1. 形
  for (const { label, report } of chunks) {
    if (!isObject(report.files)) fatal.push(`${label}: files が object ではありません`);
    if (!isObject(report.testFiles)) fatal.push(`${label}: testFiles が object ではありません`);
    const mut = report.config && report.config.mutate;
    if (!Array.isArray(mut) || mut.length === 0 || !mut.every(isLiteralPath)) {
      fatal.push(`${label}: config.mutate がファイルのパスの配列ではありません (glob や :行 を含む・空)`);
    }
    for (const k of ['schemaVersion', 'thresholds', 'framework']) {
      if (report[k] === undefined) fatal.push(`${label}: ${k} がありません`);
    }
  }
  if (chunks.length === 0) fatal.push('塊の報告が 0 件です');
  if (fatal.length > 0) return result();

  // 2. 一貫性 (最初の塊が基準)
  const base = chunks[0];
  const cfgOf = (r) => {
    const c = {};
    for (const k of Object.keys(r.config)) if (!IGNORED_CONFIG_KEYS.has(k)) c[k] = r.config[k];
    return c;
  };
  const frameworkOf = (r) => `${r.framework && r.framework.name}@${r.framework && r.framework.version}`;
  for (const { label, report } of chunks.slice(1)) {
    if (report.schemaVersion !== base.report.schemaVersion) {
      fatal.push(`${label}: schemaVersion が ${base.label} と違います (${report.schemaVersion} / ${base.report.schemaVersion})`);
    }
    if (stableJson(report.thresholds) !== stableJson(base.report.thresholds)) {
      fatal.push(`${label}: thresholds が ${base.label} と違います`);
    }
    if (frameworkOf(report) !== frameworkOf(base.report)) {
      fatal.push(`${label}: framework の版が ${base.label} と違います (${frameworkOf(report)} / ${frameworkOf(base.report)})`);
    }
    const a = cfgOf(report);
    const b = cfgOf(base.report);
    if (stableJson(a) !== stableJson(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stableJson(a[k]) !== stableJson(b[k]));
      fatal.push(`${label}: config が ${base.label} と違います (mutate 以外: ${keys.join(' , ')})`);
    }
    if (report.projectRoot !== base.report.projectRoot) {
      warnings.push(`${label}: projectRoot が ${base.label} と違います (どの道具も読みません)`);
    }
  }
  if (fatal.length > 0) return result();

  // 3. mutate は塊どうしで互いに素
  const owner = new Map();
  for (const { label, report } of chunks) {
    for (const f of report.config.mutate) {
      if (owner.has(f)) fatal.push(`${f}: config.mutate が ${owner.get(f)} と ${label} で重なっています (塊は互いに素のはず)`);
      else owner.set(f, label);
    }
  }
  const union = [...owner.keys()].sort();

  // 4. files: 自分の塊の mutate に無い鍵は落とす。
  //    (同じ鍵が 2 塊に在る形は、3 の mutate の重なりか、この規則のどちらかで必ず落ちる —— 上書きも連結もしない)
  const fileOwner = new Map();
  for (const { label, report } of chunks) {
    const own = new Set(report.config.mutate);
    for (const f of Object.keys(report.files)) {
      if (!own.has(f)) fatal.push(`${label}: files に config.mutate に無い ${f} が在ります`);
      fileOwner.set(f, label);
    }
  }
  if (fatal.length > 0) return result();

  // 5. testFiles: path の和集合・test は (path, name, location, 通し番号) で畳み新しい id を振る
  const testFiles = {};
  const testIds = new Map(); // `${path}\0${key}` → 新 id
  const idMaps = new Map(); // label → Map(旧 id 文字列 → 新 id)
  let nextTest = 0;
  for (const { label, report } of chunks) {
    const idMap = new Map();
    idMaps.set(label, idMap);
    for (const [p, tf] of Object.entries(report.testFiles)) {
      if (!isObject(tf)) continue;
      const cur = testFiles[p];
      if (cur === undefined) {
        testFiles[p] = { ...tf, tests: [] };
      } else if (tf.source !== undefined && cur.source !== undefined && tf.source !== cur.source) {
        fatal.push(`${p}: testFiles の source が ${label} と別の塊で違います (別のコミットが混ざっています)`);
        continue;
      }
      const seenInChunk = new Map();
      for (const t of Array.isArray(tf.tests) ? tf.tests : []) {
        const loc = stableJson(t.location === undefined ? null : t.location);
        const bare = `${p}\0${t.name}\0${loc}`;
        const nth = seenInChunk.get(bare) || 0;
        seenInChunk.set(bare, nth + 1);
        const key = `${bare}\0${nth}`;
        let id = testIds.get(key);
        if (id === undefined) {
          id = String(nextTest);
          nextTest += 1;
          testIds.set(key, id);
          testFiles[p].tests.push({ ...t, id });
        }
        idMap.set(String(t.id), id);
      }
    }
  }
  if (fatal.length > 0) return result();
  stats.tests = nextTest;

  // 6. mutants: files を鍵のソート順に歩き、id を 0 から振り直す
  const files = {};
  let nextMutant = 0;
  for (const f of [...fileOwner.keys()].sort()) {
    const label = fileOwner.get(f);
    const chunk = chunks.find((c) => c.label === label);
    const map = idMaps.get(label);
    const src = chunk.report.files[f];
    const mutants = [];
    for (const m of Array.isArray(src.mutants) ? src.mutants : []) {
      const out = { ...m, id: idLike(m.id, nextMutant) };
      nextMutant += 1;
      for (const k of ['coveredBy', 'killedBy']) {
        if (!Array.isArray(m[k])) continue;
        const kept = [];
        for (const id of m[k]) {
          const mapped = map.get(String(id));
          if (mapped === undefined) stats.dropped += 1;
          else kept.push(mapped);
        }
        out[k] = kept;
      }
      mutants.push(out);
    }
    files[f] = { ...src, mutants };
  }
  stats.files = Object.keys(files).length;
  stats.mutants = nextMutant;
  if (stats.dropped > 0) {
    warnings.push(`テストの参照 ${stats.dropped} 件が、その塊の testFiles に無いので落としました (どの道具も中身を読みません)`);
  }

  // 7. 揃っているか
  if (opts.expectChunks !== undefined && chunks.length !== opts.expectChunks) {
    partial.push(`塊が ${chunks.length} 個しか集まっていません (期待 ${opts.expectChunks}・失敗した塊は Re-run failed jobs で回し直せます)`);
  }
  const nums = chunks.map((c) => CHUNK_LABEL.exec(c.label));
  if (opts.expectChunks !== undefined && nums.every((m) => m !== null)) {
    const have = new Set(nums.map((m) => Number(m[1])));
    const missing = [];
    for (let i = 0; i < opts.expectChunks; i += 1) if (!have.has(i)) missing.push(i);
    if (missing.length > 0) partial.push(`塊 ${missing.join(' , ')} の報告がありません`);
  }
  if (opts.expectMutate !== undefined) {
    const have = new Set(union);
    const want = new Set(opts.expectMutate);
    const absent = [...want].filter((f) => !have.has(f)).sort();
    const extra = [...have].filter((f) => !want.has(f)).sort();
    if (extra.length > 0) {
      fatal.push(`併合した mutate に、scope が測ると言っていない本が ${extra.length} 本あります (scope と merge で木が違います): ${extra.slice(0, 20).join(' , ')}`);
    }
    if (absent.length > 0) {
      const shown = absent.slice(0, 20).join(' , ');
      partial.push(
        `mutate の ${absent.length} 本がどの塊にも入っていません: ${shown}${absent.length > 20 ? ` ほか ${absent.length - 20} 本` : ''} ` +
          '(落ちた塊だけ Re-run failed jobs で回し直せます)',
      );
    }
  }
  if (fatal.length > 0) return result();
  if (partial.length > 0 && opts.allowPartial !== true) return result();
  if (partial.length > 0) {
    for (const p of partial.splice(0)) warnings.push(`(--allow-partial) ${p}`);
  }

  // 8. 組み立て
  const assembled = {
    files,
    schemaVersion: base.report.schemaVersion,
    thresholds: base.report.thresholds,
    testFiles,
    projectRoot: base.report.projectRoot,
    config: { ...base.report.config, mutate: union },
    framework: base.report.framework,
  };
  const ordered = {};
  for (const k of REPORT_KEYS) if (assembled[k] !== undefined) ordered[k] = assembled[k];
  ordered.mergedAt = opts.nowIso === undefined ? new Date().toISOString() : opts.nowIso;
  return { report: ordered, fatal, partial, warnings, stats };
}

/** status ごとに数え、点数を出す。Ignored と無効 (RuntimeError / CompileError) は分母から外す。 */
function scoreOf(report) {
  const c = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, ignored: 0, invalid: 0 };
  for (const f of Object.values(report.files || {})) {
    for (const m of f.mutants || []) {
      if (m.status === 'Killed') c.killed += 1;
      else if (m.status === 'Timeout') c.timeout += 1;
      else if (m.status === 'Survived') c.survived += 1;
      else if (m.status === 'NoCoverage') c.noCoverage += 1;
      else if (m.status === 'Ignored') c.ignored += 1;
      else if (m.status === 'RuntimeError' || m.status === 'CompileError') c.invalid += 1;
    }
  }
  const denom = c.killed + c.timeout + c.survived + c.noCoverage;
  return { ...c, denom, pct: denom > 0 ? (100 * (c.killed + c.timeout)) / denom : null };
}

/** 判定 (verdict の配列)。空なら通過。 */
function judgeMerge({ score, breakThreshold, chunksResult }) {
  const out = [];
  if (chunksResult !== undefined && chunksResult !== 'success') {
    out.push(`mutate-full の結果が ${chunksResult} です (塊が失敗している)`);
  }
  if (typeof score.pct === 'number' && typeof breakThreshold === 'number' && score.pct < breakThreshold) {
    out.push(`全体の点数 ${score.pct.toFixed(2)}% が break ${breakThreshold}% 未満です`);
  }
  return out;
}

/** `$GITHUB_STEP_SUMMARY` へ足す markdown (4 KB 未満・全体 + 塊ごと 1 行)。 */
function renderSummary({ stats, score, breakThreshold, rows, verdicts }) {
  const lines = ['### 変異検査 (全件・併合)', ''];
  lines.push(
    `塊 ${stats.chunks} / ファイル ${stats.files} / 変異体 ${stats.mutants} / テスト ${stats.tests} — ` +
      `点数 ${typeof score.pct === 'number' ? `${score.pct.toFixed(2)}%` : '—'} (break ${breakThreshold ?? '—'}%)`,
  );
  lines.push(`Killed ${score.killed} / Timeout ${score.timeout} / Survived ${score.survived} / NoCoverage ${score.noCoverage} / Ignored ${score.ignored}`);
  if (verdicts.length > 0) {
    lines.push('', ...verdicts.map((v) => `- ❌ ${v}`));
  }
  lines.push('', '| 塊 | ファイル | 変異体 | Killed+Timeout | 生存 |', '| --- | ---: | ---: | ---: | ---: |');
  const MAX_ROWS = 60;
  for (const r of rows.slice(0, MAX_ROWS)) {
    lines.push(`| ${r.label} | ${r.files} | ${r.mutants} | ${r.killed} | ${r.survived} |`);
  }
  if (rows.length > MAX_ROWS) lines.push(`| … | | | | ほか ${rows.length - MAX_ROWS} 塊 |`);
  return `${lines.join('\n')}\n`;
}

const USAGE =
  'usage: merge-mutation-reports.cjs --dir <dir> --out <path> [--expect-chunks N] [--chunks-result R] [--config <path>] [--allow-partial]\n' +
  '       merge-mutation-reports.cjs --files <a.json> [<b.json> ...] --out <path> [--allow-partial]\n' +
  '       merge-mutation-reports.cjs --self-test\n';

const RESULT_WORDS = new Set(['success', 'failure', 'cancelled', 'skipped']);

function parseArgs(argv) {
  const o = { files: [], allowPartial: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--allow-partial') o.allowPartial = true;
    else if (a === '--dir' || a === '--out' || a === '--expect-chunks' || a === '--chunks-result' || a === '--config') {
      i += 1;
      if (i >= argv.length) return { error: `${a} に値がありません` };
      o[a.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = argv[i];
    } else if (a === '--files') {
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        i += 1;
        o.files.push(argv[i]);
      }
    } else {
      return { error: `知らない引数です: ${a}` };
    }
  }
  return { args: o };
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const parsed = parseArgs(argv);
  if (parsed.error !== undefined) {
    process.stderr.write(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const args = parsed.args;
  if (args.out === undefined || (args.dir === undefined && args.files.length === 0)) {
    process.stderr.write(USAGE);
    return 2;
  }
  if (args.chunksResult !== undefined && !RESULT_WORDS.has(args.chunksResult)) {
    process.stderr.write(`--chunks-result は ${[...RESULT_WORDS].join(' / ')} のどれかです\n${USAGE}`);
    return 2;
  }
  let expectChunks;
  if (args.expectChunks !== undefined) {
    if (!/^[1-9]\d*$/.test(args.expectChunks)) {
      process.stderr.write(`--expect-chunks は正の整数です (受け取った値: ${JSON.stringify(args.expectChunks)})\n`);
      return 1;
    }
    expectChunks = Number(args.expectChunks);
  }

  const paths = args.files.length > 0 ? args.files : findChunkReports(args.dir);
  if (paths.length === 0) {
    process.stderr.write('塊の報告が 0 件です (download-artifact が何も置かなかった・塊が全部落ちた可能性)\n');
    return 1;
  }
  const read = readChunkReports(paths);
  if (read.problems.length > 0) {
    for (const p of read.problems) process.stderr.write(`❌ ${p}\n`);
    process.stderr.write('報告が読めない塊があるので何も書きません\n');
    return 1;
  }

  let expectMutate;
  try {
    const cfg = JSON.parse(fs.readFileSync(args.config || path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
    if (!Array.isArray(cfg.mutate) || cfg.mutate.length === 0) throw new Error('mutate が配列でないか空です');
    expectMutate = cfg.mutate;
  } catch (e) {
    process.stderr.write(`stryker.config.json の mutate を読めません: ${e.message}\n`);
    return 1;
  }

  const merged = mergeReports(read.chunks, { expectMutate, expectChunks, allowPartial: args.allowPartial });
  for (const w of merged.warnings) process.stderr.write(`⚠ ${w}\n`);
  if (merged.fatal.length > 0) {
    for (const f of merged.fatal) process.stderr.write(`❌ ${f}\n`);
    process.stderr.write('併合できないので何も書きません\n');
    return 1;
  }
  if (merged.partial.length > 0) {
    for (const p of merged.partial) process.stderr.write(`❌ ${p}\n`);
    process.stderr.write('揃っていないので何も書きません (手元の試しなら --allow-partial)\n');
    return 1;
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged.report));
  fs.renameSync(tmp, outPath);

  if (fs.existsSync(path.join(REPO_ROOT, '.stryker-incremental.json'))) {
    process.stderr.write(
      '⚠ .stryker-incremental.json が在ります。verify-survivors は incremental を先に読むので、併合報告を読むなら rm してください\n',
    );
  }

  const score = scoreOf(merged.report);
  const breakThreshold = merged.report.thresholds && merged.report.thresholds.break;
  const rows = read.chunks.map(({ label, report }) => {
    const s = scoreOf(report);
    return {
      label,
      files: Object.keys(report.files).length,
      mutants: Object.values(report.files).reduce((acc, f) => acc + (f.mutants || []).length, 0),
      killed: s.killed + s.timeout,
      survived: s.survived + s.noCoverage,
    };
  });
  for (const r of rows) {
    process.stdout.write(`${r.label}: files ${r.files} / mutants ${r.mutants} / killed ${r.killed} / survived ${r.survived}\n`);
  }
  const st = merged.stats;
  process.stdout.write(
    `併合: chunks ${st.chunks} / files ${st.files} / mutants ${st.mutants} / tests ${st.tests} / ` +
      `score ${typeof score.pct === 'number' ? `${score.pct.toFixed(2)}%` : '—'} (break ${breakThreshold ?? '—'}%)\n`,
  );

  const verdicts = judgeMerge({ score, breakThreshold, chunksResult: args.chunksResult });
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      fs.appendFileSync(summaryPath, renderSummary({ stats: st, score, breakThreshold, rows, verdicts }));
    } catch (e) {
      process.stderr.write(`⚠ step summary へ書けませんでした: ${e.message}\n`);
    }
  }
  if (verdicts.length > 0) {
    for (const v of verdicts) process.stderr.write(`❌ ${v}\n`);
    return 1;
  }
  return 0;
}

/** 合成の 1 塊。files は { path: [{ status, coveredBy, killedBy }] }・tests は { testPath: [{ id, name }] }。 */
function mk(spec) {
  const files = {};
  for (const [p, muts] of Object.entries(spec.files || {})) {
    files[p] = {
      language: 'typescript',
      source: '',
      mutants: muts.map((m, i) => ({
        id: spec.numericIds ? i : String(i),
        mutatorName: 'BlockStatement',
        replacement: '{}',
        status: m.status || 'Killed',
        static: false,
        ...(m.coveredBy ? { coveredBy: m.coveredBy } : {}),
        ...(m.killedBy ? { killedBy: m.killedBy } : {}),
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
      })),
    };
  }
  const testFiles = {};
  for (const [p, ts] of Object.entries(spec.tests || {})) {
    testFiles[p] = { ...(spec.testSource === undefined ? {} : { source: spec.testSource }), tests: ts.map((t) => ({ id: t.id, name: t.name })) };
  }
  return {
    label: spec.label,
    report: {
      files,
      schemaVersion: spec.schemaVersion === undefined ? '1.0' : spec.schemaVersion,
      thresholds: spec.thresholds || { high: 100, low: 99.9, break: 99.8 },
      testFiles,
      projectRoot: spec.projectRoot === undefined ? '/work' : spec.projectRoot,
      config: { mutate: spec.mutate || Object.keys(files), timeoutMS: 30000, ...(spec.config || {}) },
      framework: { name: 'StrykerJS', version: spec.frameworkVersion || '9.6.1', branding: {} },
    },
  };
}

function selfTest() {
  const NOW = '2026-01-01T00:00:00.000Z';
  const merge = (chunks, opts) => mergeReports(chunks, { nowIso: NOW, ...(opts || {}) });
  const mutantsOf = (report, f) => report.files[f].mutants;
  const testNameOf = (report, id) => {
    for (const tf of Object.values(report.testFiles)) for (const t of tf.tests) if (t.id === id) return t.name;
    return undefined;
  };
  const A = () => mk({ label: 'chunk-a', files: { 'src/a.ts': [{ status: 'Killed', killedBy: ['0'] }, { status: 'Survived' }] }, tests: { 't/a.test.ts': [{ id: '0', name: 'テスト甲' }] } });
  const B = () => mk({ label: 'chunk-b', files: { 'src/b.ts': [{ status: 'Killed', killedBy: ['0'] }] }, tests: { 't/b.test.ts': [{ id: '0', name: 'テスト乙' }] } });
  const cases = [
    [
      '互いに素な 2 塊 → 和集合・ソート済みの mutate・鍵の順は REPORT_KEYS + mergedAt',
      () => {
        const r = merge([B(), A()]);
        if (r.fatal.length > 0 || r.report === null) return `fatal ${JSON.stringify(r.fatal)}`;
        const keys = Object.keys(r.report).join(',');
        const want = [...REPORT_KEYS, 'mergedAt'].join(',');
        if (keys !== want) return `鍵の並び ${keys}`;
        if (JSON.stringify(Object.keys(r.report.files)) !== '["src/a.ts","src/b.ts"]') return 'files の並び';
        if (JSON.stringify(r.report.config.mutate) !== '["src/a.ts","src/b.ts"]') return 'config.mutate';
        return r.report.mergedAt === NOW ? true : 'mergedAt';
      },
    ],
    [
      '同じ files の鍵が 2 塊に在る (mutate も重なる) → fatal (両方の塊を名指し)',
      () => {
        const dup = mk({ label: 'chunk-c', files: { 'src/a.ts': [{}] }, mutate: ['src/a.ts'] });
        const r = merge([A(), dup]);
        return r.report === null && r.fatal.some((f) => f.includes('chunk-a') && f.includes('chunk-c')) ? true : JSON.stringify(r.fatal);
      },
    ],
    [
      'expectMutate の本がどの塊にも無い → partial (fatal ではない)・allowPartial で warnings へ降格して書く',
      () => {
        const r = merge([A(), B()], { expectMutate: ['src/a.ts', 'src/b.ts', 'src/z.ts'] });
        if (r.fatal.length > 0 || r.report !== null || !r.partial.some((p) => p.includes('src/z.ts'))) return JSON.stringify(r);
        const ok = merge([A(), B()], { expectMutate: ['src/a.ts', 'src/b.ts', 'src/z.ts'], allowPartial: true });
        return ok.report !== null && ok.partial.length === 0 && ok.warnings.some((w) => w.includes('src/z.ts')) ? true : '降格しない';
      },
    ],
    [
      '併合した config.mutate は塊の和集合 (scope が測ると言った全件の写しではない)',
      () => {
        const r = merge([A(), B()], { expectMutate: ['src/a.ts', 'src/b.ts', 'src/z.ts'], allowPartial: true });
        return JSON.stringify(r.report && r.report.config.mutate) === '["src/a.ts","src/b.ts"]' ? true : JSON.stringify(r.report && r.report.config.mutate);
      },
    ],
    [
      '塊の数が期待より少ない → partial / expectChunks が数でない → 使い方の誤りではなく main が exit 1',
      () => {
        const r = merge([A(), B()], { expectChunks: 3 });
        if (r.report !== null || !r.partial.some((p) => p.includes('2 個'))) return JSON.stringify(r.partial);
        const empty = main(['--files', 'x.json', '--out', 'y.json', '--expect-chunks', '']);
        const word = main(['--files', 'x.json', '--out', 'y.json', '--expect-chunks', 'x']);
        return empty === 1 && word === 1 ? true : `exit ${empty} / ${word}`;
      },
    ],
    [
      'label の番号が 0..N-1 に届かない (chunk-3 が無い) → partial が 3 を名指し',
      () => {
        const cs = [0, 1, 2, 4].map((n) => mk({ label: `mutation-report-full-chunk-${n}`, files: { [`src/f${n}.ts`]: [{}] } }));
        const r = merge(cs, { expectChunks: 5 });
        return r.report === null && r.partial.some((p) => p.includes('塊 3 ')) ? true : JSON.stringify(r.partial);
      },
    ],
    [
      'テストの id が 2 塊で衝突 (どちらも 0 で別のテスト) → 併合後は別の id・killedBy はその塊のテスト名を指す',
      () => {
        const r = merge([A(), B()]);
        const ka = mutantsOf(r.report, 'src/a.ts')[0].killedBy[0];
        const kb = mutantsOf(r.report, 'src/b.ts')[0].killedBy[0];
        if (ka === kb) return `同じ id ${ka}`;
        return testNameOf(r.report, ka) === 'テスト甲' && testNameOf(r.report, kb) === 'テスト乙' ? true : '名前が合わない';
      },
    ],
    [
      '同じ (path, name) のテストが塊をまたいで在る → 1 つの id に畳む・同じ塊の中の同名 2 件は 2 つの id のまま',
      () => {
        const x = mk({ label: 'chunk-x', files: { 'src/x.ts': [{ coveredBy: ['0', '1'] }] }, tests: { 't/s.test.ts': [{ id: '0', name: '同名' }, { id: '1', name: '同名' }] } });
        const y = mk({ label: 'chunk-y', files: { 'src/y.ts': [{ coveredBy: ['0'] }] }, tests: { 't/s.test.ts': [{ id: '0', name: '同名' }] } });
        const r = merge([x, y]);
        const cx = mutantsOf(r.report, 'src/x.ts')[0].coveredBy;
        const cy = mutantsOf(r.report, 'src/y.ts')[0].coveredBy;
        if (cx.length !== 2 || cx[0] === cx[1]) return `塊内の同名が潰れた ${JSON.stringify(cx)}`;
        return cy[0] === cx[0] && r.report.testFiles['t/s.test.ts'].tests.length === 2 ? true : `畳まれない ${JSON.stringify([cx, cy])}`;
      },
    ],
    [
      'killedBy が塊の testFiles に無い id → 落とさず warnings・配列から落ちる',
      () => {
        const bad = mk({ label: 'chunk-d', files: { 'src/d.ts': [{ status: 'Killed', killedBy: ['9'] }] } });
        const r = merge([bad]);
        return r.report !== null && mutantsOf(r.report, 'src/d.ts')[0].killedBy.length === 0 && r.stats.dropped === 1 && r.warnings.length === 1 ? true : JSON.stringify(r.stats);
      },
    ],
    [
      'mutant の id は 0 から密・元の型を保つ (文字列は文字列・数は数)・重複なし',
      () => {
        const num = mk({ label: 'chunk-n', numericIds: true, files: { 'src/n.ts': [{}, {}] } });
        const r = merge([A(), num]);
        const ids = Object.values(r.report.files).flatMap((f) => f.mutants.map((m) => m.id));
        const nums = mutantsOf(r.report, 'src/n.ts').map((m) => m.id);
        if (new Set(ids).size !== ids.length) return '重複';
        return typeof mutantsOf(r.report, 'src/a.ts')[0].id === 'string' && nums.every((n) => typeof n === 'number') && ids.map(String).join() === '0,1,2,3' ? true : JSON.stringify(ids);
      },
    ],
    [
      'schemaVersion / thresholds / framework の版が違う → それぞれ fatal',
      () => {
        const v = merge([A(), { ...B(), report: { ...B().report, schemaVersion: '2.0' } }]);
        const t = merge([A(), mk({ label: 'chunk-b', files: { 'src/b.ts': [{}] }, thresholds: { high: 90, low: 80, break: 50 } })]);
        const f = merge([A(), mk({ label: 'chunk-b', files: { 'src/b.ts': [{}] }, frameworkVersion: '9.7.0' })]);
        return [v, t, f].every((r) => r.report === null && r.fatal.length > 0) ? true : JSON.stringify([v.fatal, t.fatal, f.fatal]);
      },
    ],
    [
      'testFiles の source が塊間で違う → fatal (別のコミットの混在)',
      () => {
        const p = mk({ label: 'chunk-p', files: { 'src/p.ts': [{}] }, tests: { 't/s.test.ts': [{ id: '0', name: 'n' }] }, testSource: 'v1' });
        const q = mk({ label: 'chunk-q', files: { 'src/q.ts': [{}] }, tests: { 't/s.test.ts': [{ id: '0', name: 'n' }] }, testSource: 'v2' });
        const r = merge([p, q]);
        return r.report === null && r.fatal.some((f) => f.includes('source')) ? true : JSON.stringify(r.fatal);
      },
    ],
    [
      'config の mutate 以外が違う (timeoutMS) → fatal で鍵名を含む / mutate だけが違うのは fatal でない',
      () => {
        const r = merge([A(), mk({ label: 'chunk-b', files: { 'src/b.ts': [{}] }, config: { timeoutMS: 1 } })]);
        if (r.report !== null || !r.fatal.some((f) => f.includes('timeoutMS'))) return JSON.stringify(r.fatal);
        return merge([A(), B()]).fatal.length === 0 ? true : 'mutate だけの違いで落ちた';
      },
    ],
    [
      'config.mutate に glob や :行 を含む塊 → fatal',
      () => {
        const g = mk({ label: 'chunk-g', files: { 'src/g.ts': [{}] }, mutate: ['src/**/*.ts'] });
        const l = mk({ label: 'chunk-l', files: { 'src/l.ts': [{}] }, mutate: ['src/l.ts:12'] });
        return [g, l].every((c) => merge([c]).fatal.length > 0) ? true : 'glob / 行の範囲が通った';
      },
    ],
    [
      '塊間で config.mutate が重なる → fatal',
      () => {
        const b = mk({ label: 'chunk-b', files: { 'src/b.ts': [{}] }, mutate: ['src/b.ts', 'src/a.ts'] });
        const r = merge([A(), b]);
        return r.report === null && r.fatal.some((f) => f.includes('src/a.ts')) ? true : JSON.stringify(r.fatal);
      },
    ],
    [
      '自分の塊の mutate に無い files の鍵 → fatal',
      () => {
        const c = mk({ label: 'chunk-c', files: { 'src/c.ts': [{}] }, mutate: ['src/other.ts'] });
        const r = merge([c]);
        return r.report === null && r.fatal.some((f) => f.includes('src/c.ts')) ? true : JSON.stringify(r.fatal);
      },
    ],
    [
      'projectRoot だけが違う → warnings・fatal でない',
      () => {
        const r = merge([A(), mk({ label: 'chunk-b', files: { 'src/b.ts': [{}] }, projectRoot: '/other' })]);
        return r.report !== null && r.fatal.length === 0 && r.warnings.some((w) => w.includes('projectRoot')) ? true : JSON.stringify(r);
      },
    ],
    [
      'scoreOf: Killed 98 / Timeout 1 / Survived 1 / Ignored 5 / RuntimeError 2 → 99 (Ignored と無効は分母外)・分母 0 → null',
      () => {
        const ms = [];
        for (let i = 0; i < 98; i += 1) ms.push({ status: 'Killed' });
        ms.push({ status: 'Timeout' }, { status: 'Survived' });
        for (let i = 0; i < 5; i += 1) ms.push({ status: 'Ignored' });
        ms.push({ status: 'RuntimeError' }, { status: 'CompileError' });
        const s = scoreOf(mk({ label: 's', files: { 'src/s.ts': ms } }).report);
        const z = scoreOf(mk({ label: 'z', files: { 'src/z.ts': [{ status: 'Ignored' }] } }).report);
        return s.denom === 100 && s.pct === 99 && s.ignored === 5 && s.invalid === 2 && z.pct === null ? true : JSON.stringify([s, z]);
      },
    ],
    [
      'judgeMerge: 点数が break 未満 → 1 件 / 塊が失敗 (failure / cancelled) → 1 件 / success・未指定・点数なし → 0 件',
      () => {
        const n = (o) => judgeMerge(o).length;
        const got = [
          n({ score: { pct: 99 }, breakThreshold: 99.8 }),
          n({ score: { pct: 99 }, breakThreshold: 98 }),
          n({ score: { pct: null }, breakThreshold: 99.8 }),
          n({ score: { pct: 100 }, breakThreshold: 99.8, chunksResult: 'failure' }),
          n({ score: { pct: 100 }, breakThreshold: 99.8, chunksResult: 'cancelled' }),
          n({ score: { pct: 100 }, breakThreshold: 99.8, chunksResult: 'success' }),
          n({ score: { pct: 100 }, breakThreshold: 99.8 }),
        ].join();
        return got === '1,0,0,1,1,0,0' ? true : got;
      },
    ],
    [
      '入力の並びを逆にしても出力 JSON が同一・chunk-2 < chunk-10',
      () => {
        const cs = [2, 10, 1].map((n) => mk({ label: `chunk-${n}`, files: { [`src/f${n}.ts`]: [{ killedBy: ['0'] }] }, tests: { [`t/${n}.test.ts`]: [{ id: '0', name: `t${n}` }] } }));
        const a = JSON.stringify(merge(cs).report);
        const b = JSON.stringify(merge([...cs].reverse()).report);
        return a === b && naturalCompare('chunk-2', 'chunk-10') < 0 && naturalCompare('chunk-10', 'chunk-2') > 0 ? true : '並びに依る';
      },
    ],
    [
      '壊れた JSON / 非 object / files が無い → readChunkReports が problem で返す (例外を投げない)',
      () => {
        const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'merge-mut-'));
        try {
          const w = (name, body) => {
            fs.mkdirSync(path.join(dir, name), { recursive: true });
            fs.writeFileSync(path.join(dir, name, 'mutation.json'), body);
            return path.join(dir, name, 'mutation.json');
          };
          const ps = [w('c-1', '{ not json'), w('c-2', '[1,2]'), w('c-3', '{"schemaVersion":"1.0"}'), w('c-10', JSON.stringify(A().report))];
          const r = readChunkReports(ps);
          // 探した並びは natural order (c-10 は c-2 のあと)。
          const found = findChunkReports(dir).map((p) => path.basename(path.dirname(p))).join();
          return r.problems.length === 3 && r.chunks.length === 1 && found === 'c-1,c-2,c-3,c-10' ? true : JSON.stringify([r.problems, found]);
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
    ],
    [
      'renderSummary は 22 塊の合成でも 4 KB 未満',
      () => {
        const rows = Array.from({ length: 22 }, (_v, i) => ({ label: `mutation-report-full-chunk-${i}`, files: 14, mutants: 2000, killed: 1999, survived: 1 }));
        const md = renderSummary({ stats: { chunks: 22, files: 308, mutants: 45000, tests: 20000 }, score: { pct: 99.9, killed: 1, timeout: 1, survived: 1, noCoverage: 0, ignored: 1 }, breakThreshold: 99.8, rows, verdicts: [] });
        return Buffer.byteLength(md) < 4096 ? true : `${Buffer.byteLength(md)} byte`;
      },
    ],
    [
      '実物の対照: 実在する mutate を chunker の塊にして 1 本 1 変異体の合成報告を作ると、過不足なく併合できる・塊を 1 つ落とすとその全ファイルが partial に出る',
      () => {
        const mc = require('./mutate-changed.cjs');
        const targets = mc.allTargets();
        const parts = mc.chunksOutput(targets).parts;
        const chunks = parts.map((part, i) => {
          const fs2 = {};
          for (const f of part.split(',')) fs2[f] = [{ status: 'Killed' }];
          return mk({ label: `mutation-report-full-chunk-${i}`, files: fs2 });
        });
        const ok = merge(chunks, { expectMutate: targets, expectChunks: parts.length });
        if (ok.fatal.length > 0 || ok.partial.length > 0 || ok.report === null) return JSON.stringify([ok.fatal, ok.partial]);
        if (ok.stats.files !== targets.length || JSON.stringify(ok.report.config.mutate) !== JSON.stringify(targets)) return '過不足';
        const lost = chunks.slice(1);
        const r = merge(lost, { expectMutate: targets, expectChunks: parts.length });
        const dropped = parts[0].split(',');
        return r.report === null && dropped.every((f) => r.partial.join('\n').includes(f) || dropped.length > 20) ? true : '落とした塊の本が名指しされない';
      },
    ],
  ];
  let failed = 0;
  console.log('self-test:');
  for (const [label, fn] of cases) {
    let res;
    try {
      res = fn();
    } catch (e) {
      res = `例外: ${e.message}`;
    }
    const ok = res === true;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${res}`}`);
  }
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 併合が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

module.exports = {
  REPORT_KEYS,
  findChunkReports,
  readChunkReports,
  mergeReports,
  scoreOf,
  judgeMerge,
  renderSummary,
  main,
  selfTest,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
