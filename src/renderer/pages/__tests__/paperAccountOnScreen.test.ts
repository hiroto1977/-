/** @vitest-environment jsdom */
/**
 * **株式の画面で、ペーパー口座の 5 タイルを実際に見る** (2026-09-12 · パス 189)。
 *
 * 単体検査 (`shared/__tests__/paperAccount.test.ts`) は規則しか言えない。
 * **画面が何を刷るか**は描いてみるしかない (パス 175 以来の姿勢) ——
 * 2026-09-12 まで、ここには「損益 +￥0 / +0.00%」が**緑で**出ていた。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StocksPage } from '../StocksPage';
import { SNAPSHOT } from '../../data/snapshot';
import { PNL_UNKNOWN_COLOR, PNL_UP_COLOR } from '../../../shared/paperAccount';

type Wl = (typeof SNAPSHOT.stocks)['watchlist'][number];

const row = (symbol: string, action: Wl['signal']['action'], close: number): Wl => ({
  symbol,
  label: symbol,
  latestClose: close,
  previousClose: close,
  changePct: 0,
  signal: { date: '2026-09-01', action, confidence: 0.3, reason: 'no crossover', strategy: 'sma-crossover' },
  candles: [
    { date: '2026-08-31', open: close, high: close, low: close, close, volume: 1 },
    { date: '2026-09-01', open: close, high: close, low: close, close, volume: 1 },
  ],
});

/** 実測の既定と同じ形: 5 銘柄すべて「見送り」・玉 0・取引 0。 */
const ALL_HOLD = {
  ...SNAPSHOT.stocks,
  watchlist: [row('7203.T', 'hold', 3_200), row('AAPL', 'hold', 195)],
};

/** 約定が 1 件在る口座 (損益が「在る」場合の対照)。 */
const TRADED = {
  ...SNAPSHOT.stocks,
  watchlist: [row('AAPL', 'buy', 220)],
  portfolio: {
    cash: 900_000,
    initialCash: 1_000_000,
    positions: { AAPL: { shares: 500, avgCost: 200 } },
    history: [
      { date: '2026-09-01', ticker: 'AAPL', action: 'buy' as const, shares: 500, price: 200, cashAfter: 900_000, reason: 'r' },
    ],
  },
};

