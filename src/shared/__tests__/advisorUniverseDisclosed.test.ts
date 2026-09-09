/**
 * **画面が「ウォッチリストのティッカーを送ります」と書いているのに、デスクトップ版は
 * 1 銘柄も送っていなかった。** (2026-09-09 · パス 105)
 *
 * `StocksPage` の免責帯にはこう書いてある (2026-08-23 に足された egress の断り):
 *
 *     送信内容: 質問文と、**登録済みウォッチリストのティッカー**が
 *     Anthropic API へ送信されます (指標はモック値)。
 *
 * ところが `runAdvisor` は `{ question }` だけを invoke していた。デスクトップ版の
 * `askAdvisor` は `ctx.payload.universe` が無ければ `MOCK_TICKERS` (5 銘柄) を使い、
 * **保存済みウォッチリストを一切読まない**。つまり利用者は自分の登録銘柄について
 * 答えが返ると思って読み、実際は固定の 5 銘柄の順位づけを渡されていた。
 *
 * **断り書き自身のコメントが web 実装だけを引いていた** ——
 * 「(`callStocksAdvisor` が `loadWatchlistSymbols()` をユニバースにする)」。
 * 片方の実装を見て両方に当てはまる文を書いたことの、コード上の証拠である。
 *
 * ## 2 つ目: 同じ 25 を、2 つの実装が正反対に扱っていた
 *
 * | 実装 | 26 銘柄目 |
 * | --- | --- |
 * | `main/clients/stocks.ts` | `throw new Error('universe exceeds 25 symbols')` — **断る** |
 * | `renderer/web-shim.ts` | `watch.slice(0, 25)` — **黙って切る** |
 *
 * **規準は「同じ機能のもう一方の実装」に在り、しかもそちらが厳しかった** (10 か所目)。
 * しかも `advisorQuestionLimits.ts` は 2026-08-25 に**質問の上限**を 4 か所から
 * ここへ寄せた本で、その注記に「同じ判断を 4 度書くと、片方だけ動かしたときに誰も
 * 気付かない」と書いてある。**ユニバースの上限は同じ関数の 25 行下に在ったのに
 * 置いていかれ、動かす前から食い違っていた。**
 *
 * ## 3 つ目: 写した型が、意図して留めた `true` を `boolean` へ広げていた
 *
 * 本物 2 つ (`main/clients/stocks.ts` / `renderer/data/stocksAnalysisWeb.ts`) は
 * どちらも `notForRealMoney: true` をリテラルで固定し、注記が
 * 「呼び出し側がこの出力を実弾発注の許可と取り違えられないように型で留める」と
 * 書いている。`StocksPage` の写しだけ `boolean` で、**答えを描く唯一の場所で
 * その留めが外れていた** (パス 62 / 80 と同じ機構 —— 写しは広い方へずれるので
 * `tsc` は黙る)。
 *
 * 2026-09-09 (パス 117) から宣言は `shared/stocksTypes.ts` の **1 つだけ**になった —— main と
 * ブラウザ版は再輸出し、画面は台帳 (`ActionData<'stocks/advise'>`) を読む。写しが無ければ広がりようが
 * ないので、ここは「3 つが同じ」ではなく「**1 つしか無く、3 か所に写しが戻っていない**」を留める。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_ADVISOR_UNIVERSE_SYMBOLS,
  capAdvisorUniverse,
} from '../advisorQuestionLimits';

const SRC = path.resolve(__dirname, '../..');
const read = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

const MAIN_CLIENT = 'main/clients/stocks.ts';
const WEB_DATA = 'renderer/data/stocksAnalysisWeb.ts';
const PAGE = 'renderer/pages/StocksPage.tsx';
const SHIM = 'renderer/web-shim.ts';
/** 宣言はここ 1 つ (パス 117)。 */
const SHARED_TYPES = 'shared/stocksTypes.ts';

/** `interface Name { … }` の本体を波括弧の対応で取り出す (入れ子で切れない)。 */
function interfaceBody(src: string, name: string): string {
  const m = new RegExp(`(?:export\\s+)?interface\\s+${name}\\s*\\{`).exec(src);
  if (m === null) throw new Error(`interface not found: ${name}`);
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth > 0) {
    if (i >= src.length) throw new Error(`unterminated interface: ${name}`);
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    i += 1;
  }
  return src.slice(start, i - 1);
}

