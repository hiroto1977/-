import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NotImplementedError,
  apiFetch,
  apiFetchOkFlag,
  bearer,
  jsonBody,
  withQuery,
} from '../http';

/** `Response` の必要な面だけを持つ替え玉。 */
function res(body: unknown, init: { ok?: boolean; status?: number; text?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    // `readBodyWithCap` は本文を **text() から**読む (`res.body` を持たない
    // 素朴なモックのための退避路)。成功時の本文は body を直列化して渡す。
    text: async () => init.text ?? JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withQuery', () => {
  it('パラメータが無ければ ? を付けない', () => {
    expect(withQuery('https://x.test/a', {})).toBe('https://x.test/a');
  });

  it('undefined の項目は落とす（空文字として送らない）', () => {
    expect(withQuery('https://x.test/a', { q: undefined, b: '1' })).toBe('https://x.test/a?b=1');
  });

  it('すべて undefined なら ? を付けない', () => {
    expect(withQuery('https://x.test/a', { q: undefined })).toBe('https://x.test/a');
  });

  it('数値は文字列にする', () => {
    expect(withQuery('https://x.test/a', { n: 5 })).toBe('https://x.test/a?n=5');
  });

  it('0 と空文字は落とさない（undefined とは違う）', () => {
    expect(withQuery('https://x.test/a', { n: 0, s: '' })).toBe('https://x.test/a?n=0&s=');
  });

  it('記号を含む値をエスケープする', () => {
    expect(withQuery('https://x.test/a', { q: 'is:pr author:@me' })).toBe(
      'https://x.test/a?q=is%3Apr+author%3A%40me',
    );
  });
});

describe('bearer / jsonBody', () => {
  it('Authorization を組み立てる', () => {
    expect(bearer('tok')).toEqual({ Authorization: 'Bearer tok' });
  });

  it('追加ヘッダを重ねられる', () => {
    expect(bearer('tok', { Accept: 'application/json' })).toEqual({
      Authorization: 'Bearer tok',
      Accept: 'application/json',
    });
  });

  it('jsonBody は Content-Type を足す', () => {
    expect(jsonBody('tok')).toEqual({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    });
  });

  it('jsonBody にも追加ヘッダを重ねられる', () => {
    expect(jsonBody('tok', { 'Notion-Version': '2022-06-28' })).toEqual({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    });
  });
});

describe('apiFetch', () => {
  it('2xx なら JSON を返す', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res({ a: 1 }));
    await expect(apiFetch<{ a: number }>('https://x.test', {}, { fetch: f, serviceId: 's' })).resolves.toEqual({ a: 1 });
    // `signal` が乗る —— 締切は本文を読み終えるまで掛かる (下の専用の検査を見よ)。
    expect(f).toHaveBeenCalledWith('https://x.test', { signal: expect.any(AbortSignal) });
  });

  it('fetch を渡さなければグローバルの fetch を使う', async () => {
    const g = vi.fn<typeof fetch>().mockResolvedValue(res({ ok: 1 }));
    vi.stubGlobal('fetch', g);
    await expect(apiFetch('https://x.test', {}, { serviceId: 's' })).resolves.toEqual({ ok: 1 });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('2xx でなければ status 付きの ApiError', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res(null, { ok: false, status: 404, text: 'nope' }));
    const err = await apiFetch('https://x.test', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
    expect((err as ApiError).serviceId).toBe('svc');
    expect((err as ApiError).message).toBe('svc 404: nope');
    expect((err as ApiError).name).toBe('ApiError');
  });

  it('エラー本文の秘密を伏せる（上流が資格情報を反射しても漏らさない）', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(res(null, { ok: false, status: 401, text: 'bad token ghp_abcdefghijklmnopqrstuvwxyz0123456789' }));
    const err = await apiFetch('https://x.test', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect((err as ApiError).message).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('エラー本文は 200 字で切る', async () => {
    const long = 'y'.repeat(500);
    const f = vi.fn<typeof fetch>().mockResolvedValue(res(null, { ok: false, status: 500, text: long }));
    const err = await apiFetch('https://x.test', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe(`svc 500: ${'y'.repeat(200)}`);
  });

  it('本文が読めなくても status は落とさない', async () => {
    const broken = {
      ok: false,
      status: 502,
      json: async () => null,
      text: async () => {
        throw new Error('stream closed');
      },
    } as unknown as Response;
    const f = vi.fn<typeof fetch>().mockResolvedValue(broken);
    const err = await apiFetch('https://x.test', {}, { fetch: f, serviceId: 'svc' }).catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).message).toBe('svc 502: ');
  });
});

describe('apiFetchOkFlag', () => {
  it('ok:true はそのまま通す', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res({ ok: true, v: 1 }));
    await expect(apiFetchOkFlag('https://x.test', {}, { fetch: f, serviceId: 'slack' })).resolves.toEqual({
      ok: true,
      v: 1,
    });
  });

  it('ok が無い応答も通す（ok を持たない API を壊さない）', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res({ v: 1 }));
    await expect(apiFetchOkFlag('https://x.test', {}, { fetch: f, serviceId: 'slack' })).resolves.toEqual({ v: 1 });
  });

  it('HTTP 200 でも ok:false なら失敗にする（送れていないものを送れたことにしない）', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res({ ok: false, error: 'channel_not_found' }));
    const err = await apiFetchOkFlag('https://x.test', {}, { fetch: f, serviceId: 'slack' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('slack: channel_not_found');
    expect((err as ApiError).status).toBe(200);
  });

  it('ok:false で error が無くても落とす', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(res({ ok: false }));
    const err = await apiFetchOkFlag('https://x.test', {}, { fetch: f, serviceId: 'slack' }).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe('slack: unknown error');
  });
});

describe('NotImplementedError', () => {
  it('サービス・メソッド・理由を message に含める', () => {
    const err = new NotImplementedError('canva', 'generateDesign', '一次資料が無い');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotImplementedError');
    expect(err.message).toBe('canva.generateDesign() は未実装です: 一次資料が無い');
  });
});
