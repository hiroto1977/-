import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_HTTP_RESPONSE_BYTES,
  declaredLengthExceeds,
  isOverCap,
  readBodyWithCap,
  withBodyDeadline,
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


/**
 * **`withTimeout` は `Response` を返させない。**
 *
 * `fetch` はヘッダを受け取った時点で解決するので、`fn` が `Response` を
 * 返してきたということは本文がまだ読まれていないということで、`finally` が
 * 唯一の abort 源を落とした後に本文が読まれる —— 打ち切りが本文に掛からない。
 *
 * この検査は `clients/__tests__/types.test.ts` にも在るが、**変異検査を
 * `--mutate src/shared/httpLimits.ts` で絞ると、そちらのテストが変異体に
 * 帰属されず「生存」と誤報される** (記録済みの罠)。測定を正直にするために、
 * 守っている当のファイルの隣にも置く。
 */
describe('withTimeout は Response を返させない', () => {
  it('★ fn が Response を返したら投げる', async () => {
    await expect(withTimeout(1000, null, async () => new Response('x', { status: 200 })))
      .rejects.toThrow(/Response を返しています/);
  });

  it('★ 文言が「本文を読み終えるまで入れる」と案内している', async () => {
    await expect(withTimeout(1000, null, async () => new Response('x', { status: 200 })))
      .rejects.toThrow(/本文を使い終えるところまで/);
  });

  it('Response でない値はそのまま通す (締めすぎていない)', async () => {
    expect(await withTimeout(1000, null, async () => ({ status: 200 }))).toEqual({ status: 200 });
    expect(await withTimeout(1000, null, async () => 'text')).toBe('text');
    expect(await withTimeout(1000, null, async () => null)).toBe(null);
  });
});

/**
 * **`withBodyDeadline` —— `Response` を返さねばならない経路のための締切。**
 *
 * `withTimeout` は `fn` が解決した時点で timer を落とす。それは「本文を
 * 使い終えるところまで `fn` の中に入っている」ことが前提で、`Response` を
 * 外へ返す経路 (ブラウザ版の `Transport` / `timedFetch` / `timedFetchAi`) には
 * 使えない。こちらは **timer を落とさない**ので、応答が済んでいれば abort は
 * 何にも当たらず、本文がまだ流れていれば stream が壊れる。
 *
 * 2026-08-29: この関数を足したとき**検査を 1 つも書いていなかった**。
 * 変異検査が「abort の呼び出しを消しても誰も気付かない」と報告して分かった。
 */
describe('withBodyDeadline — 本文を読み終えるまで締切を生かす', () => {
  /** ヘッダは返るが本文が終わらない応答。実物 (undici) は abort で本文を error させる。 */
  const stallingFetch = () =>
    async (_url: string, init?: RequestInit): Promise<Response> => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'));
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          });
        },
      });
      return new Response(body, { status: 200 });
    };

  it('★ 応答が返った後でも、本文の読み取りが締切で切られる', async () => {
    const f = stallingFetch();
    const res = await withBodyDeadline(20, null, (signal) => f('https://example.com', { signal }));
    // ここで既に `withBodyDeadline` は解決している (= timer を落としていたら効かない)
    await expect(readBodyWithCap(res, 1024, 'demo')).rejects.toThrow(/aborted/i);
  }, 5000);

  it('★ 締切の中で読み終えれば普通に返る (締めすぎていない)', async () => {
    const f = async (_u: string, init?: RequestInit): Promise<Response> => {
      void init;
      return new Response('{"ok":true}', { status: 200 });
    };
    const res = await withBodyDeadline(5000, null, (signal) => f('https://example.com', { signal }));
    expect(await readBodyWithCap(res, 1024, 'demo')).toBe('{"ok":true}');
  });

  it('★ 呼び出し側の signal と合成する (上位の打ち切りを殺さない)', async () => {
    const caller = new AbortController();
    const f = stallingFetch();
    const res = await withBodyDeadline(60_000, caller.signal, (signal) =>
      f('https://example.com', { signal }),
    );
    const reading = readBodyWithCap(res, 1024, 'demo');
    caller.abort();
    await expect(reading).rejects.toThrow(/aborted/i);
  }, 5000);

  it('呼び出し側の signal を渡さなくても自前の締切は効く', async () => {
    const f = stallingFetch();
    const res = await withBodyDeadline(20, undefined, (signal) =>
      f('https://example.com', { signal }),
    );
    await expect(readBodyWithCap(res, 1024, 'demo')).rejects.toThrow(/aborted/i);
  }, 5000);

  /*
   * **`unref?.()` の `?.` はブラウザで効く。**
   *
   * Node の `setTimeout` は `Timeout` オブジェクト (= `unref` を持つ) を返すが、
   * ブラウザは**数値**を返す。`?.` を外すと `(5).unref()` で TypeError になり、
   * ブラウザ版のプロキシ経路 (`Transport` / `timedFetch`) が全部落ちる。
   * Node の実行環境では差が出ないので、**ブラウザの形を作って当てる**。
   */
  it('★ timer が数値で返る環境 (ブラウザ) でも落ちない', async () => {
    const real = globalThis.setTimeout;
    let cleared: unknown = null;
    // ブラウザの形: setTimeout は数値を返す
    (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms: number) => {
      void fn;
      void ms;
      return 12345;
    }) as unknown as typeof globalThis.setTimeout;
    try {
      const res = await withBodyDeadline(1000, null, async () => new Response('x', { status: 200 }));
      cleared = res.status;
    } finally {
      globalThis.setTimeout = real;
    }
    expect(cleared).toBe(200);
  });

  it('fetch へ signal を必ず渡す', async () => {
    let seen: AbortSignal | null = null;
    await withBodyDeadline(1000, null, async (signal) => {
      seen = signal;
      return new Response(null, { status: 204 }); // 204 は本文を持てない
    });
    expect(seen).toBeInstanceOf(AbortSignal);
  });
});