/** 欄の型を字面で引く (コメントは落とす)。 */
function fieldType(body: string, field: string): string | null {
  for (const line of body.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const m = new RegExp(`^\\s*(?:readonly\\s+)?${field}\\s*\\??:\\s*([^;]+);`).exec(line);
    if (m) return m[1]!.trim();
  }
  return null;
}

describe('機構 — 上限は 1 つ、そして外した件数を必ず持つ', () => {
  it('★ 収まるときは 1 件も外さない (上限ちょうどを含む)', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);
    for (const n of [0, 1, MAX_ADVISOR_UNIVERSE_SYMBOLS - 1, MAX_ADVISOR_UNIVERSE_SYMBOLS]) {
      const c = capAdvisorUniverse(mk(n));
      expect(c.symbols.length, `${n} 銘柄`).toBe(n);
      expect(c.omitted, `${n} 銘柄`).toBe(0);
    }
  });

  it('★ 境目の 1 つ先で外した件数が出る (黙って切らない)', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);
    const over = capAdvisorUniverse(mk(MAX_ADVISOR_UNIVERSE_SYMBOLS + 1));
    expect(over.symbols.length).toBe(MAX_ADVISOR_UNIVERSE_SYMBOLS);
    expect(over.omitted).toBe(1);
    // 実測の例: 40 銘柄なら 15 件が対象外。
    expect(capAdvisorUniverse(mk(40)).omitted).toBe(40 - MAX_ADVISOR_UNIVERSE_SYMBOLS);
  });

  it('★ 採るのは先頭から (順序を変えない)', () => {
    const c = capAdvisorUniverse(['AAPL', 'MSFT', 'GOOGL']);
    expect(c.symbols).toEqual(['AAPL', 'MSFT', 'GOOGL']);
  });
});

describe('上限の綴りが 1 か所 — 2 つの実装が同じ数を読む', () => {
  it('★ どちらの実装も shared の規則を読む (数を写していない)', () => {
    const code = (rel: string): string =>
      read(rel)
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
    // main は**比べる**ので上限そのものを読む。
    expect(code(MAIN_CLIENT), 'main が共有の上限を読んでいない').toContain(
      'MAX_ADVISOR_UNIVERSE_SYMBOLS',
    );
    // shim は**収める**ので共有の関数を読む (数は関数が持つ。数字を 2 か所に
    // 置かないほうが、片方だけ動く形にならない)。
    expect(code(SHIM), 'shim が共有の関数を読んでいない').toContain('capAdvisorUniverse');
    // どちらも 25 を字面で持たない。
    for (const rel of [MAIN_CLIENT, SHIM]) {
      expect(code(rel), `${rel} が 25 を字面で持っている`).not.toMatch(/length\s*>\s*25\b/);
      expect(code(rel), `${rel} が slice(0, 25) を持っている`).not.toMatch(/slice\(0,\s*25\)/);
    }
  });

  it('★ shared の 1 か所だけが数を持つ', () => {
    const shared = read('shared/advisorQuestionLimits.ts');
    expect(shared).toContain('export const MAX_ADVISOR_UNIVERSE_SYMBOLS = 25;');
    expect(MAX_ADVISOR_UNIVERSE_SYMBOLS).toBe(25);
  });

  it('★ main は上限超えを断る (収めない) —— 信頼境界だから', () => {
    const src = read(MAIN_CLIENT);
    expect(src).toMatch(/universeList\.length > MAX_ADVISOR_UNIVERSE_SYMBOLS/);
    expect(src).toMatch(/throw new Error\(`universe exceeds \$\{MAX_ADVISOR_UNIVERSE_SYMBOLS\} symbols`\)/);
  });

  it('★ shim は共有の関数で収める (自前の slice を持たない)', () => {
    const src = read(SHIM);
    expect(src).toContain('capAdvisorUniverse(');
    // 直す前の形が戻ってこないこと。
    expect(src).not.toMatch(/watch\.slice\(0,\s*25\)/);
  });
});

