/**
 * 「改善提案」は画面の数字から規則で組む (2026-09-09 · パス 119)。
 *
 * ここで留めるのは 3 つ:
 * 1. **文が言う数字は入力の数字である** —— 入力を変えれば文が変わり、見本の数字を写した
 *    固定文 (「6.15%」「大阪市ワンルームが空室」「+14.8%」) はどこにも残っていない。
 * 2. 読めない payload は断る (何も無い所から提案を作らない)。文面は両ビルドで同じ。
 * 3. 免責は投資系 / 店舗系で片ごとに固有の言い回しを持つ。
 */
import { describe, expect, it } from 'vitest';
import {
  ADVISOR_AOV_SPREAD_RATIO,
  ADVISOR_CANCELLATION_RATE_REF,
  ADVISOR_CONCENTRATION_SHARE,
  ADVISOR_RATING_GAP_PT,
  ADVISOR_STORE_REVENUE_SPREAD_RATIO,
  ADVISOR_YIELD_GAP_PT,
  DEFAULT_ADVISOR_THRESHOLDS,
  FOOD_ADVISOR_DISCLAIMER,
  MAX_ADVICE_NAME_CHARS,
  MAX_ADVICE_ROWS,
  MUTUAL_FUNDS_ADVISOR_DISCLAIMER,
  REAL_ESTATE_ADVISOR_DISCLAIMER,
  adviseDemaeCan,
  adviseMutualFunds,
  adviseRealEstate,
  adviseService,
  adviseUberEats,
  parseDemaeCanAdviceInput,
  parseMutualFundsAdviceInput,
  parseRealEstateAdviceInput,
  parseUberEatsAdviceInput,
  type DemaeCanAdviceInput,
  type MutualFundsAdviceInput,
  type RealEstateAdviceInput,
  type UberEatsAdviceInput,
} from '../serviceAdvisor';
import { RECORD_ENTRY_SERVICE_IDS } from '../recordEntryLimits';

// --- 標本: 同梱の見本と同じ数字 (画面が既定で渡す物) ---------------------------------

const RE_SAMPLE: RealEstateAdviceInput = {
  properties: [
    { name: '渋谷区マンション 1LDK', occupied: true, monthlyRent: 168_000, grossYieldPct: 4.8, demo: true },
    { name: '横浜市戸建て', occupied: true, monthlyRent: 235_000, grossYieldPct: 6.2, demo: true },
    { name: '大阪市ワンルーム', occupied: false, monthlyRent: 72_000, grossYieldPct: 5.5, demo: true },
    { name: '札幌市アパート 6 戸', occupied: true, monthlyRent: 420_000, grossYieldPct: 8.1, demo: true },
  ],
  netCashflow: 243_000,
  portfolioYieldPct: 6.15,
  occupancyRate: 0.75,
};

const MF_SAMPLE: MutualFundsAdviceInput = {
  holdings: [
    { name: 'eMAXIS Slim 米国株式 (S&P500)', valuation: 3_241_360, ytdReturnPct: 14.2, demo: true },
    { name: 'eMAXIS Slim 全世界株式 (オール・カントリー)', valuation: 2_437_260, ytdReturnPct: 11.8, demo: true },
    { name: 'eMAXIS Slim 先進国債券インデックス', valuation: 697_840, ytdReturnPct: 3.4, demo: true },
    { name: 'ひふみプラス', valuation: 1_863_680, ytdReturnPct: 8.7, demo: true },
  ],
  totalValuation: 8_240_140,
  unrealizedGainPct: 14.8,
};

const UE_SAMPLE: UberEatsAdviceInput = {
  stores: [
    { name: 'Shibuya 本店', orders: 142, revenue: 285_400, rating: 4.7 },
    { name: 'Shinjuku 東口店', orders: 98, revenue: 196_800, rating: 4.5 },
    { name: 'Ikebukuro West', orders: 76, revenue: 152_300, rating: 4.6 },
  ],
  topItems: [
    { name: 'スパイシーチキンバーガー', sold: 89, revenue: 71_200 },
    { name: 'クラシックチーズバーガー', sold: 67, revenue: 50_250 },
    { name: 'ガーリックフライ (L)', sold: 124, revenue: 49_600 },
  ],
  avgRating: 4.6,
};

const DC_SAMPLE: DemaeCanAdviceInput = {
  monthOrders: 612,
  cancellationRate: 0.018,
  topAreas: [
    { area: '渋谷区', orders: 178, revenue: 362_400 },
    { area: '新宿区', orders: 134, revenue: 273_600 },
    { area: '世田谷区', orders: 89, revenue: 181_200 },
  ],
  deliveringOrders: 1,
};

const titles = (r: { recommendations: readonly { title: string }[] }): string[] => r.recommendations.map((x) => x.title);
const all = (r: { recommendations: readonly { title: string; rationale: string }[]; basis: string }): string =>
  [r.basis, ...r.recommendations.map((x) => `${x.title} ${x.rationale}`)].join('\n');

