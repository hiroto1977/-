#!/usr/bin/env node
/**
 * 正規表現の破滅的バックトラック (ReDoS) を **実測で** 見張る。
 *
 * ## なぜ要るか (2026-08-23 実測)
 *
 * `data/assistantMarkdown.ts` は **モデルの応答をそのまま構文解析する**。
 * 応答は攻撃者が誘導しうる (プロンプト注入、乗っ取られた proxy、
 * 悪意ある MCP サーバ) ので、ここに指数時間の正規表現が 1 本入るだけで
 * **画面が固まる** —— レンダラーは 1 スレッドなので、操作も再描画も止まる。
 * CSP も contextIsolation もこの停止は防がない。
 *
 * 走査時点の結果は **全件白** だった:
 *
 * ```
 *   src/           1374 種   閾値超え 0
 *   scripts/        408 種   閾値超え 0
 *   orchestration/   19 種   閾値超え 0
 * ```
 *
 * つまりこの門は「今ある傷」ではなく **これから入る傷** を止めるためにある。
 * `assistantMarkdown.ts` のような「外から来た文字列を解析する場所」に
 * `(\s*\S+)*` の形が足された日に落ちる。
 *
 * ## なぜ字面ではなく実測なのか
 *
 * 「入れ子の量化子を見つける」式の検査は誤検知が多く、`(a+)+` の形を
 * していても実際には破綻しない (先頭固定、否定文字クラス等) 例が普通にある。
 * **時間は嘘をつかない** ので、実際に走らせて計る。
 *
 * ## 番人を別スレッドに置く理由 —— **門が固まっては本末転倒**
 *
 * 最初は同じスレッドで「閾値を超えたら打ち切る」形にした。**動かなかった。**
 * 正規表現の実行は途中で止められないので、`test()` が返ってくるまで
 * 打ち切りの判定に到達しない:
 *
 * ```
 *   ^(a|a?)+$   26 文字の test() 1 回で 23 秒 (実測)
 *   ^(a+)+$     22 文字では 50ms をわずかに下回り、そのまま次の
 *               2 万文字の探りに落ちて **戻ってこなくなった** (実測)
 * ```
 *
 * 2 つ目が特に厄介で、**この門自身が CI を無限に止める**。閾値をどう選んでも
 * 「閾値の直下をすり抜けて次の段で固まる」式は作れるため、値の調整では直らない。
 *
 * そこで測定を `worker_threads` の中で回し、親が番犬を持つ。応答が
 * `WATCHDOG_MS` 途切れたら worker を `terminate()` する —— 実行中の正規表現ごと
 * 止められる唯一の手段で、**止めざるを得なかったこと自体**が「破滅的である」
 * という最も強い証拠になる (`probe: 'timeout'`)。親は次の式から worker を
 * 作り直して続きを測るので、1 本あたりの上限が決まり走査時間が有界になる。
 *
 * ## 誤って鳴らないための確認パス
 *
 * 判定が壁時計時間である以上、GC・CPU の奪い合い・実行機の当たり外れで
 * 無実の式が 1 度だけ遅くなることはありうる。**誤って鳴る門は、鳴らない門より
 * 悪い** —— 人は鳴り続ける門を見なくなる。そこで挙がった式は新しい worker で
 * もう一度測り、**再現したものだけ**を報告する。本物は決定的に何度でも遅いので
 * 必ず再現し、通常 (挙がる式が 0 件) はこの段が 1 度も走らないので費用も無い。
 * worker の起動時間も測定時間に数えない (`BOOT_TIMEOUT_MS` は別枠)。
 *
 * ## 指数だけを見る —— 多項式を外した理由 (実測)
 *
 * 最初は多項式 (O(n²)) の探りも入れた。**2 万文字で 250ms 超**を破綻とすると
 * 11 件挙がったが、**そのうち 9 件は末尾を削るだけの定型**だった:
 *
 * ```
 *   /\/+$/    src/shared/aiEndpoint.ts        末尾のスラッシュを削る
 *   /-+$/      scripts/build-knowledge-vault   末尾のハイフンを削る
 *   /\.+$/    src/renderer/network/proxy.ts   末尾のドットを削る
 * ```
 *
 * これらは確かに O(n²) だが **直しようがなく**、かつ危険でもない ——
 * このリポジトリの入力は上限が掛かっており (`MAX_ANALYZE_TEXT_CHARS` 5000、
 * `MAX_MOOD_NOTE_CHARS` 2000 等)、その長さでの O(n²) は 30ms 程度で
 * 画面は止まらない。台帳に 9 件の「これは普通の定型です」を並べても、
 * 読む人の目を滑らせるだけで何も守らない。
 *
 * 対して指数は入力の上限では防げない —— `(a+)+` は **26 文字**で数秒、
 * 40 文字で事実上永久に返らない。上限を掛けても止まる方が指数、
 * 上限が効く方が多項式。だから **指数だけを門にする**。
 *
 * これは「多項式は安全だ」という主張ではなく、「この入力上限のもとでは
 * 割に合わない」という判断である。上限を外す変更を入れるなら考え直すこと。
 *
 * ## 対照 (--self-test)
 *
 * 既知の破滅的な式が破滅的と判定されること、**および** 安全な式が白と
 * 判定されることを同じ数だけ確かめる。片側だけの照合は、検出器が全部
 * 落とすようになっても・全部通すようになっても気付けない。
 * 抽出器の対照 (コメント行の式を拾わないこと) も併せて持つ。
 *
 * ## 測っていない範囲 (正直に書く)
 *
 * - 種文字は **1 文字** のみ。`(ab)+` のように 2 文字以上の繰り返しでしか
 *   爆発しない式は **この門では見つからない**。ここを広げると組み合わせが
 *   爆発して CI 時間に乗らないため、意図的に諦めている。
 * - **多項式 (O(n²)) は見ていない** —— 上の「指数だけを見る」の通り。
 * - この門自身のファイルは走査から外す。`--self-test` が **わざと破滅的な式**を
 *   標本として抱えているため、外さないと自分の標本を指摘して落ちる
 *   (実際に落ちた。字面で探す検査が同居する説明文を拾う 0-a-17 と同じ形)。
 *
 * 「走って白だった」ことと「安全である」ことは同じではない。
 */

