import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { runAiChat } from '../chat';
import { MAX_HTTP_RESPONSE_BYTES } from '../../httpLimits';
import {
  ASSISTANT_REPLY_TRUNCATED_NOTICE,
  MAX_ASSISTANT_REPLY_CHARS,
} from '../../assistantLimits';
import type { AiChatRequest } from '../providers';

/**
 * **AI の応答本文にも締切と上限が掛かっていること。実サーバで測る。**
 *
 * ## なぜモックでは足りないか
 *
 * ここで見たい欠陥は「`fetch` はヘッダーで解決し、本文はまだ流れていない」
 * という**実装の性質**そのものである。`vi.fn()` の偽 fetch は `Response` を
 * 即座に丸ごと返すので、**その性質が再現しない** —— 本文が既に手元に在る
 * 世界では、締切を本文に掛け忘れても誰も困らない。だから本物の HTTP を使う。
 *
 * 本 PR で 1 度この足元を掬われている: 偽の stream に `cancel()` を呼ぶ
 * モックを書いたが、実際の undici は abort で stream を **error する**。
 * モックは「実装がこう振る舞うはずだ」という**こちらの記憶**を留めるだけで、
 * 記憶が間違っていれば検査も一緒に間違う。
 *
 * ## 直した欠陥 (2026-08-29 実測)
 *
 * `runAiChat` は 2026-08-22 に timeout を足したが、`finally` で
 * **本文を読む前に** `clearTimeout` していた。ヘッダーだけ返して黙る鯖へ
 * 2 秒の締切で投げると、**6 秒後にもまだ待っていた**。`AI_CHAT_TIMEOUT_MS`
 * の頭に書かれている症状 (「画面が『読込中…』のまま止まる」) が、
 * その timeout を足した後も**そのまま残っていた**。
 *
 * 併せて本文に上限が無く、300MiB を返す鯖から**全部読んだ** (heap +627MB)。
 */

const REQ: AiChatRequest = {
  system: 'sys',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 16,
};

/** 応答の中身は問わない。**返ってくるかどうか**だけを見る。 */
const OK_BODY = JSON.stringify({ choices: [{ message: { content: 'ok' } }] });

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/v1/chat/completions') {
      // 経路はヘッダーで切り替える。compat プロバイダは URL を組み立てるので
      // パスは固定になる。
      const mode = String(req.headers['x-test-mode'] ?? 'ok');
      if (mode === 'stall') {
        res.writeHead(200, { 'content-type': 'application/json' });
        // **ヘッダーだけ流して本文を途中で止める。** `writeHead` だけでは
        // Node が実際に送らないので、ここを飛ばすと `fetch` 自体が
        // 打ち切られてしまい、**本文の締切を試していないことになる**
        // (本 PR で 1 度そう書いて、再現しないまま「直った」と読み違えかけた)。
        res.flushHeaders();
        res.write('{"choices":[{"message":{"content":"');
        return; // ...そして黙る。閉じない。
      }
      if (mode === 'flood') {
        // byte の上限には収まるが、**画面に出す量としては論外**な応答。
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '#### x\n'.repeat(60_000) } }] }));
        return;
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
      res.writeHead(200, { 'content-type': 'application/json' }).end(OK_BODY);
      return;
    }
    res.writeHead(404).end();
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

/** 送り先を試験用の鯖へ向けた compat プロバイダ (baseUrl は利用者が決められる)。 */
function call(mode: string, timeoutMs: number) {
  return runAiChat({
    provider: 'compat',
    cfg: { baseUrl: base, model: 'test-model' },
    request: REQ,
    timeoutMs,
    fetchFn: (input, init) =>
      fetch(String(input), {
        ...init,
        headers: { ...(init?.headers as Record<string, string>), 'x-test-mode': mode },
      }),
  });
}

