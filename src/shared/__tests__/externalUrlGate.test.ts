import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EXTERNAL_URL_SCHEMES, externalUrlOrNull } from '../externalUrlGate';

/*
 * 外部 URL の関門は**アプリ全体で 1 つ**。表もここ 1 つにする。
 *
 * 2026-08-22 まで、同じ判断が main.ts の中に 2 つ書かれていて、
 * それぞれ**別の表**で検査されていた:
 *
 *   setWindowOpenHandler  弾く形 5 + 読めない形 2   (mainWindow.test.ts)
 *   app:openExternal      弾く形 9 + 読めない形 4 + 大文字 2 (mainIpc.test.ts)
 *
 * 差分 (vbscript: / chrome: / about: / ftp: / 大文字スキーム / '///' / '   ')
 * は**窓の扉では一度も見られていなかった**。表を 1 つにすれば、
 * 新しい形を足したときに両方の扉が同時に守られる。
 */
describe('externalUrlOrNull — OS へ渡してよい URL だけ', () => {
  it.each([
    ['https', 'https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['http', 'http://example.com/', 'http://example.com/'],
    ['大文字スキームは正規化して通す', 'HTTPS://example.com/', 'https://example.com/'],
    ['既定ポートは落ちる', 'https://example.com:443/', 'https://example.com/'],
    ['非既定ポートは残る', 'http://example.com:8080/x', 'http://example.com:8080/x'],
    ['前後の空白は URL 解析が落とす', '  https://example.com/  ', 'https://example.com/'],
    ['スラッシュ 1 つでも解析は通る', 'https:/example.com', 'https://example.com/'],
  ])('%s は通す (%j)', (_label, input, expected) => {
    expect(externalUrlOrNull(input)).toBe(expected);
  });

  /*
   * `javascript:` / `data:` はコード実行、`file:` はローカル読み出し、
   * OS 独自スキームはハンドラ起動に繋がる。
   */
  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['javascript (大文字)', 'JavaScript:alert(1)'],
    ['javascript (全部大文字)', 'JAVASCRIPT:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['file', 'file:///etc/passwd'],
    ['ssh (macOS)', 'ssh://evil.example'],
    ['ms-windows-store (Windows)', 'ms-windows-store://pdp/?productid=x'],
    ['chrome 内部', 'chrome://settings'],
    ['about', 'about:blank'],
    ['ftp', 'ftp://evil.example/x'],
    ['ws', 'ws://evil.example/'],
    ['blob', 'blob:https://example.com/abc'],
    ['mailto', 'mailto:a@b.example'],
  ])('%s は弾く (%j)', (_label, url) => {
    expect(externalUrlOrNull(url)).toBeNull();
  });

  it.each([
    ['空', ''],
    ['URL でない', 'not a url'],
    ['スラッシュだけ', '///'],
    ['空白だけ', '   '],
    ['相対パス', '/a/b'],
    ['ホストだけ', 'example.com'],
  ])('URL として読めない %s は弾く (%j)', (_label, url) => {
    expect(externalUrlOrNull(url)).toBeNull();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['数値', 42],
    ['オブジェクト', {}],
    ['配列', ['https://example.com']],
    ['URL オブジェクト', new URL('https://example.com')],
  ])('文字列でない %s は弾く', (_label, value) => {
    expect(externalUrlOrNull(value)).toBeNull();
  });

  it('許すスキームは 2 つだけ (増えていない)', () => {
    expect([...EXTERNAL_URL_SCHEMES].sort()).toEqual(['http:', 'https:']);
  });

  it('「全部 null」で通っていない (通る側も在る)', () => {
    expect(externalUrlOrNull('https://example.com/')).toBe('https://example.com/');
    expect(externalUrlOrNull('javascript:alert(1)')).toBeNull();
  });
});

/*
 * **扉の数を数える。**
 *
 * 関門を 1 つに寄せても、`shell.openExternal(` を関門を通さずに書けば
 * 3 つ目の扉が開く。main.ts の中では、OS へ URL を渡す行と関門を呼ぶ行が
 * **同数**でなければならない。
 *
 * `oauth.ts` の `shell.openExternal` は対象外 —— あちらが渡すのは
 * `buildAuthorizeUrl()` が組み立てた URL で、レンダラー由来ではない。
 */
describe('main.ts の中で OS へ URL を渡す扉は、全部この関門を通る', () => {
  const MAIN = readFileSync(new URL('../../main/main.ts', import.meta.url), 'utf8');
  const count = (re: RegExp): number => (MAIN.match(re) ?? []).length;

  it('shell.openExternal の呼び出しと externalUrlOrNull の呼び出しが同数', () => {
    const opens = count(/shell\.openExternal\s*\(/g);
    const gated = count(/\bexternalUrlOrNull\s*\(/g);
    expect(opens, 'main.ts から OS へ URL を渡す行が消えている').toBeGreaterThanOrEqual(2);
    expect(gated, '関門を通さずに OS へ URL を渡す行がある (扉が増えた)').toBe(opens);
  });

  it('main.ts が自前でスキームを判定していない (関門の写経が復活していない)', () => {
    expect(MAIN).not.toMatch(/protocol\s*===\s*'https?:'/);
    expect(MAIN).not.toMatch(/EXTERNAL_URL_SCHEMES/);
  });
});

/*
 * **ブラウザ版の扉も同じ関門を通る。**
 *
 * 2026-08-23 まで `web-shim.ts` の `openExternal` は
 * `/^https?:\/\//i` という**別の実装**だった。攻撃入力 29 種のうち
 * **6 種で答えが割れた** (詳細は `externalUrlGate.ts` の頭)。
 *
 * いちばん効くのは `"https://\njavascript:alert(1)"` の形 ——
 * **字面は `https://` で始まるので通るが、`window.open` が開くのは
 * 解析後の URL** で、検査した文字列とは別物になる。
 * この関門は解析してから判定し、正規化した形を返すので、
 * 「調べたもの」と「開くもの」が一致する。
 */
describe('web-shim.ts の中で外へ開く扉も、全部この関門を通る', () => {
  const SHIM = readFileSync(new URL('../../renderer/web-shim.ts', import.meta.url), 'utf8');
  const code = SHIM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const count = (re: RegExp): number => (code.match(re) ?? []).length;

  it('window.open の呼び出しと externalUrlOrNull の呼び出しが同数', () => {
    const opens = count(/\bwindow\.open\s*\(/g);
    const gated = count(/\bexternalUrlOrNull\s*\(/g);
    expect(opens, 'ブラウザ版から外へ開く行が消えている').toBeGreaterThanOrEqual(1);
    expect(gated, '関門を通さずに外へ開く行がある (扉が増えた)').toBe(opens);
  });

  it('自前のスキーム判定が復活していない', () => {
    expect(code, '字面での https 判定が戻っている').not.toMatch(/\^https\?/);
    expect(code).not.toMatch(/EXTERNAL_URL_SCHEMES/);
  });

  it('開くのは関門が返した正規化済みの値 (生の入力ではない)', () => {
    // `window.open(safe, ...)` の形。生の `url` を渡していれば落ちる。
    expect(code).toMatch(/window\.open\(\s*safe\s*,/);
    expect(code, '生の入力をそのまま開いている').not.toMatch(/window\.open\(\s*url\s*,/);
  });
});