describe('不動産の提案 — 画面の数字から組む', () => {
  it('見本と同じ数字なら: 空室 1 件 (大阪)・CF の主力 (札幌)・低利回り (渋谷 4.8% vs 平均 6.2%、差 1.4 pt = round1(1.35))', () => {
    const r = adviseRealEstate(RE_SAMPLE);
    expect(r.recommendations).toEqual([
      {
        title: '空室 1 件の解消',
        rationale: '空室: 大阪市ワンルーム (¥72,000/月)。満室になれば家賃収入は +¥72,000/月。賃料の市場比較と募集条件の見直しを検討してください。',
      },
      {
        title: 'キャッシュフローの主力: 札幌市アパート 6 戸',
        rationale:
          '月次 CF は ¥243,000。家賃収入の最大は 札幌市アパート 6 戸 (¥420,000/月、家賃収入の 51.0%)。この物件の修繕積立と契約更新を優先してください。',
      },
      {
        title: '低利回り物件の見直し: 渋谷区マンション 1LDK',
        rationale: '表面利回り 4.8% は平均 6.2% を 1.4 pt 下回ります (差のしきい値 1.0 pt)。賃料改定か売却の検討対象です。',
      },
    ]);
    expect(r.basis).toBe('4 物件 (同梱の見本 4 件を含む)・月次 CF ¥243,000・平均表面利回り 6.2%・入居率 75%');
    expect(r.disclaimer).toBe(REAL_ESTATE_ADVISOR_DISCLAIMER);
    expect(r.notForRealMoney).toBe(true);
    expect(r.phase).toBe('rules');
  });

  it('★ 利用者の物件を足すと、提案はその物件について語る (見本の数字を写した固定文ではない)', () => {
    const r = adviseRealEstate({
      properties: [
        ...RE_SAMPLE.properties,
        { name: '福岡市アパート', occupied: false, monthlyRent: 100_000, grossYieldPct: 10.0, demo: false },
      ],
      netCashflow: 143_000,
      portfolioYieldPct: 6.92,
      occupancyRate: 0.6,
    });
    expect(r.recommendations[0]).toEqual({
      title: '空室 2 件の解消',
      rationale:
        '空室: 大阪市ワンルーム (¥72,000/月)、福岡市アパート (¥100,000/月)。満室になれば家賃収入は +¥172,000/月。賃料の市場比較と募集条件の見直しを検討してください。',
    });
    // CF の文も入力の数字 (対照 B: ここを ¥243,000 に固定した版は、この行で落ちる)。
    expect(r.recommendations[1]).toEqual({
      title: 'キャッシュフローの主力: 札幌市アパート 6 戸',
      rationale:
        '月次 CF は ¥143,000。家賃収入の最大は 札幌市アパート 6 戸 (¥420,000/月、家賃収入の 51.0%)。この物件の修繕積立と契約更新を優先してください。',
    });
    expect(r.recommendations[2]).toEqual({
      title: '低利回り物件の見直し: 渋谷区マンション 1LDK',
      rationale: '表面利回り 4.8% は平均 6.9% を 2.1 pt 下回ります (差のしきい値 1.0 pt)。賃料改定か売却の検討対象です。',
    });
    expect(r.basis).toBe('5 物件 (同梱の見本 4 件を含む)・月次 CF ¥143,000・平均表面利回り 6.9%・入居率 60%');
    // 見本の行が無ければ「すべて利用者の入力」。
    const own = adviseRealEstate({ ...RE_SAMPLE, properties: RE_SAMPLE.properties.map((p) => ({ ...p, demo: false })) });
    expect(own.basis).toContain('4 物件 (すべて利用者の入力)');
  });

  it('★ 見本の数字を写した固定文が残っていない (入力を変えれば数字が消える)', () => {
    const r = adviseRealEstate({
      properties: [{ name: 'A', occupied: true, monthlyRent: 50_000, grossYieldPct: 3.0, demo: false }],
      netCashflow: 10_000,
      portfolioYieldPct: 3.0,
      occupancyRate: 1,
    });
    const text = all(r);
    for (const frozen of ['大阪', '札幌', '6.15', '8.1%', '空室の解消', '243,000', '75%']) expect(text, frozen).not.toContain(frozen);
    // 標本: 規則は実際にその綴りに当たる (見本の入力では在る)。
    expect(all(adviseRealEstate(RE_SAMPLE))).toContain('大阪');
  });

  it('空室なし / CF マイナス / CF ゼロ / 家賃が読めない入居中 の枝', () => {
    const base = { portfolioYieldPct: null, occupancyRate: 1 };
    const full = adviseRealEstate({
      ...base,
      properties: [
        { name: 'A', occupied: true, monthlyRent: 100_000, grossYieldPct: null, demo: false },
        { name: 'B', occupied: true, monthlyRent: 80_000, grossYieldPct: null, demo: false },
      ],
      netCashflow: -5_000,
    });
    expect(full.recommendations[0]).toEqual({
      title: '空室なし',
      rationale: '2 物件すべてが入居中です。現状維持のうえ、契約の更新時期と修繕計画を確認してください。',
    });
    expect(full.recommendations[1]).toEqual({
      title: '月次キャッシュフローがマイナス',
      rationale: '月次 CF は ¥-5,000 です。空室の解消、運営費用と返済条件の見直しを優先してください。',
    });
    const zero = adviseRealEstate({ ...full, ...base, properties: full.recommendations.length > 0 ? RE_SAMPLE.properties : [], netCashflow: 0 });
    expect(zero.recommendations[1]).toEqual({
      title: '月次キャッシュフローがゼロ',
      rationale: '月次 CF は ¥0 です。家賃・費用・返済のいずれかが動けば赤字になります。',
    });
    // 入居中の物件の家賃が全部 0 (読めない) なのに CF がプラス: 主力は名指しできない。
    const unreadable = adviseRealEstate({
      ...base,
      properties: [{ name: 'A', occupied: true, monthlyRent: 0, grossYieldPct: null, demo: false }],
      netCashflow: 30_000,
    });
    expect(unreadable.recommendations[1]).toEqual({
      title: '月次キャッシュフローはプラス',
      rationale: '月次 CF は ¥30,000 ですが、家賃が読める入居中の物件がありません。家賃の入力を確認してください。',
    });
    // 全部空室で CF プラス (手入力の上書き): 同じく主力を名指しできない。
    const allVacant = adviseRealEstate({
      ...base,
      properties: [{ name: 'A', occupied: false, monthlyRent: 90_000, grossYieldPct: null, demo: false }],
      netCashflow: 30_000,
    });
    expect(allVacant.recommendations[1]?.title).toBe('月次キャッシュフローはプラス');
  });

  it('利回り: 未算定 (測れた物件 < 2 / 平均が null)・ばらつき小・読めない物件の断り', () => {
    const one = adviseRealEstate({
      ...RE_SAMPLE,
      properties: [
        { name: 'A', occupied: true, monthlyRent: 100_000, grossYieldPct: 5.0, demo: false },
        { name: 'B', occupied: true, monthlyRent: 100_000, grossYieldPct: null, demo: false },
      ],
      portfolioYieldPct: 5.0,
    });
    expect(one.recommendations[2]).toEqual({
      title: '利回りの比較は未算定',
      rationale: '表面利回りを測れた物件が 1 件のため、平均との比較はしません。取得価格が読めない 1 件は比較から外しています。',
    });
    const nullAvg = adviseRealEstate({ ...RE_SAMPLE, portfolioYieldPct: null });
    expect(nullAvg.recommendations[2]?.rationale).toBe('表面利回りを測れた物件が 4 件のため、平均との比較はしません。');
    expect(nullAvg.basis).toContain('平均表面利回り —');
    const flat = adviseRealEstate({
      ...RE_SAMPLE,
      properties: [
        { name: 'A', occupied: true, monthlyRent: 100_000, grossYieldPct: 5.4, demo: false },
        { name: 'B', occupied: true, monthlyRent: 100_000, grossYieldPct: 5.6, demo: false },
        { name: 'C', occupied: true, monthlyRent: 100_000, grossYieldPct: null, demo: false },
      ],
      portfolioYieldPct: 5.5,
    });
    expect(flat.recommendations[2]).toEqual({
      title: '利回りのばらつきは小さい',
      rationale: '最低は A の 5.4% で、平均 5.5% との差 0.1 pt はしきい値 1.0 pt 未満です。取得価格が読めない 1 件は比較から外しています。',
    });
    expect(flat.basis).toBe('3 物件 (すべて利用者の入力)・月次 CF ¥243,000・平均表面利回り 5.5%・入居率 75%');
  });

  it('★ しきい値は入力で動く (台帳の値が届く形): 差 1.4 pt は 1.0 で名指し、1.5 では横並び', () => {
    const named = adviseRealEstate({ ...RE_SAMPLE, thresholds: { ...DEFAULT_ADVISOR_THRESHOLDS, yieldGapPt: 1.0 } });
    expect(named.recommendations[2]?.title).toBe('低利回り物件の見直し: 渋谷区マンション 1LDK');
    const loose = adviseRealEstate({ ...RE_SAMPLE, thresholds: { ...DEFAULT_ADVISOR_THRESHOLDS, yieldGapPt: 1.5 } });
    expect(loose.recommendations[2]).toEqual({
      title: '利回りのばらつきは小さい',
      rationale: '最低は 渋谷区マンション 1LDK の 4.8% で、平均 6.2% との差 1.4 pt はしきい値 1.5 pt 未満です。',
    });
    // 境界: 差 = しきい値 は名指し (以上)。
    const edge = adviseRealEstate({ ...RE_SAMPLE, thresholds: { ...DEFAULT_ADVISOR_THRESHOLDS, yieldGapPt: 1.4 } });
    expect(edge.recommendations[2]?.title).toBe('低利回り物件の見直し: 渋谷区マンション 1LDK');
    expect(edge.recommendations[2]?.rationale).toContain('(差のしきい値 1.4 pt)');
  });

  it('入居率が null なら根拠は「—」', () => {
    expect(adviseRealEstate({ ...RE_SAMPLE, occupancyRate: null }).basis).toContain('入居率 —');
  });
});

