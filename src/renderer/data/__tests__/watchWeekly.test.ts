import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES } from '../collectionShapes';
import {
  MAX_WATCH_METRIC,
  MAX_WATCH_MOVES,
  WATCH_METRICS,
  WATCH_METRIC_KEYS,
  WATCH_MOVE_THRESHOLD_PCT,
  WATCH_NO_MOVES_NOTE,
  WATCH_NO_PREVIOUS_NOTE,
  WATCH_NUMBER_SOURCES,
  WATCH_NUMBER_SOURCE_LABEL,
  WATCH_REPORT_EMPTY_NOTE,
  WATCH_WEEKLY_COLLECTION,
  buildWatchWeeklyReport,
  countUnreadableWatchWeeks,
  duplicateWatchWeekMessage,
  hasWatchWeek,
  parseWatchWeek,
  signedPct,
  unreadableWatchWeeksNote,
  watchMetricOf,
  weekStartOf,
  type WatchWeekEntry,
} from '../watchWeekly';

describe('週ごとの数字: 台帳', () => {
  it('collection の名前と、3 つの先の呼び名', () => {
    expect(WATCH_WEEKLY_COLLECTION).toBe('watch-weekly');
    expect([...WATCH_NUMBER_SOURCES]).toEqual(['x', 'ads', 'analytics']);
    expect(WATCH_NUMBER_SOURCE_LABEL).toEqual({
      x: 'エックス (X)',
      ads: 'グーグル広告 (Google Ads)',
      analytics: 'アナリティクス (Google Analytics)',
    });
  });

  it('数字の一覧 (欄の名前・先・呼び名・単位)', () => {
    expect(WATCH_METRICS.map((m) => `${m.key}|${m.source}|${m.label}|${m.unit}`)).toEqual([
      'xPosts|x|投稿数|件',
      'xImpressions|x|表示回数|回',
      'xEngagements|x|反応数|件',
      'xFollowers|x|フォロワー数|人',
      'adCost|ads|広告費|円',
      'adImpressions|ads|表示回数|回',
      'adClicks|ads|クリック数|回',
      'adConversions|ads|成果数|件',
      'gaUsers|analytics|利用者数|人',
      'gaSessions|analytics|訪問数|回',
      'gaPageviews|analytics|ページ表示数|回',
      'gaConversions|analytics|成果数|件',
    ]);
    expect(WATCH_METRIC_KEYS).toEqual(WATCH_METRICS.map((m) => m.key));
    expect(new Set(WATCH_METRIC_KEYS).size).toBe(WATCH_METRIC_KEYS.length);
  });

  it('★ 形の表の欄は、週 + 数字の一覧と過不足なく一致する', () => {
    const shape = COLLECTION_SHAPES[WATCH_WEEKLY_COLLECTION];
    if (shape === undefined) throw new Error('形の表に watch-weekly が無い');
    expect([...shape.fields].sort()).toEqual(['week', ...WATCH_METRIC_KEYS].sort());
  });

  it('決まった数と文', () => {
    expect(MAX_WATCH_METRIC).toBe(100_000_000_000);
    expect(WATCH_MOVE_THRESHOLD_PCT).toBe(10);
    expect(MAX_WATCH_MOVES).toBe(5);
    expect(WATCH_NO_PREVIOUS_NOTE).toBe('前の週の記録が無いため、増減は出していません。来週の数字を入れると比べられます。');
    expect(WATCH_NO_MOVES_NOTE).toBe('前の週から 10% 以上動いた数字はありません。');
    expect(WATCH_REPORT_EMPTY_NOTE).toBe(
      'まだ週ごとの数字がありません。下の欄に、エックス・広告・アナリティクスの管理画面で見た数字を入力してください（分かる数字だけで構いません）。',
    );
  });
});

describe('weekStartOf (その週の月曜日)', () => {
  it('月曜はその日・他の曜日は直前の月曜・日曜は 6 日前', () => {
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-17')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-20')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-21')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23');
  });

  it('月と年をまたぐ', () => {
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });

  it('読めない日付は null', () => {
    for (const v of ['2026-02-30', '2026-11', '', 'x', null, undefined, 20261116]) expect(weekStartOf(v)).toBeNull();
  });
});

