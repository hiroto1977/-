/**
 * 補助金・助成金の申請書類の下書き —— 判定と組み立て (2026-11-18)。
 *
 * 文面は値ごと留める (綴りが変わったら鳴る)。計算は境目を両側から当てる。
 */
import { describe, expect, it } from 'vitest';
import {
  APPLICANT_ENTITY_LABELS,
  APPLICATION_BLANK,
  APPLICATION_KIND_LABELS,
  APPLICATION_UNREADABLE,
  CUSTOM_PROGRAM_NOTE,
  DRAFT_CAUTIONS,
  GRANT_AMOUNT_NOTE,
  INDUSTRIES,
  MAX_APPLICATION_NAME_CHARS,
  MAX_APPLICATION_TEXT_CHARS,
  MAX_EXPENSE_LINES,
  MAX_EXPENSE_NAME_CHARS,
  NUMBER_FIELD_LABELS,
  PAYMENT_TIMING_NOTE,
  PROFESSIONAL_NOTE,
  START_TIMING_NOTE,
  TEXT_FIELD_LIMITS,
  applicationDraftFilename,
  applicationDraftMarkdown,
  buildApplicationDraft,
  draftWithheldNote,
  expenseAmountLabel,
  expenseNameLabel,
  expenseTotals,
  filledExpenses,
  industryOf,
  isAmount,
  missingFields,
  monthLabel,
  numberText,
  overLimitLabels,
  programNameOf,
  yenText,
  type ApplicationInput,
  type ApplicationProgram,
  type DraftBlock,
} from '../fundingApplication';

const PROGRAM: ApplicationProgram = {
  name: '見本の補助金',
  authority: '見本の省',
  statement: '見本の概要。',
  application: '見本の流れ。',
  asOf: '2026-06',
  sources: [
    { url: 'https://example.go.jp/a', label: '見本の省 案内' },
    { url: 'https://example.jp/b', label: '見本の解説' },
  ],
};

/** 全部の項目が入った補助金の入力。 */
const FULL: ApplicationInput = {
  kind: 'subsidy',
  program: PROGRAM,
  customProgramName: '',
  applicantName: '見本商店',
  entity: 'corporation',
  industryId: 'E',
  location: '見本県見本市',
  foundedYear: 2015,
  employees: 5,
  capitalYen: 3_000_000,
  annualRevenueYen: 20_000_000,
  projectTitle: '見本の計画',
  issues: '課題の文。',
  plan: '取組の文。',
  effect: '効果の文。',
  startMonth: '2026-04',
  endMonth: '2027-03',
  expenses: [
    { name: '機械装置費', amount: 1_000_000 },
    { name: '広報費', amount: 500_001 },
    { name: '', amount: null },
  ],
  ratePct: 50,
  capYen: 2_000_000,
};

const TODAY = '2026-11-18';

function sectionOf(input: ApplicationInput, heading: string): readonly DraftBlock[] {
  const section = buildApplicationDraft(input, TODAY).sections.find((s) => s.heading === heading);
  if (section === undefined) throw new Error(`節が無い: ${heading}`);
  return section.blocks;
}

