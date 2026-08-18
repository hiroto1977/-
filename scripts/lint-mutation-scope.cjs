#!/usr/bin/env node
/**
 * lint:mutation-scope — 変異検査が「測っていない範囲」を台帳で固定する。
 *
 * ## 見つけた事故 (2026-08-18)
 *
 * `src/renderer/data/store.ts` は先頭で 13 種の mutator を **ファイル全体**に
 * 対して `Stryker disable` していた (末尾に restore はあるが実装全体が挟まれて
 * いた)。変異検査は **3 変異体・100%** と報告し、ゲートは緑を返し続けた。
 * 無効化を外して実測すると **256 変異体・71.09%・生存 44 / 未到達 30**。
 * 業務データの永続化層はほぼ測られておらず、実際に**接続リークが 11 箇所**
 * 潜んでいた (書き込みが失敗すると `db.close()` に到達しない)。
 *
 * **「測っていない」は「緑」ではない。** 100% という数字は、分母が小さければ
 * 何も言っていないのと同じになる。
 *
 * ## なぜ pragma を禁止しないのか
 *
 * 到達しない防御コードや、定義と参照が同時に置換される定数は、本当に
 * 観測できない等価変異を生む。問題は pragma そのものではなく**範囲**なので、
 * 範囲で線を引く:
 *
 *   - `Stryker disable next-line <Mutator>: <理由>` … 常に可 (1 行・理由を並記)
 *   - 範囲指定で restore までが MAX_SPAN 行以内 … 可
 *   - restore が無い / MAX_SPAN 行を超える … 台帳にある分だけ可
 *
 * ## 台帳は双方向
 *
 * 既存の広い無効化は 36 ファイル・46 箇所・5,189 行あり、一度には直せない。
 * そこで実測値を台帳に置き、**増えたら落ちる**ようにした。同時に**減っても
 * 落ちる** — 直したのに台帳が古いままだと、次に読む人が「まだ 5,189 行ある」
 * と誤解して同じ場所を調べ直す (このリポジトリで繰り返している形)。
 *
 * 台帳に載っているのは「許した」ではなく「まだ測っていないと分かっている」。
 * 内訳は docs/REMAINING_WORK.md に、なぜ危険かとあわせて書いてある。
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
/** これを超える行数を一度に無効化したら、それは「説明」ではなく「目隠し」。 */
const MAX_SPAN = 30;

/**
 * 既知の広い無効化 (2026-08-18 実測)。**減らすのが目的の台帳**。
 * ファイルを直したらこの行も直すこと (一致しないと落ちる)。
 * 0 になったらエントリごと消す。
 */
const KNOWN_BROAD = {
  'src/main/clients/business.ts':                { regions: 3, lines:  199 },
  'src/main/clients/calendar.ts':                { regions: 1, lines:   99 },
  'src/main/clients/canva.ts':                   { regions: 1, lines:   81 },
  'src/main/clients/cloudflare.ts':              { regions: 1, lines:  189 },
  'src/main/clients/devEnv.ts':                  { regions: 1, lines:   43 },
  'src/main/clients/drive.ts':                   { regions: 1, lines:   70 },
  'src/main/clients/emotions.ts':                { regions: 1, lines:  234 },
  'src/main/clients/funding.ts':                 { regions: 1, lines:   34 },
  'src/main/clients/notion.ts':                  { regions: 1, lines:  122 },
  'src/main/clients/stocks.ts':                  { regions: 1, lines:  169 },
  'src/main/clients/teamradar.ts':               { regions: 4, lines:  237 },
  'src/main/clients/templates.ts':               { regions: 3, lines:  290 },
  'src/main/clients/wordpress.ts':               { regions: 1, lines:  110 },
  'src/renderer/data/chatbot.ts':                { regions: 1, lines:   83 },
  'src/renderer/data/counseling.ts':             { regions: 1, lines:  120 },
  'src/renderer/fs/fsa.ts':                      { regions: 1, lines:  128 },
  'src/renderer/library/library.ts':             { regions: 1, lines:  217 },
  'src/shared/ai/chat.ts':                       { regions: 1, lines:   57 },
  'src/shared/taxCalc.ts':                       { regions: 1, lines:   53 },
};

const DISABLE_RE = /^\s*(?:\/\/|\/\*)\s*Stryker\s+disable\s+(?!next-line)(\S+)/;
const RESTORE_RE = /^\s*(?:\/\/|\/\*)\s*Stryker\s+restore\s+(\S+)/;

function mutateList() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/** ソース文字列から範囲指定 disable を数える。span は disable 行から restore 行まで。 */
function scanSource(text) {
  const lines = text.split('\n');
  const open = [];
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    const d = DISABLE_RE.exec(lines[i]);
    if (d) { open.push({ start: i + 1, mutators: d[1] }); continue; }
    if (RESTORE_RE.test(lines[i]) && open.length > 0) {
      const o = open.pop();
      regions.push({ start: o.start, end: i + 1, span: i + 1 - o.start, mutators: o.mutators, closed: true });
    }
  }
  // 閉じていない disable は EOF まで効く。
  for (const o of open) {
    regions.push({ start: o.start, end: lines.length, span: lines.length - o.start, mutators: o.mutators, closed: false });
  }
  return { regions, total: lines.length };
}

