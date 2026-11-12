/*
 * vitest だけが読む `electron` の代替 (vitest.config.ts の resolve.alias)。
 *
 * 単体テストは Electron 本体 (バイナリ) 無しで走る —— ci.yml は取得そのものを止めた。
 * 実物の `electron` を読むテストは、ランナーに本体が無ければ
 * `Electron failed to install correctly` で落ち、有れば通る。つまり**環境で結果が変わる**
 * (2026-09-05 の CI run 33948541144 がその形で赤になった)。
 *
 * ここで **どの環境でも同じように** 落とす: electron を使う main のモジュール
 * (oauth.ts / secrets.ts / clients/emotions.ts / main.ts) を読むテストは
 * `vi.mock('electron', () => ({ … }))` を書く。mock は alias より先に効くので、
 * mock したテストはこのファイルを読まない。
 */
throw new Error(
  "unit tests never load the real 'electron' — add vi.mock('electron', () => ({ … })) to this test file (see vitest.config.ts)",
);
export {};
