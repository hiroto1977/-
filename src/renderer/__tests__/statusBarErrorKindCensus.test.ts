/**
 * **取得の失敗の文を状態バーへ渡す画面は、失敗の種類も渡す。**
 *
 * 状態バーの札は失敗の種類で決まる (「認証エラー」「レート制限」・どちらでもなければ「エラー」)。種類は
 * 取得の hook (`useServiceData`) が返すが、状態バーへは画面が 1 つずつ渡す —— 渡し忘れた画面は、
 * 鍵の期限切れもレート制限もただの「エラー」になり、認証で断られても登録の欄が開かない。
 *
 * 2026-11-19 実測 (jsdom · 実物の全画面 · 取得を 429 / 資格情報なしで断らせる): 取得する 50 画面のうち
 * 32 画面 (連携先 9 + 端末内 23) が「エラー」と出た。残る 18 画面は「レート制限」「認証エラー」と出た。
 * 原因は 40 か所 (39 画面 + 士業の共通部品) が `errorKind` を渡していなかったこと。
 *
 * ここは母集団 (`<StatusBar …>` の JSX) を構文木で数える。振る舞いは
 * `pages/__tests__/fetchFailureBadgeOnScreen.test.ts` が実物の画面で見る。
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { parseSource, uiSources } from './astStyle';

interface Site {
  file: string;
  line: number;
  attrs: string[];
  spread: boolean;
}

/** ソース 1 本の中の `<StatusBar …>` (自己完結・開きタグの両方)。 */
function statusBarsIn(file: string, text: string): Site[] {
  const sf = parseSource(file, text);
  const out: Site[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === 'StatusBar') {
      const attrs: string[] = [];
      let spread = false;
      for (const a of node.attributes.properties) {
        if (ts.isJsxAttribute(a)) attrs.push(a.name.getText(sf));
        else spread = true;
      }
      out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, attrs, spread });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** 失敗の文は渡すのに、失敗の種類を渡していない所。 */
const missingKind = (sites: readonly Site[]): Site[] =>
  sites.filter((s) => s.attrs.includes('errorMessage') && !s.attrs.includes('errorKind'));

const SITES = uiSources().flatMap((s) => statusBarsIn(s.file, s.text));

describe('状態バーへ渡す物 —— 失敗の文と失敗の種類は対', () => {
  it('母集団: 状態バーを描く所は 55 以上在り、失敗の文を渡す所も 55 以上在る (走査が空で通らない)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(55);
    expect(SITES.filter((s) => s.attrs.includes('errorMessage')).length).toBeGreaterThanOrEqual(55);
  });

  it('★ 失敗の文を渡す所は、どこも失敗の種類を渡す', () => {
    // ここに名前が出たら、その画面は期限切れもレート制限も「エラー」としか言わない。
    // `useServiceData` の戻りから `errorKind` を取り、`errorKind={errorKind}` を足す。
    expect(missingKind(SITES).map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });

  it('属性は 1 つずつ書く (展開 `{...x}` で渡すと、この走査から見えない)', () => {
    expect(SITES.filter((s) => s.spread).map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });

  it('標本: 走査は、渡し忘れた形を見つけ、渡している形と失敗の文を渡さない形は見つけない', () => {
    const src = [
      'export function A() { return <StatusBar status={status} errorMessage={errorMessage} who="a" />; }',
      'export function B() { return <StatusBar status={status} errorMessage={errorMessage} errorKind={errorKind} who="b" />; }',
      'export function C() { return <StatusBar who="c" right={<span />} />; }',
      'export function D() { return <StatusBar errorMessage={m}><i /></StatusBar>; }',
      '// <StatusBar errorMessage={x} /> 注記の中の言及は数えない',
      'export function E() { return <Other errorMessage={m} />; }',
    ].join('\n');
    const sites = statusBarsIn('sample.tsx', src);
    expect(sites.map((s) => s.line)).toEqual([1, 2, 3, 4]);
    expect(missingKind(sites).map((s) => s.line)).toEqual([1, 4]);
  });
});
