/**
 * 同時の書き込みが互いを壊さない (2026-10-15 · パス 522 · threat: T-055)。
 *
 * 直す前の `stocks.ts` / `teamradar.ts` は固定名の `.tmp` へ書いて `rename` し、
 * 「読む → 直す → 書く」に鎖が無かった。実測 (2026-10-15 · 実ファイル):
 * 同時の 2 つの保存 300 回のうち **49 回で本体が壊れた JSON** になり、
 * `chmod` が ENOENT で投げ、同時の 2 つの登録は片方の 1 件を消した。
 * `secrets.ts` は同じ形の鎖を 2026-08 から持っていた。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', async () => (await import('./safeStorageMock')).electronSafeStorageMock());

const { addWatchlistEntry, loadStoredWatchlist, saveStocksState } = await import('../clients/stocks');
const { loadTeamRadarState, saveTeamRadarState } = await import('../clients/teamradar');
const { isAtomicLitterOf } = await import('../atomicWrite');
const { createWriteChain } = await import('../writeChain');

let dir = '';
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-writer-race-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('createWriteChain', () => {
  it('前の仕事が終わるまで次は始まらず、投げても鎖は続く', async () => {
    const chain = createWriteChain();
    const order: string[] = [];
    const a = chain(async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('a-end');
      throw new Error('boom');
    });
    const b = chain(async () => {
      order.push('b-start');
      return 'b';
    });
    await expect(a).rejects.toThrow('boom');
    expect(await b).toBe('b');
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });
});

describe('stocks のウォッチリスト (threat: T-055)', () => {
  it('★ 同時の登録 30 件は 1 件も失われず、本体は読める JSON のまま (threat: T-055)', async () => {
    const target = path.join(dir, 'state.json');
    const deps = { statePath: () => target };
    await saveStocksState({ watchlist: ['AAPL'] }, deps);
    const symbols = Array.from({ length: 30 }, (_, i) => `S${i}`);
    await Promise.all(symbols.map((s) => addWatchlistEntry(s, deps)));
    const stored = await loadStoredWatchlist(deps);
    expect(stored.kind).toBe('saved');
    if (stored.kind === 'saved') expect([...stored.symbols].sort()).toEqual(['AAPL', ...symbols].sort());
  });

  it('★ 同時の保存 2 つが作業ファイルを切り詰め合わない (一意な名前 + 鎖)', async () => {
    const target = path.join(dir, 'state.json');
    const deps = { statePath: () => target };
    const long = { watchlist: Array.from({ length: 200 }, (_, i) => `LONG${i}`) };
    const short = { watchlist: ['A'] };
    for (let round = 0; round < 40; round++) {
      await Promise.all([saveStocksState(short, deps), saveStocksState(long, deps)]);
      const stored = await loadStoredWatchlist(deps);
      expect(stored.kind, `round ${round}: ${JSON.stringify(stored)}`).toBe('saved');
    }
    // 残骸は無く、残るとしても `isAtomicLitterOf` が見分けられる名前である。
    const names = (await fs.readdir(dir)).filter((n) => n !== 'state.json');
    expect(names).toEqual([]);
    expect(isAtomicLitterOf(target, 'state.json.tmp-1-2-3')).toBe(true);
  });
});

describe('teamradar の評価 (threat: T-055)', () => {
  it('★ 同時の保存 2 つの後で、本体は封緘が開けて読める', async () => {
    const target = path.join(dir, 'team-radar.json');
    const deps = { statePath: () => target };
    const big = { department: '営業部', evaluatedAt: '2026-10-15', members: Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, name: `社員${i}`, scores: [3, 3, 3, 3, 3] })) };
    const small = { department: '営業部', evaluatedAt: '2026-10-15', members: [] };
    for (let round = 0; round < 20; round++) {
      await Promise.all([saveTeamRadarState(small as never, deps), saveTeamRadarState(big as never, deps)]);
      const stored = await loadTeamRadarState(deps);
      expect(stored.kind, `round ${round}`).toBe('saved');
    }
    expect((await fs.readdir(dir)).filter((n) => n !== 'team-radar.json')).toEqual([]);
  });
});
