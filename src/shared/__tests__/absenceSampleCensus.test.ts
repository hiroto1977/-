import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * **「不在を主張する検査には、標本を添える」に機械を付ける** (2026-09-15 · パス 293)。
 *
 * ## なぜ要るか
 *
 * `CLAUDE.md` の規約にこう書いてある:
 *
 * > `not.toMatch(/…/)` や `!body.includes('…')` は、綴りが 1 つ違えば黙る ——
 * > どの入力でも通る空の検査になる。規則が**実際にその文面へ当たる**ことを、
 * > 同じテストの中で標本に対して確かめること
 *
 * この規約は 2026-08-25 の失敗から生まれた —— `dbSecurityPosture.test.ts` の
 * 注記が名指ししている通り、**記憶の言い換え**に対して正規表現を書いたせいで
 * 「どの文面でも通る空の検査」になっていた。実物は
 * 「有効化**し**、」で、検査は「有効化**してください**」を探していた。
 *
 * **だがこの規約を確かめる物は 1 つも無かった** (2026-09-15 実測: ゲート 37 本・
 * 検査 742 本のどこにも無い)。規約は散文で、散文は落ちない ——
 * このリポジトリが何度も直してきた形そのものである。
 *
 * ## 何を数えるか (母集団の定義)
 *
 * 不在の主張すべて (実測 1,100 件超) は母集団ではない。
 * `not.toContain('<script>')` の `'<script>'` は**検査自身が定義する字**で、
 * 他人の綴りを覚える必要が無い。危ういのは
 * **針が「他のモジュールが書いた文」を当てに行く**場合だけである。
 *
 * 機械の代理として**日本語 (かな・漢字) を含む針**を使う ——
 * このリポジトリの利用者向けの文はすべて日本語なので、針に日本語が入って
 * いれば、その綴りは画面・案内・書面のどこかが持っている。
 *
 * そのうち「同じ綴りが**どこかで肯定形でも**主張されている」物は、
 * 綴りが実物に当たることを誰かが確かめている。無い物は、
 * 綴りを 1 字外しても黙る (2026-08-25 の形)。
 *
 * ## この検査が見る所と、見ない所
 *
 * **正規表現の針**だけを台帳制にする。文字列の針 (実測 242 件) は
 * `toContain` の完全一致なので、綴りが外れれば**その検査は必ず落ちる**
 * (「当たったつもり」になれない) —— 部分一致・メタ文字で黙るのは
 * 正規表現の側だけである。**この非対称が台帳の範囲を決めている。**
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** この検査自身は母集団から外す。理由は下の `it` が主張する。 */
const SELF = 'src/shared/__tests__/absenceSampleCensus.test.ts';

/**
 * 母集団のファイル —— **追跡済み + 未追跡 (無視されていない)**。
 *
 * ## `--others --exclude-standard` を足した理由 (2026-09-20 · パス 341)
 *
 * ここは `git ls-files` だけを呼んでおり、**まだ `git add` していない新しい
 * 検査ファイルが 1 つも映らなかった**。規約が最も効くのは「検査を新しく
 * 書いた瞬間」なので、**効かせたい時にだけ黙る**形だった。
 *
 * 実測で踏んだ (パス 340 → 341): 新しい検査に標本の無い `not.toMatch(/…/)` を
 * 書いて `npm test` を回すと **17,658 件すべて緑**、commit して push したら
 * **CI が同じ 1 件で落ちた** —— ローカルとの差は「その時点で追跡されていたか」
 * だけである。**`npm test` が CI と違う答えを出す検査は、手元の確認を無意味にする。**
 *
 * 対照 (2026-09-20 実測): 未追跡の検査に標本なしの `not.toMatch` を置くと、
 * この指定では **捕まえ**、`git ls-files` だけに戻すと **見えなくなる**。
 *
 * `--exclude-standard` を付けるので `.gitignore` の物 (dist/ など) は入らない。
 */
function testFilePopulation(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(out.split('\n').filter(Boolean))].sort();
}

const JP = /[぀-ゟ゠-ヿ一-鿿]/;
/** `.not.toMatch(` / `.not.toContain(` の引数 (入れ子の括弧 1 段まで)。 */
const ABSENCE = /\.not\.(?:toMatch|toContain)\(\s*((?:[^(),]|\([^()]*\))*?)\s*[,)]/g;
/** 肯定形の `.toMatch(` / `.toContain(`。`.not.` が直前に在る物は除く。 */
const POSITIVE = /(?<!\.not)\.(?:toMatch|toContain)\(\s*((?:[^(),]|\([^()]*\))*?)\s*[,)]/g;

