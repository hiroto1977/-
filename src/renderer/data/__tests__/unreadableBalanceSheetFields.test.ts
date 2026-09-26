/**
 * **貸借対照表の欄が数として読めないとき、倒した先を必ず言う。** (2026-09-24 · パス 444)
 *
 * パス 443 は KPI の金額について同じ家系を閉じた。**その隣が貸借対照表**で、
 * `normalizeBalanceSheet` は型から読むので**投げも連結もしない** ——
 * だから「投げた画面」を数える走査 (`npm run audit:malformed-fields`) には 1 件も映らない。
 * 代わりに**倒す**: 必須の欄は 0 円へ、任意の欄は「未入力」へ。
 *
 * ## 実測 (2026-09-24 · 直す前 · 健全な控え = 自己資本比率 33.3% / 流動比率 160.0%)
 *
 * 金融機関等提出用の書面 §4「財政状態」:
 *
 * | 壊した欄 | 総資産 | 純資産 | 自己資本比率 | 流動比率 | 紙の但し書き |
 * | --- | ---: | ---: | ---: | ---: | --- |
 * | (正しい控え) | 12,000 | 4,000 | 33.3% | 160.0% | —— |
 * | `currentAssets` | 4,000 | **△4,000** | **△100.0%** | **0.0%** | **無し** |
 * | `fixedAssets` | 8,000 | **0** | **0.0%** | 160.0% | **無し** |
 *
 * `'9000000'` / `{z:1}` / `[1]` / `true` / `null` の 5 形すべてで同じ。
 * **向きがパス 443 と逆である** —— あちらは 10 兆円の営業利益で過大に見せ、
 * こちらは**健全な会社を債務超過として**過小に見せる。どちらの紙も
 * 「上記のとおり相違ありません。」と代表者名つきで金融機関へ出す。
 *
 * ## 2 つ目 —— 任意の欄は「原因を取り違えた断り」になっていた
 *
 * 任意の欄 (棚卸資産・売上債権・仕入債務) は `undefined` へ倒れるので、
 * 既存の 3 つの面が**そろって「未入力のため」**と述べる (実測: `inventory: '500'` で
 * 書面 §5 / 経営ハイライト / 経営サマリーの画面)。打ち込んだ利用者にとって偽で、
 * しかも経営ハイライトは「**KPI ページの貸借対照表に入力してください**」と
 * 直す手まで名指しする (パス 388 の形 —— 原因を取り違えた断りは直す手ごと誤らせる)。
 */
import { describe, expect, it } from 'vitest';
import {
  BALANCE_SHEET_COLLECTION,
  BS_NUMERIC_FIELDS,
  NO_UNREADABLE_BS_FIELDS,
  hasUnreadableBalanceSheetFields,
  normalizeBalanceSheet,
  splitMissingStocks,
  unreadableBalanceSheetField,
  netDebtUnavailableNote,
  unreadableBalanceSheetNote,
  unreadableBalanceSheetSheetNote,
} from '../balanceSheet';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { buildBusinessOverview } from '../overview';
import { buildBankSubmissionSheet, type BankSubmissionSettings, type SheetSection } from '../bankSubmission';
import { buildManagementReport } from '../managementReport';
import { buildManagementHighlights } from '../managementHighlights';
import { NO_MANUAL_OVERRIDES } from '../overviewOverrides';
import { buildManagementScorecard } from '../../../shared/managementScorecard';
import { combineCashflowDebtService } from '../cashflowDebtService';
import { BANK_FORMAT_DEFAULT } from '../../../shared/bankFormat';

/** 形が拒む 5 形 —— どれも `structuredClone` が通すので保管値として実在しうる。 */
const NON_NUMBERS: readonly [string, unknown][] = [
  ['10進の文字列', '9000000'],
  ['物', { z: 1 }],
  ['配列', [1]],
  ['真偽', true],
  ['null', null],
];

/** 健全な控え —— 自己資本比率 33.3% / 流動比率 160.0%。 */
const GOOD_RAW: Readonly<Record<string, unknown>> = {
  asOf: '2026-03-31',
  currentAssets: 8_000_000,
  cash: 3_000_000,
  inventory: 2_000_000,
  accountsReceivable: 1_500_000,
  fixedAssets: 4_000_000,
  currentLiabilities: 5_000_000,
  accountsPayable: 1_000_000,
  fixedLiabilities: 3_000_000,
  interestBearingDebt: 2_000_000,
  netIncome: 600_000,
};

