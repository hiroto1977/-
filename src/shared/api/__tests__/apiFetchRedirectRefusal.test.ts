/**
 * **`apiFetch` は転送 (3xx) に追随せず、断る。** (2026-09-30 · パス 502)
 *
 * 送り先の関門 (`lint:network-targets` / 各 endpoint の検証) は**最初の 1 ホップ**にしか掛からない。
 * `fetch` の既定 (`redirect: 'follow'`) だと、表のホストが返す `302 Location:` 1 つで
 * 表に無い先 (LAN・loopback) へ取りに行き、`Authorization` も持っていく。規則は
 * `httpLimits.ts` の `egressInit` (追随しない) + `isRedirectResponse` / `redirectRefusal` (断る) で、
 * `apiFetch` は**応答を受けたらまず転送かを見る**。
 *
 * 変異検査の全掃引 (#179) は、この枝の 2 つを残していた:
 *
 * - `isRedirectResponse(res)` を偽にする変異体 —— **生存** (転送の応答を渡す検査が 1 つも無く、
 *   判定を外しても誰も落ちなかった)
 * - 断りを投げるブロックを空にする変異体 —— **NoCoverage** (その枝を通る検査が 0 件だった)
 *
 * `main/clients/types.ts` の `limitedFetch` (双子・`types.test.ts` の「転送に追随しない」) には
 * 同じ検査が在る。こちら (`src/shared/api/*` のクライアント層の HTTP コア) は「同じ振る舞いを
 * 意図的に揃えている」と自分で述べているので、揃っていることをここで留める。
 *
 * ★ 断りの文は `redirectRefusal` の出力を**呼んで**比べず、**文面そのものを値として**置く
 *   (呼んで比べると、文面が変わったとき両辺が一緒に動いて素通りする)。
 */
import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '../http';

/** 転送の応答の替え玉。本文は読まれないはずなので、読まれたら分かるよう spy にする。 */
function redirectResponse(init: { status: number; type?: string; location?: string }) {
  const text = vi.fn(async () => 'これは読まれてはいけない本文');
  const res = {
    ok: false,
    status: init.status,
    type: init.type ?? 'basic',
    headers: new Headers(init.location === undefined ? {} : { location: init.location }),
    text,
    json: async () => null,
  } as unknown as Response;
  return { res, text };
}

const TAIL = '追随しません (送り先の関門は最初の 1 ホップにしか掛からないため)';

describe('apiFetch は転送に追随せず断る (パス 502)', () => {
  it('★ 302 + Location: 行き先のホストを添えて ApiError (status・serviceId を残し、本文は読まない)', async () => {
    const { res, text } = redirectResponse({ status: 302, location: 'https://evil.example/steal?x=1' });
    const f = vi.fn<typeof fetch>().mockResolvedValue(res);
    const err = await apiFetch('https://api.example/v1/x', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(`svc が別の場所 (evil.example) へ転送しようとしました —— ${TAIL}`);
    expect((err as ApiError).status).toBe(302);
    expect((err as ApiError).serviceId).toBe('svc');
    expect(text).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('★ 相対の Location は要求の URL で解く (行き先は要求と同じホスト)', async () => {
    const { res } = redirectResponse({ status: 307, location: '/moved' });
    const f = vi.fn<typeof fetch>().mockResolvedValue(res);
    const err = await apiFetch('https://api.example/v1/x', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe(`svc が別の場所 (api.example) へ転送しようとしました —— ${TAIL}`);
    expect((err as ApiError).status).toBe(307);
  });

  it('★ ブラウザの opaqueredirect (status 0・ヘッダを見せない) は行き先を述べずに断る', async () => {
    const { res } = redirectResponse({ status: 0, type: 'opaqueredirect' });
    const f = vi.fn<typeof fetch>().mockResolvedValue(res);
    const err = await apiFetch('https://api.example/v1/x', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(`svc が別の場所へ転送しようとしました —— ${TAIL}`);
    expect((err as ApiError).status).toBe(0);
  });

  it('★ 5 つの転送の status (301 / 302 / 303 / 307 / 308) はどれも断る', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const { res } = redirectResponse({ status, location: 'https://evil.example/' });
      const f = vi.fn<typeof fetch>().mockResolvedValue(res);
      const err = await apiFetch('https://api.example/v1/x', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
      expect((err as ApiError).message, String(status)).toBe(`svc が別の場所 (evil.example) へ転送しようとしました —— ${TAIL}`);
      expect((err as ApiError).status, String(status)).toBe(status);
    }
  });

  it('★ 対照: 304 Not Modified は転送ではない (ふつうの失敗の文と、本文を読んだ結果になる)', async () => {
    const res = { ok: false, status: 304, type: 'basic', headers: new Headers(), text: async () => 'not modified', json: async () => null } as unknown as Response;
    const f = vi.fn<typeof fetch>().mockResolvedValue(res);
    const err = await apiFetch('https://api.example/v1/x', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe('svc 304: not modified');
    expect((err as ApiError).status).toBe(304);
  });
});