export interface AbsenceSite {
  file: string;
  line: number;
  needle: string;
  isRegex: boolean;
}

/** コメント行は検査ではない (直す前の壊れた規則を注記が引用している場合が在る)。 */
function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** 1 ファイルの本文から、針が日本語の散文である不在の主張を取る。 */
export function absenceSites(file: string, text: string): AbsenceSite[] {
  const sites: AbsenceSite[] = [];
  text.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const m of line.matchAll(ABSENCE)) {
      const needle = (m[1] ?? '').trim();
      if (!JP.test(needle)) continue;
      sites.push({ file, line: i + 1, needle, isRegex: needle.startsWith('/') });
    }
  });
  return sites;
}

/** 本文の中で肯定形の針として現れた綴りを集める。 */
export function positiveNeedles(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(POSITIVE)) out.add((m[1] ?? '').trim());
  return out;
}

/*
 * **台帳: 正規表現の針で、綴りを肯定形で確かめていない不在の主張。**
 *
 * 載せるには理由が要る。理由は「なぜ標本が無くてよいか」であって
 * 「何を検査しているか」ではない —— 後者は検査の題名が言う。
 *
 * 2026-09-15 の実測 14 件。**これは欠陥の一覧ではなく、測っていない範囲の
 * 一覧である** (`lint:zero-fold` / `lint:shared-judgement` と同じ立場)。
 * 上から順に標本を付けて減らしていく。
 */
const UNSAMPLED_REGEX_LEDGER: Record<string, string> = {
  'src/main/clients/__tests__/business.test.ts:1987':
    '針は検査自身が注入した見出し (`## 偽の見出し`) で、他所の綴りではない —— 注入した字と探す字が同じ it の中に在る',
  'src/main/clients/__tests__/paperAccountReality.test.ts:127':
    '書面の表の行 (`| 損益 | +￥0`)。標本を付ける価値は在るが、同じ検査が肯定側で ￥0 でない値を主張している',
  'src/main/clients/__tests__/stocks.test.ts:2829': 'パス 189 の「+¥0 (0.00%) を刷らない」の一部。標本未付',
  'src/main/clients/__tests__/stocks.test.ts:3687':
    '針は検査自身が注入した見出し (`## 偽`) で、他所の綴りではない',
  'src/renderer/__tests__/chatCalcAmountAndFloor.test.ts:132':
    'パス 102 の「負の手取りを刷らない」。針は `手取り` + 負号で、画面のラベルは肯定側で主張されている',
  'src/renderer/__tests__/numericCeilingEnforced.test.ts:221':
    '針はソースの字面 (`label: \'積立年数\'` と `max: 80`) を当てに行く。標本未付',
  'src/renderer/components/__tests__/FinancialAnalysis.ctEligibility.test.ts:113':
    'パス 9 の「使えない方式を最有利にしない」。針は HTML の構造つきで、標本未付',
  'src/renderer/components/__tests__/StatusBar.render.test.ts:249':
    '針は `\\d+ 件` (件数そのもの) で、綴りではなく形を見ている',
  'src/renderer/data/__tests__/stocksAnalysisWeb.test.ts:1120':
    '針は検査自身が注入した見出し (`## 偽の見出し`)。main 側 business.test.ts:1987 の双子',
  'src/renderer/data/__tests__/stocksAnalysisWeb.test.ts:1139':
    '針は検査自身が注入した見出し (`## 偽`)。main 側 stocks.test.ts:3687 の双子',
  'src/renderer/pages/__tests__/emotionRadarNoData.test.ts:161':
    'パス 65 の「記録が無い人を評価しない」。針は `活力 \\d` で、ラベルは肯定側で主張されている',
  'src/renderer/pages/__tests__/siteDimensionsUnsetOnScreen.test.ts:165':
    'パス 206 の「空欄の寸法から判定を作らない」。針は `間口 0 m`。標本未付',
  'src/shared/__tests__/nortonDetection.test.ts:52':
    '針は 3 つの語の択一 (`detected|検出されません|無い`) で、うち 2 つは日本語。標本未付',
  'src/shared/__tests__/ollamaCli.test.ts:218':
    '針は CLI が刷る行 (`❌ Ollama が HTTP 404 を返しました: `) で、同じ検査の肯定側が別の文面を主張している',
};