const raw = (over: Record<string, unknown>): Record<string, unknown> => ({ ...GOOD_RAW, ...over });

const ACTUALS = [
  { period: '2026-03', unit: '全社', revenue: 12_000_000, cogs: 6_000_000, advertising: 0, sga: 3_000_000, depreciation: 0 },
];
const SETTINGS: BankSubmissionSettings = {
  profile: {
    companyName: '株式会社テスト',
    representative: '代表取締役 山田 太郎',
    address: '東京都千代田区1-1',
    fiscalYearEnd: '2026-03',
  },
  format: BANK_FORMAT_DEFAULT,
};

function overviewOf(bsRaw: Record<string, unknown>) {
  return buildBusinessOverview({
    plan: 'business',
    sales: [],
    kpiActuals: ACTUALS,
    kpiBudgets: [],
    balanceSheet: normalizeBalanceSheet(bsRaw),
    accounting: [],
    members: [{ role: 'owner' }],
  });
}

function sheetOf(bsRaw: Record<string, unknown>, prefix: string): SheetSection {
  const ov = overviewOf(bsRaw);
  const m = buildBankSubmissionSheet({
    overview: ov,
    scorecard: buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
    }),
    debtService: combineCashflowDebtService([], []),
    balanceSheetAsOf: '2026-03-31',
    today: '2026-09-24',
    settings: SETTINGS,
    manual: NO_MANUAL_OVERRIDES,
  });
  const s = m.sections.find((x) => x.title.startsWith(prefix));
  if (!s) throw new Error(`§${prefix} missing`);
  return s;
}

function reportOf(bsRaw: Record<string, unknown>): string {
  const ov = overviewOf(bsRaw);
  return buildManagementReport(
    ov,
    buildManagementScorecard({
      operatingMarginPct: ov.kpi.operatingMarginPct ?? undefined,
      grossMarginPct: ov.kpi.grossMarginPct ?? undefined,
    }),
    buildManagementHighlights(ov),
    '2026-09-24',
    NO_MANUAL_OVERRIDES,
  );
}

const cell = (s: SheetSection, label: string): string => {
  const r = s.rows.find((x) => x.label === label);
  if (!r) throw new Error(`row ${label} missing`);
  return r.value;
};

/**
 * 形を**振る舞いで**問うための素の控え —— 全部 0。
 *
 * `GOOD_RAW` を土台にすると「内数 ≦ 親項目」(`recordRelations.ts`) が先に鳴るので、
 * 「`currentAssets: 0` が拒まれた」を「数の欄ではない」と読み違える
 * (実測: 最初に書いた版がその通り外れ、流動資産と流動負債を母集団から落とした)。
 */
const ZERO_RAW: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.keys(GOOD_RAW).map((k) => [k, k === 'asOf' ? '' : 0]),
);

/** 実物の形 (`COLLECTION_SHAPES`) —— 無ければその場で落とす (空の検査にしない)。 */
const BS_SHAPE = COLLECTION_SHAPES[BALANCE_SHEET_COLLECTION];
if (BS_SHAPE === undefined) throw new Error('balance-sheet の形が COLLECTION_SHAPES に無い');

/** 形が「この欄に 0 を入れてよい」と言うか (= 数の欄) —— 綴りではなく振る舞いで測る。 */
const isNumericField = (key: string): boolean =>
  BS_SHAPE({ ...ZERO_RAW, [key]: 0 });

/** 形が「この欄は無くてよい」と言うか (= 任意) —— 同じく振る舞いで。 */
const isOptionalField = (key: string): boolean => {
  const copy = { ...ZERO_RAW };
  delete (copy as Record<string, unknown>)[key];
  return BS_SHAPE(copy);
};