describe('parseWatchWeek (入口)', () => {
  it('入力した数字だけを持つ (空欄は欄ごと持たない)・週は月曜にそろえる', () => {
    expect(parseWatchWeek({ week: '2026-11-18', xPosts: '12', xImpressions: '', adCost: '30,000', gaSessions: 2400 })).toEqual({
      week: '2026-11-16',
      xPosts: 12,
      adCost: 30000,
      gaSessions: 2400,
    });
  });

  it('★ 0 は「0 と入力した」として持つ (空欄と混ぜない)', () => {
    const e = parseWatchWeek({ week: '2026-11-16', xFollowers: '0', adClicks: '   ' });
    expect(e).toEqual({ week: '2026-11-16', xFollowers: 0 });
    expect('adClicks' in e).toBe(false);
  });

  it('全角・桁区切りを読む', () => {
    expect(parseWatchWeek({ week: '2026-11-16', gaUsers: '１，２３４' }).gaUsers).toBe(1234);
  });

  it('週の日付が読めなければ断る', () => {
    const refusal = new Error('週の日付は YYYY-MM-DD 形式で入力してください（その週のどの日でも構いません）');
    expect(() => parseWatchWeek({ week: '', xPosts: 1 })).toThrow(refusal);
    expect(() => parseWatchWeek({ week: '2026-02-30', xPosts: 1 })).toThrow(refusal);
    expect(() => parseWatchWeek({ xPosts: 1 })).toThrow(refusal);
  });

  it('数字が 1 つも無ければ断る', () => {
    const refusal = new Error('数字が 1 つも入っていません（分かる数字だけで構いません。0 のときは 0 と入力してください）');
    expect(() => parseWatchWeek({ week: '2026-11-16' })).toThrow(refusal);
    expect(() => parseWatchWeek({ week: '2026-11-16', xPosts: '', adCost: ' ' })).toThrow(refusal);
  });

  it('★ 読めない・負・小数・大きすぎる数は、欄を名指しして断る', () => {
    const refusal = (label: string): Error => new Error(`${label}は 0 以上 100,000,000,000 以下の整数で入力してください`);
    expect(() => parseWatchWeek({ week: '2026-11-16', xPosts: '12件ぐらい' })).toThrow(refusal('エックス (X)の投稿数'));
    expect(() => parseWatchWeek({ week: '2026-11-16', adCost: '-1' })).toThrow(refusal('グーグル広告 (Google Ads)の広告費'));
    expect(() => parseWatchWeek({ week: '2026-11-16', gaSessions: '1.5' })).toThrow(refusal('アナリティクス (Google Analytics)の訪問数'));
    expect(() => parseWatchWeek({ week: '2026-11-16', gaPageviews: MAX_WATCH_METRIC + 1 })).toThrow(
      refusal('アナリティクス (Google Analytics)のページ表示数'),
    );
    expect(() => parseWatchWeek({ week: '2026-11-16', xFollowers: Number.NaN })).toThrow(refusal('エックス (X)のフォロワー数'));
    expect(() => parseWatchWeek({ week: '2026-11-16', adClicks: {} })).toThrow(refusal('グーグル広告 (Google Ads)のクリック数'));
  });

  it('境界: 0 と上限ちょうどは通る', () => {
    expect(parseWatchWeek({ week: '2026-11-16', xImpressions: MAX_WATCH_METRIC }).xImpressions).toBe(MAX_WATCH_METRIC);
    expect(parseWatchWeek({ week: '2026-11-16', xImpressions: 0 }).xImpressions).toBe(0);
  });

  it('どの欄も 1 つずつ読める', () => {
    for (const key of WATCH_METRIC_KEYS) {
      expect(parseWatchWeek({ week: '2026-11-16', [key]: '7' }), key).toEqual({ week: '2026-11-16', [key]: 7 });
    }
  });
});

describe('保管値の読みと、同じ週の判定', () => {
  it('数は数として・数でない物と負は null', () => {
    expect(watchMetricOf(0)).toBe(0);
    expect(watchMetricOf(12)).toBe(12);
    for (const v of [-1, Number.NaN, Number.POSITIVE_INFINITY, '12', null, undefined, {}, [1], true]) expect(watchMetricOf(v)).toBeNull();
  });

  it('同じ週が在るか', () => {
    const rows: WatchWeekEntry[] = [{ week: '2026-11-16', xPosts: 1 }, { week: '2026-11-09', xPosts: 2 }];
    expect(hasWatchWeek(rows, '2026-11-16')).toBe(true);
    expect(hasWatchWeek(rows, '2026-11-09')).toBe(true);
    expect(hasWatchWeek(rows, '2026-11-23')).toBe(false);
    expect(hasWatchWeek([], '2026-11-16')).toBe(false);
    expect(duplicateWatchWeekMessage('2026-11-16')).toBe(
      '2026-11-16 の週は記録済みです。直すときは、下の一覧の × で消してから入れ直してください。',
    );
  });

  it('週の日付が読めない記録の件数と断り', () => {
    const rows = [{ week: '2026-11-16' }, { week: 'x' }, { week: 20261116 }, { week: '2026-11' }] as unknown as WatchWeekEntry[];
    expect(countUnreadableWatchWeeks(rows)).toBe(3);
    expect(countUnreadableWatchWeeks([{ week: '2026-11-16' }])).toBe(0);
    expect(unreadableWatchWeeksNote(0)).toBeNull();
    expect(unreadableWatchWeeksNote(Number.NaN)).toBeNull();
    expect(unreadableWatchWeeksNote(-1)).toBeNull();
    expect(unreadableWatchWeeksNote(2)).toBe(
      '週の日付が読めない記録が 2 件あります。レポートには入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。',
    );
  });

  it('増減の率の書き方', () => {
    expect(signedPct(12.5)).toBe('+12.5%');
    expect(signedPct(-3)).toBe('-3.0%');
    expect(signedPct(0)).toBe('+0.0%');
    expect(signedPct(100)).toBe('+100.0%');
  });
});