describe('AI の応答 — 本文にも締切と上限が掛かる (実サーバ)', () => {
  /*
   * **肯定の対照を先に置く。** 下の 2 つは「投げること」を見る検査なので、
   * 実装が何でも投げるようになっても気付けない。正常な応答がこの経路を
   * 通り抜けることを同じ鯖で確かめておく。
   */
  it('★ 正常な応答は通る (経路が生きていることの確認)', async () => {
    const res = await call('ok', 5000);
    expect(res.text).toBe('ok');
    expect(res.provider).toBe('compat');
  });

  /*
   * **これが直した欠陥そのもの。**
   *
   * 締切 300ms に対し 4 秒の猶予で待つ。直す前はここで返ってこなかった
   * (実測: 2 秒の締切で 6 秒後もまだ待っていた)。時間で判定する検査は
   * 遅い実行機で誤爆しやすいので、境界は**桁で**取ってある ——
   * 「300ms が効く」ではなく「4 秒以内に必ず返る」を見る。
   */
  it('★ ヘッダーだけ返して黙る相手からは、締切で必ず返る', async () => {
    const started = Date.now();
    const err = await Promise.race([
      call('stall', 300).then(
        () => new Error('返ってしまった (締切が本文に掛かっていない)'),
        (e: Error) => e,
      ),
      new Promise<Error>((r) => setTimeout(() => r(new Error('HUNG')), 4000)),
    ]);
    expect(err.message).not.toBe('HUNG');
    expect(err.message).toContain('時間内に応答しませんでした');
    // 締切の桁で返っていること (4 秒の番人に救われたのではない)
    expect(Date.now() - started).toBeLessThan(3000);
  });

  /*
   * 上限を超える本文は**読み切らずに**投げる。ここが素通しだと、宛先を
   * 決められる相手 (compat の baseUrl / BYO プロキシ) にプロセスを
   * 落とされる。12MiB を送って 10MiB の門に当てる。
   */
  it('★ 上限を超える本文は読み切らずに落とす', async () => {
    await expect(call('huge', 30000)).rejects.toThrow(/too large/);
  });

  it('上限は共有の定数を見ている (二つ目の台帳を作らない)', () => {
    expect(MAX_HTTP_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
  });
});

/**
 * **受け取った応答を画面へ出す量にも上限が要る。**
 *
 * byte の上限 (10MiB) を通ってもなお、`parseMarkdown` に渡せば 150 万
 * ブロックになる応答が作れる。実測 (2026-08-29):
 *
 * ```
 *    10MiB → 1,497,965 blocks / parse 746ms / render 15,630ms / html 134MiB
 * ```
 *
 * レンダラーは 1 スレッドなので、これは**画面が 15 秒死ぬ**ということである。
 * `lint:regex` の頭が名指ししている攻撃者 (「乗っ取られた proxy」) が
 * そのまま使える経路で、あちらは*指数時間の正規表現*だけを見張っていた。
 */
describe('AI の応答 — 画面へ出す量の上限', () => {
  it('★ 上限を超える応答は切り詰められる', async () => {
    const res = await call('flood', 30000);
    // 元は 42 万字。上限 + 注記の長さちょうどに収まる。
    expect(res.text.length).toBe(MAX_ASSISTANT_REPLY_CHARS + ASSISTANT_REPLY_TRUNCATED_NOTICE.length);
  });

  it('★ 切ったことを黙らせない (注記が本文に残る)', async () => {
    const res = await call('flood', 30000);
    expect(res.text.endsWith(ASSISTANT_REPLY_TRUNCATED_NOTICE)).toBe(true);
  });

  /*
   * **対照。** 上 2 件は「切られること」を見るので、実装が何でも切るように
   * なっても気付けない。正当な長さの応答が**そのまま**通ることを確かめる。
   * 上限は正当な応答 (maxTokens 2048) の 12 倍以上に取ってあるので、
   * ここが発火するようになったら値の取り方が間違っている。
   */
  it('★ 正当な長さの応答は 1 文字も変えない (対照)', async () => {
    const res = await call('ok', 5000);
    expect(res.text).toBe('ok');
    expect(res.text).not.toContain('打ち切りました');
  });
});
