import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/*
 * `scripts/lib/json-for-script.cjs` は R2-13 (2026-07 監査) の対策そのもの ——
 * `JSON.stringify` は `<` を退避しないので、データに `</script>` が入ると
 * インライン script がそこで終わり、残りが DOM へ markup として溢れて
 * ページの JS が死ぬ。
 *
 * **その関門に検査が 1 件も無かった** (2026-08-24 に判明)。生成器 8 本が
 * 依存しているのに、壊れても気付けるのは公開してからになる。
 *
 * CJS (Node ビルドスクリプト) なのでテストだけが createRequire で読み込む。
 */
const req = createRequire(import.meta.url);
const { jsonForScript, scriptSafeJs, replaceToken, replaceJsonToken } = req(
  '../../../scripts/lib/json-for-script.cjs',
) as {
  jsonForScript: (v: unknown) => string;
  scriptSafeJs: (js: string) => string;
  replaceToken: (source: string, token: string, value: string) => string;
  replaceJsonToken: (source: string, token: string, value: unknown) => string;
};

describe('jsonForScript — データを <script> へ埋める', () => {
  it('生の < を 1 つも残さない', () => {
    const out = jsonForScript({ note: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('<');
  });

  it('★ 実行時の値は変わらない (\\u003c は JSON の正規のエスケープ)', () => {
    // ここが本質 —— 見た目だけ変えて意味を変えない。
    for (const v of [
      '</script>',
      { a: '</SCRIPT >', b: ['<', '<<'] },
      '普通の文字列',
      { nested: { deep: '</script>' } },
    ]) {
      expect(JSON.parse(jsonForScript(v))).toEqual(v);
    }
  });

  it('U+2028 / U+2029 を退避する (古いパーサで JS 文字列に生で置けない)', () => {
    const out = jsonForScript('a b c');
    expect(out).not.toContain(' ');
    expect(out).not.toContain(' ');
    expect(JSON.parse(out)).toBe('a b c');
  });
});

describe('scriptSafeJs — コードを <script> へ埋める', () => {
  it('</script を退避する', () => {
    expect(scriptSafeJs('var a = "</script>";')).toBe('var a = "<\\/script>";');
  });

  it('★ 大文字小文字を保つ', () => {
    // 生成器 3 本に写されていた実装は置換先を小文字で固定していたので、
    // `</SCRIPT>` を含む文字列リテラルの中身が小文字に化けていた。
    expect(scriptSafeJs('var a = "</SCRIPT >";')).toBe('var a = "<\\/SCRIPT >";');
    expect(scriptSafeJs('"</ScRiPt>"')).toBe('"<\\/ScRiPt>"');
  });

  it('複数箇所すべてを退避する', () => {
    expect(scriptSafeJs('a</script>b</SCRIPT>c')).toBe('a<\\/script>b<\\/SCRIPT>c');
  });

  it('既に退避済みの形は二重に退避しない', () => {
    const once = scriptSafeJs('var re = /<\\/script/;');
    expect(once).toBe('var re = /<\\/script/;');
    expect(scriptSafeJs(once)).toBe(once);
  });

  it('関係ない JS はそのまま', () => {
    expect(scriptSafeJs('ok(); // <script は開始タグなので対象外')).toBe(
      'ok(); // <script は開始タグなので対象外',
    );
  });
});

describe('replaceToken — $ の特別扱いを避ける', () => {
  it("★ 値の中の $& を解釈しない", () => {
    // 文字列形の replace だと `$&` が「一致した全体」に置き換わり、
    // データが黙って壊れる (R2-13 で同時に是正された足元)。
    expect(replaceToken('X-TOKEN-X', 'TOKEN', '$&')).toBe('X-$&-X');
    expect(replaceToken('X-TOKEN-X', 'TOKEN', '$`')).toBe('X-$`-X');
    expect(replaceToken('X-TOKEN-X', 'TOKEN', '$1')).toBe('X-$1-X');
  });

  it('トークンが無ければ投げる (黙って何もしない形にしない)', () => {
    expect(() => replaceToken('abc', 'NOPE', 'x')).toThrow(/NOPE/);
  });

  it('replaceJsonToken は退避してから差し込む', () => {
    const out = replaceJsonToken('var D = TOKEN;', 'TOKEN', { s: '</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out.slice('var D = '.length, -1))).toEqual({ s: '</script>' });
  });
});