describe('投資信託の提案 — 画面の数字から組む', () => {
  it('見本と同じ数字なら: 分散 (S&P500 39.3%)・牽引役 S&P500 14.2%・含み益 14.8%', () => {
    const r = adviseMutualFunds(MF_SAMPLE);
    expect(r.recommendations).toEqual([
      {
        title: '分散の状況',
        rationale: '最大の銘柄は eMAXIS Slim 米国株式 (S&P500) で評価額の 39.3% です (しきい値 50.0% 未満)。',
      },
      {
        title: '年初来の牽引役: eMAXIS Slim 米国株式 (S&P500)',
        rationale:
          'eMAXIS Slim 米国株式 (S&P500) が年初来 14.2% で最高、最低は eMAXIS Slim 先進国債券インデックス の 3.4% です。すべてプラスです。',
      },
      { title: '含み益 14.8%', rationale: '評価損益率は 14.8% です。利益確定の基準と積立の継続を確認してください。' },
    ]);
    expect(r.basis).toBe('4 銘柄 (同梱の見本 4 件を含む)・評価額 ¥8,240,140・評価損益率 14.8%');
    expect(r.disclaimer).toBe(MUTUAL_FUNDS_ADVISOR_DISCLAIMER);
    expect(r.notForRealMoney).toBe(true);
    expect(r.phase).toBe('rules');
  });

  it('★ しきい値は入力で動く: 39.3% は 0.3 で集中と呼ぶ (境界は以上)', () => {
    const r = adviseMutualFunds({ ...MF_SAMPLE, thresholds: { ...DEFAULT_ADVISOR_THRESHOLDS, concentrationShare: 0.3 } });
    expect(r.recommendations[0]).toEqual({
      title: '集中リスク: eMAXIS Slim 米国株式 (S&P500)',
      rationale:
        '評価額 ¥8,240,140 のうち 39.3% が eMAXIS Slim 米国株式 (S&P500) に集中しています (しきい値 30.0%)。値動きの相関が低い資産への分散を検討してください。',
    });
    const edge = adviseMutualFunds({
      holdings: [
        { name: 'A', valuation: 500, ytdReturnPct: null, demo: false },
        { name: 'B', valuation: 500, ytdReturnPct: null, demo: false },
      ],
      totalValuation: 1000,
      unrealizedGainPct: null,
    });
    expect(edge.recommendations[0]?.title).toBe('集中リスク: A');
  });

  it('集中度・年初来・評価損益率の「未算定」の枝と、マイナス / 1 銘柄 / 含み損', () => {
    const none = adviseMutualFunds({
      holdings: [{ name: 'A', valuation: 0, ytdReturnPct: null, demo: false }],
      totalValuation: 0,
      unrealizedGainPct: null,
    });
    expect(none.recommendations).toEqual([
      { title: '集中度は未算定', rationale: '評価額の合計が読めないため、銘柄の集中度は出しません。' },
      { title: '年初来リターンは未入力', rationale: '年初来リターンが入力された銘柄が無いため、銘柄間の比較はしません。' },
      { title: '評価損益率は未算定', rationale: '取得原価が読めないため、評価損益率は出しません。' },
    ]);
    expect(none.basis).toBe('1 銘柄 (すべて利用者の入力)・評価額 ¥0・評価損益率 —');
    const minus = adviseMutualFunds({
      holdings: [
        { name: 'A', valuation: 600, ytdReturnPct: -2.5, demo: false },
        { name: 'B', valuation: 400, ytdReturnPct: 4.0, demo: true },
      ],
      totalValuation: 1000,
      unrealizedGainPct: -3.25,
    });
    // 集中の文も入力の数字 (対照 B2: 評価額を ¥8,240,140 に固定した版は、この行で落ちる)。
    expect(minus.recommendations[0]).toEqual({
      title: '集中リスク: A',
      rationale: '評価額 ¥1,000 のうち 60.0% が A に集中しています (しきい値 50.0%)。値動きの相関が低い資産への分散を検討してください。',
    });
    for (const frozen of ['8,240,140', '39.3', '14.8', 'S&P500']) expect(all(minus), frozen).not.toContain(frozen);
    expect(minus.recommendations[1]).toEqual({
      title: '年初来マイナスの銘柄: A',
      rationale: 'A は年初来 -2.5% です。最高は B の 4.0%。マイナスの銘柄は保有目的を確認してください。',
    });
    expect(minus.recommendations[2]).toEqual({
      title: '含み損 3.3%',
      rationale: '評価損益率は -3.3% です。取得原価と保有目的を確認し、損失の許容範囲を決めてください。',
    });
    expect(minus.basis).toBe('2 銘柄 (同梱の見本 1 件を含む)・評価額 ¥1,000・評価損益率 -3.3%');
    const single = adviseMutualFunds({
      holdings: [
        { name: 'A', valuation: 600, ytdReturnPct: 7.25, demo: false },
        { name: 'B', valuation: 400, ytdReturnPct: null, demo: false },
      ],
      totalValuation: 1000,
      unrealizedGainPct: 0,
    });
    expect(single.recommendations[1]).toEqual({
      title: '年初来リターン: A',
      rationale: 'A の年初来リターンは 7.3% です (比較対象は他にありません)。',
    });
    expect(single.recommendations[2]?.title).toBe('含み益 0.0%');
  });
});