describe('buildWatchWeeklyReport (週次レポート)', () => {
  const THIS: WatchWeekEntry = {
    week: '2026-11-16',
    xPosts: 12,
    xImpressions: 15000,
    xEngagements: 450,
    xFollowers: 1020,
    adCost: 30000,
    adImpressions: 50000,
    adClicks: 1000,
    adConversions: 20,
    gaUsers: 1800,
    gaSessions: 2400,
    gaPageviews: 6000,
    gaConversions: 48,
  };
  const LAST: WatchWeekEntry = {
    week: '2026-11-09',
    xPosts: 10,
    xImpressions: 12000,
    xEngagements: 300,
    xFollowers: 1000,
    adCost: 30000,
    adImpressions: 40000,
    adClicks: 1000,
    adConversions: 25,
    gaUsers: 1500,
    gaSessions: 2000,
    gaPageviews: 5500,
    gaConversions: 30,
  };

  it('読める記録が 1 件も無ければ null', () => {
    expect(buildWatchWeeklyReport([])).toBeNull();
    expect(buildWatchWeeklyReport([{ week: 'x', xPosts: 1 }])).toBeNull();
  });

  it('いちばん新しい週と、その 7 日前を比べる (並びに依らない)', () => {
    for (const rows of [[THIS, LAST], [LAST, THIS]]) {
      const r = buildWatchWeeklyReport(rows);
      expect(r?.week).toBe('2026-11-16');
      expect(r?.previousWeek).toBe('2026-11-09');
      expect(r?.hasPrevious).toBe(true);
      expect(r?.unreadable).toBe(0);
    }
  });

  it('数字の行: 今週・前の週・増減の率', () => {
    const r = buildWatchWeeklyReport([THIS, LAST]);
    const row = (key: string) => r?.rows.find((x) => x.key === key);
    expect(r?.rows.map((x) => x.key)).toEqual([...WATCH_METRIC_KEYS]);
    expect(row('xPosts')).toEqual({ key: 'xPosts', source: 'x', label: '投稿数', unit: '件', current: 12, previous: 10, changePct: 20 });
    expect(row('xImpressions')?.changePct).toBe(25);
    expect(row('xEngagements')?.changePct).toBe(50);
    expect(row('xFollowers')?.changePct).toBe(2);
    expect(row('adCost')?.changePct).toBe(0);
    expect(row('adConversions')?.changePct).toBe(-20);
    expect(row('gaConversions')?.changePct).toBe(60);
  });

  it('導く率: 分母が在れば値・無ければ「—」', () => {
    const r = buildWatchWeeklyReport([THIS, LAST]);
    expect(r?.rates).toEqual([
      { source: 'x', label: '反応率 (反応数 ÷ 表示回数)', current: '3.00%', previous: '2.50%' },
      { source: 'ads', label: 'クリック率 (クリック数 ÷ 表示回数)', current: '2.00%', previous: '2.50%' },
      { source: 'ads', label: 'クリック単価 (広告費 ÷ クリック数)', current: '30 円', previous: '30 円' },
      { source: 'ads', label: '成果単価 (広告費 ÷ 成果数)', current: '1,500 円', previous: '1,200 円' },
      { source: 'analytics', label: '成果率 (成果数 ÷ 訪問数)', current: '2.00%', previous: '1.50%' },
    ]);
  });

  it('★ 分母が 0・未入力なら率は「—」(0% や 0 円と書かない)', () => {
    const r = buildWatchWeeklyReport([{ week: '2026-11-16', adCost: 1000, adClicks: 0, adImpressions: 0, xEngagements: 5, gaConversions: 3 }]);
    expect(r?.rates.map((x) => x.current)).toEqual(['—', '—', '—', '—', '—']);
    expect(r?.rates.map((x) => x.previous)).toEqual(['—', '—', '—', '—', '—']);
    // 分子が無いとき (分母は在る)。
    const r2 = buildWatchWeeklyReport([{ week: '2026-11-16', xImpressions: 100, adImpressions: 100, adClicks: 10, adConversions: 2, gaSessions: 50 }]);
    expect(r2?.rates.map((x) => x.current)).toEqual(['—', '10.00%', '—', '—', '—']);
  });

  it('★ 前の週が 0・未入力なら増減の率は null (0% と混ぜない)', () => {
    const r = buildWatchWeeklyReport([
      { week: '2026-11-16', xPosts: 5, xFollowers: 10, adClicks: 7 },
      { week: '2026-11-09', xPosts: 0, adClicks: 7 },
    ]);
    const row = (key: string) => r?.rows.find((x) => x.key === key);
    expect(row('xPosts')).toMatchObject({ current: 5, previous: 0, changePct: null });
    expect(row('xFollowers')).toMatchObject({ current: 10, previous: null, changePct: null });
    expect(row('adClicks')).toMatchObject({ current: 7, previous: 7, changePct: 0 });
    expect(row('gaUsers')).toMatchObject({ current: null, previous: null, changePct: null });
  });

  it('動き: 10% 以上動いた数字を、動きの大きい順に 5 つまで', () => {
    const r = buildWatchWeeklyReport([THIS, LAST]);
    expect(r?.moves).toEqual([
      'アナリティクス (Google Analytics)の成果数が前の週より +60.0% (30 → 48 件)',
      'エックス (X)の反応数が前の週より +50.0% (300 → 450 件)',
      'エックス (X)の表示回数が前の週より +25.0% (12,000 → 15,000 回)',
      'グーグル広告 (Google Ads)の表示回数が前の週より +25.0% (40,000 → 50,000 回)',
      'エックス (X)の投稿数が前の週より +20.0% (10 → 12 件)',
    ]);
    expect(r?.moves.length).toBe(MAX_WATCH_MOVES);
  });

  it('★ 境界: ちょうど 10% は「動き」に入り、10% 未満は入らない (減った側も)', () => {
    const r = buildWatchWeeklyReport([
      { week: '2026-11-16', xPosts: 110, xFollowers: 109, adClicks: 90, gaUsers: 91 },
      { week: '2026-11-09', xPosts: 100, xFollowers: 100, adClicks: 100, gaUsers: 100 },
    ]);
    expect(r?.moves).toEqual([
      'エックス (X)の投稿数が前の週より +10.0% (100 → 110 件)',
      'グーグル広告 (Google Ads)のクリック数が前の週より -10.0% (100 → 90 回)',
    ]);
  });

  it('全文 (前の週あり)', () => {
    const r = buildWatchWeeklyReport([THIS, LAST]);
    expect(r?.text).toBe(
      [
        '【週次レポート】2026-11-16 の週 (月曜始まり)',
        '',
        '■ エックス (X)',
        '・投稿数: 12 件 (前の週 10 件 / +20.0%)',
        '・表示回数: 15,000 回 (前の週 12,000 回 / +25.0%)',
        '・反応数: 450 件 (前の週 300 件 / +50.0%)',
        '・フォロワー数: 1,020 人 (前の週 1,000 人 / +2.0%)',
        '・反応率 (反応数 ÷ 表示回数): 3.00% (前の週 2.50%)',
        '',
        '■ グーグル広告 (Google Ads)',
        '・広告費: 30,000 円 (前の週 30,000 円 / +0.0%)',
        '・表示回数: 50,000 回 (前の週 40,000 回 / +25.0%)',
        '・クリック数: 1,000 回 (前の週 1,000 回 / +0.0%)',
        '・成果数: 20 件 (前の週 25 件 / -20.0%)',
        '・クリック率 (クリック数 ÷ 表示回数): 2.00% (前の週 2.50%)',
        '・クリック単価 (広告費 ÷ クリック数): 30 円 (前の週 30 円)',
        '・成果単価 (広告費 ÷ 成果数): 1,500 円 (前の週 1,200 円)',
        '',
        '■ アナリティクス (Google Analytics)',
        '・利用者数: 1,800 人 (前の週 1,500 人 / +20.0%)',
        '・訪問数: 2,400 回 (前の週 2,000 回 / +20.0%)',
        '・ページ表示数: 6,000 回 (前の週 5,500 回 / +9.1%)',
        '・成果数: 48 件 (前の週 30 件 / +60.0%)',
        '・成果率 (成果数 ÷ 訪問数): 2.00% (前の週 1.50%)',
        '',
        '■ 動き',
        '・アナリティクス (Google Analytics)の成果数が前の週より +60.0% (30 → 48 件)',
        '・エックス (X)の反応数が前の週より +50.0% (300 → 450 件)',
        '・エックス (X)の表示回数が前の週より +25.0% (12,000 → 15,000 回)',
        '・グーグル広告 (Google Ads)の表示回数が前の週より +25.0% (40,000 → 50,000 回)',
        '・エックス (X)の投稿数が前の週より +20.0% (10 → 12 件)',
      ].join('\n'),
    );
  });

  it('全文 (前の週なし・入力した先だけを出す・前の週が 0 の数字は率を書かない)', () => {
    const r = buildWatchWeeklyReport([{ week: '2026-11-16', xPosts: 3, adCost: 500, adClicks: 10 }]);
    expect(r?.hasPrevious).toBe(false);
    expect(r?.moves).toEqual([]);
    expect(r?.text).toBe(
      [
        '【週次レポート】2026-11-16 の週 (月曜始まり)',
        '',
        '■ エックス (X)',
        '・投稿数: 3 件',
        '',
        '■ グーグル広告 (Google Ads)',
        '・広告費: 500 円',
        '・クリック数: 10 回',
        '・クリック単価 (広告費 ÷ クリック数): 50 円',
        '',
        '■ 動き',
        '・前の週の記録が無いため、増減は出していません。来週の数字を入れると比べられます。',
      ].join('\n'),
    );
    const zeroPrev = buildWatchWeeklyReport([{ week: '2026-11-16', xPosts: 3 }, { week: '2026-11-09', xPosts: 0 }]);
    expect(zeroPrev?.text.split('\n')[3]).toBe('・投稿数: 3 件 (前の週 0 件)');
  });

  it('前の週は在るが大きな動きが無いとき', () => {
    const r = buildWatchWeeklyReport([{ week: '2026-11-16', xPosts: 101 }, { week: '2026-11-09', xPosts: 100 }]);
    expect(r?.hasPrevious).toBe(true);
    expect(r?.text.split('\n').slice(-2)).toEqual(['■ 動き', '・前の週から 10% 以上動いた数字はありません。']);
  });

  it('★ 前の週は「ちょうど 7 日前」だけ (2 週間前の記録とは比べない)', () => {
    const r = buildWatchWeeklyReport([{ week: '2026-11-16', xPosts: 5 }, { week: '2026-11-02', xPosts: 1 }]);
    expect(r?.previousWeek).toBe('2026-11-09');
    expect(r?.hasPrevious).toBe(false);
    expect(r?.rows[0]).toMatchObject({ current: 5, previous: null, changePct: null });
  });

  it('★ 同じ週が重なっていれば、先に並ぶ行を使う', () => {
    const r = buildWatchWeeklyReport([{ week: '2026-11-16', xPosts: 9 }, { week: '2026-11-16', xPosts: 1 }]);
    expect(r?.rows[0]?.current).toBe(9);
  });

  it('★ 週の日付が読めない行はレポートから外し、件数を返す', () => {
    const rows = [{ week: '2026-11-16', xPosts: 5 }, { week: '2026-99-99', xPosts: 1000 }, { week: 42, xPosts: 7 }] as unknown as WatchWeekEntry[];
    const r = buildWatchWeeklyReport(rows);
    expect(r?.week).toBe('2026-11-16');
    expect(r?.unreadable).toBe(2);
    expect(r?.rows[0]?.current).toBe(5);
  });

  it('★ 保管した数字が読めなければ未入力として扱う (文に NaN を刷らない)', () => {
    const rows = [{ week: '2026-11-16', xPosts: '12', xFollowers: -5, adCost: 100 }] as unknown as WatchWeekEntry[];
    const r = buildWatchWeeklyReport(rows);
    expect(r?.rows.find((x) => x.key === 'xPosts')?.current).toBeNull();
    expect(r?.rows.find((x) => x.key === 'xFollowers')?.current).toBeNull();
    expect(r?.text).not.toContain('エックス');
    expect(r?.text).toContain('・広告費: 100 円');
    expect(r?.text).not.toContain('NaN');
  });

  it('週を名指しして作る (在る週だけ)', () => {
    const r = buildWatchWeeklyReport([THIS, LAST], '2026-11-09');
    expect(r?.week).toBe('2026-11-09');
    expect(r?.previousWeek).toBe('2026-11-02');
    expect(r?.hasPrevious).toBe(false);
    expect(buildWatchWeeklyReport([THIS, LAST], '2026-11-23')).toBeNull();
  });
});
