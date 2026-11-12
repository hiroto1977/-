/**
 * クラウド全停止の演習 —— デスクトップ版の取得 (2026-11-11)。
 *
 * 事業継続の台帳 (`shared/cloudContinuity.ts`) は「クラウドが預かるデータを見る画面」以外を
 * 「止まっても動く」側に数える。それが本当かを、実物の fetcher を 1 つずつ呼んで測る:
 * **網の口 (注入した fetch と global の fetch) を、端末の外に向けて 1 度も叩かないこと。**
 *
 * 叩いた回数を数える (投げるだけの偽物だと、失敗を握りつぶして見本へ倒れる fetcher を見逃す)。
 * 同じ端末 (127.0.0.1 / localhost / ::1) への接続は「他社のクラウド」ではないので数えない ——
 * Ollama の取得がそれに当たる。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/cloud-outage-drill', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {}, openPath: async () => '', showItemInFolder: () => {} },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { LIVE_FETCHERS } from '../index';
import { continuityClassOf } from '../../../shared/cloudContinuity';
import { SERVICE_IDS, type ServiceId } from '../../../shared/serviceId';

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return String((input as { url?: unknown } | null)?.url ?? input);
}

/** 端末の外へ向いた呼び出しを数える fetch。必ず失敗する (網が止まっている)。 */
function countingFetch(calls: string[]): typeof fetch {
  return (async (input: unknown) => {
    const url = urlOf(input);
    if (!isLoopback(url)) calls.push(url);
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
}

async function drill(id: ServiceId): Promise<{ calls: string[]; threw: boolean }> {
  const calls: string[] = [];
  const f = countingFetch(calls);
  vi.stubGlobal('fetch', f);
  let threw = false;
  try {
    await (LIVE_FETCHERS[id] as (c: never) => Promise<unknown>)({ token: '', fetch: f } as never);
  } catch {
    threw = true;
  }
  return { calls, threw };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('クラウド全停止の演習 (デスクトップ版の取得)', () => {
  const offCloud = SERVICE_IDS.filter((id) => continuityClassOf(id) !== 'cloud-data');
  const cloudData = SERVICE_IDS.filter((id) => continuityClassOf(id) === 'cloud-data');

  it('★ 標本: 数える fetch は、外へ向いた呼び出しを数え、同じ端末への接続は数えない', async () => {
    const calls: string[] = [];
    const f = countingFetch(calls);
    await expect(f('https://api.example.invalid/x')).rejects.toThrow('fetch failed');
    await expect(f('http://127.0.0.1:11434/api/tags')).rejects.toThrow('fetch failed');
    await expect(f(new URL('http://localhost:3000/'))).rejects.toThrow('fetch failed');
    expect(calls).toEqual(['https://api.example.invalid/x']);
  });

  it('★ 預かるデータを見る画面を除く全サービスの取得は、端末の外へ 1 度も出ない', async () => {
    expect(offCloud.length).toBeGreaterThanOrEqual(60);
    const leaked: string[] = [];
    for (const id of offCloud) {
      const { calls } = await drill(id);
      if (calls.length > 0) leaked.push(`${id}: ${calls[0]}`);
    }
    expect(leaked).toEqual([]);
  }, 60_000);

  it('★ その取得は、網が止まっていても失敗しない (見本か端末の記録を返す)', async () => {
    const failed: string[] = [];
    for (const id of offCloud) {
      const { threw } = await drill(id);
      if (threw) failed.push(id);
    }
    expect(failed).toEqual([]);
  }, 60_000);

  it('対照: 預かるデータを見る画面の取得は、実際に外へ出ようとして失敗する (数え方が空でない証拠)', async () => {
    expect(cloudData.length).toBeGreaterThanOrEqual(15);
    const silent: string[] = [];
    for (const id of cloudData) {
      const { calls, threw } = await drill(id);
      // 資格情報の形を先に検めて断る物 (JSON の包みを要る Atlassian など) は外へ出る前に投げる。
      if (calls.length === 0 && !threw) silent.push(id);
    }
    expect(silent).toEqual([]);
    const { calls } = await drill('github');
    expect(calls.length).toBeGreaterThan(0);
    expect(new URL(calls[0] ?? '').hostname).toBe('api.github.com');
  }, 60_000);
});