describe('Uber Eats の提案 — 画面の数字から組む', () => {
  it('見本と同じ数字なら: 売上 1.9 倍の開き・評価は横並び・人気はガーリックフライ', () => {
    const r = adviseUberEats(UE_SAMPLE);
    expect(r.recommendations).toEqual([
      {
        title: '店舗別売上の平準化',
        rationale:
          '売上の最大は Shibuya 本店 (¥285,400)、最小は Ikebukuro West (¥152,300) で 1.9 倍の開きがあります (しきい値 1.5 倍)。上位店舗の運用を他店舗へ展開してください。',
      },
      {
        title: '評価は横並び',
        rationale: '最低は Shinjuku 東口店 の 4.5 で、平均 4.6 との差 0.1 pt はしきい値 0.2 pt 未満です。',
      },
      {
        title: '人気メニューの横展開: ガーリックフライ (L)',
        rationale: 'ガーリックフライ (L) は 124 食 (¥49,600) で最多です。全店舗で前面に出してください。',
      },
    ]);
    expect(r.basis).toBe('3 店舗・メニュー 3 品・平均評価 4.6');
    expect(r.disclaimer).toBe(FOOD_ADVISOR_DISCLAIMER);
    expect(r.phase).toBe('rules');
    expect(r.notForRealMoney).toBe(true);
  });

  it('差が小さい / 売上 0 の店舗 / 平均評価なし / 評価の底上げ / メニューなし の枝', () => {
    const flat = adviseUberEats({
      stores: [
        { name: 'A', orders: 10, revenue: 100_000, rating: 4.0 },
        { name: 'B', orders: 10, revenue: 80_000, rating: 4.5 },
      ],
      topItems: [],
      avgRating: 4.25,
    });
    expect(flat.recommendations).toEqual([
      {
        title: '店舗間の売上差は小さい',
        rationale: '最大 A (¥100,000) と最小 B (¥80,000) の差は 1.3 倍で、しきい値 1.5 倍未満です。',
      },
      {
        title: '評価の底上げ: A',
        rationale: 'A の評価 4.0 は平均 4.3 を 0.3 pt 下回ります (しきい値 0.2 pt)。配達時間と包装の改善を優先してください。',
      },
      { title: '人気メニューは未入力', rationale: 'メニュー別の販売数が無いため、横展開の候補は挙げません。' },
    ]);
    expect(flat.basis).toBe('2 店舗・メニュー 0 品・平均評価 4.3');
    const zero = adviseUberEats({
      stores: [
        { name: 'A', orders: 0, revenue: 0, rating: 4.0 },
        { name: 'B', orders: 10, revenue: 80_000, rating: 4.5 },
      ],
      topItems: [],
      avgRating: null,
    });
    expect(zero.recommendations[0]).toEqual({
      title: '店舗別売上の比較は未算定',
      rationale: '売上が 0 の店舗 (A) があるため、店舗間の倍率は出しません。',
    });
    expect(zero.recommendations[1]).toEqual({
      title: '評価の比較は未算定',
      rationale: '平均評価が読めないため、店舗ごとの評価の比較はしません。',
    });
    expect(zero.basis).toBe('2 店舗・メニュー 0 品・平均評価 —');
    // 境界: 倍率 = しきい値 は「平準化」(以上)。
    const edge = adviseUberEats({
      stores: [{ name: 'A', orders: 1, revenue: 150_000, rating: 4 }, { name: 'B', orders: 1, revenue: 100_000, rating: 4 }],
      topItems: [],
      avgRating: 4,
    });
    expect(edge.recommendations[0]?.title).toBe('店舗別売上の平準化');
    expect(edge.recommendations[1]?.title).toBe('評価は横並び');
  });
});

