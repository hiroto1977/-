#!/usr/bin/env node
/**
 * 確証ゲートの機械検証 — 採録済みナレッジが「確証のとれる情報のみ」を満たすか。
 *
 * 継続的ナレッジ・パイプライン（docs/KNOWLEDGE_PIPELINE_SPEC.md）の中核不変条件を、
 * データ本体に対して強制する：
 *   - 各項目は独立 2 出典以上（ADMISSION_RULE.minSources）
 *   - うち 1 件以上が権威ある出典（分類は下の TAXONOMIES を参照）
 *
 * ## 読み込み経路（2026-08-22 に姉妹ゲートへ揃えた）
 *
 * 当初このゲートだけが自前の正規表現でファイルを読んでいた。`lint:citations` /
 * `lint:doi-prefix` / `lint:knowledge-refs` / `verify:graph` は 4 つとも
 * `orchestration/knowledge-context.cjs` の `loadEntries()` を通しており、
 * こちらは TS を型除去して**評価する**ので 5 コレクション 4140 件すべてを読める。
 * 自前で読んでいたせいで 1 つしか見ておらず、しかも共有 const 参照を含む
 * counselorKnowledge は原理的に読めなかった。姉妹ゲートに合わせて解決した。
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
 * 今は 5 つすべて (4140 件) をこのゲートが見る。
 *
 * ## 「権威ある出典」の定義が 3 つある
 *
 * `knowledge-context.cjs` は vault と AI オーケストレーションへ流す際に
 * `authoritative` フラグを付けるが、その判定は **academic ∪ official の
 * 合併集合** (academic/reference/government/municipality) で、上の 2 つとは
 * 別物である。今日は一致する —— 各コレクションの型の語彙が
 * discriminating な型で分かれている (academic 系に municipality は無く、
 * official 系に academic/reference は無い) からで、偶然ではないが
 * **どこにも書かれていない前提**だった。`AcademicSourceType` に
 * municipality を足した日に黙ってずれる。全 4140 件で突き合わせる。
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

const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
/*
 * 目録の判定は `lint-citations.cjs` の台帳 1 つを読む (`METADATA_ONLY_HOSTS`)。
 * ホスト一覧を 2 か所に書くと片方が腐るので写さない —— `require` は
 * `require.main === module` の守りがあるので main は走らない。
 */
const { hostOf, isMetadataOnlyHost } = require(path.join(REPO_ROOT, 'scripts', 'lint-citations.cjs'));

/**
 * コレクション → 適用する分類。`loadEntries()` が返す `collection` キーで引く。
 * 新しいコレクションが増えたらここに書かないと落ちる (黙って素通りしない)。
 */
const TAXONOMY_BY_COLLECTION = {
  academic: 'academic',
  'econ-history': 'academic',
  compliance: 'official',
  subsidy: 'official',
  support: 'official',
};

/**
 * コレクションの分類。**素の添字にしない。**
 *
 * `TAXONOMY_BY_COLLECTION[c]` と書くと `'constructor'` / `'toString'` /
 * `'__proto__'` がプロトタイプ側の値 (関数やオブジェクト) を返して truthy に
 * なり、未知のコレクションが `unknownCollections` に載らないまま `assess` へ
 * 渡っていた (2026-08-22 に修正)。関数にしてあるのは自己検査から叩くため。
 */
function taxonomyOf(collection) {
  return Object.hasOwn(TAXONOMY_BY_COLLECTION, collection)
    ? TAXONOMY_BY_COLLECTION[collection]
    : undefined;
}

/**
 * 出典の並び (`{ type, url }`) を評価して、満たしていない理由を返す。
 *
 * **URL も見る**のは目録の規則のため (2026-09-06 に種別だけの評価から変えた)。
 * 図書館の目録・書店の商品頁・検索結果は「その出版物が存在する」ことしか示さないので、
 * 権威ある出典がそれだけの項目は**中身を誰も確かめていない**。実測では 0 件だったが、
 * 0 件のまま放置すると次に足す人が気づかないので規則にした (標本は自己検査に置いた)。
 */
