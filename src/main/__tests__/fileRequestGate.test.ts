import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileRequestAllowed } from '../fileRequestGate';

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
});
