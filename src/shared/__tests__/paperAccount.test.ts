/**
 * **1 度も取引していないペーパー口座は「損益 ±0」ではない** (2026-09-12 · パス 189)。
 *
 * 規則は `shared/paperAccount.ts` が 1 つだけ持つ。ここはその規則を当て、
 * 到達しない枝 (`unpricedPositions`) も純粋関数として直接組んで測る。
 */
import { describe, expect, it } from 'vitest';
import {
  PNL_DOWN_COLOR,
  PNL_UNKNOWN_COLOR,
  PNL_UP_COLOR,
  paperAccountExportNote,
  paperAccountNote,
  paperAccountView,
  pnlColor,
  pnlLabel,
  pnlSubLabel,
  portfolioEquity,
  signalFilterEmptyNote,
  simulationScopeNote,
  tradeCountSubLabel,
  watchlistPrices,
  type PaperPortfolioLike,
} from '../paperAccount';

/** 画面・書き出しと同じ整形器 (負号は整形器が前に置く)。 */
const YEN = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const yen = (n: number) => YEN.format(n);
const LABELS = { buy: '買い', sell: '売り', hold: '見送り' } as const;

/** 取引 0 件・玉なし・現金だけ —— 実測の既定の取得がちょうどこの形 */
const UNTRADED: PaperPortfolioLike = {
  cash: 1_000_000,
  initialCash: 1_000_000,
  positions: {},
  history: [],
};

/** 1 回買った後の形。**約定値と評価値が同じ終値なので時価は初期入金に戻る。** */
const BOUGHT: PaperPortfolioLike = {
  cash: 1_000_000 - 50 * 2_000,
  initialCash: 1_000_000,
  positions: { AAPL: { shares: 50, avgCost: 2_000 } },
  history: [{ ticker: 'AAPL' }],
};

describe('watchlistPrices / portfolioEquity', () => {
  it('ウォッチリストの最終値が「銘柄 → 値段」になる', () => {
    expect(watchlistPrices([{ symbol: 'AAPL', latestClose: 195 }, { symbol: 'MSFT', latestClose: 420 }]))
      .toEqual({ AAPL: 195, MSFT: 420 });
  });

  it('保有の時価を現金に足す', () => {
    expect(portfolioEquity(BOUGHT, { AAPL: 2_200 })).toBe(900_000 + 50 * 2_200);
  });

  it('★ 値段が分からない銘柄は 0 円として数えない (時価評価に入れない)', () => {
    expect(portfolioEquity(BOUGHT, {})).toBe(900_000);
  });
});

describe('paperAccountView — 取引 0 件は「損益 0」ではない', () => {
  it('★ 取引が 0 件なら pnl / pnlPct は null', () => {
    const v = paperAccountView(UNTRADED, {});
    expect(v.tradeCount).toBe(0);
    expect(v.pnl).toBeNull();
    expect(v.pnlPct).toBeNull();
    expect(v.equity).toBe(1_000_000);
  });

  it('★ 取引が 1 件でもあれば金額と率を出す (同値で 0 でも「測った 0」)', () => {
    const v = paperAccountView(BOUGHT, { AAPL: 2_000 });
    expect(v.tradeCount).toBe(1);
    expect(v.pnl).toBe(0);
    expect(v.pnlPct).toBe(0);
  });

  it('値上がりと値下がりを符号で分ける', () => {
    expect(paperAccountView(BOUGHT, { AAPL: 2_200 }).pnl).toBe(10_000);
    expect(paperAccountView(BOUGHT, { AAPL: 1_800 }).pnl).toBe(-10_000);
  });

  it('初期入金が 0 なら率は null (割れない)', () => {
    const v = paperAccountView({ ...BOUGHT, initialCash: 0 }, { AAPL: 2_000 });
    expect(v.pnl).not.toBeNull();
    expect(v.pnlPct).toBeNull();
  });

  it('★ 値段が分からない銘柄を挙げる (現在資産が実際より小さいことの根拠)', () => {
    const v = paperAccountView(BOUGHT, {});
    expect(v.unpricedPositions).toEqual(['AAPL']);
    expect(v.positionCount).toBe(1);
    expect(paperAccountView(BOUGHT, { AAPL: 2_000 }).unpricedPositions).toEqual([]);
  });
});