function assess(sources, taxonomy) {
  const reasons = [];
  const types = sources.map((s) => s.type);
  if (types.length < MIN_SOURCES) {
    reasons.push(`出典 ${types.length} 件（${MIN_SOURCES} 件以上が必要）`);
  }
  const set = TAXONOMIES[taxonomy].authoritative;
  const authoritativeSources = sources.filter((s) => set.has(s.type));
  const authoritative = authoritativeSources.length;
  if (authoritative < MIN_AUTHORITATIVE) {
    reasons.push(
      `権威ある出典 ${authoritative} 件（${MIN_AUTHORITATIVE} 件以上が必要 / ${taxonomy} 分類）`,
    );
  }
  /*
   * `every` は空配列に true を返すので、**1 件以上あるとき限定**にする。
   * 0 件は上の理由が既に鳴らしており、ここで二重に鳴らす意味がない。
   */
  if (authoritative >= MIN_AUTHORITATIVE
    && authoritativeSources.every((s) => isMetadataOnlyHost(hostOf(String(s.url ?? '').trim())))) {
    reasons.push('権威ある出典が目録・書店・検索結果の記録だけ（出版物そのものが必要）');
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
  /** 表は種別だけを書く。URL 空文字は目録判定に当たらない (ホストが取れない)。 */
  const asSources = (types) => types.map((t) => ({ type: t, url: '' }));
  for (const [label, types, taxonomy, want] of cases) {
    const got = assess(asSources(types), taxonomy).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: 理由 ${got} 件 (期待 ${want})`);
  }

  /* --- 目録の記録だけでは権威にならない。標本を当てて、規則が実際に鳴ることを見る。 --- */
  const S = (...pairs) => pairs.map(([type, url]) => ({ type, url }));
  const metaCases = [
    ['★ 権威が worldcat の目録だけなら鳴る', S(['reference', 'https://search.worldcat.org/title/17234042'], ['media', 'https://hbr.org/x']), 1],
    ['★ 権威が Google Scholar の検索 URL だけでも鳴る', S(['reference', 'https://scholar.google.com/scholar?q=x'], ['media', 'https://hbr.org/x']), 1],
    ['目録 + 出版物なら通る', S(['reference', 'https://search.worldcat.org/title/17234042'], ['academic', 'https://doi.org/10.1234/x']), 0],
    ['目録が非権威 (media) で他に権威があれば通る', S(['academic', 'https://doi.org/10.1234/x'], ['media', 'https://www.worldcat.org/oclc/1']), 0],
    ['全文を置くホスト (archive.org) は目録ではない', S(['academic', 'https://archive.org/details/logiclimitsofb00jack'], ['media', 'https://hbr.org/x']), 0],
    ['権威 0 件のときは目録の理由を重ねない (理由は 1 つ)', S(['media', 'https://www.worldcat.org/oclc/1'], ['media', 'https://hbr.org/x']), 1],
  ];
  for (const [label, sources, want] of metaCases) {
    const got = assess(sources, 'academic').length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: 理由 ${got} 件 (期待 ${want})`);
  }

  /*
   * 分類の割り当てが全コレクションに在ること。ここが抜けたコレクションは
   * `main` で弾かれるが、**抜けたこと自体は実データを読むまで分からない**ので、
   * 実際のコレクション一覧と突き合わせておく。
   */
  /*
   * 未知の collection が**プロトタイプ側の値で「分類あり」になっていない**こと。
   * `TAXONOMY_BY_COLLECTION[e.collection]` と素で引いていた頃は、
   * `'constructor'` が `Object` を返して truthy になり、未知のコレクションが
   * `unknownCollections` に載らないまま `assess` へ渡っていた (2026-08-22)。
   */
  const protoNames = ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty'];
  const leaked = protoNames.filter((n) => taxonomyOf(n) !== undefined);
  const knownOk = taxonomyOf('academic') === 'academic' && taxonomyOf('subsidy') === 'official';
  const protoOk = leaked.length === 0 && knownOk;
  if (!protoOk) failed += 1;
  console.log(
    `  ${protoOk ? '✓' : '✗'} 未知のコレクションに分類を返さない`
      + (leaked.length ? ` / プロトタイプ経由で漏れ ${leaked.join(',')}` : '')
      + (knownOk ? ` (プロトタイプ名 ${protoNames.length} 個 + 実在 2 件で確認)` : ' / 実在するものまで落ちている'),
  );

  const actual = new Set(kc.loadEntries().map((e) => e.collection));
  const missing = [...actual].filter((c) => !Object.hasOwn(TAXONOMY_BY_COLLECTION, c));
  const stale = Object.keys(TAXONOMY_BY_COLLECTION).filter((c) => !actual.has(c));
  const mapOk = missing.length === 0 && stale.length === 0;
  if (!mapOk) failed += 1;
  console.log(
    `  ${mapOk ? '✓' : '✗'} 分類の割り当てが実コレクションと一致: `
      + `${actual.size} コレクション`
      + (missing.length ? ` / 割り当て漏れ ${missing.join(',')}` : '')
      + (stale.length ? ` / 実在しない割り当て ${stale.join(',')}` : ''),
  );

  /*
   * 3 つの「権威」定義が食い違わないこと。
   *
   * knowledge-context.cjs は academic ∪ official の合併集合で判定する。
   * 今日それがコレクション別の判定と一致するのは、型の語彙が
   * discriminating な型で分かれているから —— academic 系に `municipality` は
   * 無く、official 系に `academic`/`reference` は無い。この前提が崩れると
   * vault だけが緩くなる。前提そのものを検査にしておく。
   */
  const vocab = {};
  for (const e of kc.loadEntries()) {
    (vocab[e.collection] ??= new Set());
    for (const src of e.sources ?? []) vocab[e.collection].add(src.type);
  }
  // 合併集合は **knowledge-context.cjs から読む**。ここに写すと、向こうが
  // 変わっても自己検査は写した古い値を見続ける (対照実験で実際にすり抜けた)。
  const UNION = kc.AUTHORITATIVE_TYPES;
  for (const [col, taxonomy] of Object.entries(TAXONOMY_BY_COLLECTION)) {
    const types = vocab[col] ?? new Set();
    const viaUnion = [...types].filter((t) => UNION.has(t)).sort();
    const viaStrict = [...types].filter((t) => TAXONOMIES[taxonomy].authoritative.has(t)).sort();
    const same = viaUnion.join(',') === viaStrict.join(',');
    if (!same) failed += 1;
    console.log(
      `  ${same ? '✓' : '✗'} ${col}: 合併定義を語彙で絞ると ${taxonomy} 定義と一致: `
        + `[${viaUnion.join(',')}] vs [${viaStrict.join(',')}]`,
    );
  }

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  // 姉妹ゲートと同じ読み込み経路 (5 コレクションを型除去して評価する)。
  const entries = kc.loadEntries();
  if (entries.length === 0) {
    console.error('❌ 項目を 1 件も読めませんでした（loadEntries の不具合を疑ってください）。');
    return 1;
  }

  const violations = [];
  const disagreements = [];
  const unknownCollections = new Set();
  const counts = {};

  for (const e of entries) {
    const taxonomy = taxonomyOf(e.collection);
    if (!taxonomy) {
      unknownCollections.add(e.collection);
      continue;
    }
    counts[e.collection] = (counts[e.collection] ?? 0) + 1;

    const types = (e.sources ?? []).map((s) => s.type);
    const reasons = assess((e.sources ?? []).map((s) => ({ type: s.type, url: s.url })), taxonomy);
    if (reasons.length > 0) violations.push({ collection: e.collection, id: e.id, reasons });

    /*
     * 3 つ目の定義との突合。vault と AI オーケストレーションへ流れるのは
     * knowledge-context.cjs が付ける `authoritative` フラグで、判定は
     * academic ∪ official の合併集合。コレクションごとの厳密な判定と
     * 食い違ったら、どちらかが緩んでいる。
     */
    const strict = types.filter((t) => TAXONOMIES[taxonomy].authoritative.has(t)).length
      >= MIN_AUTHORITATIVE;
    if (Boolean(e.authoritative) !== strict) {
      disagreements.push({ collection: e.collection, id: e.id, types, vault: Boolean(e.authoritative), strict });
    }
  }

  if (unknownCollections.size > 0) {
    console.error(
      `❌ 分類の割り当てが無いコレクション: ${[...unknownCollections].join(', ')}\n`
        + '  scripts/verify-knowledge-provenance.cjs の TAXONOMY_BY_COLLECTION に'
        + ' どちらの分類を使うか書いてください（書かないと無検査で通ります）。',
    );
    return 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`確証ゲート検証: ${total} 項目（出典 ${MIN_SOURCES}+・権威 ${MIN_AUTHORITATIVE}+）`);
  for (const [col, n] of Object.entries(counts)) {
    console.log(`  ・${col} ${n} 件 [${TAXONOMY_BY_COLLECTION[col]}]`);
  }

  let failed = false;

  if (violations.length > 0) {
    failed = true;
    console.error(`❌ ${violations.length} 件が確証ゲート違反:`);
    for (const v of violations.slice(0, 50)) {
      console.error(`  [${v.collection}] ${v.id} — ${v.reasons.join(' / ')}`);
    }
    if (violations.length > 50) console.error(`  …ほか ${violations.length - 50} 件`);
  }

  if (disagreements.length > 0) {
    failed = true;
    console.error(
      `❌ ${disagreements.length} 件で vault の authoritative 判定とコレクション別の判定が食い違います:`,
    );
    for (const d of disagreements.slice(0, 20)) {
      console.error(
        `  [${d.collection}] ${d.id} — vault=${d.vault} / 厳密=${d.strict} (出典: ${d.types.join(', ')})`,
      );
    }
    console.error(
      '  knowledge-context.cjs の AUTHORITATIVE_TYPES は academic ∪ official の合併集合です。'
      + ' 型の語彙が広がると、コレクション別の判定とずれます。どちらを直すか決めてください。',
    );
  }

  if (failed) return 1;
  console.log(
    '✅ すべての項目が確証ゲートを満たし、vault の authoritative 判定とも一致しています。',
  );
  return 0;
}

module.exports = { assess, TAXONOMIES, TAXONOMY_BY_COLLECTION };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