interface Census {
  prose: AbsenceSite[];
  pinned: AbsenceSite[];
  unpinned: AbsenceSite[];
  unpinnedRegex: AbsenceSite[];
  files: number;
}

function runCensus(): Census {
  const files = testFilePopulation().filter((f) => f !== SELF);
  const texts = new Map<string, string>();
  // **原文の道具を通す** (`originalSourcePolicy.test.ts` の規則 1)。
  // 生の `readFileSync` は変異検査の中で**変異体**を読みうるし、
  // 道が変数だと同じ検査の台帳に理由を書く必要が出る。その検査が
  // このファイルを足した直後に鳴って教えてくれた (2026-09-15)。
  for (const f of files) texts.set(f, readOriginalSource(path.join(REPO_ROOT, f)));

  // 肯定形の針は**全ファイル横断**で集める —— 綴りが別のファイルで確かめられて
  // いれば、その綴りが実物に当たることは誰かが見ている。
  const positives = new Set<string>();
  for (const t of texts.values()) for (const n of positiveNeedles(t)) positives.add(n);

  const prose: AbsenceSite[] = [];
  for (const [f, t] of texts) prose.push(...absenceSites(f, t));
  const pinned = prose.filter((s) => positives.has(s.needle));
  const unpinned = prose.filter((s) => !positives.has(s.needle));
  return {
    prose,
    pinned,
    unpinned,
    unpinnedRegex: unpinned.filter((s) => s.isRegex),
    files: files.length,
  };
}

describe('不在の主張に標本が付いているか (母集団の census)', () => {
  const c = runCensus();

  /*
   * **走査が死んだら鳴る** (パス 65 の生存下限)。針の取り方を壊して 0 件に
   * なったら「1 件も危うくない」と読めてしまう。床は 2026-09-15 の実測
   * (496 件 / 306 ファイル) より下に置く —— 検査を足せば増えるので、
   * 上限ではなく下限で留める。
   */
  it('★ 走査が生きている (母集団が床を超えている)', () => {
    expect(c.files, '検査ファイルが取れていない').toBeGreaterThanOrEqual(280);
    expect(c.prose.length, '針が日本語の不在の主張が取れていない — 走査が死んだ').toBeGreaterThanOrEqual(
      400,
    );
  });

  it('肯定形で綴りを確かめている物が過半に近い (実測を記録する)', () => {
    // 数そのものを固定しない (検査を足せば動く)。比だけを床にする。
    expect(c.pinned.length / c.prose.length).toBeGreaterThan(0.3);
  });

  /*
   * **正規表現の針だけを台帳制にする** (上の docblock の非対称)。
   * 台帳は**両方向** —— 母集団に入ったのに台帳に無ければ落ち、
   * 台帳に在るのに母集団から消えても落ちる (古い登録は次に足された
   * 1 件を隠す)。
   */
  it('★ 標本の無い正規表現の針は、すべて台帳に在る', () => {
    const missing = c.unpinnedRegex
      .map((s) => `${s.file}:${s.line}`)
      .filter((k) => !Object.hasOwn(UNSAMPLED_REGEX_LEDGER, k));
    expect(
      missing,
      '標本の無い不在の主張が増えた。規則を定数へ切り出し、'
        + '「その規則が禁じたい文面に当たる」を同じファイルの it で主張するか、'
        + 'UNSAMPLED_REGEX_LEDGER に理由を書くこと',
    ).toEqual([]);
  });

  it('★ 台帳に、母集団から消えた行が残っていない (逆向き)', () => {
    const live = new Set(c.unpinnedRegex.map((s) => `${s.file}:${s.line}`));
    const stale = Object.keys(UNSAMPLED_REGEX_LEDGER).filter((k) => !live.has(k));
    expect(stale, '台帳の行が実物から消えている (直したなら台帳からも消す)').toEqual([]);
  });

  it('台帳の理由が空でない', () => {
    for (const [k, why] of Object.entries(UNSAMPLED_REGEX_LEDGER)) {
      expect(why.length, `${k} の理由が短すぎる`).toBeGreaterThan(20);
    }
  });
});

/*
 * **走査そのものを標本で確かめる。**
 *
 * この検査は「不在を主張する検査に標本を添える」ことを要求するのだから、
 * **自分が標本を持っていなければ話にならない**。走査は文字列を受け取る形に
 * 切り出してあるので、合成した本文を食わせて振る舞いを見る。
 */
