#!/usr/bin/env node
/**
 * 確証ゲートの機械検証 — 採録済みナレッジが「確証のとれる情報のみ」を満たすか。
 *
 * 継続的ナレッジ・パイプライン（docs/KNOWLEDGE_PIPELINE_SPEC.md）の中核不変条件を、
 * データ本体に対して強制する：
 *   - 各項目は独立 2 出典以上（ADMISSION_RULE.minSources）
 *   - うち 1 件以上が権威ある出典（分類は下の TAXONOMIES を参照）
 *
 * ## 走査範囲（2026-08-22 に広げた）
 *
 * 以前は `academicKnowledge.ts` の 3518 件**だけ**を見ていた。ところが出力は
 * 「確証ゲート検証: 3518 概念」→「✅ すべての概念が確証ゲートを満たしています」で、
 * **corpus 全体を見たかのように読める**。実際には確証済みデータは 5 つあり、
 * 内訳はこうだった:
 *
 *   academicKnowledge   3518 件 … このゲート                  ✅
 *   complianceKnowledge  393 件 … complianceResearch.test.ts   ✅
 *   counselorKnowledge     3 件 … sourceVerification.test.ts   ✅
 *   subsidyKnowledge     140 件 … **どこにも無し**             ❌
 *   economicHistory       86 件 … **どこにも無し**             ❌
 *
 * 補助金 140 件は `assistantContext.ts` を通じて **AI アシスタントの文脈に入る**。
 * 年表 86 件は分析画面に出る。どちらも実測すると今日は全件が規則を満たしていた
 * ——つまり人の規律だけで保たれていた。次に出典 1 件の項目を足しても、
 * 何も鳴らずに出荷される状態だった。
 *
 * ## 権威ある出典の定義を**発明しない**
 *
 * データセットごとに型の並びが違う。どちらもコード側に既に宣言があるので、
 * それを写す（このスクリプトで新しい基準を作らない）:
 *
 *   - `academic` 系 (`AcademicSourceType` / `EconHistorySourceType`)
 *     → `knowledgeProvenance.ts` の `evidenceTier()` が primary(government) /
 *       scholarly(academic) / reference を権威とする。media は popular で単体不可。
 *   - `official` 系 (`SourceType` / `SubsidySourceType`)
 *     → `sourceVerification.ts` の `OFFICIAL_TYPES = government | municipality`。
 *
 * Run:  node scripts/verify-knowledge-provenance.cjs
 *       node scripts/verify-knowledge-provenance.cjs --self-test
 *       npm run verify:knowledge
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// knowledgeProvenance.ts / sourceVerification.ts と一致させる閾値。
const MIN_SOURCES = 2;
const MIN_AUTHORITATIVE = 1;

/** 権威ある出典の集合。どちらもコード側の宣言を写したもの（上のコメント参照）。 */
const TAXONOMIES = {
  academic: {
    authoritative: new Set(['government', 'academic', 'reference']),
    declaredIn: 'src/renderer/data/knowledgeProvenance.ts (evidenceTier)',
  },
  official: {
    authoritative: new Set(['government', 'municipality']),
    declaredIn: 'src/renderer/data/sourceVerification.ts (OFFICIAL_TYPES)',
  },
};

/**
 * 走査対象。`from`/`to` はファイル内の切り出し位置（同じファイルに別の配列が
 * 続く場合に、そこまでで止める）。`expect` は現在の件数で、**パーサが黙って
 * 0 件になる**のを防ぐ下限として使う。
 */
const DATASETS = [
  {
    name: 'academicKnowledge (VERIFIED_CONCEPTS)',
    file: 'src/renderer/data/academicKnowledge.ts',
    from: null,
    to: null,
    idKey: /id: '([^']+)'/,
    taxonomy: 'academic',
    minEntries: 3000,
  },
  {
    name: 'complianceKnowledge (VERIFIED_COMPLIANCE)',
    file: 'src/renderer/data/complianceKnowledge.ts',
    from: 'export const VERIFIED_COMPLIANCE',
    to: null,
    idKey: /id: '([^']+)'/,
    taxonomy: 'official',
    minEntries: 300,
  },
  {
    name: 'subsidyKnowledge (VERIFIED_SUBSIDIES)',
    file: 'src/renderer/data/subsidyKnowledge.ts',
    from: 'export const VERIFIED_SUBSIDIES',
    // SUBSIDY_PORTALS は「窓口の一覧」で、個々が確証対象の主張ではない。
    to: 'export const SUBSIDY_PORTALS',
    idKey: /id: '([^']+)'/,
    taxonomy: 'official',
    minEntries: 100,
  },
  {
    name: 'economicHistoryKnowledge (ECONOMIC_HISTORY)',
    file: 'src/renderer/data/economicHistoryKnowledge.ts',
    from: 'export const ECONOMIC_HISTORY: YearlyEconomy[]',
    // ASSET_SERIES 以降は年表ではなく系列データ（出典は別立て）。
    to: 'export interface AssetPoint',
    idKey: /year: (\d+)/,
    taxonomy: 'academic',
    minEntries: 80,
  },
];