describe('業種の一覧', () => {
  it('日本標準産業分類の大分類 20 が、記号 A〜T の順に並ぶ', () => {
    expect(INDUSTRIES.map((i) => i.id).join('')).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(new Set(INDUSTRIES.map((i) => i.label)).size).toBe(20);
  });

  it('どの業種も、名前と、数字で書くとよい観点 3 つを持つ', () => {
    for (const industry of INDUSTRIES) {
      expect(industry.label.length, industry.id).toBeGreaterThan(1);
      expect(industry.hints.length, industry.id).toBe(3);
      for (const hint of industry.hints) expect(hint.length, `${industry.id}: ${hint}`).toBeGreaterThan(1);
      expect(new Set(industry.hints).size, industry.id).toBe(3);
    }
  });

  it('名前と観点は値ごと留める (先頭・中ほど・末尾)', () => {
    expect(INDUSTRIES[0]).toEqual({ id: 'A', label: '農業・林業', hints: ['作付面積・飼養頭数', '収量と出荷額', '作業時間'] });
    expect(industryOf('E')).toEqual({ id: 'E', label: '製造業', hints: ['生産数量と不良率', '設備の稼働率', '1 個あたりの製造時間'] });
    expect(industryOf('M')?.label).toBe('宿泊業・飲食サービス業');
    expect(INDUSTRIES[19]).toEqual({ id: 'T', label: '分類不能の産業・その他', hints: ['売上高', '顧客数', '作業時間'] });
  });

  it('全部の業種の文面 (一覧が黙って書き換わらない)', () => {
    expect(INDUSTRIES.map((i) => `${i.id}:${i.label}:${i.hints.join('/')}`)).toEqual([
      'A:農業・林業:作付面積・飼養頭数/収量と出荷額/作業時間',
      'B:漁業:水揚げ量・養殖の生産量/出荷額/燃料・餌の費用',
      'C:鉱業・採石業・砂利採取業:採取量/設備の稼働時間/安全対策の件数',
      'D:建設業:受注件数と受注額/工期/技能者の人数',
      'E:製造業:生産数量と不良率/設備の稼働率/1 個あたりの製造時間',
      'F:電気・ガス・熱供給・水道業:供給量/設備の稼働率/保守の件数',
      'G:情報通信業:開発にかかる人月/利用者数・契約数/解約率',
      'H:運輸業・郵便業:輸送量/車両の稼働率/燃料費',
      'I:卸売業・小売業:客数と客単価/在庫回転/販路ごとの売上',
      'J:金融業・保険業:契約件数/事務処理にかかる時間/問い合わせ件数',
      'K:不動産業・物品賃貸業:管理戸数・貸出件数/入居率・稼働率/成約までの日数',
      'L:学術研究・専門・技術サービス業:受託件数/1 件あたりの作業時間/顧客数',
      'M:宿泊業・飲食サービス業:客数と客単価/席数・客室の稼働率/食材の廃棄量',
      'N:生活関連サービス業・娯楽業:来店客数/再来店の割合/予約から提供までの時間',
      'O:教育・学習支援業:受講者数/継続率/講座あたりの準備時間',
      'P:医療・福祉:利用者数/職員 1 人あたりの担当数/記録にかかる時間',
      'Q:複合サービス事業:取扱件数/窓口の待ち時間/事業ごとの売上',
      'R:サービス業 (他に分類されないもの):受注件数/1 件あたりの作業時間/顧客数',
      'S:公務 (他に分類されるものを除く):処理件数/処理にかかる日数/窓口の待ち時間',
      'T:分類不能の産業・その他:売上高/顧客数/作業時間',
    ]);
  });

  it('表に無い記号は null (空・小文字・prototype の名前)', () => {
    for (const id of ['', 'e', 'Z', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(industryOf(id), JSON.stringify(id)).toBeNull();
    }
  });
});

describe('呼び名と天井', () => {
  it('書類の型・事業形態・数の欄の呼び名', () => {
    expect(APPLICATION_KIND_LABELS).toEqual({
      subsidy: '補助金 (事業の計画と経費を書く)',
      grant: '助成金 (雇用・労務の取組を書く)',
    });
    expect(APPLICANT_ENTITY_LABELS).toEqual({ individual: '個人事業主', corporation: '法人' });
    expect(NUMBER_FIELD_LABELS).toEqual({
      foundedYear: '創業・設立の年 (西暦)',
      employees: '従業員数',
      capitalYen: '資本金',
      annualRevenueYen: '直近の年間売上高',
      ratePct: '補助率',
      capYen: '上限額',
    });
  });

  it('天井の数と、天井を持つ欄', () => {
    expect(MAX_APPLICATION_NAME_CHARS).toBe(80);
    expect(MAX_APPLICATION_TEXT_CHARS).toBe(1200);
    expect(MAX_EXPENSE_NAME_CHARS).toBe(40);
    expect(MAX_EXPENSE_LINES).toBe(12);
    expect(TEXT_FIELD_LIMITS).toEqual({
      customProgramName: { label: '制度の名前', max: 80 },
      applicantName: { label: '事業者名', max: 80 },
      location: { label: '所在地', max: 80 },
      projectTitle: { label: '計画の名前', max: 80 },
      issues: { label: '現状と課題', max: 1200 },
      plan: { label: '取り組む内容', max: 1200 },
      effect: { label: '期待される効果', max: 1200 },
    });
  });

  it('未記入と「使えない値」の文は別', () => {
    expect(APPLICATION_BLANK).toBe('（未記入）');
    expect(APPLICATION_UNREADABLE).toBe('（読み取れない値）');
  });

  it('費目の欄の呼び名は 1 始まり', () => {
    expect(expenseNameLabel(0)).toBe('費目 1 の名前');
    expect(expenseNameLabel(11)).toBe('費目 12 の名前');
    expect(expenseAmountLabel(0)).toBe('費目 1 の金額');
    expect(expenseAmountLabel(2)).toBe('費目 3 の金額');
  });
});

describe('数の読み', () => {
  it('isAmount: 0 以上の有限の数だけ', () => {
    expect(isAmount(0)).toBe(true);
    expect(isAmount(5)).toBe(true);
    expect(isAmount(0.5)).toBe(true);
    expect(isAmount(null)).toBe(false);
    expect(isAmount(-1)).toBe(false);
    expect(isAmount(-0.001)).toBe(false);
    expect(isAmount(Number.NaN)).toBe(false);
    expect(isAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('numberText: 未記入・使えない値・読めた値を言い分ける (0 は読めた値)', () => {
    const format = (n: number): string => `<${n}>`;
    expect(numberText(null, format)).toBe('（未記入）');
    expect(numberText(-1, format)).toBe('（読み取れない値）');
    expect(numberText(Number.NaN, format)).toBe('（読み取れない値）');
    expect(numberText(Number.POSITIVE_INFINITY, format)).toBe('（読み取れない値）');
    expect(numberText(0, format)).toBe('<0>');
    expect(numberText(12, format)).toBe('<12>');
  });

  it('yenText: 桁区切りと単位', () => {
    expect(yenText(0)).toBe('0 円');
    expect(yenText(1_234_567)).toBe('1,234,567 円');
  });

  it('monthLabel: 暦に在る月だけを読む (月の 0 は落とす)', () => {
    expect(monthLabel('2026-04')).toBe('2026年4月');
    expect(monthLabel('2026-12')).toBe('2026年12月');
    expect(monthLabel('2026-13')).toBeNull();
    expect(monthLabel('2026-00')).toBeNull();
    expect(monthLabel('2026-04-01')).toBeNull();
    expect(monthLabel('2026')).toBeNull();
    expect(monthLabel('')).toBeNull();
  });
});

describe('費目と申請額の目安', () => {
  it('filledExpenses: 名前も金額も空の行だけを落とす', () => {
    const lines = [
      { name: '', amount: null },
      { name: '   ', amount: null },
      { name: '機械', amount: null },
      { name: '', amount: 0 },
      { name: ' 広報 ', amount: 10 },
    ];
    expect(filledExpenses(lines)).toEqual([
      { name: '機械', amount: null },
      { name: '', amount: 0 },
      { name: ' 広報 ', amount: 10 },
    ]);
  });

  it('合計 × 補助率 (1 円未満は切り捨て)・自己負担は残り', () => {
    expect(expenseTotals(FULL.expenses, 50, null)).toEqual({
      total: 1_500_001,
      unreadable: 0,
      requested: 750_000,
      own: 750_001,
      capped: false,
      reason: null,
    });
    // 2/3 のような割り切れない率も、切り捨てて整数にする。
    expect(expenseTotals([{ name: 'a', amount: 100 }], 66.6, null).requested).toBe(66);
  });

  it('上限額: 超えたら頭打ち・ちょうどは頭打ちではない・未満はそのまま', () => {
    const lines = [{ name: 'a', amount: 1000 }];
    expect(expenseTotals(lines, 50, 499)).toMatchObject({ requested: 499, own: 501, capped: true, reason: null });
    expect(expenseTotals(lines, 50, 500)).toMatchObject({ requested: 500, own: 500, capped: false, reason: null });
    expect(expenseTotals(lines, 50, 501)).toMatchObject({ requested: 500, own: 500, capped: false, reason: null });
    expect(expenseTotals(lines, 50, 0)).toMatchObject({ requested: 0, own: 1000, capped: true, reason: null });
  });

  it('補助率の境目: 100 は通す・100 を超える / 0 / 負 / 非有限は計算しない', () => {
    const lines = [{ name: 'a', amount: 1000 }];
    expect(expenseTotals(lines, 100, null)).toMatchObject({ requested: 1000, own: 0, reason: null });
    expect(expenseTotals(lines, 0.1, null)).toMatchObject({ requested: 1, own: 999, reason: null });
    const refused = '補助率は 0 より大きく 100 以下で入力してください (申請額は計算していません)。';
    for (const rate of [100.01, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(expenseTotals(lines, rate, null), String(rate)).toEqual({
        total: 1000,
        unreadable: 0,
        requested: null,
        own: null,
        capped: false,
        reason: refused,
      });
    }
  });

  it('計算しない理由は 1 つずつ言う (費目が無い → 金額が未記入 → 補助率が未記入 → 上限額が負)', () => {
    expect(expenseTotals([], 50, null)).toEqual({
      total: 0,
      unreadable: 0,
      requested: null,
      own: null,
      capped: false,
      reason: '費目が未記入のため、申請額は計算していません。',
    });
    expect(expenseTotals([{ name: '', amount: null }], null, null).reason).toBe('費目が未記入のため、申請額は計算していません。');
    const mixed = [
      { name: 'a', amount: 300 },
      { name: 'b', amount: null },
      { name: 'c', amount: -1 },
    ];
    expect(expenseTotals(mixed, null, -1)).toEqual({
      total: 300,
      unreadable: 2,
      requested: null,
      own: null,
      capped: false,
      reason: '金額が未記入の費目が 2 件あるため、申請額は計算していません。',
    });
    expect(expenseTotals([{ name: 'a', amount: 300 }], null, -1).reason).toBe('補助率が未記入のため、申請額は計算していません。');
    expect(expenseTotals([{ name: 'a', amount: 300 }], 50, -1)).toEqual({
      total: 300,
      unreadable: 0,
      requested: null,
      own: null,
      capped: false,
      reason: '上限額は 0 以上で入力してください (申請額は計算していません)。',
    });
    expect(expenseTotals([{ name: 'a', amount: 300 }], 50, Number.NaN).reason).toBe(
      '上限額は 0 以上で入力してください (申請額は計算していません)。',
    );
  });
});

describe('制度の名前', () => {
  it('一覧の制度が在ればその名前 (利用者の入力は使わない)・無ければ入力を前後の空白を落として使う', () => {
    expect(programNameOf({ program: PROGRAM, customProgramName: '別の名前' })).toBe('見本の補助金');
    expect(programNameOf({ program: null, customProgramName: '  自分の制度  ' })).toBe('自分の制度');
    expect(programNameOf({ program: null, customProgramName: '   ' })).toBe('');
  });
});

describe('未記入の項目', () => {
  it('全部入っていれば空', () => {
    expect(missingFields(FULL)).toEqual([]);
  });

  it('空の入力は、補助金・法人で要る項目を全部、順に挙げる', () => {
    const empty: ApplicationInput = {
      kind: 'subsidy',
      program: null,
      customProgramName: '',
      applicantName: '',
      entity: 'corporation',
      industryId: '',
      location: '',
      foundedYear: null,
      employees: null,
      capitalYen: null,
      annualRevenueYen: null,
      projectTitle: '',
      issues: '',
      plan: '',
      effect: '',
      startMonth: '',
      endMonth: '',
      expenses: [],
      ratePct: null,
      capYen: null,
    };
    expect(missingFields(empty)).toEqual([
      '申請する制度',
      '事業者名',
      '業種',
      '所在地',
      '創業・設立の年 (西暦)',
      '従業員数',
      '資本金',
      '直近の年間売上高',
      '計画の名前',
      '現状と課題',
      '取り組む内容',
      '期待される効果',
      '開始の月',
      '完了の月',
      '経費の費目',
      '補助率',
    ]);
    // 個人事業主は資本金を挙げない。助成金は経費の 2 項目を挙げない。
    expect(missingFields({ ...empty, entity: 'individual' })).not.toContain('資本金');
    expect(missingFields({ ...empty, entity: 'individual' }).length).toBe(15);
    expect(missingFields({ ...empty, kind: 'grant' })).toEqual(missingFields(empty).slice(0, 14));
  });

  it('1 項目ずつ欠くと、その項目だけを挙げる (空白だけ・使えない値も欠けに数える)', () => {
    const cases: ReadonlyArray<readonly [Partial<ApplicationInput>, string]> = [
      [{ program: null, customProgramName: ' ' }, '申請する制度'],
      [{ applicantName: '  ' }, '事業者名'],
      [{ industryId: 'toString' }, '業種'],
      [{ location: ' ' }, '所在地'],
      [{ foundedYear: Number.NaN }, '創業・設立の年 (西暦)'],
      [{ employees: -1 }, '従業員数'],
      [{ capitalYen: null }, '資本金'],
      [{ annualRevenueYen: null }, '直近の年間売上高'],
      [{ projectTitle: ' ' }, '計画の名前'],
      [{ issues: '\n' }, '現状と課題'],
      [{ plan: ' ' }, '取り組む内容'],
      [{ effect: ' ' }, '期待される効果'],
      [{ startMonth: '2026-13' }, '開始の月'],
      [{ endMonth: '' }, '完了の月'],
      [{ expenses: [{ name: ' ', amount: null }] }, '経費の費目'],
      [{ ratePct: null }, '補助率'],
    ];
    for (const [patch, label] of cases) {
      expect(missingFields({ ...FULL, ...patch }), label).toEqual([label]);
    }
  });

  it('一覧に無い制度でも、名前が入っていれば欠けではない・0 は入っている値', () => {
    expect(missingFields({ ...FULL, program: null, customProgramName: '自分の制度' })).toEqual([]);
    expect(missingFields({ ...FULL, employees: 0, capitalYen: 0, annualRevenueYen: 0 })).toEqual([]);
    // 個人事業主は、資本金が無くても欠けではない。
    expect(missingFields({ ...FULL, entity: 'individual', capitalYen: null })).toEqual([]);
    // 助成金は、費目と補助率が無くても欠けではない。
    expect(missingFields({ ...FULL, kind: 'grant', expenses: [], ratePct: null })).toEqual([]);
  });
});

describe('天井を超えた欄', () => {
  const base = {
    customProgramName: '',
    applicantName: '',
    location: '',
    projectTitle: '',
    issues: '',
    plan: '',
    effect: '',
    expenses: [],
  };

  it('ちょうどは超えていない・1 字多いと名指しする (全部の欄)', () => {
    for (const [key, limit] of Object.entries(TEXT_FIELD_LIMITS)) {
      expect(overLimitLabels({ ...base, [key]: 'あ'.repeat(limit.max) }), `${key} ちょうど`).toEqual([]);
      expect(overLimitLabels({ ...base, [key]: 'あ'.repeat(limit.max + 1) }), `${key} +1`).toEqual([limit.label]);
    }
  });

  it('数えるのは文字 (絵文字 80 個は 80 文字)', () => {
    expect(overLimitLabels({ ...base, applicantName: '😀'.repeat(80) })).toEqual([]);
    expect(overLimitLabels({ ...base, applicantName: '😀'.repeat(81) })).toEqual(['事業者名']);
  });

  it('費目の名前は行の番号つきで名指しする・並びは欄 → 費目', () => {
    const expenses = [
      { name: 'a'.repeat(40), amount: null },
      { name: 'a'.repeat(41), amount: null },
      { name: 'ok', amount: 1 },
      { name: 'a'.repeat(50), amount: null },
    ];
    expect(overLimitLabels({ ...base, expenses })).toEqual(['費目 2 の名前', '費目 4 の名前']);
    expect(overLimitLabels({ ...base, effect: 'あ'.repeat(1201), location: 'あ'.repeat(81), expenses })).toEqual([
      '所在地',
      '期待される効果',
      '費目 2 の名前',
      '費目 4 の名前',
    ]);
  });
});

describe('下書きを作らなかったことの文', () => {
  it('直す欄が無ければ null・在れば名指しする', () => {
    expect(draftWithheldNote([])).toBeNull();
    expect(draftWithheldNote(['補助率'])).toBe(
      '補助率を直すまで、下書きは作っていません (保存とコピーもできません)。欄の下の指摘どおりに直すと下書きが出ます。',
    );
    expect(draftWithheldNote(['補助率', '費目 2 の金額'])).toBe(
      '補助率・費目 2 の金額を直すまで、下書きは作っていません (保存とコピーもできません)。欄の下の指摘どおりに直すと下書きが出ます。',
    );
  });
});

describe('断りの文', () => {
  it('先頭の断りは 2 つ (所定の様式ではない・保証しない)', () => {
    expect(DRAFT_CAUTIONS).toEqual([
      'この文書は申請書類の下書きです。制度ごとに所定の様式があり、年度や公募回で変わります。提出するときは、最新の公募要領 (助成金は支給要領) の様式へ書き写してください。',
      '要件を満たすこと・採択や支給を保証するものではありません。金額・要件・締切は、実施機関の公式の情報で確認してください。',
    ]);
  });

  it('節に置く断り', () => {
    expect(CUSTOM_PROGRAM_NOTE).toBe(
      'この制度の情報は、このアプリの確証済みの一覧に収録していません。対象者・対象経費・補助率・締切は、公募要領で確認してください。',
    );
    expect(START_TIMING_NOTE).toBe(
      '多くの制度では、交付決定 (助成金は計画の届出) より前に始めた取組や、前に支払った経費は対象になりません。いつから始めてよいかは公募要領で確認してください。',
    );
    expect(PAYMENT_TIMING_NOTE).toBe(
      '多くの補助金は後払いです (事業を終えて報告し、確定した額が支払われます)。それまでの支払いに充てる資金が要ります。',
    );
    expect(GRANT_AMOUNT_NOTE).toBe(
      '助成金は、取組の内容や対象の人数で支給額が決まる制度が多く、経費の内訳を求めない様式もあります。支給額は支給要領で確認してください。',
    );
    expect(PROFESSIONAL_NOTE).toBe(
      '官公署に出す補助金の申請書類の作成を業として代わりに行えるのは行政書士、雇用関係の助成金の申請を代わりに行えるのは社会保険労務士です。迷う点は専門家に相談してください。',
    );
  });
});

describe('下書きの組み立て', () => {
  it('全部入った補助金の下書き (Markdown の全文)', () => {
    const md = applicationDraftMarkdown(buildApplicationDraft(FULL, TODAY));
    expect(md).toBe(
      [
        '# 【下書き】見本の補助金 申請書類 (作成日 2026-11-18)',
        '',
        `> ${DRAFT_CAUTIONS[0]}`,
        '>',
        `> ${DRAFT_CAUTIONS[1]}`,
        '',
        '## 1. 申請者の概要',
        '',
        '- 事業者名: 見本商店',
        '- 事業形態: 法人',
        '- 業種: 製造業',
        '- 所在地: 見本県見本市',
        '- 創業・設立の年 (西暦): 2015年',
        '- 従業員数: 5 人',
        '- 資本金: 3,000,000 円',
        '- 直近の年間売上高: 20,000,000 円',
        '',
        '## 2. 申請する制度',
        '',
        '- 制度名: 見本の補助金',
        '- 書類の型: 補助金 (事業の計画と経費を書く)',
        '',
        '- 所管・実施機関: 見本の省',
        '- 制度の概要 (2026-06 時点の確証済みの情報): 見本の概要。',
        '- 申請の流れ: 見本の流れ。',
        '',
        '- 見本の省 案内: https://example.go.jp/a',
        '- 見本の解説: https://example.jp/b',
        '',
        '## 3. 現状と課題',
        '',
        '課題の文。',
        '',
        '> 数字で書くとよい観点 (製造業): 生産数量と不良率・設備の稼働率・1 個あたりの製造時間',
        '',
        '## 4. 取り組む内容 (補助事業の内容)',
        '',
        '- 計画の名前: 見本の計画',
        '',
        '取組の文。',
        '',
        '## 5. 期待される効果',
        '',
        '効果の文。',
        '',
        '## 6. 実施の日程',
        '',
        '- 開始: 2026年4月',
        '- 完了: 2027年3月',
        '',
        `> ${START_TIMING_NOTE}`,
        '',
        '## 7. 経費の内訳と申請額の目安',
        '',
        '| 費目 | 金額 |',
        '| --- | ---: |',
        '| 機械装置費 | 1,000,000 円 |',
        '| 広報費 | 500,001 円 |',
        '| 合計 (金額の入っている費目) | 1,500,001 円 |',
        '',
        '- 補助率 (公募要領から入れた値): 50%',
        '- 上限額 (公募要領から入れた値): 2,000,000 円',
        '- 申請額の目安: 750,000 円',
        '- 自己負担の目安: 750,001 円',
        '',
        '> 端数の扱いと、対象になる経費の範囲は制度ごとに違います。公募要領で確認してください。',
        '',
        `> ${PAYMENT_TIMING_NOTE}`,
        '',
        '## 8. 提出前の確認',
        '',
        '- [ ] 最新の公募要領 (助成金は支給要領) と様式を入手した',
        '- [ ] 申請の締切と方法 (電子申請に要る ID の取得を含む) を確認した',
        '- [ ] 対象者の要件を満たすか確認した',
        '- [ ] 対象になる経費かを確認し、見積書など金額の根拠になる書類をそろえた',
        '',
        `> ${PROFESSIONAL_NOTE}`,
        '',
      ].join('\n'),
    );
  });

  it('空の入力の助成金・個人事業主の下書き (未記入を空欄にしない・Markdown の全文)', () => {
    const empty: ApplicationInput = {
      ...FULL,
      kind: 'grant',
      program: null,
      customProgramName: '',
      applicantName: '',
      entity: 'individual',
      industryId: '',
      location: ' ',
      foundedYear: null,
      employees: null,
      capitalYen: null,
      annualRevenueYen: null,
      projectTitle: '',
      issues: '',
      plan: ' ',
      effect: '',
      startMonth: '',
      endMonth: '',
      expenses: [],
      ratePct: null,
      capYen: null,
    };
    const draft = buildApplicationDraft(empty, TODAY);
    expect(draft.missing).toEqual([
      '申請する制度',
      '事業者名',
      '業種',
      '所在地',
      '創業・設立の年 (西暦)',
      '従業員数',
      '直近の年間売上高',
      '計画の名前',
      '現状と課題',
      '取り組む内容',
      '期待される効果',
      '開始の月',
      '完了の月',
    ]);
    expect(draft.cautions).toBe(DRAFT_CAUTIONS);
    expect(applicationDraftMarkdown(draft)).toBe(
      [
        '# 【下書き】補助金・助成金 申請書類 (作成日 2026-11-18)',
        '',
        `> ${DRAFT_CAUTIONS[0]}`,
        '>',
        `> ${DRAFT_CAUTIONS[1]}`,
        '',
        '## 1. 申請者の概要',
        '',
        '- 事業者名: （未記入）',
        '- 事業形態: 個人事業主',
        '- 業種: （未記入）',
        '- 所在地: （未記入）',
        '- 創業・設立の年 (西暦): （未記入）',
        '- 従業員数: （未記入）',
        '- 直近の年間売上高: （未記入）',
        '',
        '## 2. 申請する制度',
        '',
        '- 制度名: （未記入）',
        '- 書類の型: 助成金 (雇用・労務の取組を書く)',
        '',
        `> ${CUSTOM_PROGRAM_NOTE}`,
        '',
        '## 3. 現状と課題',
        '',
        '（未記入）',
        '',
        '## 4. 取り組む内容 (雇用・労務の取組)',
        '',
        '- 計画の名前: （未記入）',
        '',
        '（未記入）',
        '',
        '## 5. 期待される効果',
        '',
        '（未記入）',
        '',
        '## 6. 実施の日程',
        '',
        '- 開始: （未記入）',
        '- 完了: （未記入）',
        '',
        `> ${START_TIMING_NOTE}`,
        '',
        '## 7. 支給額について',
        '',
        `> ${GRANT_AMOUNT_NOTE}`,
        '',
        '## 8. 提出前の確認',
        '',
        '- [ ] 最新の公募要領 (助成金は支給要領) と様式を入手した',
        '- [ ] 申請の締切と方法 (電子申請に要る ID の取得を含む) を確認した',
        '- [ ] 対象者の要件を満たすか確認した',
        '- [ ] 就業規則・賃金台帳・出勤簿など、取組の根拠になる書類をそろえた',
        '- [ ] 未記入の項目を埋めた: 申請する制度・事業者名・業種・所在地・創業・設立の年 (西暦)・従業員数・直近の年間売上高・計画の名前・現状と課題・取り組む内容・期待される効果・開始の月・完了の月',
        '',
        `> ${PROFESSIONAL_NOTE}`,
        '',
      ].join('\n'),
    );
  });

  it('一覧に無い制度は、入れた名前を題と節に出し、収録していないと断る', () => {
    const custom = { ...FULL, program: null, customProgramName: ' 自分の制度 ' };
    expect(buildApplicationDraft(custom, TODAY).title).toBe('【下書き】自分の制度 申請書類 (作成日 2026-11-18)');
    expect(sectionOf(custom, '2. 申請する制度')).toEqual([
      { kind: 'list', items: ['制度名: 自分の制度', '書類の型: 補助金 (事業の計画と経費を書く)'] },
      { kind: 'note', text: CUSTOM_PROGRAM_NOTE },
    ]);
  });

  it('自由文は前後の空白を落として置く・数は読めた値をそのまま置く (0 も)', () => {
    const blocks = sectionOf(
      { ...FULL, applicantName: '  見本商店  ', location: ' 見本市 ', employees: 0, capitalYen: 0, annualRevenueYen: 0 },
      '1. 申請者の概要',
    );
    expect(blocks).toEqual([
      {
        kind: 'list',
        items: [
          '事業者名: 見本商店',
          '事業形態: 法人',
          '業種: 製造業',
          '所在地: 見本市',
          '創業・設立の年 (西暦): 2015年',
          '従業員数: 0 人',
          '資本金: 0 円',
          '直近の年間売上高: 0 円',
        ],
      },
    ]);
    expect(sectionOf({ ...FULL, issues: '  課題  ' }, '3. 現状と課題')[0]).toEqual({ kind: 'text', text: '課題' });
    expect(sectionOf({ ...FULL, projectTitle: ' 計画 ', plan: ' 取組 ' }, '4. 取り組む内容 (補助事業の内容)')).toEqual([
      { kind: 'list', items: ['計画の名前: 計画'] },
      { kind: 'text', text: '取組' },
    ]);
    expect(sectionOf({ ...FULL, effect: ' 効果 ' }, '5. 期待される効果')).toEqual([{ kind: 'text', text: '効果' }]);
  });

  it('従業員数は桁区切りで置く', () => {
    const blocks = sectionOf({ ...FULL, employees: 1200 }, '1. 申請者の概要');
    expect(blocks[0]).toMatchObject({ kind: 'list' });
    expect((blocks[0] as { items: readonly string[] }).items[5]).toBe('従業員数: 1,200 人');
  });

  it('業種が未選択なら、観点の注記は付けない', () => {
    expect(sectionOf({ ...FULL, industryId: '' }, '3. 現状と課題')).toEqual([{ kind: 'text', text: '課題の文。' }]);
  });

  it('日程: 完了が開始より前なら述べる (同じ月・後なら述べない・片方が読めなければ述べない)', () => {
    const reversed = { kind: 'note', text: '完了の月が開始の月より前になっています。' };
    expect(sectionOf({ ...FULL, startMonth: '2026-05', endMonth: '2026-04' }, '6. 実施の日程')).toEqual([
      { kind: 'list', items: ['開始: 2026年5月', '完了: 2026年4月'] },
      reversed,
      { kind: 'note', text: START_TIMING_NOTE },
    ]);
    expect(sectionOf({ ...FULL, startMonth: '2026-05', endMonth: '2026-05' }, '6. 実施の日程')).not.toContainEqual(reversed);
    expect(sectionOf({ ...FULL, startMonth: '2026-05', endMonth: '2026-06' }, '6. 実施の日程')).not.toContainEqual(reversed);
    // 読めない月は「未記入」と置き、前後は述べない (文字として比べると 'zz' は大きい)。
    expect(sectionOf({ ...FULL, startMonth: 'zz', endMonth: '2026-04' }, '6. 実施の日程')).toEqual([
      { kind: 'list', items: ['開始: （未記入）', '完了: 2026年4月'] },
      { kind: 'note', text: START_TIMING_NOTE },
    ]);
    expect(sectionOf({ ...FULL, startMonth: '2026-05', endMonth: '' }, '6. 実施の日程')).toEqual([
      { kind: 'list', items: ['開始: 2026年5月', '完了: （未記入）'] },
      { kind: 'note', text: START_TIMING_NOTE },
    ]);
  });

  it('経費: 上限額で頭打ちになったらそう述べる・上限額が無ければ「入力なし」', () => {
    const capped = sectionOf({ ...FULL, capYen: 100_000 }, '7. 経費の内訳と申請額の目安');
    expect(capped[1]).toEqual({
      kind: 'list',
      items: [
        '補助率 (公募要領から入れた値): 50%',
        '上限額 (公募要領から入れた値): 100,000 円',
        '申請額の目安: 100,000 円 (上限額で頭打ち)',
        '自己負担の目安: 1,400,001 円',
      ],
    });
    const noCap = sectionOf({ ...FULL, capYen: null }, '7. 経費の内訳と申請額の目安');
    expect(noCap[1]).toEqual({
      kind: 'list',
      items: [
        '補助率 (公募要領から入れた値): 50%',
        '上限額 (公募要領から入れた値): 入力なし',
        '申請額の目安: 750,000 円',
        '自己負担の目安: 750,001 円',
      ],
    });
  });

  it('経費: 計算しなかったときは目安を出さず、理由を述べる (金額の無い費目は「未記入」と置く)', () => {
    const blocks = sectionOf(
      { ...FULL, expenses: [{ name: '機械', amount: 100 }, { name: ' ', amount: 50 }, { name: '広報', amount: null }, { name: 'x', amount: -1 }], ratePct: null, capYen: -5 },
      '7. 経費の内訳と申請額の目安',
    );
    expect(blocks).toEqual([
      {
        kind: 'table',
        head: ['費目', '金額'],
        rows: [
          ['機械', '100 円'],
          ['（未記入）', '50 円'],
          ['広報', '（未記入）'],
          ['x', '（読み取れない値）'],
          ['合計 (金額の入っている費目)', '150 円'],
        ],
      },
      { kind: 'list', items: ['補助率 (公募要領から入れた値): （未記入）', '上限額 (公募要領から入れた値): （読み取れない値）'] },
      { kind: 'note', text: '金額が未記入の費目が 2 件あるため、申請額は計算していません。' },
      { kind: 'note', text: '端数の扱いと、対象になる経費の範囲は制度ごとに違います。公募要領で確認してください。' },
      { kind: 'note', text: PAYMENT_TIMING_NOTE },
    ]);
  });

  it('提出前の確認: 未記入が在れば名指しで足す (無ければ足さない)', () => {
    const complete = sectionOf(FULL, '8. 提出前の確認');
    expect((complete[0] as { items: readonly string[] }).items.length).toBe(4);
    const lacking = sectionOf({ ...FULL, location: '', ratePct: null }, '8. 提出前の確認');
    expect(lacking[0]).toEqual({
      kind: 'check',
      items: [
        '最新の公募要領 (助成金は支給要領) と様式を入手した',
        '申請の締切と方法 (電子申請に要る ID の取得を含む) を確認した',
        '対象者の要件を満たすか確認した',
        '対象になる経費かを確認し、見積書など金額の根拠になる書類をそろえた',
        '未記入の項目を埋めた: 所在地・補助率',
      ],
    });
    expect(lacking[1]).toEqual({ kind: 'note', text: PROFESSIONAL_NOTE });
  });

  it('節は 8 つ・見出しは型で変わる', () => {
    expect(buildApplicationDraft(FULL, TODAY).sections.map((s) => s.heading)).toEqual([
      '1. 申請者の概要',
      '2. 申請する制度',
      '3. 現状と課題',
      '4. 取り組む内容 (補助事業の内容)',
      '5. 期待される効果',
      '6. 実施の日程',
      '7. 経費の内訳と申請額の目安',
      '8. 提出前の確認',
    ]);
    expect(buildApplicationDraft({ ...FULL, kind: 'grant' }, TODAY).sections.map((s) => s.heading)).toEqual([
      '1. 申請者の概要',
      '2. 申請する制度',
      '3. 現状と課題',
      '4. 取り組む内容 (雇用・労務の取組)',
      '5. 期待される効果',
      '6. 実施の日程',
      '7. 支給額について',
      '8. 提出前の確認',
    ]);
  });
});

describe('Markdown への書き出し', () => {
  it('1 行の所 (題・見出し・箇条書き・表・注記) は 1 行に畳み、入口の記号を落とす', () => {
    const hostile = 'a|b\nc<script>![x](y)\\';
    const md = applicationDraftMarkdown({
      title: hostile,
      cautions: [hostile],
      missing: [],
      sections: [
        {
          heading: hostile,
          blocks: [
            { kind: 'note', text: hostile },
            { kind: 'list', items: [hostile] },
            { kind: 'check', items: [hostile] },
            { kind: 'table', head: [hostile, hostile], rows: [[hostile, hostile]] },
            { kind: 'links', items: [{ label: hostile, url: hostile }] },
          ],
        },
      ],
    });
    const safe = 'a\\|b c&lt;script>!\\[x]\\(y)\\\\';
    expect(md).toBe(
      [
        `# ${safe}`,
        '',
        `> ${safe}`,
        '',
        `## ${safe}`,
        '',
        `> ${safe}`,
        '',
        `- ${safe}`,
        '',
        `- [ ] ${safe}`,
        '',
        `| ${safe} | ${safe} |`,
        '| --- | ---: |',
        `| ${safe} | ${safe} |`,
        '',
        `- ${safe}: ${safe}`,
        '',
      ].join('\n'),
    );
  });

  it('本文は改行を残し、入口の記号だけを落とす', () => {
    const md = applicationDraftMarkdown({
      title: 't',
      cautions: [],
      missing: [],
      sections: [{ heading: 'h', blocks: [{ kind: 'text', text: '1 行目\n2 行目 <b> ![x](y) a|b' }] }],
    });
    expect(md).toBe(['# t', '', '## h', '', '1 行目\n2 行目 &lt;b> !\\[x]\\(y) a|b', ''].join('\n'));
  });

  it('断りが無くても題の後ろの空行は 1 つ・節が無くても末尾は改行 1 つ', () => {
    expect(applicationDraftMarkdown({ title: 't', cautions: [], missing: [], sections: [] })).toBe('# t\n');
    expect(applicationDraftMarkdown({ title: 't', cautions: ['c'], missing: [], sections: [] })).toBe('# t\n\n> c\n');
  });

  it('保存するときの名前は日付だけで組む (利用者の入力は入れない)', () => {
    expect(applicationDraftFilename('2026-11-18')).toBe('funding-application-draft-2026-11-18.md');
  });
});
