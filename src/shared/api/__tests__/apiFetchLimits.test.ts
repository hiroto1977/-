import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ApiError, apiFetch } from '../http';
import { MAX_HTTP_RESPONSE_BYTES, DEFAULT_HTTP_TIMEOUT_MS } from '../../httpLimits';

/**
 * **`shared/api` の HTTP コアにも締切と上限が掛かっていること。実サーバで測る。**
 *
 * ## 見つかった食い違い (2026-08-31)
 *
 * `http.ts` の冒頭は「`src/main/clients/types.ts` の `jsonFetch` と**同じ
 * 振る舞い**を意図的に揃えている」と書いている。ところが main 側だけが
 * 2026-08-28〜29 に締切 (本文まで) と本文上限を得て、**こちらは
 * `f(url, init)` → `res.json()` の素のまま**だった。
 *
 * 「同じ」と書いてあるものが同じでなくなるのは、いちばん見つけにくい壊れ方
 * である —— 読む人は片方を読んで両方を分かった気になる。
 *
 * ## なぜモックでは足りないか
 *
 * ここで見たい欠陥は「`fetch` はヘッダーで解決し、本文はまだ流れていない」
 * という**実装の性質**そのものである。`vi.fn()` の偽 fetch は `Response` を
 * 即座に丸ごと返すので、その性質が再現しない —— 本文が既に手元に在る世界
 * では、締切を本文に掛け忘れても誰も困らない。だから本物の HTTP を使う。
 * (`shared/ai/__tests__/chatBodyDeadline.test.ts` と同じ理由・同じ作り。)
 */

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const mode = String(req.headers['x-test-mode'] ?? 'ok');
    if (mode === 'stall') {
      res.writeHead(200, { 'content-type': 'application/json' });
      // **ヘッダーだけ流して本文を途中で止める。** `writeHead` だけでは Node が
      // 実際に送らないので、ここを飛ばすと `fetch` 自体が打ち切られてしまい、
      // **本文の締切を試していないことになる**。
      res.flushHeaders();
      res.write('{"a":');
      return; // ...そして黙る。閉じない。
    }
    if (mode === 'huge') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.flushHeaders();
      res.write('{"junk":"');
      const chunk = 'A'.repeat(1024 * 1024);
      let sent = 0;
      const pump = (): void => {
        while (sent < 12) {
          sent += 1;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end('"}');
      };
      pump();
      return;
    }
    if (mode === 'notjson') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html>proxy login page</html>');
      return;
    }
    if (mode === 'fail') {
      res.writeHead(503, { 'content-type': 'text/plain' }).end('upstream is down');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"a":1}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => {
    server.closeAllConnections?.();
    server.close(() => r());
  });
});

function call(mode: string, ctx: { timeoutMs?: number; maxBytes?: number } = {}) {
  return apiFetch<{ a: number }>(
    base,
    { headers: { 'x-test-mode': mode } },
    { serviceId: 'svc', ...ctx },
  );
}

describe('apiFetch — 本文にも締切と上限が掛かる (実サーバ)', () => {
  /*
   * **肯定の対照を先に置く。** 下は「投げること」を見る検査なので、実装が
   * 何でも投げるようになっても気付けない。正常な応答がこの経路を通り抜ける
   * ことを同じ鯖で確かめておく。
   */
  it('★ 正常な応答は通る (経路が生きていることの確認)', async () => {
    await expect(call('ok')).resolves.toEqual({ a: 1 });
  });

  /*
   * **これが直した欠陥そのもの。** 締切 300ms に対し 4 秒の猶予で待つ。
   * 直す前はここで返ってこなかった (締切そのものが無かった)。
   * 時間で判定する検査は遅い実行機で誤爆しやすいので、境界は**桁で**取る。
   */
  it('★ ヘッダーだけ返して黙る相手からは、締切で必ず返る', async () => {
    const started = Date.now();
    const err = await Promise.race([
      call('stall', { timeoutMs: 300 }).then(
        () => new Error('返ってしまった (締切が本文に掛かっていない)'),
        (e: Error) => e,
      ),
      new Promise<Error>((r) => setTimeout(() => r(new Error('HUNG')), 4000)),
    ]);
    expect(err.message).not.toBe('HUNG');
    // 桁で返っていること (4 秒の番人に救われたのではない)
    expect(Date.now() - started).toBeLessThan(3000);
  });

  /*
   * 上限を超える本文は**読み切らずに**投げる。ここが素通しだと、宛先を
   * 決められる相手 (BYO プロキシ・自前ホストの SaaS 互換 API) に
   * プロセスを落とされる。12MiB を送って 1MiB の門に当てる。
   */
  it('★ 上限を超える本文は読み切らずに落とす', async () => {
    await expect(call('huge', { maxBytes: 1024 * 1024 })).rejects.toThrow(/svc response too large/);
  });

  it('上限も締切も共有の定数を既定値にしている (二つ目の台帳を作らない)', () => {
    expect(MAX_HTTP_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(30_000);
  });

  /*
   * **既定値が効いていることは、既定値のまま試さないと分からない。**
   *
   * 上の「上限を超える本文」は `maxBytes` を明示して 1MiB に落としている
   * ので、`ctx.maxBytes ?? MAX_HTTP_RESPONSE_BYTES` の `??` が壊れても
   * (`&&` になると `undefined` が渡り、上限が事実上無くなる) 鳴らない。
   * 実測 2026-08-31 でその変異体が生き残った。**渡さない**場合を試す。
   *
   * 12MiB を流して既定の 10MiB に当てる。数秒かかるが、既定値そのものを
   * 測る手段が他に無い。
   */
  it('★ maxBytes を渡さなければ共有の既定 (10MiB) が効く', async () => {
    await expect(call('huge')).rejects.toThrow(/svc response too large/);
  }, 30_000);

  /*
   * JSON にならない応答 —— 認証を挟むプロキシが差し込むログイン画面が
   * 典型 —— を `SyntaxError` のまま外へ出さない。status を持った
   * `ApiError` にすることで、呼び出し側は他の失敗と同じ形で扱える。
   */
  it('★ JSON でない 2xx 応答は status 付きの ApiError にする', async () => {
    const err = await call('notjson').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(200);
    expect((err as ApiError).serviceId).toBe('svc');
    expect((err as ApiError).message).toBe('svc の応答が JSON ではありません');
    // 本文そのものは例外に載せない (プロキシの画面に秘密が混じりうる)。
    expect((err as ApiError).message).not.toContain('proxy login page');
  });

  it('★ 2xx でない応答は本文を上限つきで読んだうえで ApiError にする', async () => {
    const err = await call('fail').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect((err as ApiError).message).toBe('svc 503: upstream is down');
  });
});
