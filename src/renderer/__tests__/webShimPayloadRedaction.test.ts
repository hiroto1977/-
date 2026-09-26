/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';

const SENTINEL = 'sk-ant-api03-SENTINELKEY0000';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => JSON.stringify({ anthropic: SENTINEL, openai: SENTINEL }),
    status: async () => 'unlocked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

/*
 * **`err()` を通らない誤りの文言が 1 つだけあった。**
 *
 * `web-shim` の `err()` は `redactForMessage` を内側で通すので、そこを
 * 通る文言は全部伏せられる。だが `assistant.chatAll` はプロバイダごとの
 * 失敗を `ok({ answers })` の**中身**として返すので、関門を通らない。
 *
 * 実測 (2026-08-23): 送信が `Authorization: Bearer sk-ant-…` を含む例外で
 * 落ちると、その鍵が**そのまま `answers[].error` に載って画面へ届いた**。
 * main 側の同じ経路は先に塞いであったのに、ブラウザ版が残っていた。
 *
 * **数える単位は「err() の呼び出し」ではなく「画面へ出る文字列」。**
 * 出口が 1 つだと思い込んだところに、出口がもう 1 つあった。
 */

type Hub = { invoke: (s: string, a: string, p: unknown) => Promise<unknown> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

describe('画面へ出る文字列は、どの出口でも伏字を通る', () => {
  it('chatAll: 例外に混じった鍵が answers[].error へ逐語で出ない', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`connect ECONNREFUSED while sending Authorization: Bearer ${SENTINEL}`);
    });
    const hub = await loadHub();
    const res = await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    });
    const blob = JSON.stringify(res);
    expect(blob, '鍵が逐語で画面まで届いている').not.toContain(SENTINEL);
  });

  it('走査が実物に届いている (answers に到達していて、空虚でない)', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`boom Authorization: Bearer ${SENTINEL}`);
    });
    const hub = await loadHub();
    const res = (await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    })) as { ok: boolean; data?: { answers?: { ok: boolean; error?: string }[] } };
    // ここへ来ていること自体が前提 —— 資格情報の形が違うと
    // `not_configured` で折り返して、上の検査は何も確かめない。
    expect(res.ok, 'chatAll の本体に届いていない (検査が空虚)').toBe(true);
    const answers = res.data?.answers ?? [];
    expect(answers.length, 'プロバイダが 1 つも走っていない').toBeGreaterThanOrEqual(2);
    const failed = answers.filter((a) => !a.ok && (a.error ?? '').length > 0);
    expect(failed.length, '失敗した答えが無い — 誤りの経路を通っていない').toBeGreaterThanOrEqual(2);
    // 伏せた跡が在ること (中身ごと消えたのではなく、伏字として残っている)。
    expect(failed.some((a) => (a.error ?? '').includes('Authorization'))).toBe(true);
  });

  it('伏字は必要な文脈まで消さない (読める誤りとして残る)', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error(`connect ECONNREFUSED to api.anthropic.com`);
    });
    const hub = await loadHub();
    const res = (await hub.invoke('assistant', 'chatAll', {
      messages: [{ role: 'user', content: 'hi' }],
    })) as { data?: { answers?: { error?: string }[] } };
    const errors = (res.data?.answers ?? []).map((a) => a.error ?? '').join(' ');
    expect(errors, '秘密でない文脈まで消している').toContain('ECONNREFUSED');
  });
});