describe('刷る文字 — 算定できないものは「—」で、緑にしない', () => {
  it('★ 取引 0 件は「—」・理由つき・色は中立', () => {
    const v = paperAccountView(UNTRADED, {});
    expect(pnlLabel(v, yen)).toBe('—');
    expect(pnlSubLabel(v)).toBe('取引 0 件 — 損益は算定できません');
    expect(pnlColor(v)).toBe(PNL_UNKNOWN_COLOR);
    // 標本: 直っていなければ出ていた文字 (これが出たら元に戻っている)
    expect(pnlLabel(v, yen)).not.toBe('+¥0');
    expect(pnlSubLabel(v)).not.toBe('+0.00%');
    expect(pnlColor(v)).not.toBe(PNL_UP_COLOR);
  });

  it('取引が在れば符号つきの金額と率、色は上下で分かれる', () => {
    const up = paperAccountView(BOUGHT, { AAPL: 2_200 });
    // 符号の付け方: 非負にだけ '+' を足し、負号は整形器に任せる
    // (通貨記号の前に '-' を置くのは整形器の仕事 —— ここで '-' を足すと二重になる)。
    expect(pnlLabel(up, yen)).toBe('+' + yen(10_000));
    expect(pnlSubLabel(up)).toBe('+1.00%');
    expect(pnlColor(up)).toBe(PNL_UP_COLOR);
    const down = paperAccountView(BOUGHT, { AAPL: 1_800 });
    expect(pnlLabel(down, yen)).toBe(yen(-10_000));
    expect(pnlLabel(down, yen)).not.toMatch(/^\+/);
    expect(pnlSubLabel(down)).toBe('-1.00%');
    expect(pnlColor(down)).toBe(PNL_DOWN_COLOR);
  });

  it('初期入金 0 の副文は率ではなく理由を言う', () => {
    expect(pnlSubLabel(paperAccountView({ ...BOUGHT, initialCash: 0 }, { AAPL: 2_000 })))
      .toBe('初期入金 0 円 — 率は算定できません');
  });

  it('★ 取引履歴 0 件の副文は「paper trades」ではない', () => {
    expect(tradeCountSubLabel(paperAccountView(UNTRADED, {}))).toBe('まだ 1 件もありません');
    expect(tradeCountSubLabel(paperAccountView(BOUGHT, { AAPL: 2_000 }))).toBe('paper trades');
  });
});

describe('この口座は何なのか — 実行形態ごと', () => {
  it('★ ブラウザ版は「ペーパートレードを行わない」と言う', () => {
    const t = paperAccountNote('browser');
    expect(t).toContain('ブラウザ版はペーパートレードを行いません');
    expect(t).toContain('常に 0 件');
  });

  it('★ デスクトップ版は「取得のたびに組み直す」「約定値と評価値が同じ終値」と言う', () => {
    const t = paperAccountNote('desktop');
    expect(t).toContain('取得しなおすたびに初期入金から組み直します');
    expect(t).toContain('約定値と評価値が同じ終値');
    expect(t).toContain('交差が起きない');
  });

  it('実行形態が分かるまでは、両方で成り立つことだけを言う', () => {
    const t = paperAccountNote(null);
    expect(t).toContain('取引履歴は蓄積されません');
    expect(t).not.toContain('ブラウザ版');
    expect(t).not.toContain('交差');
  });

  it('★ 帯の「稼働中」はブラウザ版でペーパートレードを名乗らない', () => {
    expect(simulationScopeNote('browser')).not.toContain('ペーパートレードのみ稼働中');
    expect(simulationScopeNote('browser')).toContain('ペーパートレードは行いません');
    expect(simulationScopeNote('desktop')).toContain('ペーパートレードのみ稼働中');
    expect(simulationScopeNote(null)).not.toContain('ペーパートレード');
  });
});

describe('絞り込みが空になった理由', () => {
  it('★ 登録が 0 件なら「登録されている銘柄はありません」', () => {
    expect(signalFilterEmptyNote('buy', { buy: 0, sell: 0, hold: 0 }, LABELS))
      .toBe('登録されている銘柄はありません');
    expect(signalFilterEmptyNote('all', { buy: 0, sell: 0, hold: 0 }, LABELS))
      .toBe('登録されている銘柄はありません');
  });

  it('★ 全部が「見送り」なら、内訳を挙げて「買いは無い」と言う', () => {
    expect(signalFilterEmptyNote('buy', { buy: 0, sell: 0, hold: 5 }, LABELS))
      .toBe('「買い」の銘柄はありません（登録 5 件の内訳: 見送り 5 件）');
  });

  it('内訳は 0 件の区分を挙げない', () => {
    expect(signalFilterEmptyNote('sell', { buy: 2, sell: 0, hold: 3 }, LABELS))
      .toBe('「売り」の銘柄はありません（登録 5 件の内訳: 買い 2 件 / 見送り 3 件）');
  });
});

describe('書き出しに載せる注記', () => {
  it('★ 取引 0 件のときは「損益は算定できません」と書く', () => {
    const t = paperAccountExportNote(paperAccountView(UNTRADED, {}));
    expect(t).toContain('取引が 1 件も発生していない');
    expect(t).toContain('損益は算定できません');
  });

  it('取引が在るときは「蓄積されない」「約定だけでは動かない」と書く', () => {
    const t = paperAccountExportNote(paperAccountView(BOUGHT, { AAPL: 2_000 }));
    expect(t).toContain('取引履歴は蓄積されません');
    expect(t).toContain('約定だけでは動きません');
    expect(t).not.toContain('時価評価に入れていない');
  });

  it('★ 値段の分からない銘柄が在れば、書き出しにもそれを書く (断りは渡す物に乗る)', () => {
    const t = paperAccountExportNote(paperAccountView(BOUGHT, {}));
    expect(t).toContain('値段の分からない 1 銘柄（AAPL）');
    expect(t).toContain('現在資産は実際より小さく出ています');
  });
});