describe('画面が送る物と、断り書きが言う物が一致する', () => {
  const page = read(PAGE);

  it('★ 画面は表示しているウォッチリストを universe として送る', () => {
    // 断り書きが「ウォッチリストのティッカーを送る」と言う根拠が、実際に在る。
    expect(page).toContain('capAdvisorUniverse(data.watchlist.map((w) => w.symbol))');
    expect(page).toContain('universe: capped.symbols');
  });

  it('★ 断り書きは実物の件数を出す (「送る」とだけ言わない)', () => {
    expect(page).toContain('登録済みウォッチリストのティッカー');
    expect(page).toContain('data.watchlist.length');
    // 上限を超えたら、対象外の件数と「対象外」の語を出す。
    expect(page).toContain('data-advisor-universe-capped');
    expect(page).toContain('今回の助言の対象外');
  });

  it('★ 答えのとなりに「対象にした銘柄」が出て、件数は返り値から取る', () => {
    expect(page).toContain('data-advisor-universe');
    expect(page).toContain('advisorResult.universeConsidered');
    expect(page).toContain('advisorResult.universeOmitted');
    // **画面が送った物を写して刷らない** —— 送った物と見た物が食い違ったときに
    // 気付けなくなる。`capped` を表示側で読んでいないことを確かめる。
    const displayBlock = page.slice(page.indexOf('data-advisor-universe'));
    expect(displayBlock.slice(0, 600)).not.toContain('capped.symbols');
  });
});

describe('答えは「何を見たか」を運ぶ — 宣言は 1 つで、写しが戻っていない', () => {
  const REQUIRED = ['recommendations', 'disclaimer', 'notForRealMoney', 'universeConsidered', 'universeOmitted'];
  /** 2026-09-09 (パス 117) まで写しを持っていた 3 か所。 */
  const FORMER_COPIES = [MAIN_CLIENT, WEB_DATA, PAGE];

  it('★ shared の宣言が欄を全部持つ', () => {
    const body = interfaceBody(read(SHARED_TYPES), 'AdvisorResponse');
    for (const field of REQUIRED) {
      expect(fieldType(body, field), `${SHARED_TYPES} に ${field} が無い`).not.toBeNull();
    }
  });

  it('★ notForRealMoney は `true` で留まっている (広がっていない)', () => {
    const t = fieldType(interfaceBody(read(SHARED_TYPES), 'AdvisorResponse'), 'notForRealMoney');
    expect(t).toBe('true');
    // **これが直した中身** —— 画面の写しは 2026-09-09 まで `boolean` だった。
    expect(t).not.toBe('boolean');
  });

  it('★ 3 か所に写しが戻っていない (main とブラウザ版は shared を再輸出し、画面は台帳を読む)', () => {
    for (const rel of FORMER_COPIES) {
      expect(read(rel), `${rel} が AdvisorResponse を手で宣言している (写しは shared/stocksTypes.ts へ)`).not.toMatch(
        /(?:export\s+)?interface\s+AdvisorResponse\s*\{/,
      );
    }
    expect(read(MAIN_CLIENT)).toMatch(/AdvisorResponse,?\s*[\s\S]*?\} from '\.\.\/\.\.\/shared\/stocksTypes'/);
    expect(read(WEB_DATA)).toMatch(/AdvisorResponse,?\s*[\s\S]*?\} from '\.\.\/\.\.\/shared\/stocksTypes'/);
    expect(read(PAGE)).toContain("ActionData<'stocks/advise'>");
    // 規則が実物に当たる: 写しの形は鳴る。
    expect('export interface AdvisorResponse {\n  x: 1;\n}').toMatch(/(?:export\s+)?interface\s+AdvisorResponse\s*\{/);
  });

  it('★ 走査規則が実物に当たる (どの入力でも通る形になっていない)', () => {
    // 規則そのものを標本に当てる。広い型を置けば `true` との比較は落ちる。
    const sample = 'readonly notForRealMoney: boolean;\nreadonly universeOmitted: number;';
    expect(fieldType(sample, 'notForRealMoney')).toBe('boolean');
    expect(fieldType(sample, 'universeOmitted')).toBe('number');
    expect(fieldType(sample, 'notPresent')).toBeNull();
    // コメント行は拾わない (説明の中の綴りを型と読まない)。
    expect(fieldType(' * notForRealMoney: boolean;', 'notForRealMoney')).toBeNull();
  });
});