describe('数の欄の表は形から導く (パス 444)', () => {
  it('★ 母集団は両方向 —— 形が数と言う欄はすべて表に在り、表の欄はすべて形に在る', () => {
    const fromShape = BS_SHAPE.fields.filter(isNumericField);
    expect([...BS_NUMERIC_FIELDS.map((f) => f.key)].sort()).toEqual([...fromShape].sort());
    // 床 —— 走査が死んで「0 欄だから健全」にならないため。
    expect(fromShape.length).toBeGreaterThanOrEqual(10);
    // 針が的に当たる標本: `asOf` は数ではない (全部が数なら上の filter は何も言っていない)。
    expect(isNumericField('asOf')).toBe(false);
  });

  it('★ 必須かどうかも形から測る (表の `required` は形と一致する)', () => {
    for (const f of BS_NUMERIC_FIELDS) {
      expect(isOptionalField(f.key), `${f.key} (${f.label})`).toBe(!f.required);
    }
    // 針が的に当たる標本 —— 両方向とも実在する。
    expect(BS_NUMERIC_FIELDS.filter((f) => f.required).length).toBeGreaterThanOrEqual(5);
    expect(BS_NUMERIC_FIELDS.filter((f) => !f.required).length).toBeGreaterThanOrEqual(5);
  });

  it('★ 形はこの 5 形をすべて拒む (名簿が「形が拒む物」と同じ母集団を見ている)', () => {
    for (const f of BS_NUMERIC_FIELDS) {
      for (const [label, bad] of NON_NUMBERS) {
        expect(BS_SHAPE(raw({ [f.key]: bad })), `${f.key} = ${label}`).toBe(false);
      }
    }
  });
});

describe('倒した欄を名簿にする (パス 444)', () => {
  it.each(BS_NUMERIC_FIELDS.map((f) => [f.key, f.label, f.required] as const))(
    '★ %s (%s) が非数なら名簿に載る (5 形すべて)',
    (key, label, required) => {
      for (const [form, bad] of NON_NUMBERS) {
        const u = normalizeBalanceSheet(raw({ [key]: bad })).unreadableFields;
        expect(u, `${key} = ${form}`).toBeDefined();
        expect(required ? u?.zeroed : u?.missing, `${key} = ${form}`).toContain(label);
        // **倒した先は 1 つだけ** —— 両方に載ると 2 つの断りが同じ欄を名指しする。
        expect(required ? u?.missing : u?.zeroed, `${key} = ${form}`).not.toContain(label);
      }
    },
  );

  it('★ 欄そのものが無い控え (前方互換) は名簿に入らない —— 未入力は「読めなかった」ではない', () => {
    for (const f of BS_NUMERIC_FIELDS) {
      if (f.required) continue; // 必須の欄は形が拒むので、欄の無い控えは復元を通らない
      const copy = { ...GOOD_RAW };
      delete (copy as Record<string, unknown>)[f.key];
      const u = normalizeBalanceSheet(copy).unreadableFields;
      expect(u?.zeroed, f.key).toHaveLength(0);
      expect(u?.missing, f.key).toHaveLength(0);
    }
  });

  it('★ 正しい控えは名簿が空で、断りは 1 文も出ない', () => {
    const u = normalizeBalanceSheet(GOOD_RAW).unreadableFields;
    expect(u).toEqual({ zeroed: [], missing: [] });
    expect(hasUnreadableBalanceSheetFields(u)).toBe(false);
    expect(unreadableBalanceSheetNote(u)).toBeNull();
    expect(unreadableBalanceSheetSheetNote(u)).toBeNull();
  });

  it('★ 手で組んだ控え (検査・見本) は名簿を持たない —— そこは「読めた」ではなく「保管層を通っていない」', () => {
    expect(hasUnreadableBalanceSheetFields(undefined)).toBe(false);
    expect(unreadableBalanceSheetNote(undefined)).toBeNull();
    expect(unreadableBalanceSheetSheetNote(undefined)).toBeNull();
    expect(hasUnreadableBalanceSheetFields(NO_UNREADABLE_BS_FIELDS)).toBe(false);
  });
});