const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

/** 指数の探り。 */
const N_EXP = 26;
const MS_EXP = 50;

/** 番犬: 1 本にこれだけ音沙汰が無ければ、その式は破滅的とみなして殺す。 */
const WATCHDOG_MS = 3000;

/**
 * worker が起動して最初の報せを寄越すまでの猶予。**測定の番犬とは別枠**。
 *
 * 起動時間を測定時間に含めると、混んだ実行機で無実の式が「応答なし」に
 * なる —— 時間で判定する門は、遅い機械の上で誤爆しやすい。
 */
const BOOT_TIMEOUT_MS = 30000;

/**
 * 挙がった式は、**新しい worker でもう一度だけ測って再現したものだけ**を採る。
 *
 * この門の判定は壁時計時間なので、GC・CPU の奪い合い・実行機の当たり外れで
 * 無実の式が 1 度だけ遅くなることがありうる。**誤って鳴る門は、鳴らない門より
 * 悪い** —— 人は鳴り続ける門を見なくなる。
 *
 * 本物の破滅的な式は決定的に何度でも遅いので、再測で必ず再現する。
 * 通常 (挙がる式が 0 件) はこの段が 1 度も走らないので、費用も掛からない。
 */
const CONFIRM_PASSES = 1;

const ROOTS = ['src', 'scripts', 'orchestration'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'coverage']);
const EXT = /\.(ts|tsx|cjs|js|mjs)$/;

/**
 * 例外台帳。**双方向** —— 載っているのに検出されなくなったら落ちる。
 *
 * 形式: `{ file, body, why }`。`body` は正規表現の中身 (前後の `/` を除く)。
 * 走査時点では空。遅い式を通す理由ができたときだけ足すこと。
 */