/** 広いと見なす範囲だけを返す (restore 無し、または MAX_SPAN 超え)。 */
function broadRegionsOf(text) {
  return scanSource(text).regions.filter((r) => !r.closed || r.span > MAX_SPAN);
}

function scanFile(rel) {
  const full = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return scanSource(fs.readFileSync(full, 'utf8'));
}

/**
 * 自己検査 — 「常に緑を返すゲートは無いより悪い」。
 * 検出器そのものが壊れていないかを、毎回の実行で確かめる。
 */
function selfTest() {
  const body = (n) => Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join('\n');
  const cases = [
    ['pragma 無し', body(50), 0],
    ['next-line だけ', '// Stryker disable next-line StringLiteral: 理由\n' + body(50), 0],
    ['狭い範囲 (10 行) は許す', '// Stryker disable all\n' + body(9) + '\n// Stryker restore all\n' + body(20), 0],
    ['上限ちょうど (30 行) は許す', '// Stryker disable all\n' + body(29) + '\n// Stryker restore all', 0],
    ['上限 +1 (31 行) は広い', '// Stryker disable all\n' + body(30) + '\n// Stryker restore all', 1],
    ['restore が無ければ EOF まで広い', '// Stryker disable all\n' + body(50), 1],
    ['ブロックコメント形式も見る', '/* Stryker disable all */\n' + body(50), 1],
    ['restore があっても離れていれば広い', '// Stryker disable StringLiteral\n' + body(100) + '\n// Stryker restore StringLiteral', 1],
    ['広い範囲が 2 つなら 2 件', '// Stryker disable all\n' + body(40) + '\n// Stryker restore all\n// Stryker disable all\n' + body(40) + '\n// Stryker restore all', 2],
  ];
  let failed = 0;
  console.log('self-test:');
  for (const [label, text, want] of cases) {
    const got = broadRegionsOf(text).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 検出器が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const files = mutateList();
  const failures = [];
  const seen = new Set();
  let scanned = 0;
  let broadRegions = 0;
  let broadLines = 0;

  for (const rel of files) {
    const res = scanFile(rel);
    if (!res) {
      failures.push(`${rel}: stryker.config.json の mutate に載っているがファイルが存在しません`);
      continue;
    }
    scanned++;
    const broad = res.regions.filter((r) => !r.closed || r.span > MAX_SPAN);
    const actual = { regions: broad.length, lines: broad.reduce((s, r) => s + r.span, 0) };
    broadRegions += actual.regions;
    broadLines += actual.lines;

    const known = KNOWN_BROAD[rel];
    if (actual.regions === 0) {
      if (known) {
        failures.push(
          `${rel}: 広い無効化は無くなっていますが台帳に残っています (台帳 ${known.regions} 箇所 / ${known.lines} 行)。` +
          ` KNOWN_BROAD からこの行を削除してください — 直った場所を「未着手」に見せると、次の人が調べ直します`,
        );
      }
      continue;
    }
    seen.add(rel);
    if (!known) {
      failures.push(
        `${rel}: 広い Stryker disable が新規に増えました (${actual.regions} 箇所 / ${actual.lines} 行)。` +
        ` 1 行ごとの \`Stryker disable next-line <Mutator>: <理由>\` に置き換えてください` +
        ` — 広い範囲を黙らせると「測っていない」が「100%」として報告されます` +
        `\n      内訳: ` + broad.map((r) => `L${r.start}-L${r.end} (${r.span}行) ${r.mutators}`).join(' / '),
      );
      continue;
    }
    if (actual.regions > known.regions || actual.lines > known.lines) {
      failures.push(
        `${rel}: 測っていない範囲が広がりました — 台帳 ${known.regions} 箇所 / ${known.lines} 行 → 実際 ${actual.regions} 箇所 / ${actual.lines} 行`,
      );
    } else if (actual.regions < known.regions || actual.lines < known.lines) {
      failures.push(
        `${rel}: 測っていない範囲が狭まりました (台帳 ${known.regions} 箇所 / ${known.lines} 行 → 実際 ${actual.regions} 箇所 / ${actual.lines} 行)。` +
        ` KNOWN_BROAD をこの実測値に更新してください`,
      );
    }
  }

  for (const rel of Object.keys(KNOWN_BROAD)) {
    if (!files.includes(rel)) {
      failures.push(`${rel}: 台帳にありますが stryker.config.json の mutate に載っていません (行を削除してください)`);
    }
  }

  console.log(`Scanned ${scanned} mutate-listed file(s); span limit ${MAX_SPAN} lines`);
  console.log(`広い無効化: ${seen.size} ファイル / ${broadRegions} 箇所 / ${broadLines} 行 (台帳: ${Object.keys(KNOWN_BROAD).length} ファイル)`);

  if (failures.length === 0) {
    console.log('✅ 測っていない範囲は台帳どおり (増えても減ってもいません)');
    return 0;
  }
  console.error(`❌ ${failures.length} 件:`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

module.exports = { scanSource, broadRegionsOf, MAX_SPAN };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