/*
 * 正規表現で読まないデータセットの台帳。
 *
 * counselorKnowledge.ts は出典に `MHLW_MAMOROU` のような**共有 const 参照**を
 * 混ぜている。`type: '...'` を数える読み方では取りこぼし、実際には規則を
 * 満たしている項目を違反と報告してしまう。既に
 * `sourceVerification.test.ts` が `VERIFIED_SUPPORT_RESOURCES` 全件を
 * `isConfirmed` で固定しているので、そちらに任せる。
 */
const PARSED_ELSEWHERE = [
  {
    name: 'counselorKnowledge (VERIFIED_SUPPORT_RESOURCES)',
    why: '出典に共有 const 参照を含むため正規表現では数えられない',
    enforcedBy: 'src/renderer/data/__tests__/sourceVerification.test.ts',
  },
];

/** データセット 1 つを項目配列へ正規表現でパースする。 */
function parseEntries(text, { from, to, idKey }) {
  // 変数名を `body` にしない —— `lint:forbidden` の「伏せていない応答本文」規則が
  // `body.slice(` を見ており、HTTP 応答でなくても鳴る。規則を緩めるより名前を譲る。
  let section = text;
  if (from) {
    const i = section.indexOf(from);
    if (i === -1) return null; // 切り出しの目印が消えた = 構造が変わった
    section = section.slice(i);
  }
  if (to) {
    const j = section.indexOf(to);
    if (j === -1) return null;
    section = section.slice(0, j);
  }
  // 各エントリは "\n  {\n" で始まる。先頭の型定義チャンクは slice(1) で捨てる。
  const blocks = section.split(/\n {2}\{\n/).slice(1);
  const entries = [];
  for (const b of blocks) {
    const idMatch = b.match(idKey);
    if (!idMatch) continue;
    const types = [...b.matchAll(/type: '([a-z-]+)'/g)].map((m) => m[1]);
    entries.push({ id: idMatch[1], types });
  }
  return entries;
}

function assess(types, taxonomy) {
  const reasons = [];
  if (types.length < MIN_SOURCES) {
    reasons.push(`出典 ${types.length} 件（${MIN_SOURCES} 件以上が必要）`);
  }
  const set = TAXONOMIES[taxonomy].authoritative;
  const authoritative = types.filter((t) => set.has(t)).length;
  if (authoritative < MIN_AUTHORITATIVE) {
    reasons.push(
      `権威ある出典 ${authoritative} 件（${MIN_AUTHORITATIVE} 件以上が必要 / ${taxonomy} 分類）`,
    );
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

/*
 * 「✅ すべての項目が確証ゲートを満たしています」は**通っている限り同じ文面**
 * なので、規則が死んでも読んで気づくことはできない。規則を 1 つずつ壊した入力で
 * 毎回鳴らす。分類の取り違え (municipality を academic 系で権威と数える等) は
 * 静かに基準を緩めるので特に見張る。
 */
function selfTest() {
  const cases = [
    ['2 出典・うち government', ['government', 'media'], 'academic', 0],
    ['出典 1 件', ['government'], 'academic', 1],
    ['出典 0 件', [], 'academic', 2],
    ['2 出典だが両方 media', ['media', 'media'], 'academic', 1],
    ['academic 分類: academic は権威', ['academic', 'media'], 'academic', 0],
    ['academic 分類: reference は権威', ['reference', 'media'], 'academic', 0],
    ['academic 分類: municipality は権威ではない', ['municipality', 'media'], 'academic', 1],
    ['official 分類: municipality は権威', ['municipality', 'media'], 'official', 0],
    ['official 分類: academic は権威ではない', ['academic', 'media'], 'official', 1],
    ['official 分類: operator は権威ではない', ['operator', 'media'], 'official', 1],
    ['ちょうど 2 出典・権威 1 件は通る（境界）', ['government', 'media'], 'official', 0],
  ];

  let failed = 0;
  console.log('self-test:');
  for (const [label, types, taxonomy, want] of cases) {
    const got = assess(types, taxonomy).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: 理由 ${got} 件 (期待 ${want})`);
  }

  // パーサ。切り出しの目印が消えたら null（=「構造が変わった」）を返すこと。
  const sample =
    "export const X = [\n  {\n    id: 'a',\n    sources: [{ type: 'government' }, { type: 'media' }],\n  },\n"
    + "  {\n    id: 'b',\n    sources: [{ type: 'media' }],\n  },\n];\nexport const AFTER = [\n  {\n    id: 'c',\n    sources: [{ type: 'media' }],\n  },\n];\n";
  const parserCases = [
    ['切り出し無しなら全部読む', { from: null, to: null }, 3],
    ['to で止めれば後ろは読まない', { from: null, to: 'export const AFTER' }, 2],
    ['from の目印が無ければ null', { from: 'export const MISSING', to: null }, null],
    ['to の目印が無ければ null', { from: null, to: 'export const MISSING' }, null],
  ];
  for (const [label, opts, want] of parserCases) {
    const r = parseEntries(sample, { ...opts, idKey: /id: '([^']+)'/ });
    const got = r === null ? null : r.length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} パーサ: ${label}: ${got} (期待 ${want})`);
  }

  // 共有 const 参照は数えられない —— counselorKnowledge を台帳へ退避した理由。
  const shared =
    "export const X = [\n  {\n    id: 'a',\n    sources: [SHARED_GOV, { type: 'operator' }],\n  },\n];\n";
  const sharedEntries = parseEntries(shared, { from: null, to: null, idKey: /id: '([^']+)'/ });
  const undercounts = sharedEntries[0].types.length === 1;
  if (!undercounts) failed += 1;
  console.log(
    `  ${undercounts ? '✓' : '✗'} 共有 const 参照は数えられない (台帳へ退避する理由): `
      + `${sharedEntries[0].types.length} 件しか読めない (期待 1)`,
  );

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const violations = [];
  const summary = [];
  let total = 0;

  for (const ds of DATASETS) {
    const abs = path.join(REPO_ROOT, ds.file);
    const text = fs.readFileSync(abs, 'utf8');
    const entries = parseEntries(text, ds);

    if (entries === null) {
      console.error(
        `❌ ${ds.name}: 切り出しの目印が見つかりません（構造が変わった可能性）。`
          + ` from=${ds.from} / to=${ds.to}`,
      );
      return 1;
    }
    // パーサが黙って 0 件になると「違反なし」に見える。下限で止める。
    if (entries.length < ds.minEntries) {
      console.error(
        `❌ ${ds.name}: ${entries.length} 件しかパースできませんでした`
          + `（${ds.minEntries} 件以上を期待）。パーサの不具合を疑ってください。`,
      );
      return 1;
    }

    total += entries.length;
    summary.push(`${ds.name} ${entries.length} 件 [${ds.taxonomy}]`);
    for (const e of entries) {
      const reasons = assess(e.types, ds.taxonomy);
      if (reasons.length > 0) violations.push({ ds: ds.name, id: e.id, reasons });
    }
  }

  console.log(
    `確証ゲート検証: ${total} 項目（出典 ${MIN_SOURCES}+・権威 ${MIN_AUTHORITATIVE}+）`,
  );
  for (const s of summary) console.log(`  ・${s}`);
  for (const p of PARSED_ELSEWHERE) {
    console.log(`  ・${p.name} — このゲートの対象外（${p.why}）→ ${p.enforcedBy}`);
  }

  if (violations.length === 0) {
    console.log('✅ すべての項目が確証ゲートを満たしています。');
    return 0;
  }
  console.error(`❌ ${violations.length} 件が確証ゲート違反:`);
  for (const v of violations.slice(0, 50)) {
    console.error(`  [${v.ds}] ${v.id} — ${v.reasons.join(' / ')}`);
  }
  if (violations.length > 50) console.error(`  …ほか ${violations.length - 50} 件`);
  return 1;
}

module.exports = { assess, parseEntries, TAXONOMIES, DATASETS };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