describe('出前館の提案 — 画面の数字から組む', () => {
  it('見本と同じ数字なら: キャンセル率 1.8% の維持・客単価は均一・配達中 1 件', () => {
    const r = adviseDemaeCan(DC_SAMPLE);
    expect(r.recommendations).toEqual([
      {
        title: 'キャンセル率 1.8% の維持',
        rationale: '月次キャンセル率 1.8% は基準 3.0% (出典なし・置き値) 以下です。継続観測してください。',
      },
      {
        title: '客単価は地域間で均一',
        rationale: '客単価は最高 新宿区 ¥2,042 / 最低 渋谷区 ¥2,036 で、差は 1.0 倍 (しきい値 1.2 倍未満) です。',
      },
      { title: '配達中 1 件の監視', rationale: '配達中の注文が 1 件あります。最優先で監視し、遅延を未然に防いでください。' },
    ]);
    expect(r.basis).toBe('月次 612 件・地域 3 か所・配達中 1 件');
    expect(r.disclaimer).toBe(FOOD_ADVISOR_DISCLAIMER);
    expect(r.phase).toBe('rules');
  });

  it('キャンセル率の改善 / 未入力、地域格差 / 未算定、配達中なし の枝', () => {
    const bad = adviseDemaeCan({
      monthOrders: 10,
      cancellationRate: 0.05,
      topAreas: [
        { area: 'X', orders: 10, revenue: 30_000 },
        { area: 'Y', orders: 10, revenue: 20_000 },
        { area: 'Z', orders: 0, revenue: 0 },
      ],
      deliveringOrders: 0,
    });
    expect(bad.recommendations).toEqual([
      {
        title: 'キャンセル率 5.0% の改善',
        rationale: '月次キャンセル率 5.0% は基準 3.0% (出典なし・置き値) を上回ります。受付から調理開始までの確認と、在庫切れ時の即時反映を見直してください。',
      },
      {
        title: '客単価の地域格差: X と Y',
        rationale: '客単価は最高 X ¥3,000 / 最低 Y ¥2,000 で 1.5 倍の開きがあります (しきい値 1.2 倍)。X の高単価メニューを Y でも展開してください。',
      },
      { title: '配達中の注文なし', rationale: '配達中の注文はありません。' },
    ]);
    expect(bad.basis).toBe('月次 10 件・地域 3 か所・配達中 0 件');
    const none = adviseDemaeCan({ monthOrders: 0, cancellationRate: null, topAreas: [{ area: 'X', orders: 0, revenue: 0 }], deliveringOrders: 0 });
    expect(none.recommendations[0]).toEqual({
      title: 'キャンセル率は未入力',
      rationale: '月次キャンセル率が読めないため、基準との比較はしません。',
    });
    expect(none.recommendations[1]).toEqual({
      title: '客単価の地域比較は未算定',
      rationale: '注文のある地域が 0 か所のため、地域間の客単価は比べません。',
    });
    // 境界: 率 = 基準 は「維持」(上回らない)。
    expect(adviseDemaeCan({ ...DC_SAMPLE, cancellationRate: ADVISOR_CANCELLATION_RATE_REF }).recommendations[0]?.title).toBe('キャンセル率 3.0% の維持');
  });
});