const REVIEWED = [];

// ---------------------------------------------------------------------------
// 抽出
// ---------------------------------------------------------------------------

/**
 * 行から正規表現リテラルを抜く。
 *
 * 除算 (`a / b / c`) と見分けるため、直前が演算子・開き括弧・行頭・
 * `return` のものだけを採る。コメント行は落とす —— 説明文の中の正規表現を
 * 検出すると、**直しようのない指摘**になるため (0-a-17)。
 */
const LITERAL =
  /(^|[=(,:[!&|?{;>\s]|return|=>)\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+)\/([gimsuyd]*)/g;

/** コメントだけの行か。 */
function isCommentLine(line) {
  return /^\s*(\/\/|\*|\/\*)/.test(line);
}

/** ファイル 1 本から `{ body, flags, file, line }` を集める。 */
function extractLiterals(text, file) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    let m;
    LITERAL.lastIndex = 0;
    while ((m = LITERAL.exec(line))) {
      // 中身が短すぎるものは量化子を持てないので測る価値がない。
      if (m[2].length < 3) continue;
      out.push({ body: m[2], flags: m[3], file, line: i + 1 });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// 実測 (worker の中で回る)
// ---------------------------------------------------------------------------

/** 常用の種文字 + その式自身が含むリテラル文字。 */
function attackSeeds(body, limit) {
  const seeds = new Set(['a', ' ', '0', '*', '-', '#', '.', '/', ':', '"', "'", '=', '&']);
  const literal = body.replace(/\\[a-zA-Z]/g, '').replace(/[[\]()+*?{}|^$]/g, '');
  for (const ch of literal) seeds.add(ch);
  return [...seeds].slice(0, limit);
}

/** 1 本の式を 1 つの長さで計り、最悪の所要時間 (ms) を返す。 */
function worstMs(re, body, n, seedLimit, limitMs) {
  let worst = 0;
  for (const seed of attackSeeds(body, seedLimit)) {
    // 末尾に「絶対に一致しない文字」を置くと、失敗するまで全経路を踏む。
    for (const tail of [' !', '']) {
      const s = seed.repeat(n) + tail;
      const t0 = process.hrtime.bigint();
      try {
        re.test(s);
      } catch {
        /* 実行時に落ちる式は本門の対象外 */
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (ms > worst) worst = ms;
      // 既に答えが出た後まで残りの種を試すと、破滅的な式ほど長く回る。
      if (worst > limitMs) return worst;
    }
  }
  return worst;
}

/**
 * 1 本を指数の探りに掛ける。落ちたら `{ probe, ms, n }`、白なら `null`。
 *
 * **これは worker の中でだけ呼ぶこと。** 戻ってこない可能性があり、
 * 親スレッドで呼ぶと番犬ごと巻き込んで止まる。
 */
function probe(body, flags) {
  let re;
  try {
    // g / y は `lastIndex` が残って結果が揺れるので落とす。
    re = new RegExp(body, flags.replace(/[gy]/g, ''));
  } catch {
    return null; // 組み立てられない式はここでは扱わない
  }
  const exp = worstMs(re, body, N_EXP, 24, MS_EXP);
  if (exp > MS_EXP) return { probe: 'exponential', ms: exp, n: N_EXP };
  return null;
}

// ---------------------------------------------------------------------------
// worker 側の入口
// ---------------------------------------------------------------------------

if (!isMainThread && workerData && workerData.items) {
  const { items, from } = workerData;
  for (let i = from; i < items.length; i += 1) {
    // 「これから測る」を先に知らせる。番犬はこの報せが途切れた式を犯人と見る。
    parentPort.postMessage({ type: 'start', i });
    const verdict = probe(items[i].body, items[i].flags);
    parentPort.postMessage({ type: 'done', i, verdict });
  }
  parentPort.postMessage({ type: 'end' });
}

// ---------------------------------------------------------------------------
// 親側: 番犬つきで worker を回す
// ---------------------------------------------------------------------------

/**
 * `items` を順に測り、`verdict` の配列を返す。
 *
 * 番犬が鳴いたら worker を殺し、その式を `timeout` として記録して
 * 次の式から作り直す。
 */
function runProbes(items) {
  return new Promise((resolve) => {
    const verdicts = new Array(items.length).fill(null);
    let current = -1;

    const spawn = (from) => {
      if (from >= items.length) {
        resolve(verdicts);
        return;
      }
      const worker = new Worker(__filename, { workerData: { items, from } });
      let timer = null;
      let settled = false;

      // 起動そのものが来ない場合の保険。測定の番犬とは別枠にする。
      const bootTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        spawn(from + 1);
      }, BOOT_TIMEOUT_MS);

      const disarm = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        clearTimeout(bootTimer);
      };

      const arm = () => {
        disarm();
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          const victim = current;
          void worker.terminate();
          // 止めざるを得なかった = 最も強い証拠。どちらの探りの最中だったかは
          // worker ごと消えていて分からないので、`n` は名乗らない ——
          // 測っていない長さを報告に書くと、断り方そのものが嘘になる。
          verdicts[victim] = { probe: 'timeout', ms: WATCHDOG_MS, n: null };
          spawn(victim + 1);
        }, WATCHDOG_MS);
      };

      worker.on('message', (msg) => {
        if (settled) return;
        if (msg.type === 'start') {
          current = msg.i;
          arm();
        } else if (msg.type === 'done') {
          verdicts[msg.i] = msg.verdict;
          arm();
        } else if (msg.type === 'end') {
          settled = true;
          disarm();
          void worker.terminate();
          resolve(verdicts);
        }
      });

      worker.on('error', () => {
        if (settled) return;
        settled = true;
        disarm();
        // worker が落ちたら、その式は測れなかった。次へ進める。
        spawn(current + 1);
      });

      // **ここで arm しない。** worker の起動 (数十 ms〜、混んだ CI では更に) を
      // 測定時間に数えると、遅い実行機で無実の式が「応答なし」になる。
      // 番犬は最初の `start` が届いてから回す。
    };

    spawn(0);
  });
}

