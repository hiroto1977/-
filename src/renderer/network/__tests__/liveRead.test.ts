/**
 * ブラウザ版の読み取り経路の検査。
 *
 * ここが `not_implemented` を返し続けていたせいで、資格情報を入れても画面は
 * 永久に同梱サンプルのままだった。**「実データにならない理由」を区別して返す**
 * ことが要件なので、3 つの理由がそれぞれ別の code になることを固定する。
 */
import { describe, expect, it, vi } from 'vitest';
import { canLiveRead, liveRead, LIVE_READERS, type LiveReadDeps } from '../liveRead';

const NOW = Date.UTC(2026, 7, 19);

function deps(over: Partial<LiveReadDeps> = {}): LiveReadDeps {
  return {
    readCredential: async () => 'key-123',
    getProxyJsonFetch: async () => async (url: string) => {
      if (url.endsWith('/teams/members')) return { teamMembers: [{ name: '実在 太郎', email: 'real@corp.example', role: 'owner' }] };
      if (url.endsWith('/teams/daily-usage-data')) return { data: [{ date: NOW, isActive: true }] };
      return { teamMemberSpend: [{ spendCents: 2500 }] };
    },
    now: () => NOW,
    ...over,
  };
}

describe('canLiveRead', () => {
  it('一覧にあるサービスだけ true', () => {
    expect(canLiveRead('cursor')).toBe(true);
    expect(canLiveRead('github')).toBe(false);
    expect(canLiveRead('')).toBe(false);
  });

  it('プロトタイプ由来の名前を「対応済み」と答えない', () => {
    expect(canLiveRead('toString')).toBe(false);
    expect(canLiveRead('constructor')).toBe(false);
    expect(canLiveRead('__proto__')).toBe(false);
  });
});

describe('liveRead — 実データにならない理由を区別する', () => {
  it('一覧に無いサービスは live_read_unsupported', async () => {
    const r = await liveRead('github', deps());
    expect(r).toEqual({
      ok: false,
      code: 'live_read_unsupported',
      message: 'このサービスはブラウザ版からの読み取りに未対応です。同梱のサンプルを表示します。',
    });
  });

  it('資格情報が無ければ not_configured (入れれば実データになると言う)', async () => {
    const nil = await liveRead('cursor', deps({ readCredential: async () => null }));
    expect(nil).toMatchObject({ ok: false, code: 'not_configured' });
    const empty = await liveRead('cursor', deps({ readCredential: async () => '' }));
    expect(empty).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('資格情報の読み出しが失敗しても not_configured で返す (throw させない)', async () => {
    const r = await liveRead('cursor', deps({
      readCredential: async () => {
        throw new Error('vault locked');
      },
    }));
    expect(r).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('プロキシ未設定は proxy_required で、案内文をそのまま渡す', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => {
        throw new Error('設定でプロキシのURLを登録してください');
      },
    }));
    expect(r).toEqual({
      ok: false,
      code: 'proxy_required',
      message: '設定でプロキシのURLを登録してください',
    });
  });

  it('取得そのものの失敗は live_read_failed で、相手の応答を添える', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => async () => {
        throw new Error('HTTP 401');
      },
    }));
    expect(r).toEqual({ ok: false, code: 'live_read_failed', message: 'HTTP 401' });
  });

  it('Error でない値が投げられても文言を返す', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => async () => {
        throw 'boom';
      },
    }));
    expect(r).toMatchObject({ ok: false, code: 'live_read_failed', message: '取得に失敗しました。' });
  });
});

describe('liveRead — 揃っていれば実データを返す', () => {
  it('サンプルではなく取得した中身が出る', async () => {
    const r = await liveRead('cursor', deps());
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: unknown }).data as {
      members: { name: string }[];
      totals: { members: number; activeDays: number; spendUsd: number };
    };
    // 同梱サンプルの架空の 3 人 (佐藤健 / 鈴木彩 / 田中悠) ではないこと
    expect(data.members).toEqual([{ name: '実在 太郎', email: 'real@corp.example', role: 'owner' }]);
    expect(data.totals).toEqual({ members: 1, activeDays: 1, spendUsd: 25 });
  });

  it('現在時刻は外から渡したものを使う (照会期間が決定的になる)', async () => {
    const seen: string[] = [];
    const spy = vi.fn(async (url: string, init: RequestInit): Promise<unknown> => {
      seen.push(String(init.body ?? ''));
      if (url.endsWith('/teams/members')) return { teamMembers: [] };
      if (url.endsWith('/teams/daily-usage-data')) return { data: [] };
      return { teamMemberSpend: [] };
    });
    await liveRead('cursor', deps({ getProxyJsonFetch: async () => spy, now: () => NOW }));
    const usageBody = JSON.parse(seen[1]!) as { startDate: number; endDate: number };
    expect(usageBody.endDate).toBe(NOW);
    expect(usageBody.startDate).toBe(NOW - 29 * 86_400_000);
  });

  it('Cursor はプロキシが要る (ブラウザから直接は叩けない相手)', () => {
    expect(LIVE_READERS.cursor!.needsProxy).toBe(true);
  });

  it('プロキシが要るサービスでは直接 fetch を使わない', async () => {
    const direct = vi.spyOn(globalThis, 'fetch');
    await liveRead('cursor', deps());
    expect(direct).not.toHaveBeenCalled();
    direct.mockRestore();
  });
});