describe('読み取り — 読めない payload は断る (文面は両ビルドで同じ)', () => {
  const RE = 'real-estate.advise';

  it('無い・オブジェクトでない・一覧が無い・0 件・多すぎる', () => {
    for (const raw of [undefined, null, 'x', 42, []]) {
      expect(parseRealEstateAdviceInput(raw)).toEqual({ ok: false, message: `${RE}: 提案の元になる数字 (画面の集計) が payload にありません` });
    }
    expect(parseRealEstateAdviceInput({})).toEqual({ ok: false, message: `${RE}: properties は配列 (1〜500 件) で指定してください` });
    expect(parseRealEstateAdviceInput({ properties: [] })).toEqual({ ok: false, message: `${RE}: properties は配列 (1〜500 件) で指定してください` });
    const many = { ...RE_SAMPLE, properties: Array.from({ length: MAX_ADVICE_ROWS + 1 }, () => RE_SAMPLE.properties[0]) };
    expect(parseRealEstateAdviceInput(many).ok).toBe(false);
    const atCap = { ...RE_SAMPLE, properties: Array.from({ length: MAX_ADVICE_ROWS }, () => RE_SAMPLE.properties[0]) };
    expect(parseRealEstateAdviceInput(atCap).ok).toBe(true);
  });

  it('行の欄: 名前 (1〜64 字・前後の空白は落とす)・真偽値・有限数・null 可の欄', () => {
    const row = (patch: Record<string, unknown>) => parseRealEstateAdviceInput({ ...RE_SAMPLE, properties: [{ ...RE_SAMPLE.properties[0], ...patch }] });
    expect(row({ name: '' })).toEqual({ ok: false, message: `${RE}: properties[0].name は 1〜64 文字で指定してください` });
    expect(row({ name: 'x'.repeat(MAX_ADVICE_NAME_CHARS + 1) }).ok).toBe(false);
    expect(row({ name: 'x'.repeat(MAX_ADVICE_NAME_CHARS) }).ok).toBe(true);
    expect(row({ name: 12 }).ok).toBe(false);
    const trimmed = row({ name: '  渋谷  ' });
    expect(trimmed.ok && trimmed.value.properties[0]?.name).toBe('渋谷');
    expect(row({ occupied: 'yes' })).toEqual({ ok: false, message: `${RE}: properties[0].occupied は真偽値で指定してください` });
    expect(row({ monthlyRent: Number.NaN })).toEqual({ ok: false, message: `${RE}: properties[0].monthlyRent は有限の数値で指定してください` });
    expect(row({ monthlyRent: '1000' }).ok).toBe(false);
    expect(row({ grossYieldPct: Number.POSITIVE_INFINITY })).toEqual({ ok: false, message: `${RE}: properties[0].grossYieldPct は有限の数値か null で指定してください` });
    const omitted = row({ grossYieldPct: undefined });
    expect(omitted.ok && omitted.value.properties[0]?.grossYieldPct).toBeNull();
    expect(row({ demo: 1 })).toEqual({ ok: false, message: `${RE}: properties[0].demo は真偽値で指定してください` });
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, properties: ['x'] })).toEqual({ ok: false, message: `${RE}: properties[0] はオブジェクトで指定してください` });
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, properties: [RE_SAMPLE.properties[0], null] })).toEqual({
      ok: false,
      message: `${RE}: properties[1] はオブジェクトで指定してください`,
    });
  });

  it('集計の欄と、しきい値', () => {
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, netCashflow: 'x' })).toEqual({ ok: false, message: `${RE}: netCashflow は有限の数値で指定してください` });
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, portfolioYieldPct: 'x' })).toEqual({ ok: false, message: `${RE}: portfolioYieldPct は有限の数値か null で指定してください` });
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, occupancyRate: {} })).toEqual({ ok: false, message: `${RE}: occupancyRate は有限の数値か null で指定してください` });
    const ok = parseRealEstateAdviceInput(RE_SAMPLE);
    expect(ok.ok && ok.value).toEqual({ ...RE_SAMPLE, thresholds: DEFAULT_ADVISOR_THRESHOLDS });
    expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, thresholds: 3 })).toEqual({ ok: false, message: `${RE}: thresholds はオブジェクトで指定してください` });
    for (const bad of [0, -1, Number.NaN, '1']) {
      expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, thresholds: { yieldGapPt: bad } }), String(bad)).toEqual({
        ok: false,
        message: `${RE}: thresholds.yieldGapPt は正の有限の数値で指定してください`,
      });
    }
    for (const bad of [0, 1.01, -0.5, 'x']) {
      expect(parseRealEstateAdviceInput({ ...RE_SAMPLE, thresholds: { concentrationShare: bad } }), String(bad)).toEqual({
        ok: false,
        message: `${RE}: thresholds.concentrationShare は 0 より大きく 1 以下の数値で指定してください`,
      });
    }
    // 片方だけ書けば、もう片方は既定。
    const half = parseRealEstateAdviceInput({ ...RE_SAMPLE, thresholds: { yieldGapPt: 2 } });
    expect(half.ok && half.value.thresholds).toEqual({ yieldGapPt: 2, concentrationShare: ADVISOR_CONCENTRATION_SHARE });
    const other = parseRealEstateAdviceInput({ ...RE_SAMPLE, thresholds: { concentrationShare: 1 } });
    expect(other.ok && other.value.thresholds).toEqual({ yieldGapPt: ADVISOR_YIELD_GAP_PT, concentrationShare: 1 });
  });

  it('投資信託 / Uber Eats / 出前館 の読み取り (最初に落ちる欄と、通る形)', () => {
    expect(parseMutualFundsAdviceInput({})).toEqual({ ok: false, message: 'mutual-funds.advise: holdings は配列 (1〜500 件) で指定してください' });
    const mfRow = (patch: Record<string, unknown>) => parseMutualFundsAdviceInput({ ...MF_SAMPLE, holdings: [{ ...MF_SAMPLE.holdings[0], ...patch }] });
    expect(mfRow({ name: '' }).ok).toBe(false);
    expect(mfRow({ valuation: 'x' })).toEqual({ ok: false, message: 'mutual-funds.advise: holdings[0].valuation は有限の数値で指定してください' });
    expect(mfRow({ ytdReturnPct: 'x' })).toEqual({ ok: false, message: 'mutual-funds.advise: holdings[0].ytdReturnPct は有限の数値か null で指定してください' });
    expect(mfRow({ demo: 'x' })).toEqual({ ok: false, message: 'mutual-funds.advise: holdings[0].demo は真偽値で指定してください' });
    expect(parseMutualFundsAdviceInput({ ...MF_SAMPLE, holdings: [1] })).toEqual({ ok: false, message: 'mutual-funds.advise: holdings[0] はオブジェクトで指定してください' });
    expect(parseMutualFundsAdviceInput({ ...MF_SAMPLE, totalValuation: null })).toEqual({ ok: false, message: 'mutual-funds.advise: totalValuation は有限の数値で指定してください' });
    expect(parseMutualFundsAdviceInput({ ...MF_SAMPLE, unrealizedGainPct: 'x' })).toEqual({ ok: false, message: 'mutual-funds.advise: unrealizedGainPct は有限の数値か null で指定してください' });
    expect(parseMutualFundsAdviceInput({ ...MF_SAMPLE, thresholds: { yieldGapPt: 0 } }).ok).toBe(false);
    const mf = parseMutualFundsAdviceInput(MF_SAMPLE);
    expect(mf.ok && mf.value).toEqual({ ...MF_SAMPLE, thresholds: DEFAULT_ADVISOR_THRESHOLDS });

    expect(parseUberEatsAdviceInput({})).toEqual({ ok: false, message: 'uber-eats.advise: stores は配列 (1〜500 件) で指定してください' });
    const ueStore = (patch: Record<string, unknown>) => parseUberEatsAdviceInput({ ...UE_SAMPLE, stores: [{ ...UE_SAMPLE.stores[0], ...patch }] });
    expect(ueStore({ name: '' })).toEqual({ ok: false, message: 'uber-eats.advise: stores[0].name は 1〜64 文字で指定してください' });
    expect(ueStore({ orders: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: stores[0].orders は有限の数値で指定してください' });
    expect(ueStore({ revenue: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: stores[0].revenue は有限の数値で指定してください' });
    expect(ueStore({ rating: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: stores[0].rating は有限の数値で指定してください' });
    expect(parseUberEatsAdviceInput({ ...UE_SAMPLE, stores: [0] })).toEqual({ ok: false, message: 'uber-eats.advise: stores[0] はオブジェクトで指定してください' });
    expect(parseUberEatsAdviceInput({ ...UE_SAMPLE, topItems: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: topItems は配列 (0〜500 件) で指定してください' });
    const ueItem = (patch: Record<string, unknown>) => parseUberEatsAdviceInput({ ...UE_SAMPLE, topItems: [{ ...UE_SAMPLE.topItems[0], ...patch }] });
    expect(ueItem({ name: '' })).toEqual({ ok: false, message: 'uber-eats.advise: topItems[0].name は 1〜64 文字で指定してください' });
    expect(ueItem({ sold: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: topItems[0].sold は有限の数値で指定してください' });
    expect(ueItem({ revenue: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: topItems[0].revenue は有限の数値で指定してください' });
    expect(parseUberEatsAdviceInput({ ...UE_SAMPLE, topItems: [null] })).toEqual({ ok: false, message: 'uber-eats.advise: topItems[0] はオブジェクトで指定してください' });
    expect(parseUberEatsAdviceInput({ ...UE_SAMPLE, avgRating: 'x' })).toEqual({ ok: false, message: 'uber-eats.advise: avgRating は有限の数値か null で指定してください' });
    const emptyItems = parseUberEatsAdviceInput({ ...UE_SAMPLE, topItems: [] });
    expect(emptyItems.ok && emptyItems.value.topItems).toEqual([]);
    const ue = parseUberEatsAdviceInput(UE_SAMPLE);
    expect(ue.ok && ue.value).toEqual(UE_SAMPLE);

    expect(parseDemaeCanAdviceInput({})).toEqual({ ok: false, message: 'demae-can.advise: monthOrders は有限の数値で指定してください' });
    expect(parseDemaeCanAdviceInput({ ...DC_SAMPLE, cancellationRate: 'x' })).toEqual({ ok: false, message: 'demae-can.advise: cancellationRate は有限の数値か null で指定してください' });
    expect(parseDemaeCanAdviceInput({ ...DC_SAMPLE, topAreas: {} })).toEqual({ ok: false, message: 'demae-can.advise: topAreas は配列 (0〜500 件) で指定してください' });
    const dcArea = (patch: Record<string, unknown>) => parseDemaeCanAdviceInput({ ...DC_SAMPLE, topAreas: [{ ...DC_SAMPLE.topAreas[0], ...patch }] });
    expect(dcArea({ area: '' })).toEqual({ ok: false, message: 'demae-can.advise: topAreas[0].area は 1〜64 文字で指定してください' });
    expect(dcArea({ orders: 'x' })).toEqual({ ok: false, message: 'demae-can.advise: topAreas[0].orders は有限の数値で指定してください' });
    expect(dcArea({ revenue: 'x' })).toEqual({ ok: false, message: 'demae-can.advise: topAreas[0].revenue は有限の数値で指定してください' });
    expect(parseDemaeCanAdviceInput({ ...DC_SAMPLE, topAreas: ['x'] })).toEqual({ ok: false, message: 'demae-can.advise: topAreas[0] はオブジェクトで指定してください' });
    expect(parseDemaeCanAdviceInput({ ...DC_SAMPLE, deliveringOrders: 'x' })).toEqual({ ok: false, message: 'demae-can.advise: deliveringOrders は有限の数値で指定してください' });
    const dc = parseDemaeCanAdviceInput(DC_SAMPLE);
    expect(dc.ok && dc.value).toEqual(DC_SAMPLE);
    const dcNull = parseDemaeCanAdviceInput({ ...DC_SAMPLE, cancellationRate: null, topAreas: [] });
    expect(dcNull.ok && dcNull.value.cancellationRate).toBeNull();
  });
});

describe('adviseService — main の 4 action とブラウザ版が通る 1 つの入口', () => {
  it('4 サービスすべてで、読めれば提案・読めなければ断りの文面 (id 込み)', () => {
    const inputs = { 'real-estate': RE_SAMPLE, 'mutual-funds': MF_SAMPLE, 'uber-eats': UE_SAMPLE, 'demae-can': DC_SAMPLE } as const;
    const firstField = {
      'real-estate': 'properties は配列 (1〜500 件) で指定してください',
      'mutual-funds': 'holdings は配列 (1〜500 件) で指定してください',
      'uber-eats': 'stores は配列 (1〜500 件) で指定してください',
      'demae-can': 'monthOrders は有限の数値で指定してください',
    } as const;
    for (const id of RECORD_ENTRY_SERVICE_IDS) {
      const good = adviseService(id, inputs[id]);
      expect(good.ok, id).toBe(true);
      if (good.ok) {
        expect(good.data.recommendations.length, id).toBe(3);
        expect(good.data.phase, id).toBe('rules');
        expect(good.data.notForRealMoney, id).toBe(true);
        expect(good.data.basis.length, id).toBeGreaterThan(5);
      }
      const bad = adviseService(id, {});
      expect(bad).toEqual({ ok: false, message: `${id}.advise: ${firstField[id]}` });
      expect(adviseService(id, undefined)).toEqual({ ok: false, message: `${id}.advise: 提案の元になる数字 (画面の集計) が payload にありません` });
    }
  });

  it('入口の答えは規則関数の答えと同じ物 (別の写しを作らない)', () => {
    expect(adviseService('real-estate', RE_SAMPLE)).toEqual({ ok: true, data: adviseRealEstate({ ...RE_SAMPLE, thresholds: DEFAULT_ADVISOR_THRESHOLDS }) });
    expect(adviseService('mutual-funds', MF_SAMPLE)).toEqual({ ok: true, data: adviseMutualFunds({ ...MF_SAMPLE, thresholds: DEFAULT_ADVISOR_THRESHOLDS }) });
    expect(adviseService('uber-eats', UE_SAMPLE)).toEqual({ ok: true, data: adviseUberEats(UE_SAMPLE) });
    expect(adviseService('demae-can', DC_SAMPLE)).toEqual({ ok: true, data: adviseDemaeCan(DC_SAMPLE) });
  });

  it('しきい値の既定は定数そのもの (写しではない)', () => {
    expect(DEFAULT_ADVISOR_THRESHOLDS).toEqual({ yieldGapPt: ADVISOR_YIELD_GAP_PT, concentrationShare: ADVISOR_CONCENTRATION_SHARE });
    expect(ADVISOR_YIELD_GAP_PT).toBe(1.0);
    expect(ADVISOR_CONCENTRATION_SHARE).toBe(0.5);
    expect(ADVISOR_STORE_REVENUE_SPREAD_RATIO).toBe(1.5);
    expect(ADVISOR_RATING_GAP_PT).toBe(0.2);
    expect(ADVISOR_CANCELLATION_RATE_REF).toBe(0.03);
    expect(ADVISOR_AOV_SPREAD_RATIO).toBe(1.2);
    expect(MAX_ADVICE_ROWS).toBe(500);
    expect(MAX_ADVICE_NAME_CHARS).toBe(64);
  });

  it('免責 — 投資系は「投資助言ではありません」、店舗系は「店舗運営上の助言ではありません」、どれも規則で組んだと言う', () => {
    expect(REAL_ESTATE_ADVISOR_DISCLAIMER).toBe(
      '本提案は画面の数字から規則で組み立てた教育目的の参考情報であり、投資助言ではありません。実際の投資判断はファイナンシャルアドバイザー・税理士・宅建士の確認を経てご自身の責任で行ってください。Phase 6 で実 LLM 推論を接続します。',
    );
    expect(MUTUAL_FUNDS_ADVISOR_DISCLAIMER).toBe(
      '本提案は画面の数字から規則で組み立てた教育目的の参考情報であり、投資助言ではありません。実際の投資判断はファイナンシャルアドバイザーの確認を経てご自身の責任で行ってください。Phase 6 で実 LLM 推論を接続します。',
    );
    expect(FOOD_ADVISOR_DISCLAIMER).toBe(
      '本提案は画面の数字から規則で組み立てた参考情報であり、店舗運営上の助言ではありません。実際の経営判断はオーナー・専門家の責任で行ってください。Phase 6 で実 LLM 推論を接続します。',
    );
    for (const d of [REAL_ESTATE_ADVISOR_DISCLAIMER, MUTUAL_FUNDS_ADVISOR_DISCLAIMER, FOOD_ADVISOR_DISCLAIMER]) {
      expect(d).not.toContain('静的 snapshot');
      expect(d).not.toContain('テンプレート');
    }
  });

  it('提案は必ず 3 本で、題名と根拠は空でない', () => {
    for (const r of [adviseRealEstate(RE_SAMPLE), adviseMutualFunds(MF_SAMPLE), adviseUberEats(UE_SAMPLE), adviseDemaeCan(DC_SAMPLE)]) {
      expect(titles(r)).toHaveLength(3);
      for (const x of r.recommendations) {
        expect(x.title.length).toBeGreaterThan(0);
        expect(x.rationale.length).toBeGreaterThan(10);
      }
    }
  });
});