/**
 * `runProbes` の結果から、**再現したものだけ**を残す。
 *
 * 再現しなかった式は「あの 1 回が遅かっただけ」なので落とす。何が落ちたかは
 * 黙って捨てず呼び出し側へ返す —— 消えた指摘は、消えたことも見えないと困る。
 */
async function runProbesConfirmed(items, measure = runProbes) {
  const first = await measure(items);
  const suspects = [];
  first.forEach((v, i) => {
    if (v) suspects.push(i);
  });
  if (suspects.length === 0) return { verdicts: first, retracted: [] };

  const verdicts = first.slice();
  const retracted = [];
  for (let pass = 0; pass < CONFIRM_PASSES; pass += 1) {
    for (const i of suspects) {
      if (!verdicts[i]) continue;
      const again = await measure([items[i]]);
      if (!again[0]) {
        retracted.push({ item: items[i], was: verdicts[i] });
        verdicts[i] = null;
      }
    }
  }
  return { verdicts, retracted };
}

// ---------------------------------------------------------------------------
// 走査
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    // 自分自身は外す —— `--self-test` がわざと破滅的な式を標本として持つ。
    else if (EXT.test(e.name) && path.resolve(p) !== __filename) out.push(p);
  }
  return out;
}

/** 走査対象の式を集める (同じ式は 1 つにまとめ、出所は全部覚える)。 */
function collect(roots) {
  const literals = [];
  let files = 0;
  for (const root of roots) {
    for (const file of walk(root)) {
      files += 1;
      literals.push(...extractLiterals(fs.readFileSync(file, 'utf8'), file));
    }
  }
  const byBody = new Map();
  for (const lit of literals) {
    const key = `${lit.body} ${lit.flags}`;
    if (!byBody.has(key)) byBody.set(key, { body: lit.body, flags: lit.flags, sites: [] });
    byBody.get(key).sites.push(`${lit.file}:${lit.line}`);
  }
  return { files, items: [...byBody.values()] };
}