describe('断りは倒した先ごとに言い分ける (パス 444)', () => {
  it('★ 必須の欄は「0 円として計算」、任意の欄は「未入力として扱う」', () => {
    const zeroed = unreadableBalanceSheetSheetNote({ zeroed: ['流動資産'], missing: [] });
    const missing = unreadableBalanceSheetSheetNote({ zeroed: [], missing: ['棚卸資産'] });
    expect(zeroed).toContain('流動資産');
    expect(zeroed).toContain('0 円として計算しています');
    expect(missing).toContain('棚卸資産');
    expect(missing).toContain('未入力として扱っています');
    // **言い分けの両方向** —— 片方の文がもう片方の言い回しを持たない。
    expect(zeroed).not.toContain('未入力として扱っています');
    expect(missing).not.toContain('0 円として計算しています');
  });

  it('★ 両方在れば両方言う (片方に畳まない)', () => {
    const both = unreadableBalanceSheetSheetNote({ zeroed: ['流動資産'], missing: ['棚卸資産'] });
    expect(both).toContain('流動資産');
    expect(both).toContain('棚卸資産');
    expect(both).toContain('0 円として計算しています');
    expect(both).toContain('未入力として扱っています');
  });

  it('★ 画面だけが逃げ口を名指しする (紙の読み手はこのアプリを触らない)', () => {
    const u = { zeroed: ['流動資産'], missing: [] };
    expect(unreadableBalanceSheetNote(u)).toContain('形式の合わないレコード');
    expect(unreadableBalanceSheetSheetNote(u)).not.toContain('形式の合わないレコード');
    // 針が的に当たる標本 —— この綴りは実在し、画面の文がそれを持つ。
    expect(unreadableBalanceSheetNote(u)).toMatch(/形式の合わないレコード/);
  });

  it('★ 溜まりの欄は「未入力」と「読めない」に分かれる (両方向)', () => {
    const u = { zeroed: [], missing: ['棚卸資産'] };
    const s = splitMissingStocks(['売上債権', '棚卸資産'], u);
    expect(s.blank).toEqual(['売上債権']);
    expect(s.unreadable).toEqual(['棚卸資産']);
    // 名簿が無ければ全部「未入力」(今までどおり)。
    expect(splitMissingStocks(['売上債権', '棚卸資産'], undefined).blank).toEqual(['売上債権', '棚卸資産']);
    expect(splitMissingStocks(['売上債権', '棚卸資産'], undefined).unreadable).toEqual([]);
  });
});