/**
 * **`isOverCap` は「上限超過」だけを真にする。**
 *
 * 呼び出し側にはこれを独自の文言・種別へ翻訳する経路が在る
 * (`clients/ollama.ts` の `FetchError`、`network/ollamaWeb.ts` の
 * `kind: 'too-large'`)。最初そこを `catch {}` と一括りに書いたので、
 * **打ち切りも接続断も「大きすぎます」になっていた** —— 利用者を
 * 的外れな対処へ導く文言である。
 *
 * ## 標本は**書かずに、起こして採る**
 *
 * ここで文字列を手で書くと、留まるのは「`readBodyWithCap` の文言は
 * こうだったはず」という**こちらの記憶**であって、実装ではない。記憶が
 * ずれた日に検査も一緒にずれる —— 本 PR で 3 度踏んだ形なので、
 * 実際に上限を超えさせて**投げられた例外そのもの**を材料にする。
 * 文言を直した日に、ここが鳴って翻訳側の見落としを教える。
 */
describe('isOverCap — 上限超過とそれ以外を分ける', () => {
  /** 実際に上限を超えさせて、投げられた例外を採る。 */
  async function thrownBy(res: Response): Promise<unknown> {
    try {
      await readBodyWithCap(res, 4, 'ollama');
      return null;
    } catch (e) {
      return e;
    }
  }

  it('★ stream 経路の上限超過を真と判定する (文言を書かずに起こして採る)', async () => {
    const e = await thrownBy(new Response('0123456789'));
    expect(e).toBeInstanceOf(Error);
    expect(isOverCap(e)).toBe(true);
  });

  it('★ body なし (素朴なモック) の経路でも真と判定する', async () => {
    const mock = { text: () => Promise.resolve('0123456789') } as unknown as Response;
    const e = await thrownBy(mock);
    expect(e).toBeInstanceOf(Error);
    expect(isOverCap(e)).toBe(true);
  });

  it('★ 上限以内なら投げない (対照: 何でも真になっていない)', async () => {
    expect(await thrownBy(new Response('abc'))).toBeNull();
  });

  it('★ 打ち切り・接続断は偽 (これを真にすると文言が的外れになる)', () => {
    expect(isOverCap(new DOMException('aborted', 'AbortError'))).toBe(false);
    expect(isOverCap(new TypeError('fetch failed'))).toBe(false);
    expect(isOverCap(new Error('ollama response too small'))).toBe(false);
  });

  it('Error でない物は偽', () => {
    expect(isOverCap('ollama response too large')).toBe(false);
    expect(isOverCap(null)).toBe(false);
    expect(isOverCap(undefined)).toBe(false);
  });
});
