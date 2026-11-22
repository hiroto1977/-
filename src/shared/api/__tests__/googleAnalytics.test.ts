import { describe, expect, it } from 'vitest';
import {
  GA_CHANNEL_LABELS,
  GA_PERIOD_DAYS,
  buildGaReport,
  checkGaReportRequest,
  gaChannelLabel,
  gaChannelName,
  gaCountText,
  gaDateOf,
  gaPeriodOrNull,
  gaPropertyIdOrNull,
  gaReportIntakeNote,
  gaRunReportPath,
  gaShareText,
  normalizeGaAccountSummaries,
  normalizeGaChannels,
  normalizeGaDailyUsers,
} from '../googleAnalytics';

/** 壊れた応答の標本 (どれも投げずに読めなかったと答えること)。 */
const BROKEN: readonly unknown[] = [null, undefined, 42, 'x', [], {}, { rows: 'x' }, { rows: [null, 1, 'a', []] }];

describe('プロパティ ID の関門', () => {
  it('数字だけを受け、properties/ の接頭辞と前後の空白は外す', () => {
    expect(gaPropertyIdOrNull('123456789')).toBe('123456789');
    expect(gaPropertyIdOrNull('  properties/987  ')).toBe('987');
  });
  it('数字以外が 1 字でもあれば断る (道の区切り・照会・全角・桁あふれ)', () => {
    for (const bad of ['', ' ', '12a', '12/34', '12?x=1', '../1', '１２３', '1234567890123456', 'properties/', 123, null, {}]) {
      expect(gaPropertyIdOrNull(bad), String(bad)).toBeNull();
    }
  });
  it('道へは符号化して入れる', () => {
    expect(gaRunReportPath('123')).toBe('/v1beta/properties/123:runReport');
  });
});

describe('期間の関門', () => {
  it('7 / 28 / 90 だけ', () => {
    expect([...GA_PERIOD_DAYS]).toEqual([7, 28, 90]);
    for (const d of GA_PERIOD_DAYS) expect(gaPeriodOrNull(d)).toBe(d);
    for (const bad of [0, 1, 30, '7', 28.5, null]) expect(gaPeriodOrNull(bad)).toBeNull();
  });
  it('checkGaReportRequest は形の違う物を断りの文で投げる', () => {
    expect(checkGaReportRequest({ propertyId: '1', days: 90 })).toEqual({ propertyId: '1', days: 90 });
    expect(() => checkGaReportRequest({ propertyId: 'x', days: 7 })).toThrow(new Error(
      'プロパティ ID は数字だけで入力してください (例: 123456789)。グーグルアナリティクス (Google Analytics) の管理画面の「プロパティの詳細」に出ています。',
    ));
    expect(() => checkGaReportRequest({ propertyId: '1', days: 14 })).toThrow(
      new Error('期間は 7 日・28 日・90 日のどれかを選んでください。'),
    );
  });
});

describe('日付', () => {
  it('YYYYMMDD → YYYY-MM-DD・暦に無い日と形違いは null', () => {
    expect(gaDateOf('20261101')).toBe('2026-11-01');
    for (const bad of ['20260231', '2026-11-01', '2026110', 20261101, null]) expect(gaDateOf(bad)).toBeNull();
  });
});

describe('プロパティの一覧の正規化', () => {
  it('アカウントを跨いで並べ、ID の読めない行は落とす', () => {
    const r = normalizeGaAccountSummaries({
      accountSummaries: [
        { displayName: 'A', propertySummaries: [{ property: 'properties/1', displayName: 'S1' }, { property: 42 }] },
        { displayName: 'B', propertySummaries: [{ property: 'properties/2' }] },
        null,
      ],
    });
    expect(r.read).toBe(true);
    expect(r.properties).toEqual([
      { id: '1', name: 'S1', account: 'A' },
      { id: '2', name: '', account: 'B' },
    ]);
  });
  it('壊れた応答でも投げない', () => {
    for (const b of BROKEN) expect(() => normalizeGaAccountSummaries(b)).not.toThrow();
    expect(normalizeGaAccountSummaries({}).read).toBe(false);
    expect(normalizeGaAccountSummaries({ accountSummaries: [] })).toEqual({ properties: [], read: true });
  });
  it('長い名前は天井で切る', () => {
    const r = normalizeGaAccountSummaries({
      accountSummaries: [{ displayName: 'x'.repeat(10_000), propertySummaries: [{ property: 'properties/1', displayName: 'y'.repeat(10_000) }] }],
    });
    expect(r.properties[0]!.name.length).toBeLessThan(300);
    expect(r.properties[0]!.account.length).toBeLessThan(300);
  });
});