let version = '0.1.0-web';
let payload: unknown = ALL_HOLD;
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  version = '0.1.0-web';
  payload = ALL_HOLD;
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve(version),
    listConfigured: () => Promise.resolve(['stocks']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: payload }),
    invoke: () => Promise.resolve({ ok: false, code: 'action_failed', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(StocksPage));
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** ラベルからタイルの { 値, 副文, 色 } を読む。 */
function tile(label: string): { value: string; sub: string; color: string } | null {
  for (const el of container.querySelectorAll('div')) {
    const kids = [...el.children];
    if (kids.length >= 2 && kids[0]?.textContent === label) {
      const value = kids[1] as HTMLElement;
      return {
        value: value.textContent ?? '',
        sub: kids[2]?.textContent ?? '',
        color: value.style.color,
      };
    }
  }
  return null;
}

const marker = (name: string): string | null => {
  const el = container.querySelector(`[${name}]`);
  return el === null ? null : (el.textContent ?? '').replace(/\s+/g, ' ');
};

/** jsdom は `#22c55e` を `rgb(34, 197, 94)` に正規化するので、比べる前に両方通す。 */
function cssColor(value: string): string {
  const d = document.createElement('div');
  d.style.color = value;
  return d.style.color;
}

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

describe('損益タイル — 1 度も約定していない口座', () => {
  it('★ 「—」と理由を刷り、緑にしない', async () => {
    await mount();
    const t = tile('損益');
    expect(t).not.toBeNull();
    expect(t!.value).toBe('—');
    expect(t!.sub).toBe('取引 0 件 — 損益は算定できません');
    expect(t!.color).toBe(cssColor(PNL_UNKNOWN_COLOR));
    // 標本: 直っていなければ出ていた表示 (これが出たら元に戻っている)
    expect(t!.value).not.toBe('+￥0');
    expect(t!.value).not.toBe('+¥0');
    expect(t!.color).not.toBe(cssColor(PNL_UP_COLOR));
  });

  it('★ 取引履歴タイルは「0 / paper trades」を成績に見せない', async () => {
    await mount();
    const t = tile('取引履歴');
    expect(t!.value).toBe('0');
    expect(t!.sub).toBe('まだ 1 件もありません');
    expect(t!.sub).not.toBe('paper trades');
  });

  it('現在資産・現金残高・初期入金はそのまま出る (消していない)', async () => {
    await mount();
    expect(tile('現在資産 (cash + 保有時価)')?.value).toBe('￥1,000,000');
    expect(tile('現金残高')?.value).toBe('￥1,000,000');
    expect(tile('初期入金')?.value).toBe('￥1,000,000');
  });

  it('★ 約定が 1 件在れば金額と率が出る (対照)', async () => {
    payload = TRADED;
    await mount();
    const t = tile('損益');
    // 900,000 + 500 × 220 = 1,010,000 → +10,000 (+1.00%)
    expect(t!.value).toBe('+￥10,000');
    expect(t!.sub).toBe('+1.00%');
    expect(t!.color).toBe(cssColor(PNL_UP_COLOR));
    expect(tile('取引履歴')?.sub).toBe('paper trades');
  });
});

describe('この口座は何なのか — 実行形態ごとの注記', () => {
  it('★ ブラウザ版は「ペーパートレードを行いません」と述べる', async () => {
    await mount();
    expect(marker('data-paper-account-note')).toContain('ブラウザ版はペーパートレードを行いません');
  });

  it('★ デスクトップ版は「取得のたびに組み直す」と述べる', async () => {
    version = '0.1.0';
    await mount();
    const t = marker('data-paper-account-note');
    expect(t).toContain('取得しなおすたびに初期入金から組み直します');
    expect(t).not.toContain('ブラウザ版');
  });

  it('★ 帯の「稼働中」はブラウザ版でペーパートレードを名乗らない', async () => {
    await mount();
    expect(marker('data-simulation-scope')).toContain('ペーパートレードは行いません');
    expect(marker('data-simulation-scope')).not.toContain('ペーパートレードのみ稼働中');
  });

  it('★ デスクトップ版の帯はペーパートレードを名乗る (対照)', async () => {
    version = '0.1.0';
    await mount();
    expect(marker('data-simulation-scope')).toContain('ペーパートレードのみ稼働中');
  });

  it('値段の分からない銘柄が無ければ、その警告は出さない', async () => {
    await mount();
    expect(marker('data-paper-account-unpriced')).toBeNull();
  });

  it('★ ウォッチリストから外れた玉が在れば、時価に入れていないと述べる', async () => {
    payload = { ...TRADED, watchlist: [] };
    await mount();
    const t = marker('data-paper-account-unpriced');
    expect(t).not.toBeNull();
    expect(t).toContain('AAPL');
    expect(t).toContain('現在資産は実際より小さく出ています');
    // 現在資産は現金だけ —— 0 円として数えていない証拠
    expect(tile('現在資産 (cash + 保有時価)')?.value).toBe('￥900,000');
  });
});

describe('絞り込みが空になった理由', () => {
  it('★ 「買い」を押すと、登録の内訳を挙げて「買いは無い」と言う', async () => {
    await mount();
    await act(async () => {
      button('買い')!.click();
    });
    expect(marker('data-watchlist-filter-empty'))
      .toBe('「買い」の銘柄はありません（登録 2 件の内訳: 見送り 2 件）');
  });

  it('登録が 0 件なら「登録されている銘柄はありません」', async () => {
    payload = { ...SNAPSHOT.stocks, watchlist: [] };
    await mount();
    expect(marker('data-watchlist-filter-empty')).toBe('登録されている銘柄はありません');
  });
});