/**
 * **ブラウザ版の出口を、台帳から総当たりする** (2026-09-14 · パス 233)。
 *
 * ## デスクトップ側と同じ形の穴
 *
 * 上の 3 件はどれも `assistant` / **`chatAll`** を駆動している —— 2026-08-23 に
 * 実際に鍵を通していた 1 経路である。パス 232 でデスクトップ側の同じ検査
 * (`main/__tests__/rendererBoundMessages.test.ts`) を「事故の一覧」から
 * 「登録済み 76 fetcher + 54 action の総当たり」へ移したので、こちらも移す。
 *
 * **ブラウザ版のほうが賭け金が高い** —— main プロセスが無いので
 * `web-shim.ts` が**境界そのもの**であり、そこが値に入れた文言は画面へ直行する。
 *
 * ## 実測 (2026-09-14)
 *
 * `LIVE_ACTIONS` の 54 組 + `SERVICE_IDS` の 76 件を `hub.invoke` /
 * `hub.fetchSnapshot` に通し、伏字対象でない印で「文言を値に入れる出口」を数えた:
 *
 * ```
 *   駆動 129 件 → 印を運んだ出口 2 件:  assistant:chat  /  assistant:chatAll
 * ```
 *
 * **`assistant:chat` は上の 3 件が 1 度も駆動していなかった。** 今日は伏字が
 * 掛かっている (秘密で同じ走査をすると 0 件) ので**漏れてはいない** ——
 * 足したのは「駆動されていない出口が増えたら鳴る」ための網である。
 *
 * ## 計器の罠 —— 印をヘッダ名で包むと、生存の対照が死ぬ
 *
 * 最初この走査は印を `Authorization: Bearer <印>` の形で投げており、
 * **0 件**を返した。伏字は `Authorization:` の**値を丸ごと**伏せる規則を持つので、
 * 秘密かどうかに関わらず印も消える —— つまり「印がどこにも出てこない」のは
 * **経路が無いからではなく、印を自分で消していたから**だった。
 *
 * 生存の対照に使う印は、**伏字の規則に当たらない形で**流すこと
 * (ヘッダ名で包まない・既知の接頭辞を付けない)。上の 3 件が
 * `error` に `'Authorization'` が残ることで生存を見ているのは、この裏返しである。
 */
describe('★ ブラウザ版の出口を台帳から総当たりする (パス 233)', () => {
  /** 走査の本体。`needle` を含む例外を投げさせ、値に逐語で載った出口を返す。 */
  async function sweep(needle: string, wrapped: boolean): Promise<{ carried: string[]; ran: number }> {
    // **包むかどうかを呼び出し側が選ぶ。** 印は包まない (包むと伏字が印を消す)。
    const message = wrapped
      ? `connect ECONNREFUSED while sending Authorization: Bearer ${needle}`
      : `connect ECONNREFUSED boom ${needle}`;
    vi.stubGlobal('fetch', () => {
      throw new Error(message);
    });
    const hub = (await loadHub()) as unknown as {
      invoke: (s: string, a: string, p: unknown) => Promise<unknown>;
      fetchSnapshot: (s: string) => Promise<unknown>;
    };
    const { LIVE_ACTIONS } = await import('../../main/clients/index');
    const { SERVICE_IDS } = await import('../../shared/serviceId');

    const carried: string[] = [];
    let ran = 0;
    for (const [id, map] of Object.entries(LIVE_ACTIONS)) {
      for (const name of Object.keys(map as object)) {
        try {
          const out = await hub.invoke(id, name, { messages: [{ role: 'user', content: 'hi' }] });
          ran += 1;
          if ((JSON.stringify(out) ?? '').includes(needle)) carried.push(`invoke ${id}:${name}`);
        } catch {
          // 投げた = 画面へは `err()` 経由で出る = 伏字を通る。
        }
      }
    }
    for (const id of SERVICE_IDS) {
      try {
        const out = await hub.fetchSnapshot(id);
        ran += 1;
        if ((JSON.stringify(out) ?? '').includes(needle)) carried.push(`snapshot ${id}`);
      } catch {
        // 同上。
      }
    }
    return { carried, ran };
  }

  it('★ 走査が死んでいない (印を運ぶ出口を実測で名指しできる)', async () => {
    const { carried, ran } = await sweep('PLAIN-MARKER-NOT-A-SECRET-233', false);
    expect(ran, '駆動した出口が少なすぎる').toBeGreaterThanOrEqual(100);
    // **印がどこにも出てこなければ、下の「秘密 0 件」は空虚な合格になる。**
    expect(carried.length, '印がどの戻り値にも現れない —— 走査が死んでいる').toBeGreaterThanOrEqual(2);
    // 実測した 2 つ。`chat` は上の 3 件が 1 度も駆動していない出口である。
    expect(carried).toContain('invoke assistant:chatAll');
    expect(carried).toContain('invoke assistant:chat');
  }, 180_000);

  it('★ どの出口も戻り値に秘密を逐語で載せない', async () => {
    const { carried } = await sweep(`${['sk', 'ant', 'api03'].join('-')}-${'Q'.repeat(36)}`, true);
    expect(carried, `戻り値に秘密が逐語で載った出口: ${carried.join(', ')}`).toEqual([]);
  }, 180_000);
});
