/**
 * **配る Worker は、共有秘密が空のままなら誰の要求も中継しない** (threat: T-130)
 *
 * `docs/PROXY_EXAMPLE.md` の Worker は 2026-10-20 まで `SHARED_SECRET = ''` が既定で、
 * そのとき認証を一切行わなかった。応答は常に `Access-Control-Allow-Origin: *` なので、
 * URL を知る者は誰でも許可リスト (10 ホスト) の先へ中継でき、利用者の Cloudflare の
 * 割り当てを使われた。ネットワークの外側から**こちらの口を使わせる**最も素直な形である。
 * 今は閉じるのが既定で、認証なしで使うには自分の手で `ALLOW_UNAUTHENTICATED` を
 * `true` にする。
 *
 * 説明の文ではなく、Worker 全体を実際に読み込んで要求を投げて確かめる。
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const MD = join(__dirname, '../../../../docs/PROXY_EXAMPLE.md');
const md = readOriginalSource(MD);
const dir = mkdtempSync(join(tmpdir(), 'proxy-worker-failclosed-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function workerSource(): string {
  const open = md.indexOf('```js\n// proxy-worker.js');
  const start = md.indexOf('\n', open) + 1;
  const end = md.indexOf('\n```', start);
  if (open < 0 || end < 0) throw new Error('proxy-worker.js のブロックが見つかりません');
  return md.slice(start, end);
}

let n = 0;
async function load(edit: (src: string) => string): Promise<{ fetch: (r: Request) => Promise<Response> }> {
  const src = edit(workerSource());
  const file = join(dir, `worker${n++}.mjs`);
  writeFileSync(file, src, 'utf8');
  const mod = (await import(pathToFileURL(file).href)) as { default: { fetch: (r: Request) => Promise<Response> } };
  return mod.default;
}

const post = (headers: Record<string, string> = {}): Request =>
  new Request('https://worker.example/', { method: 'POST', headers, body: 'not json' });

describe('配る Worker — 共有秘密が空なら閉じる (threat: T-130)', () => {
  it('標本: 既定の配布物は SHARED_SECRET が空で ALLOW_UNAUTHENTICATED が false', () => {
    const src = workerSource();
    expect(src).toMatch(/const SHARED_SECRET = '';/);
    expect(src).toMatch(/const ALLOW_UNAUTHENTICATED = false;/);
  });

  it('既定のままでは、秘密のヘッダーが無くても在っても 401 で断る (本文を読む前)', async () => {
    const w = await load((s) => s);
    const headerSets: Record<string, string>[] = [{}, { 'X-Proxy-Auth': 'anything' }, { 'X-Proxy-Auth': '' }];
    for (const h of headerSets) {
      const res = await w.fetch(post(h));
      expect(res.status).toBe(401);
      expect(await res.text()).toContain('SHARED_SECRET is not configured');
    }
  });

  it('秘密を設定したら、合う要求だけが認証を通る (通れば次の本文検査で 400)', async () => {
    const w = await load((s) => s.replace("const SHARED_SECRET = '';", "const SHARED_SECRET = 'correct-horse';"));
    expect((await w.fetch(post())).status).toBe(401);
    expect((await w.fetch(post({ 'X-Proxy-Auth': 'wrong' }))).status).toBe(401);
    expect((await w.fetch(post({ 'X-Proxy-Auth': 'correct-horse' }))).status).toBe(400);
  });

  it('認証なしで使うには、自分の手で ALLOW_UNAUTHENTICATED を true にする (そのとき認証は通る)', async () => {
    const w = await load((s) => s.replace('const ALLOW_UNAUTHENTICATED = false;', 'const ALLOW_UNAUTHENTICATED = true;'));
    expect((await w.fetch(post())).status).toBe(400);
  });

  it('CORS preflight は秘密の有無に依らず通る (ブラウザが先に投げる)', async () => {
    const w = await load((s) => s);
    const res = await w.fetch(new Request('https://worker.example/', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
  });
});
