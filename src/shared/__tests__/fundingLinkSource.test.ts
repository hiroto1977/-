/**
 * **同梱の見本は「連携中」を名乗ってはいけない** (パス 265)。
 *
 * デスクトップの `fetchFundingSnapshot` は Phase 6 の実 API 差込みまで
 * `MOCK_ACCOUNTING` / `MOCK_PORTFOLIO` を**必ず**渡すので
 * `accountingLinked` / `stocksLinked` は常に真になる。2026-09-15 まで画面は
 * その真偽値だけを見て「✅ 連携中」と刷り、凡例は見本の 12 か月を
 * 「実績12か月」と呼んでいた —— 会計ソフトを 1 つも繋いでいない利用者に。
 */
import { describe, expect, it } from 'vitest';
import {
  accountingCfSeriesLabel,
  fundingLinkLabel,
  fundingLinkSource,
  type FundingLinkSource,
} from '../funding';

describe('fundingLinkSource — 持っているか × 見本か', () => {
  it('データが無ければ、見本かどうかに関わらず none', () => {
    expect(fundingLinkSource(false, true)).toBe('none');
    expect(fundingLinkSource(false, false)).toBe('none');
  });

  it('データが在って見本を名乗っていれば sample (連携ではない)', () => {
    expect(fundingLinkSource(true, true)).toBe('sample');
  });

  it('データが在って見本でなければ linked', () => {
    expect(fundingLinkSource(true, false)).toBe('linked');
  });
});

describe('画面に出る文言', () => {
  it('sample は「連携中」と言わない', () => {
    const label = fundingLinkLabel('sample');
    expect(label).not.toContain('連携中');
    expect(label).toContain('見本');
    // 対照: 綴りの検査が死んでいないこと —— linked のほうは確かに含む。
    expect(fundingLinkLabel('linked')).toContain('連携中');
  });

  it('none は任意連携かどうかで語尾が変わる', () => {
    expect(fundingLinkLabel('none')).toBe('— 未連携');
    expect(fundingLinkLabel('none', true)).toBe('— 未連携 (任意)');
  });

  it('凡例は見本の月を「実績」と呼ばない', () => {
    expect(accountingCfSeriesLabel('sample', 12)).toBe('営業CF (同梱の見本12か月)');
    expect(accountingCfSeriesLabel('sample', 12)).not.toContain('実績');
    // 対照: linked / none は従来どおり実績と呼ぶ (検査が全部を落としていない)。
    expect(accountingCfSeriesLabel('linked', 12)).toBe('営業CF (会計・実績12か月)');
    expect(accountingCfSeriesLabel('none', 3)).toBe('営業CF (会計・実績3か月)');
  });

  it('3 つの状態すべてに文言が在る (増えたら落ちる)', () => {
    const all: readonly FundingLinkSource[] = ['linked', 'sample', 'none'];
    for (const s of all) expect(fundingLinkLabel(s).length).toBeGreaterThan(3);
  });
});