async function scan(roots) {
  const { files, items } = collect(roots);
  const { verdicts, retracted } = await runProbesConfirmed(items);
  const hits = [];
  items.forEach((item, i) => {
    if (verdicts[i]) hits.push({ ...item, ...verdicts[i] });
  });
  return { files, distinct: items.length, hits, retracted };
}

// ---------------------------------------------------------------------------
// 陰性・陽性対照 (--self-test)
// ---------------------------------------------------------------------------

async function selfTest() {
  const cases = [
    // 既知の破滅的 —— `timeout` も含め「破滅的と判定されること」を見る。
    { body: '^(a+)+$', flags: '', bad: true },
    { body: '^(\\w+\\s?)*$', flags: '', bad: true },
    { body: '(x|x)*y', flags: '', bad: true },
    { body: '^(a|a?)+$', flags: '', bad: true },
    { body: '^(a*)*b$', flags: '', bad: true },
    // 安全 —— このリポジトリで実際に使っている形を含める。
    { body: '^[-*]\\s+(.*)$', flags: '', bad: false },
    { body: '\\*\\*([^*]+)\\*\\*|`([^`]+)`', flags: 'g', bad: false },
    { body: '^(#{1,6})\\s+(.*)$', flags: '', bad: false },
    { body: '^\\d{4}-\\d{2}-\\d{2}$', flags: '', bad: false },
    { body: '```(?:json)?\\s*\\n([\\s\\S]*?)\\n```', flags: '', bad: false },
    { body: '^\\s*(\\/\\/|\\*|\\/\\*)', flags: '', bad: false },
  ];

  // **出荷する経路そのもの**で測る (確認パス込み)。self-test だけが素の
  // `runProbes` を通っていると、確認パスの欠陥は対照に映らない。
  const { verdicts, retracted } = await runProbesConfirmed(cases);

  console.log('self-test:');
  let failed = 0;
  verdicts.forEach((got, i) => {
    const c = cases[i];
    const ok = Boolean(got) === c.bad;
    if (!ok) failed += 1;
    const shown = got
      ? `${got.probe} ${got.n === null ? `${WATCHDOG_MS}ms 応答なし` : `${got.n}字 ${got.ms.toFixed(0)}ms`}`
      : '白';
    console.log(`  ${ok ? '✓' : '✗'} /${c.body}/${c.flags} → ${shown} (期待 ${c.bad ? '破滅的' : '白'})`);
  });

  // 抽出そのものの対照 —— コメント行の式を拾わないこと (0-a-17)。
  const extracted = extractLiterals(
    ['const ok = /^[-*]\\s+(.*)$/;', '// 説明: /^(a+)+$/ は破滅的', ' * また /(x|x)*y/ も'].join('\n'),
    'inline',
  );
  const bodies = extracted.map((e) => e.body);
  const extractionOk = bodies.length === 1 && bodies[0] === '^[-*]\\s+(.*)$';
  if (!extractionOk) failed += 1;
  console.log(
    `  ${extractionOk ? '✓' : '✗'} コメント行の式を拾わない (拾った ${bodies.length} 件: ${bodies.join(' , ')})`,
  );

  // 確認パスの対照 —— **本物の破滅的な式は再測でも再現する**ので、
  // 1 件も取り下げられてはいけない。取り下げが起きるなら、確認パスが
  // 厳しすぎて本物まで消していることになる。
  const retractionOk = retracted.length === 0;
  if (!retractionOk) failed += 1;
  console.log(
    `  ${retractionOk ? '✓' : '✗'} 確認パスが本物を取り下げない (取り下げ ${retracted.length} 件・期待 0)`,
  );

  // **上の照合は、確認パスが何も取り下げなくても通ってしまう。**
  // 「取り下げが 0 件」を意味あるものにするため、1 度目だけ遅い式を
  // 差し込んで、**取り下げが実際に起きること**を別に確かめる。
  let calls = 0;
  const flaky = async (list) => {
    calls += 1;
    // 1 回目 (一括測定) だけ破滅的と答え、再測では白と答える。
    return list.map(() => (calls === 1 ? { probe: 'exponential', ms: 999, n: N_EXP } : null));
  };
  const flakyRun = await runProbesConfirmed([{ body: 'x+', flags: '' }], flaky);
  const retractsFlaky = flakyRun.retracted.length === 1 && flakyRun.verdicts[0] === null;
  if (!retractsFlaky) failed += 1;
  console.log(
    `  ${retractsFlaky ? '✓' : '✗'} 1 度きり遅かった式は取り下げる`
    + ` (取り下げ ${flakyRun.retracted.length} 件・残り ${flakyRun.verdicts[0] ? '有' : '無'})`,
  );

  if (failed > 0) {
    console.error(`\n❌ self-test ${failed} 件失敗 — 検出器が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

// ---------------------------------------------------------------------------

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const { files, distinct, hits, retracted } = await scan(ROOTS);

  const seen = new Set();
  const problems = [];
  for (const h of hits) {
    const hit = REVIEWED.find((r) => r.body === h.body && h.sites.some((s) => s.startsWith(r.file)));
    if (hit) {
      seen.add(`${hit.file}::${hit.body}`);
      continue;
    }
    problems.push(h);
  }
  const stale = REVIEWED.filter((r) => !seen.has(`${r.file}::${r.body}`));

  console.log(`Scanned ${files} file(s): 正規表現 ${distinct} 種を実測 (台帳 ${REVIEWED.length} 件)`);
  // 走査が死んで 0 件になったのを「ReDoS なし」と読まない (実測 976 ファイル / 2,456 種、2026-09-05)。
  const MIN_FILES = 500;
  if (files < MIN_FILES) {
    console.error(`❌ ${files} ファイルしか走査できませんでした (${MIN_FILES} 件以上を期待)。走査が壊れています。`);
    process.exit(1);
  }
  // 取り下げた指摘は黙って捨てない —— 実行機が遅いことに気づける唯一の手掛かり。
  for (const r of retracted) {
    console.log(`  (再測で再現せず取り下げ: /${r.item.body}/ — 1 度目は ${r.was.probe})`);
  }

  let failed = false;
  if (problems.length > 0) {
    failed = true;
    console.error(`\n❌ ${problems.length} 件の破滅的バックトラック:\n`);
    for (const p of problems) {
      console.error(`  /${p.body}/${p.flags}`);
      console.error(
        `    ${p.probe} — ${p.n === null ? `${WATCHDOG_MS}ms 応答が無く打ち切り` : `${p.n}字で ${p.ms.toFixed(0)}ms`}`,
      );
      console.error(`    ${p.sites.slice(0, 5).join(' , ')}`);
    }
    console.error(
      '\n直し方: 入れ子の量化子 `(x+)+` を `x+` にするか、`.` を否定文字クラス'
      + ' `[^"]` に狭めて後戻りの余地を消してください。'
      + '\n        通す理由があるなら scripts/lint-regex-complexity.cjs の REVIEWED へ'
      + '理由つきで退避 (台帳は双方向です)。',
    );
  }
  if (stale.length > 0) {
    failed = true;
    console.error(`\n❌ 台帳に載っているのに検出されない項目が ${stale.length} 件あります\n`);
    for (const s of stale) console.error(`  ${s.file} :: /${s.body}/`);
    console.error('\n直ったなら REVIEWED から削除してください。');
  }

  if (failed) return 1;
  console.log('✅ 破滅的バックトラックを起こす正規表現はありません');
  return 0;
}

module.exports = {
  extractLiterals,
  probe,
  collect,
  scan,
  runProbes,
  runProbesConfirmed,
  REVIEWED,
  N_EXP,
  BOOT_TIMEOUT_MS,
};

if (require.main === module && isMainThread) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
