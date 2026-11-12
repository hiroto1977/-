import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileRequestAllowed, installFileRequestGate } from '../fileRequestGate';

/*
 * **レンダラーの file:// 読み取りは dist/ の中だけ** (threat: T-140)。
 * 実 Electron の実測: 既定の fuse のままだと `fetch('file:///etc/passwd')` と保管ファイルが読めた。
 */
const DIST = path.resolve('/opt/app/resources/app.asar/dist');
const url = (p: string): string => pathToFileURL(p).href;

describe('fileRequestAllowed (threat: T-140)', () => {
  it('dist の中の同梱物は通す', () => {
    expect(fileRequestAllowed(url(path.join(DIST, 'index.html')), DIST)).toBe(true);
    expect(fileRequestAllowed(url(path.join(DIST, 'assets', 'a.js')), DIST)).toBe(true);
  });

  it.each([
    ['/etc/passwd'],
    ['/home/user/.config/Service Hub/service-hub-secrets.json'],
    [path.join(DIST, '..', 'secrets.json')],
    [`${DIST}-evil/index.html`], // 兄弟ディレクトリ (前方一致の取り違え)
    [DIST], // 根そのもの
  ])('★ 外 (%s) は断る', (p) => {
    expect(fileRequestAllowed(url(p), DIST)).toBe(false);
  });

  it('.. を使った脱出・ホスト名つき (UNC) の file:// は断る', () => {
    expect(fileRequestAllowed(`file://${DIST}/../../secrets.json`, DIST)).toBe(false);
    expect(fileRequestAllowed('file://attacker.example/share/x.json', DIST)).toBe(false);
    expect(fileRequestAllowed('file:///%2e%2e/%2e%2e/etc/passwd', DIST)).toBe(false);
  });

  it('壊れた URL は断り、file: 以外のスキームはここの関心外 (通す)', () => {
    expect(fileRequestAllowed('not a url', DIST)).toBe(false);
    expect(fileRequestAllowed('https://example.com/x', DIST)).toBe(true);
    expect(fileRequestAllowed('blob:null/abc', DIST)).toBe(true);
  });

  it('file://localhost/… は URL 解析でホスト無しに正規化されるので、dist の中なら通る', () => {
    expect(fileRequestAllowed(`file://localhost${path.join(DIST, 'index.html')}`, DIST)).toBe(true);
    expect(fileRequestAllowed('file://localhost/etc/passwd', DIST)).toBe(false);
  });

  it('★ 符号化された区切り (%2F) は URL をパスに直せないので断る', () => {
    expect(fileRequestAllowed('file:///a%2Fb', DIST)).toBe(false);
  });

  it('★ win32 だけ大文字小文字を畳んで比べる (他の OS では別のパス)', () => {
    const upper = url(path.join(DIST, 'INDEX.HTML')).replace('/dist/', '/DIST/');
    expect(fileRequestAllowed(upper, DIST, 'win32')).toBe(true);
    expect(fileRequestAllowed(upper, DIST, 'linux')).toBe(false);
    expect(fileRequestAllowed(url(path.join(DIST, 'INDEX.HTML')), DIST, 'win32')).toBe(true);
    expect(fileRequestAllowed(url('/OPT/APP/other/x'), DIST, 'win32')).toBe(false);
  });
});

describe('installFileRequestGate (threat: T-140)', () => {
  it('file:// の要求に門を付け、dist の外はキャンセルする', () => {
    let listener: ((d: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | undefined;
    let filter: { urls: string[] } | undefined;
    installFileRequestGate(
      { webRequest: { onBeforeRequest: (f, l) => { filter = f; listener = l; } } },
      DIST,
    );
    expect(filter?.urls).toHaveLength(1);
    const cancelOf = (u: string): boolean | undefined => {
      let out: boolean | undefined;
      listener!({ url: u }, (r) => { out = r.cancel; });
      return out;
    };
    expect(cancelOf(url(path.join(DIST, 'index.html')))).toBe(false);
    expect(cancelOf(url('/etc/passwd'))).toBe(true);
  });
});

describe('installFileRequestGate の知らせ (threat: T-155)', () => {
  it('★ 断ったときだけ onDenied を呼び、URL の中身は渡さない。通した要求では呼ばない', () => {
    let listener: ((d: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | undefined;
    const denied: string[] = [];
    installFileRequestGate(
      { webRequest: { onBeforeRequest: (_f, l) => { listener = l; } } },
      DIST,
      (where) => denied.push(where),
    );
    listener!({ url: url(path.join(DIST, 'index.html')) }, () => undefined);
    expect(denied).toEqual([]);
    listener!({ url: url('/etc/passwd') }, () => undefined);
    expect(denied).toEqual(['file-request']);
    expect(denied.join('')).not.toContain('passwd');
  });
  it('onDenied が無くても断る (任意の引数)', () => {
    let out: boolean | undefined;
    let listener: ((d: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | undefined;
    installFileRequestGate({ webRequest: { onBeforeRequest: (_f, l) => { listener = l; } } }, DIST);
    listener!({ url: url('/etc/passwd') }, (r) => { out = r.cancel; });
    expect(out).toBe(true);
  });
});
