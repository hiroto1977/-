import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import {
  ADVISOR_DISCLAIMER,
  DEFAULT_RISK_PARAMS,
  MACD_SIGNAL_STRATEGY,
  RSI_MEAN_REVERSION_STRATEGY,
  SMA_CROSSOVER_STRATEGY,
  STRATEGIES,
} from '../../main/clients/stocks';
import {
  ADVISOR_DISCLAIMER as WEB_ADVISOR_DISCLAIMER,
  DEFAULT_RISK_PARAMS as WEB_DEFAULT_RISK_PARAMS,
  MACD_SIGNAL_STRATEGY as WEB_MACD_SIGNAL_STRATEGY,
  RSI_MEAN_REVERSION_STRATEGY as WEB_RSI_MEAN_REVERSION_STRATEGY,
  SMA_CROSSOVER_STRATEGY as WEB_SMA_CROSSOVER_STRATEGY,
  STRATEGIES as WEB_STRATEGIES,
} from '../../renderer/data/stocksAnalysisWeb';

/*
 * **両ビルドに 1 つずつ在る定数が、同じ値であること** (2026-09-20 · パス 331)。
 *
 * `dualBuildDecisions.test.ts` の針は 2026-09-20 まで `^export function` だけで、
 * **`export const` が 1 つも映っていなかった**。針を広げて初めて、この 6 つが
 * 「両ビルドに 1 つずつ在るのに誰も突き合わせていない」ことが分かった。
 *
 * 中身は**画面に出る文面と数字**である —— 投資助言でない旨の断り・既定の
 * リスク値・戦略の目録。片方だけ変えても、それまでは何も鳴らなかった。
 *
 * 戦略は関数値なので `toEqual` では比べられない (JSON にすると `undefined`)。
 * **同じ足を与えて同じシグナルを返すこと**で比べる —— 値の同一性ではなく
 * 振る舞いの一致が、ここで守りたい性質である。
 */

interface Candle {
  readonly date: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** 決定的な足。乱数を使うと「たまたま一致」と「必ず一致」が見分けられない。 */
function candles(n: number, seed: number): Candle[] {
  let x = seed;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const close = 100 + (x % 4000) / 100;
    out.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + (x % 500),
    });
  }
  return out;
}

describe('株価の定数は両ビルドで同じ値 (パス 331)', () => {
  it('★ 投資助言でない旨の断りは 1 字も違わない', () => {
    expect(WEB_ADVISOR_DISCLAIMER).toBe(ADVISOR_DISCLAIMER);
    // 空虚に一致していないこと (両方とも空文字ではない)。
    expect(ADVISOR_DISCLAIMER.length).toBeGreaterThan(20);
    expect(ADVISOR_DISCLAIMER).toContain('投資助言ではありません');
  });

  it('★ 既定のリスク値は同じ', () => {
    expect(WEB_DEFAULT_RISK_PARAMS).toEqual(DEFAULT_RISK_PARAMS);
    // 空虚な一致 ({} 同士) でないこと。
    expect(Object.keys(DEFAULT_RISK_PARAMS).length).toBeGreaterThanOrEqual(3);
  });

  it('★ 戦略の目録は同じ id を持つ', () => {
    expect(Object.keys(WEB_STRATEGIES).sort()).toEqual(Object.keys(STRATEGIES).sort());
    expect(Object.keys(STRATEGIES).length).toBe(3);
  });

  const PAIRS: [string, (c: readonly Candle[]) => unknown, (c: readonly Candle[]) => unknown][] = [
    ['sma-crossover', SMA_CROSSOVER_STRATEGY, WEB_SMA_CROSSOVER_STRATEGY as unknown as (c: readonly Candle[]) => unknown],
    ['rsi-mean-reversion', RSI_MEAN_REVERSION_STRATEGY, WEB_RSI_MEAN_REVERSION_STRATEGY as unknown as (c: readonly Candle[]) => unknown],
    ['macd-signal', MACD_SIGNAL_STRATEGY, WEB_MACD_SIGNAL_STRATEGY as unknown as (c: readonly Candle[]) => unknown],
  ];

  it.each(PAIRS)('★ 戦略 %s は同じ足に同じシグナルを返す', (_id, main, web) => {
    // 履歴が足りない場合 / 足りる場合の両方を通す (前者だけだと hold で一致して
    // しまい、判定そのものを比べたことにならない)。
    for (const n of [10, 60, 200]) {
      const cs = candles(n, 7 + n);
      expect(JSON.stringify(web(cs)), `${n} 本`).toBe(JSON.stringify(main(cs)));
    }
  });

  it('★ 標本: 戦略は履歴が足りれば hold 以外も返す (全部 hold で一致していない)', () => {
    const actions = new Set<string>();
    for (const [, main] of PAIRS) {
      for (let seed = 1; seed <= 40; seed++) {
        const sig = main(candles(200, seed)) as { action?: string };
        if (typeof sig.action === 'string') actions.add(sig.action);
      }
    }
    expect([...actions].sort().length, `出た action: ${[...actions].join(',')}`).toBeGreaterThan(1);
  });
});