describe('4 つの面が述べる (パス 444)', () => {
  it('★ 正しい控えの答えは 1 つも変わらない', () => {
    const s4 = sheetOf(GOOD_RAW, '4.');
    expect(cell(s4, '総資産')).toBe('12,000');
    expect(cell(s4, '純資産')).toBe('4,000');
    expect(cell(s4, '自己資本比率')).toBe('33.3%');
    expect(cell(s4, '流動比率')).toBe('160.0%');
    expect(s4.caption).toBeNull();
  });

  it.each(BS_NUMERIC_FIELDS.filter((f) => f.required).map((f) => [f.key, f.label] as const))(
    '★ 書面 §4 は %s (%s) を倒したら必ず述べる (5 形すべて)',
    (key, label) => {
      for (const [form, bad] of NON_NUMBERS) {
        const s4 = sheetOf(raw({ [key]: bad }), '4.');
        expect(s4.caption, `${key} = ${form}`).toContain(label);
        expect(s4.caption, `${key} = ${form}`).toContain('0 円として計算しています');
      }
    },
  );

  it('★ 直す前に刷っていた「債務超過」は、いまは理由つきで出る', () => {
    const s4 = sheetOf(raw({ currentAssets: '9000000' }), '4.');
    // 値は変えていない —— 倒したことを述べるだけ (倒し込みを外すと復元が行ごと落とす)。
    expect(cell(s4, '純資産')).toBe('△4,000');
    expect(cell(s4, '自己資本比率')).toBe('△100.0%');
    expect(s4.caption).toContain('流動資産');
  });

  it('★ 書面 §5 は「未入力」と「読めない」を別々の文で述べる (両方向)', () => {
    const blank = { ...GOOD_RAW };
    delete (blank as Record<string, unknown>).inventory;
    const c1 = sheetOf(blank, '5.').caption ?? '';
    expect(c1).toContain('棚卸資産が未入力のため');
    expect(c1).not.toContain('棚卸資産が数として読めないため');

    const c2 = sheetOf(raw({ inventory: '500' }), '5.').caption ?? '';
    expect(c2).toContain('棚卸資産が数として読めないため');
    expect(c2).not.toContain('棚卸資産が未入力のため');
  });

  it('★ 経営ハイライトは「読めない」ときに「入力してください」と言わない (直す手が違う)', () => {
    const ov = overviewOf(raw({ inventory: '500' }));
    const msgs = buildManagementHighlights(ov).map((h) => h.message);
    const said = msgs.filter((m) => m.includes('棚卸資産'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('数として読めないため');
    expect(said[0]).toContain('形式の合わないレコード');
    expect(said[0]).not.toContain('入力してください');
    // 針が的に当たる標本 —— 未入力のときは今までどおり「入力してください」と言う。
    const blank = { ...GOOD_RAW };
    delete (blank as Record<string, unknown>).inventory;
    const other = buildManagementHighlights(overviewOf(blank))
      .map((h) => h.message)
      .filter((m) => m.includes('棚卸資産'));
    expect(other).toHaveLength(1);
    expect(other[0]).toContain('入力してください');
  });

  it('★ 経営レポートの財政状態も述べる', () => {
    const md = reportOf(raw({ currentAssets: '9000000' }));
    expect(md).toContain('流動資産');
    expect(md).toContain('0 円として計算しています');
    // 正しい控えでは 1 文も出ない。
    expect(reportOf(GOOD_RAW)).not.toContain('0 円として計算しています');
  });

  it('★ 名簿は経営サマリーの器に載る (画面はここから読む)', () => {
    expect(overviewOf(raw({ currentAssets: null })).balanceSheetUnreadableFields).toEqual({
      zeroed: ['流動資産'],
      missing: [],
    });
    expect(overviewOf(GOOD_RAW).balanceSheetUnreadableFields).toEqual({ zeroed: [], missing: [] });
    // 貸借対照表そのものが無ければ空 (「読めなかった」とは言わない)。
    expect(
      buildBusinessOverview({
        plan: 'business',
        sales: [],
        kpiActuals: ACTUALS,
        kpiBudgets: [],
        balanceSheet: null,
        accounting: [],
        members: [{ role: 'owner' }],
      }).balanceSheetUnreadableFields,
    ).toEqual({ zeroed: [], missing: [] });
  });
});

/**
 * **ネットデットが算定できない理由** (2026-09-24 · パス 445)。
 *
 * パス 444 は名簿を 4 つの面へ配線したが、**貸借対照表を打ち込む当の画面**
 * (KPI ページのパネル) が抜けていた。そこは `interestBearingDebtUnentered` /
 * `cashUnentered` を `=== undefined` から直に読むので、**打ち込んだ値が
 * 読めなかった控え**と**欄そのものが無い控え**を見分けられない。
 */
describe('鍵で問う口と、原因ごとの断り (パス 445)', () => {
  /** 任意の欄 —— 名簿の `missing` に入りうる側。 */
  const OPTIONAL = BS_NUMERIC_FIELDS.filter((f) => !f.required);

  it('★ 母集団の床 —— 任意の欄が 2 つ以上ある (下の全欄の主張が自明に通らない)', () => {
    expect(OPTIONAL.length).toBeGreaterThanOrEqual(2);
    // ネットデットの材料 2 欄はどちらも任意である (必須なら 0 へ倒れ、この家系に入らない)。
    expect(OPTIONAL.map((f) => f.key)).toEqual(expect.arrayContaining(['interestBearingDebt', 'cash']));
  });

  it.each(OPTIONAL.map((f) => [f.key, f.label] as const))(
    '★ 鍵で問う口とラベルで分ける口は %s (%s) について同じ答えを出す',
    (key, label) => {
      for (const [, bad] of NON_NUMBERS) {
        const u = normalizeBalanceSheet({ ...GOOD_RAW, [key]: bad }).unreadableFields;
        expect(unreadableBalanceSheetField(key, u)).toBe(true);
        // 判定は 1 つ —— ラベル側の口と食い違わない。
        expect(splitMissingStocks([label], u).unreadable).toEqual([label]);
      }
      // 欄そのものが無い控えは「読めなかった」ではない (どちらの口も false)。
      const absent: Record<string, unknown> = { ...GOOD_RAW };
      delete absent[key];
      const ua = normalizeBalanceSheet(absent).unreadableFields;
      expect(unreadableBalanceSheetField(key, ua)).toBe(false);
      expect(splitMissingStocks([label], ua).blank).toEqual([label]);
    },
  );

  it('★ 必須の欄は鍵で問っても false —— 0 として算定したのであって、算定していないのではない', () => {
    for (const f of BS_NUMERIC_FIELDS.filter((x) => x.required)) {
      const u = normalizeBalanceSheet({ ...GOOD_RAW, [f.key]: null }).unreadableFields;
      expect(unreadableBalanceSheetField(f.key, u)).toBe(false);
      expect(u?.zeroed).toContain(f.label);
    }
  });

  it('★ 名簿が無ければ鍵で問っても false (今までどおり「未入力」)', () => {
    expect(unreadableBalanceSheetField('cash', undefined)).toBe(false);
    // 針が的に当たる標本 —— 名簿が在れば true になる鍵である。
    expect(unreadableBalanceSheetField('cash', { zeroed: [], missing: ['現預金'] })).toBe(true);
  });

  it('★ 打ち込んだ値が読めない人に「0 と入力してください」と言わない', () => {
    const u = normalizeBalanceSheet({ ...GOOD_RAW, interestBearingDebt: '9000000' }).unreadableFields;
    const note = netDebtUnavailableNote({ interestBearingDebtUnentered: true, cashUnentered: false }, u);
    expect(note).toContain('有利子負債が数として読めないため');
    expect(note).toContain('形式の合わないレコード');
    // 直す手を取り違えない (パス 388) —— 0 を入れると「—」が確信のある誤った数になる。
    expect(note).not.toContain('0 と入力してください');
    expect(note).not.toContain('未入力のため');
  });

  it('★ 本当に未入力の人への文は 1 字も変えていない', () => {
    const absent: Record<string, unknown> = { ...GOOD_RAW };
    delete absent.interestBearingDebt;
    const u = normalizeBalanceSheet(absent).unreadableFields;
    expect(netDebtUnavailableNote({ interestBearingDebtUnentered: true, cashUnentered: false }, u)).toBe(
      '有利子負債が未入力のため、ネットデット・有利子負債比率・実質債務超過の判定は算定していません。借入が無いなら 0 と入力してください（0 と「未入力」は別の事実として扱います）。',
    );
  });

  it('★ 混ざっていれば 2 文に分かれ、それぞれの直す手を言う', () => {
    const u = normalizeBalanceSheet({ ...GOOD_RAW, cash: { z: 1 } }).unreadableFields;
    // 有利子負債は欄ごと無く、現預金は読めない。
    const note = netDebtUnavailableNote({ interestBearingDebtUnentered: true, cashUnentered: true }, u);
    expect(note).toContain('有利子負債が未入力のため');
    expect(note).toContain('現預金が数として読めないため');
    expect(note).toContain('0 と入力してください');
    expect(note).toContain('形式の合わないレコード');
  });

  it('★ 止まる物の名前は原因ではなく欠けた欄で決まる', () => {
    const readable = { zeroed: [], missing: [] };
    // 有利子負債が欠ければ、原因が何であれ有利子負債比率も止まる。
    for (const u of [readable, { zeroed: [], missing: ['有利子負債'] }]) {
      expect(netDebtUnavailableNote({ interestBearingDebtUnentered: true, cashUnentered: false }, u)).toContain(
        'ネットデット・有利子負債比率・実質債務超過の判定',
      );
    }
    // 現預金だけなら有利子負債比率は算定できる (その名前を挙げない)。
    const cashOnly = netDebtUnavailableNote({ interestBearingDebtUnentered: false, cashUnentered: true }, readable);
    expect(cashOnly).toContain('ネットデットと実質債務超過の判定');
    expect(cashOnly).not.toContain('有利子負債比率');
  });

  it('★ どちらも在るなら断りは出ない', () => {
    expect(
      netDebtUnavailableNote({ interestBearingDebtUnentered: false, cashUnentered: false }, { zeroed: [], missing: [] }),
    ).toBeNull();
  });
});