describe('日ごとの訪問者数の正規化', () => {
  it('10 進の文字列を数に読み、期間の合計は totals だけから取る (日ごとを足さない)', () => {
    const r = normalizeGaDailyUsers({
      dimensionHeaders: [{ name: 'date' }],
      rows: [
        { dimensionValues: [{ value: '20261101' }], metricValues: [{ value: '10' }] },
        { dimensionValues: [{ value: '20261102' }], metricValues: [{ value: '15' }] },
      ],
      totals: [{ metricValues: [{ value: '18' }] }],
    });
    expect(r.daily).toEqual([
      { date: '2026-11-01', users: 10 },
      { date: '2026-11-02', users: 15 },
    ]);
    expect(r.totalUsers).toBe(18);
    expect(r.read).toBe(true);
  });
  it('totals が無ければ合計は null (25 と足して作らない)', () => {
    const r = normalizeGaDailyUsers({
      rows: [
        { dimensionValues: [{ value: '20261101' }], metricValues: [{ value: '10' }] },
        { dimensionValues: [{ value: '20261102' }], metricValues: [{ value: '15' }] },
      ],
    });
    expect(r.totalUsers).toBeNull();
  });
  it('読めない数は null で、0 にしない', () => {
    const r = normalizeGaDailyUsers({
      rows: [
        { dimensionValues: [{ value: '20261101' }], metricValues: [{ value: 'abc' }] },
        { dimensionValues: [{ value: 'x' }], metricValues: [] },
        { dimensionValues: 'x', metricValues: null },
      ],
      totals: [{ metricValues: [{ value: '' }] }],
    });
    expect(r.daily).toEqual([
      { date: '2026-11-01', users: null },
      { date: null, users: null },
      { date: null, users: null },
    ]);
    expect(r.totalUsers).toBeNull();
  });
  it('データの無い期間 (rows を省き見出しだけ) は「0 件と読めた」、見出しも無ければ「読めなかった」', () => {
    expect(normalizeGaDailyUsers({ dimensionHeaders: [{ name: 'date' }] })).toEqual({ daily: [], read: true, totalUsers: null });
    for (const b of BROKEN) {
      expect(() => normalizeGaDailyUsers(b)).not.toThrow();
    }
    expect(normalizeGaDailyUsers({}).read).toBe(false);
    expect(normalizeGaDailyUsers(null).read).toBe(false);
  });
});

describe('流入元の正規化', () => {
  it('日本語の名前・英語・割合 (totals が分母)', () => {
    const r = normalizeGaChannels({
      rows: [
        { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '30' }, { value: '20' }] },
        { dimensionValues: [{ value: 'Referral' }], metricValues: [{ value: '10' }, { value: '8' }] },
      ],
      totals: [{ metricValues: [{ value: '80' }, { value: '25' }] }],
    });
    expect(r.totalSessions).toBe(80);
    expect(r.channels).toEqual([
      { english: 'Organic Search', label: '自然検索', sessions: 30, users: 20, sharePct: 37.5 },
      { english: 'Referral', label: '他のサイトからのリンク', sessions: 10, users: 8, sharePct: 12.5 },
    ]);
  });
  it('totals が無ければ、全行が読めたときだけ行の和を分母にする', () => {
    const all = normalizeGaChannels({
      rows: [
        { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '3' }, { value: '3' }] },
        { dimensionValues: [{ value: 'Email' }], metricValues: [{ value: '1' }, { value: '1' }] },
      ],
    });
    expect(all.totalSessions).toBe(4);
    expect(all.channels.map((c) => c.sharePct)).toEqual([75, 25]);
    const partial = normalizeGaChannels({
      rows: [
        { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '3' }] },
        { dimensionValues: [{ value: 'Email' }], metricValues: [{ value: 'x' }] },
      ],
    });
    expect(partial.totalSessions).toBeNull();
    expect(partial.channels.map((c) => c.sharePct)).toEqual([null, null]);
  });
  it('知らないチャネルは「その他の分類」で、英語は後ろのかっこに残る', () => {
    expect(gaChannelLabel('Brand New Channel')).toBe('その他の分類');
    expect(gaChannelLabel('constructor')).toBe('その他の分類');
    expect(gaChannelLabel('__proto__')).toBe('その他の分類');
    expect(gaChannelName({ label: 'その他の分類', english: 'Brand New Channel' })).toBe('その他の分類 (Brand New Channel)');
    expect(gaChannelName({ label: '直接', english: '' })).toBe('直接');
  });
  it('表の日本語の名前に英字は無い (英語はかっこの中にだけ出す)', () => {
    for (const [en, ja] of Object.entries(GA_CHANNEL_LABELS)) {
      expect(ja, en).not.toMatch(/[A-Za-z]/);
    }
    // 標本: 針が英字に当たること
    expect('Organic').toMatch(/[A-Za-z]/);
  });
  it('壊れた応答でも投げない', () => {
    for (const b of BROKEN) expect(() => normalizeGaChannels(b)).not.toThrow();
    expect(normalizeGaChannels({ rows: [] }).read).toBe(true);
    expect(normalizeGaChannels({ rows: 3 }).read).toBe(false);
  });
});

describe('レポートと表示', () => {
  it('2 つの応答からレポートを組み、読めなかった表を名指しする', () => {
    const r = buildGaReport('1', 28, {}, { rows: [] });
    expect(r.dailyRead).toBe(false);
    expect(r.channelsRead).toBe(true);
    expect(gaReportIntakeNote(r)).toBe(
      'グーグルアナリティクス (Google Analytics) の応答から日ごとの訪問者数を読み取れませんでした (0 件という意味ではありません)。',
    );
    expect(gaReportIntakeNote({ dailyRead: true, channelsRead: true })).toBeNull();
    expect(gaReportIntakeNote({ dailyRead: false, channelsRead: false })).toContain('日ごとの訪問者数と流入元');
  });
  it('読めない数は「不明」と刷り、0 と刷らない', () => {
    expect(gaCountText(null)).toBe('不明');
    expect(gaCountText(0)).toBe('0');
    expect(gaCountText(12345)).toBe('12,345');
    expect(gaShareText(null)).toBe('不明');
    expect(gaShareText(12.5)).toBe('12.5%');
  });
});
