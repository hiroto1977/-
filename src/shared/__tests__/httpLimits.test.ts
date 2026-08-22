import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_HTTP_RESPONSE_BYTES,
  declaredLengthExceeds,
  readBodyWithCap,
  withTimeout,
} from '../httpLimits';

/*
 * 外部からの応答に置く 2 つの守り —— **打ち切り**と**応答サイズ**。
 *
 * 2026-08-22 まで経路ごとにばらばらで、`clients/types.ts` の `jsonFetch`
 * (SaaS 74 本すべてが通る口) にはどちらも無かった。判定をここ 1 つに寄せた
 * ので、検査もここに置く。
 */

/** body を持つ本物に近い Response。 */
function streamed(text: string, headers: Record<string, string> = {}): Response {
  return new Response(new TextEncoder().encode(text), { status: 200, headers });
}

describe('readBodyWithCap — 上限を超えたら読むのをやめる', () => {
  it('上限内の本文はそのまま返す', async () => {
    expect(await readBodyWithCap(streamed('{"a":1}'), 1000, 'x')).toBe('{"a":1}');
  });

  it('上限ちょうどは通す (境界)', async () => {
    const body = 'a'.repeat(64);
    expect(await readBodyWithCap(streamed(body), 64, 'x')).toBe(body);
  });

  it('上限 +1 は落とす (境界)', async () => {
    await expect(readBodyWithCap(streamed('a'.repeat(65)), 64, 'x')).rejects.toThrow(/too large/);
  });

  it('文言に呼び出し側の名前が入る', async () => {
    await expect(readBodyWithCap(streamed('a'.repeat(65)), 64, 'github')).rejects.toThrow(/^github/);
  });

  it('超えた時点で読むのをやめる (残りを読み切らない)', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 50) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(100));
      },
    });
    const res = new Response(body, { status: 200 });
    await expect(readBodyWithCap(res, 250, 'x')).rejects.toThrow(/too large/);
    // 250 バイト = 3 チャンク目で超える。50 チャンク全部は読んでいない。
    expect(pulled).toBeLessThan(10);
  });

  /*
   * body を持たない実行環境 (素朴な fetch モック) では `text()` に落ちる。
   * **そこでも判定は同じ** —— モックのときだけ緩い規則にはしない。
   */
  it('body の無い応答でも上限は効く', async () => {
    const res = { text: async () => 'a'.repeat(65) } as unknown as Response;
    await expect(readBodyWithCap(res, 64, 'x')).rejects.toThrow(/too large/);
  });

  it('body の無い応答でも上限内なら通る', async () => {
    const res = { text: async () => 'ok' } as unknown as Response;
    expect(await readBodyWithCap(res, 64, 'x')).toBe('ok');
  });

  it('UTF-8 は byte 単位で数える (文字数ではない)', async () => {
    // 「あ」は UTF-8 で 3 バイト。3 文字 = 9 バイト。
    await expect(readBodyWithCap(streamed('あああ'), 8, 'x')).rejects.toThrow(/too large/);
    expect(await readBodyWithCap(streamed('あああ'), 9, 'x')).toBe('あああ');
  });
});

describe('declaredLengthExceeds — 読む前の先手の門', () => {
  it('宣言が上限を超えていれば、その値を返す', () => {
    expect(declaredLengthExceeds(streamed('x', { 'content-length': '999' }), 100)).toBe(999);
  });

  it('上限以下なら null', () => {
    expect(declaredLengthExceeds(streamed('x', { 'content-length': '50' }), 100)).toBeNull();
  });

  it('ヘッダーが無ければ null (byte 単位の門に委ねる)', () => {
    expect(declaredLengthExceeds(streamed('x'), 100)).toBeNull();
  });

  /*
   * `Content-Length: -1` は有限かつ上限以下なので、素直に書くとすり抜ける。
   * **`> 0` を要求している**ことをここで留める。
   */
  it.each([['負値', '-1'], ['ゼロ', '0'], ['数でない', 'abc'], ['空', '']])(
    '壊れた宣言 (%s) は無視する',
    (_label, v) => {
      expect(declaredLengthExceeds(streamed('x', { 'content-length': v }), 100)).toBeNull();
    },
  );

  it('headers を持たない応答でも落ちない', () => {
    expect(declaredLengthExceeds({} as Response, 100)).toBeNull();
  });

  /*
   * `headers` は在るが `get` が無い形。素朴な fetch モックに実在するので、
   * `?.get?.()` の 2 つ目の `?.` はここで要る。
   */
  it('headers はあるが get を持たない応答でも落ちない', () => {
    expect(declaredLengthExceeds({ headers: {} } as unknown as Response, 100)).toBeNull();
  });
});

describe('withTimeout — 打ち切り', () => {
  it('間に合えば結果を返す', async () => {
    expect(await withTimeout(1000, null, async () => 'ok')).toBe('ok');
  });

  it('時間を過ぎたら signal が abort する', async () => {
    const aborted = await withTimeout(10, null, async (signal) => {
      await new Promise<void>((r) => {
        signal.addEventListener('abort', () => r());
      });
      return signal.aborted;
    });
    expect(aborted).toBe(true);
  });

  it('終わったら timer を片付ける (残らない)', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await withTimeout(10_000, null, async () => 'ok');
      expect(clear).toHaveBeenCalled();
    } finally {
      clear.mockRestore();
    }
  });

  it('失敗しても timer を片付ける', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await expect(
        withTimeout(10_000, null, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(clear).toHaveBeenCalled();
    } finally {
      clear.mockRestore();
    }
  });

  /*
   * **上位の打ち切りを殺さない。** 自前の timeout を足したせいで呼び出し側の
   * signal が効かなくなると、「守りを足したら別の守りが消えた」形になる。
   */
  it('呼び出し側の signal も効く (合成する)', async () => {
    const caller = new AbortController();
    const p = withTimeout(60_000, caller.signal, async (signal) => {
      await new Promise<void>((r) => {
        signal.addEventListener('abort', () => r());
      });
      return signal.aborted;
    });
    caller.abort();
    expect(await p).toBe(true);
  });
});

/*
 * 既定値は**モジュール定数**なので、静的 import のまま比べても変異体が
 * 届かない (覆われた static 変異体)。`vi.resetModules()` + 動的 import で
 * 毎回読み直し、値そのものを字面で留める。
 */
describe('既定値', () => {
  it('応答サイズの上限は 10MiB ちょうど', async () => {
    vi.resetModules();
    const m = await import('../httpLimits');
    expect(m.MAX_HTTP_RESPONSE_BYTES).toBe(10485760);
  });

  it('待ち時間の既定は 30 秒 (ollama.ts に揃えた値)', async () => {
    vi.resetModules();
    const m = await import('../httpLimits');
    expect(m.DEFAULT_HTTP_TIMEOUT_MS).toBe(30000);
  });

  it('静的 import 側とも一致している (2 つの読み方でずれない)', () => {
    expect(MAX_HTTP_RESPONSE_BYTES).toBe(10485760);
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(30000);
  });
});