describe('走査が実際に当たる (自分の標本)', () => {
  // 合成する本文は文字列として組む。**字で書くと自分が母集団に入る** ——
  // パス 291 / 292 で 2 度踏んだ「散文が呼び出しに化ける」の形なので、
  // この検査自身を母集団から外し (SELF)、外していることを下で主張する。
  const NOT = '.not.';
  const M = 'toMatch';
  const C = 'toContain';

  it('★ 日本語の正規表現の針を拾う', () => {
    const src = `  expect(x)${NOT}${M}(/有効化してください/);`;
    const sites = absenceSites('f.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.isRegex).toBe(true);
  });

  it('★ 日本語の文字列の針を拾い、正規表現とは区別する', () => {
    const src = `  expect(x)${NOT}${C}('改ざん検知');`;
    const sites = absenceSites('f.ts', src);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.isRegex).toBe(false);
  });

  it('日本語を含まない針は数えない (検査自身が定義する字)', () => {
    const src = `  expect(x)${NOT}${C}('<script>');`;
    expect(absenceSites('f.ts', src)).toEqual([]);
  });

  it('★ コメント行は数えない (直す前の規則の引用が母集団に入らない)', () => {
    const src = `   *   expect(rec)${NOT}${M}(/有効化してください/);`;
    expect(absenceSites('f.ts', src)).toEqual([]);
  });

  it('★ 肯定形の針は不在の主張として数えない', () => {
    const src = `  expect(x).${M}(/有効化してください/);`;
    expect(absenceSites('f.ts', src)).toEqual([]);
  });

  it('★ 肯定形の収集が `.not.` を拾わない', () => {
    const neg = `expect(x)${NOT}${M}(/あ/)`;
    expect([...positiveNeedles(neg)]).toEqual([]);
    const pos = `expect(x).${M}(/あ/)`;
    expect([...positiveNeedles(pos)]).toEqual(['/あ/']);
  });

  /*
   * **母集団は「まだ commit していない検査」も含む** (2026-09-20 · パス 341)。
   * 詳しい経緯と対照は `testFilePopulation` の docblock。
   */
  it('★ 母集団は未追跡のファイルも数える (npm test と CI の答えを揃える)', () => {
    const src = readOriginalSource(path.join(REPO_ROOT, SELF));
    expect(src, '未追跡を拾う指定が無い').toContain("'--others'");
    expect(src, '.gitignore の物まで拾っている').toContain("'--exclude-standard'");
    // 標本 —— 走査が実物に届いている (この検査自身のファイルが母集団に在る)。
    expect(testFilePopulation()).toContain(SELF);
    expect(testFilePopulation().length).toBeGreaterThanOrEqual(200);
  });

  it('★ この検査自身が母集団から外れている (自分の標本を数えない)', () => {
    const files = testFilePopulation();
    expect(files, 'この検査が追跡されていない').toContain(SELF);
    const c = runCensus();
    expect(
      c.prose.filter((s) => s.file === SELF),
      '自分の標本を母集団に入れている — 合成した本文が実物の主張と混ざる',
    ).toEqual([]);
  });
});

/*
 * **規準の実装が、この走査で「標本つき」と出ること。**
 *
 * 2026-08-25 の失敗から作られた形 (`dbSecurityPosture.test.ts` の
 * `MISLEADING` + `OLD_WORDINGS` + 肯定の `it`) は、この検査が薦める形そのもの
 * である。そこが母集団に入ってしまう・あるいは「標本なし」と出るなら、
 * **走査が薦める形と規準の形が食い違っている**ことになる。
 */
describe('規準の実装が走査と整合している', () => {
  it('★ dbSecurityPosture の MISLEADING は「標本なし」に数えられない', () => {
    const c = runCensus();
    const hits = c.unpinned.filter((s) => s.file.includes('dbSecurityPosture'));
    expect(hits.map((s) => `${s.line}: ${s.needle}`), '規準の実装が標本なしに数えられている').toEqual(
      [],
    );
  });

  it('★ パス 293 で標本を付けた 3 件も「標本なし」に数えられない', () => {
    const c = runCensus();
    const fixed = [
      'src/renderer/__tests__/storageClaims.test.ts',
      'src/renderer/data/__tests__/backup.test.ts',
    ];
    const hits = c.unpinnedRegex.filter((s) => fixed.includes(s.file));
    expect(hits.map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });
});
