/**
 * **保存する書き手は、画面と同じ読み方で数を読む** (2026-09-27 · パス 496)。
 *
 * ## 見つけた物 (実測)
 *
 * 画面の関門と計算は数を `readNumeric` (`shared/readNumeric.ts`) で読む —— 全角・桁区切り・
 * 通貨記号を読み、単位語・指数表記・数字の間の記号を断る。ところが**保存する書き手**
 * (`parse*` —— 画面の欄を受け取って記録の形にする関数) の多くは `Number()` で読み直していた。
 * `Number` は同じ文字列に別の答えを出す:
 *
 * ```
 *   入力          readNumeric   Number()
 *   '1,000'       1000          NaN     → 「0 以上の数値で入力してください」(偽の理由で断る)
 *   '１０００'     1000          NaN     → 同上
 *   '¥1,000'      1000          NaN     → 同上
 *   '1e3'         null          1000    → 黙って別の数を保存する
 *   '0x10'        null          16      → 同上
 *   '.5'          null          0.5     → 同上
 *   ''  / '  '    —             0       → 必須の金額の空欄が「0 円と実測した」になる
 * ```
 *
 * 書き手 9 本を共有の口 `readEntryNumber` (空欄 / 読めない / 数 の 3 通り) へ寄せた。
 * 金額の必須欄の空欄は**断る** (0 なら 0 と打つ) —— 売上原価を空けた期は「売上総利益率 100%」、
 * 流動資産を空けた控えは純資産が小さく出て、どちらも金融機関等提出用の書面へ届く。
 *
 * ## この検査の不変条件 (書き手 × 数の欄 × 標本)
 *
 * 1. **言い直しても答えが変わらない** —— 欄に `s` を置いた結果は、欄に
 *    「画面が読んだ数をそのまま半角で打ち直した物」を置いた結果と同じ (成功なら記録が、
 *    断りなら文が一致する)。読めない `s` は「読めない」の代表 (`'abc'`) に、空欄は `''` に
 *    言い直す。**書き手が画面と別の読み方をすれば、どこかの標本で必ず割れる。**
 * 2. **読めない入力は断る** —— 黙って 0 や別の数にしない。
 * 3. **空欄は宣言どおり** —— 断る / 既定へ倒す / 「未入力」として持つ のどれかを欄ごとに宣言し、
 *    空白だけ (`'  '`・全角の `'\u3000'`・タブ) も同じ扱いにする。
 * 4. **読めた数はそのまま保存される** (範囲の外は断ってよい —— 読み方の問題ではない)。
 *
 * ## 母集団
 *
 * 画面 (`src/renderer` の UI) が `data/` / `shared/` から import する書き手らしい名前
 * (`parse*` / `*FromCsv` / `*To…Entry`) を走査で集め、台帳と**両方向**に突き合わせる。
 * 数を読む書き手には標本が要り、数を読まない物には理由が要る (理由の主張は構文木で検める)。
 * ★ **針の死角** —— この 3 つの綴りでない書き手は映らない。書き手を足すなら
 * この形で名付けるか、台帳の走査を広げること。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import ts from 'typescript';
import { readEntryNumber, readNumeric } from '../../../shared/readNumeric';
import { parseSalesEntry } from '../sales';
import { SALES_CSV_COLUMNS, salesFromCsv } from '../salesCsv';
import { parseKpiActual } from '../kpiActuals';
import { KPI_CSV_COLUMNS, kpiActualsFromCsv } from '../kpiActualsCsv';
import { BS_NUMERIC_FIELDS, parseBalanceSheet } from '../balanceSheet';
import { HIGHLIGHT_THRESHOLD_FIELDS, parseHighlightSettings } from '../highlightSettings';
import { DEFAULT_HIGHLIGHT_THRESHOLDS } from '../managementHighlights';
import { HYDROPONICS_CONTROL_DEFAULTS, parseBatch, parseControlRecord, parseReading } from '../hydroponicsLog';
import { READING_FIELDS } from '../../../shared/hydroponicsControl';
import { parseOverrideValue, type MetricUnit } from '../overviewOverrides';
import { parseManualMetric } from '../manualData';
import { orderToSalesEntry } from '../shopifyImport';
import { parseBusinessUnit } from '../businessUnits';
import { fundValuation, parseHoldingEntry, parsePropertyEntry } from '../investments';
import { parseCropNumber } from '../../../shared/hydroponicCrops';
import { parseAmountInput } from '../../components/serviceActionUtils';
import { parseNumericInput } from '../eligibility';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { stripComments } from '../../../shared/__tests__/stripNonCode';

// ─── 標本 ──────────────────────────────────────────────────────────────

/** 画面が読める文字列 (全角・桁区切り・通貨記号・符号・% を含む)。 */
const READABLE = [
  '0', '1', '2', '5', '12', '2.5', '1000', '１０００', '1,000', '1,000円', '¥1,000',
  '６', '+5', '-5', '－5', '50%', ' 7 ',
] as const;
/** 画面が読めない文字列 (指数表記・16 進・先頭の小数点・単位語・数字の間の記号・非有限)。 */
const UNREADABLE = [
  '1e3', '0x10', '.5', '7x', '1 000', '1万', '1億', '1,23', 'Infinity', 'NaN', 'abc', '12.5.6', '--1',
] as const;
/** 空欄 (空文字・半角の空白・全角の空白・タブ)。 */
const BLANK = ['', '  ', '　', '\t'] as const;
const SAMPLES: readonly string[] = [...READABLE, ...UNREADABLE, ...BLANK];

/** 読めない入力の代表。どの読み方でも数にならない。 */
const UNREADABLE_TOKEN = 'abc';

/**
 * 画面の読み方で「言い直す」。空欄は `''`、読めなければ代表の `'abc'`、
 * 読めれば**その数を半角で打ち直した物**。
 */
function restate(s: string): string {
  if (s.trim() === '') return '';
  const n = readNumeric(s);
  return n === null ? UNREADABLE_TOKEN : String(n);
}

// ─── 結果の正規化 ──────────────────────────────────────────────────────

type Outcome =
  | { readonly ok: true; readonly value: unknown }
  /** `mute` —— 理由の文を持たない断り (Error でない値を投げた・空の文で断った)。 */
  | { readonly ok: false; readonly reason: string; readonly mute?: true };

/**
 * 書き手の結果を 1 つの形へ。投げた / `{ ok: false }` を返した / `null` (取り込まない) /
 * `NaN` (読めない) はどれも「断った」。
 */
function attempt(f: () => unknown): Outcome {
  try {
    const v = f();
    if (v === null) return { ok: false, reason: '(null —— 取り込まない)' };
    if (typeof v === 'number' && Number.isNaN(v)) return { ok: false, reason: '(NaN —— 読めない)' };
    if (typeof v === 'object' && 'ok' in v) {
      const r = v as { ok: unknown; reason?: unknown; entry?: unknown; value?: unknown };
      if (r.ok === false) {
        return typeof r.reason === 'string' && r.reason !== ''
          ? { ok: false, reason: r.reason }
          : { ok: false, reason: `(理由の無い断り: ${String(r.reason)})`, mute: true };
      }
      if ('entry' in r) return { ok: true, value: r.entry };
      if ('value' in r) return { ok: true, value: r.value };
    }
    return { ok: true, value: v };
  } catch (e) {
    /*
     * ★ **断るなら理由の文つきの Error で** (2026-09-27 · パス 496) —— Error でない値
     * (`undefined` / `null` ほか) や空の文で断ると、画面は理由を出せない。しかも
     * **Vitest の `toThrow('文面')` はこの形を見分けない** —— 文面と正規表現の照合は chai の
     * `throws` に委ねられ、chai は投げた値が偽 (`undefined` / `null` / `0` / `''` / `false`) だと
     * 照合そのものを飛ばして合格にする (vitest 4.1.11 / chai 6.2.2 で実測)。断りの文を
     * 関数 (`const refuse = () => new Error(…)`) で組む書き手は、その関数が `undefined` を
     * 返す変異体が文面の検査を素通りした —— だからここで「Error か」を見る。
     */
    if (!(e instanceof Error) || e.message === '') return { ok: false, reason: `(理由の無い断り: ${String(e)})`, mute: true };
    return { ok: false, reason: e.message };
  }
}

// ─── 書き手 × 欄 ────────────────────────────────────────────────────────

interface Probe {
  /** 台帳の鍵 (書き手の名前)。 */
  readonly writer: string;
  /** 欄の名前 (失敗の文で名指しする)。 */
  readonly field: string;
  /** 欄に `s` を置いて書き手を呼ぶ。 */
  readonly write: (s: string) => Outcome;
  /** 成功した記録から、この欄が決める部分を取り出す。 */
  readonly pick: (value: unknown) => unknown;
  /** 空欄の扱い (宣言)。 */
  readonly blank: { readonly refuse: true } | { readonly value: unknown };
  /** 読めた数 `n` が保存されたときの値 (既定は `n` そのもの)。 */
  readonly stored?: (n: number) => unknown;
}

type Rec = Readonly<Record<string, unknown>>;
const get = (key: string) => (v: unknown): unknown => (v as Rec)[key];

const probes: Probe[] = [];

// 売上 (画面の 1 件と CSV の取り込み)
const SALE = { date: '2026-09-01', channel: 'shopify', amount: '1000', orders: '1' } as const;
for (const key of ['amount', 'orders'] as const) {
  probes.push({
    writer: 'parseSalesEntry',
    field: key,
    write: (s) => attempt(() => parseSalesEntry({ ...SALE, [key]: s })),
    pick: get(key),
    blank: { refuse: true },
  });
}
function salesCsv(key: 'amount' | 'orders', s: string): Outcome {
  const row: Record<string, string> = { ...SALE, note: '', [key]: s };
  const text = `${SALES_CSV_COLUMNS.join(',')}\n${SALES_CSV_COLUMNS.map((c) => `"${row[c] ?? ''}"`).join(',')}\n`;
  const r = salesFromCsv(text);
  const first = r.entries[0];
  return first !== undefined ? { ok: true, value: first } : { ok: false, reason: r.errors[0]?.message ?? '(行が無い)' };
}
for (const key of ['amount', 'orders'] as const) {
  probes.push({ writer: 'salesFromCsv', field: key, write: (s) => salesCsv(key, s), pick: get(key), blank: { refuse: true } });
}

// KPI 実績 (画面の 1 件と CSV の取り込み)
const KPI = {
  period: '2026-08', unit: '本業', revenue: '1000000', cogs: '0', advertising: '0', sga: '100000', depreciation: '0',
} as const;
const KPI_AMOUNTS = ['revenue', 'cogs', 'advertising', 'sga', 'depreciation'] as const;
for (const key of [...KPI_AMOUNTS, 'laborCost'] as const) {
  probes.push({
    writer: 'parseKpiActual',
    field: key,
    write: (s) => attempt(() => parseKpiActual({ ...KPI, [key]: s })),
    pick: get(key),
    // 人件費だけは任意 —— 空欄は「未入力」として欄ごと持たせない。
    blank: key === 'laborCost' ? { value: undefined } : { refuse: true },
  });
}
function kpiCsv(key: string, s: string): Outcome {
  const row: Record<string, string> = { ...KPI, laborCost: '', [key]: s };
  const text = `${KPI_CSV_COLUMNS.join(',')}\n${KPI_CSV_COLUMNS.map((c) => `"${row[c] ?? ''}"`).join(',')}\n`;
  const r = kpiActualsFromCsv(text);
  const first = r.entries[0];
  return first !== undefined ? { ok: true, value: first } : { ok: false, reason: r.errors[0]?.message ?? '(行が無い)' };
}
for (const key of [...KPI_AMOUNTS, 'laborCost'] as const) {
  probes.push({
    writer: 'kpiActualsFromCsv',
    field: key,
    write: (s) => kpiCsv(key, s),
    pick: get(key),
    blank: key === 'laborCost' ? { value: undefined } : { refuse: true },
  });
}

// 貸借対照表 (欄は表 `BS_NUMERIC_FIELDS` から —— 11 個目が足されても漏れない)
const BS_BASE: Readonly<Record<string, string>> = {
  asOf: '2026-03-31', currentAssets: '10000000', fixedAssets: '5000000',
  currentLiabilities: '3000000', fixedLiabilities: '2000000', netIncome: '500000',
};
for (const f of BS_NUMERIC_FIELDS) {
  probes.push({
    writer: 'parseBalanceSheet',
    field: f.key,
    write: (s) => attempt(() => parseBalanceSheet({ ...BS_BASE, [f.key]: s })),
    pick: get(f.key),
    // 必須の欄 (当期純利益を含む) の空欄は断る。内数の任意欄は「未入力」(undefined) のまま。
    blank: f.required ? { refuse: true } : { value: undefined },
  });
}

// 経営ハイライトのしきい値 (欄は表 `HIGHLIGHT_THRESHOLD_FIELDS` から)
for (const f of HIGHLIGHT_THRESHOLD_FIELDS) {
  const streak = f.key === 'declineWarnStreak' || f.key === 'declineCriticalStreak';
  probes.push({
    writer: 'parseHighlightSettings',
    field: f.key,
    write: (s) => attempt(() => parseHighlightSettings({ [f.key]: s })),
    pick: get(f.key),
    blank: { value: DEFAULT_HIGHLIGHT_THRESHOLDS[f.key] },
    // % のしきい値は 0.1 刻みへ丸めて持つ (期数は整数でなければ断る)。
    stored: streak ? undefined : (n) => Math.round(n * 10) / 10,
  });
}

// 水耕栽培 —— 測定 (欄は `READING_FIELDS` から)・ロット・運転設定
for (const f of READING_FIELDS) {
  const other = f === 'ph' ? { ec: '1.5' } : { ph: '6' };
  probes.push({
    writer: 'parseReading',
    field: f,
    write: (s) => attempt(() => parseReading({ at: '2026-09-01', values: { ...other, [f]: s } })),
    pick: (v) => (v as { values: Rec }).values[f],
    blank: { value: null },
  });
}
probes.push({
  writer: 'parseBatch',
  field: 'panels',
  write: (s) => attempt(() => parseBatch({ id: 'L1', cropId: 'lettuce', sowDate: '2026-09-01', panels: s, state: 'nursery' })),
  pick: get('panels'),
  blank: { refuse: true },
});
/** 空欄を「未入力」(null) として持つ調製の欄。残りは空欄を既定へ倒す (入力欄の初期値と同じ)。 */
const CONTROL_OPTIONAL = new Set(['tankLiters', 'stockEcRisePerMlPerL', 'alkalinityMgCaCO3PerL', 'acidNormality']);
for (const key of Object.keys(HYDROPONICS_CONTROL_DEFAULTS)) {
  probes.push({
    writer: 'parseControlRecord',
    field: key,
    write: (s) => attempt(() => parseControlRecord({ [key]: s })),
    pick: get(key),
    blank: { value: CONTROL_OPTIONAL.has(key) ? null : (HYDROPONICS_CONTROL_DEFAULTS as unknown as Rec)[key] },
  });
}

// 計算値の置き換え・任意項目 (単位ごと)
const UNITS: readonly MetricUnit[] = ['yen', 'pct', 'count', 'days', 'months'];
for (const unit of UNITS) {
  probes.push({
    writer: 'parseOverrideValue',
    field: unit,
    write: (s) => attempt(() => parseOverrideValue(s, unit)),
    pick: (v) => v,
    blank: { refuse: true },
  });
}
probes.push({
  writer: 'parseManualMetric',
  field: 'value',
  write: (s) => attempt(() => parseManualMetric({ label: '項目', value: s, unit: 'yen' })),
  pick: get('value'),
  blank: { refuse: true },
});

// Shopify の注文額 (取り込まない注文は null)
probes.push({
  writer: 'orderToSalesEntry',
  field: 'total',
  write: (s) => attempt(() => orderToSalesEntry({ name: '#1001', total: s }, { date: '2026-09-01' })),
  pick: get('amount'),
  blank: { refuse: true },
  // 0 以下は「取り込まない」(null) —— 範囲の外として断る側に入る。
});

// 事業の登録 (月次の金額 3 欄。費用だけの登録は断るので、費用の欄は売上を置いて測る)
for (const key of ['revenue', 'variableCost', 'fixedCost'] as const) {
  const base = key === 'revenue' ? { name: '事業A' } : { name: '事業A', revenue: '1000' };
  probes.push({
    writer: 'parseBusinessUnit',
    field: key,
    write: (s) => attempt(() => parseBusinessUnit({ ...base, [key]: s })),
    pick: get(key),
    blank: { value: undefined },
  });
}

// 不動産の物件
const PROPERTY = {
  name: 'テスト物件', type: 'アパート', monthlyRent: '100000', purchasePrice: '12000000',
  monthlyExpenses: '0', monthlyLoan: '0', occupied: true,
} as const;
for (const key of ['monthlyRent', 'purchasePrice', 'monthlyExpenses', 'monthlyLoan'] as const) {
  probes.push({
    writer: 'parsePropertyEntry',
    field: key,
    write: (s) => attempt(() => parsePropertyEntry({ ...PROPERTY, [key]: s })),
    pick: get(key),
    // 取得価格は 1 円以上を要求する (空欄は断る)。他の 3 欄は空欄を 0 円として記録する
    // (入力欄の番人も「保存すると 0 円 として記録されます」と言う —— パス 493l)。
    blank: key === 'purchasePrice' ? { refuse: true } : { value: 0 },
  });
}

// 投資信託の銘柄
const HOLDING = { code: 'X1', name: 'テストファンド', units: '10000', navPerUnit: '15000' } as const;
const AUTO_VALUATION = fundValuation(10000, 15000);
probes.push(
  {
    writer: 'parseHoldingEntry',
    field: 'units (評価額が空欄 = 自動計算)',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, units: s })),
    pick: get('units'),
    blank: { refuse: true },
  },
  {
    writer: 'parseHoldingEntry',
    field: 'navPerUnit (評価額が空欄 = 自動計算)',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, navPerUnit: s })),
    pick: get('navPerUnit'),
    blank: { refuse: true },
  },
  {
    writer: 'parseHoldingEntry',
    field: 'valuation',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, valuation: s })),
    pick: (v) => [get('valuationMode')(v), get('valuation')(v)],
    // 空欄は「自動計算」へ切り替わる (口数 × 基準価額)。
    blank: { value: ['auto', AUTO_VALUATION] },
    stored: (n) => ['manual', n],
  },
  {
    writer: 'parseHoldingEntry',
    field: 'units (評価額を入力したとき)',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, valuation: '1000000', units: s })),
    pick: get('units'),
    blank: { value: 0 },
  },
  {
    writer: 'parseHoldingEntry',
    field: 'acquisitionCost',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, acquisitionCost: s })),
    pick: get('acquisitionCost'),
    // 空欄は「未入力」(null) —— 0 にすると評価額がまるごと含み益に見える (パス 123)。
    blank: { value: null },
  },
  {
    writer: 'parseHoldingEntry',
    field: 'ytdReturnPct',
    write: (s) => attempt(() => parseHoldingEntry({ ...HOLDING, ytdReturnPct: s })),
    pick: get('ytdReturnPct'),
    blank: { value: null },
  },
);

// 品目の数値の欄 (下書き)
probes.push({
  writer: 'parseCropNumber',
  field: '(品目の数値)',
  write: (s) => attempt(() => parseCropNumber(s)),
  pick: (v) => v,
  blank: { refuse: true },
});

// 画面の読み手 2 つ (保存はしないが、利用者が打った数を読むので同じ不変条件を当てる)
probes.push(
  {
    writer: 'parseAmountInput',
    field: '(税・手当の金額)',
    write: (s) => {
      const r = parseAmountInput(s);
      return r.ok ? { ok: true, value: r.value ?? null } : { ok: false, reason: '(読めない)' };
    },
    pick: (v) => v,
    // 空欄は「未入力」(値なし) —— 読めない入力とは分けて返す (パス 375)。
    blank: { value: null },
  },
  {
    writer: 'parseNumericInput',
    field: '(受給判定の数値)',
    write: (s) => attempt(() => parseNumericInput(s)),
    pick: (v) => v,
    // 空欄も読めない入力も null (受給判定はどちらも「未入力」として扱う)。
    blank: { refuse: true },
  },
);

const label = (p: Probe): string => `${p.writer} · ${p.field}`;
const show = (o: Outcome): string => JSON.stringify(o);

// ─── 母集団 (画面が呼ぶ書き手) ────────────────────────────────────────────

type LedgerRow =
  | { readonly kind: 'numbers'; readonly why: string }
  | { readonly kind: 'no-numbers' | 'not-typed'; readonly why: string };

/**
 * 画面が呼ぶ書き手らしい名前 → 数を読むか。**両方向**に突き合わせる。
 * `numbers` の行は上の標本を持たなければならず、それ以外の行は数を読む口を
 * 1 つも呼ばないこと (構文木で検める)。
 */
const WRITER_LEDGER: Readonly<Record<string, LedgerRow>> = {
  parseSalesEntry: { kind: 'numbers', why: '売上金額・注文件数' },
  salesFromCsv: { kind: 'numbers', why: 'CSV の金額・注文件数を parseSalesEntry へ渡す (途中で読み直さないことを標本で見る)' },
  parseKpiActual: { kind: 'numbers', why: 'KPI 実績の金額 6 欄' },
  kpiActualsFromCsv: { kind: 'numbers', why: 'CSV の金額 6 欄を parseKpiActual へ渡す' },
  parseBalanceSheet: { kind: 'numbers', why: '貸借対照表の 10 欄' },
  parseHighlightSettings: { kind: 'numbers', why: '経営ハイライトのしきい値 5 欄' },
  parseReading: { kind: 'numbers', why: '水耕栽培の測定 8 欄' },
  parseBatch: { kind: 'numbers', why: 'ロットのパネル枚数' },
  parseControlRecord: { kind: 'numbers', why: '水耕栽培の運転設定 18 欄' },
  parseOverrideValue: { kind: 'numbers', why: '計算値の置き換え (単位 5 種)' },
  parseManualMetric: { kind: 'numbers', why: '任意項目の値 (parseOverrideValue と同じ規則)' },
  orderToSalesEntry: { kind: 'numbers', why: 'Shopify の注文額' },
  parseBusinessUnit: { kind: 'numbers', why: '事業の月次の金額 3 欄' },
  parsePropertyEntry: { kind: 'numbers', why: '物件の金額 4 欄' },
  parseHoldingEntry: { kind: 'numbers', why: '銘柄の口数・基準価額・評価額・取得額・年初来リターン' },
  parseCropNumber: { kind: 'numbers', why: '品目の下書きの数値の欄' },
  parseMember: { kind: 'no-numbers', why: 'チームの氏名・メール・役割だけを読む' },
  parseShigyoContact: { kind: 'no-numbers', why: '士業の連絡先 (氏名・事務所・電話・メール) —— 電話番号は文字列のまま持つ' },
  parseShigyoConsultation: { kind: 'no-numbers', why: '相談の日付・テーマ・状態だけを読む' },
  parseSubmissionProfile: { kind: 'no-numbers', why: '書面の代表者名・所在地などの文字列だけを読む' },
  parseBankFormat: { kind: 'no-numbers', why: '書面の書式 (単位・負数・端数・年号) を許可リストで選ぶ' },
  parseAiCredentials: { kind: 'no-numbers', why: '保管庫の AI の資格情報 (JSON) から文字列の欄だけを読む' },
  parseSecurityKeys: { kind: 'no-numbers', why: '保管庫の HIBP / VirusTotal の鍵 (JSON) から文字列の欄だけを読む' },
  parseTokenResponse: {
    kind: 'not-typed',
    why: '認可サーバの応答 (JSON) を読む —— expires_in は JSON の数として届き、入力欄の文字列ではない',
  },
  parseLatestRelease: { kind: 'not-typed', why: 'GitHub の最新リリースの応答 (JSON) を読む' },
  parseJsonText: { kind: 'not-typed', why: '第三者の本文を JSON として読む (文言は定数・パス 311)' },
  parseNumericInput: { kind: 'numbers', why: '受給判定の画面の読み手 (保存しない) —— 年齢・経営年数ほか' },
  parseAmountInput: { kind: 'numbers', why: '税・手当の画面の読み手 (保存しない) —— 課税所得・額面年収ほか' },
  parseBackupFile: {
    kind: 'not-typed',
    why: '控えの JSON を読む —— 数は JSON の数として届き、形の表 (COLLECTION_SHAPES) が型を検める',
  },
  parseGoogleCallback: { kind: 'not-typed', why: '貼り付けた callback URL から code と state を取り出す' },
  parseOllamaEndpoint: { kind: 'not-typed', why: 'Ollama の URL を読む (ポートは URL の解析器が読む)' },
  parseTimestamp: { kind: 'not-typed', why: '保存済みの時刻を読む読み手で、入力欄を受けない' },
  parseMarkdown: { kind: 'not-typed', why: 'AI の応答を描くための解析で、保存しない' },
};

/** 書き手らしい名前の針 (上の docblock の「針の死角」を参照)。 */
const WRITER_NAME = /^(?:parse[A-Z]\w*|\w+FromCsv|\w+To[A-Z]\w*Entry)$/;

const RENDERER = join(__dirname, '..', '..');

function uiFiles(dir: string = RENDERER): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // 書き手の住処 (data/) と検査は UI ではない。
      if (e.name === '__tests__' || full === join(RENDERER, 'data')) continue;
      out.push(...uiFiles(full));
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 画面が `data/` / `shared/` から import する書き手らしい名前 → 定義のあるモジュールの道。 */
export function importedWriters(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of uiFiles()) {
    const src = stripComments(readOriginalSource(file));
    for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const [, names = '', spec = ''] = m;
      // リポジトリの中のモジュールだけ (パッケージは書き手ではない)。
      if (!spec.startsWith('.')) continue;
      for (const part of names.split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '';
        if (!WRITER_NAME.test(name)) continue;
        // 呼び出しが在ること (型だけの import や言及は数えない)。
        if (!new RegExp(`\\b${name}\\s*\\(`).test(src)) continue;
        const abs = join(file, '..', spec);
        out.set(name, abs);
      }
    }
  }
  return out;
}

/** モジュールの道から実物のファイルを引く (`.ts` / `.tsx` / `index.ts`)。 */
function resolveModule(abs: string): string {
  for (const cand of [`${abs}.ts`, `${abs}.tsx`, join(abs, 'index.ts')]) {
    try {
      readOriginalSource(cand);
      return cand;
    } catch {
      // 次の候補へ
    }
  }
  throw new Error(`モジュールが見つからない: ${abs}`);
}

/**
 * 関数の本体 (構文木で切り出す —— 引数の型の `{}` に惑わされない)。
 * 再 export (`export { x } from './y'`) は辿る —— 画面が import するのは中継の
 * モジュールのことがある (`data/saasWriteWeb.ts` → `shared/api/security.ts`)。
 */
function functionBody(file: string, name: string, depth = 0): string | null {
  const src = readOriginalSource(file);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let body: string | null = null;
  let via: string | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) body = node.body.getText(sf);
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.some((e) => e.name.text === name)
    ) {
      via = node.moduleSpecifier.text;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (body !== null) return body;
  if (via !== null && depth < 3) return functionBody(resolveModule(join(file, '..', via)), name, depth + 1);
  return null;
}

/** 数を読む口 (これを呼べば「数を読む」)。 */
const NUMBER_READERS = /\b(?:Number|parseFloat|parseInt|readNumeric|readEntryNumber|readNumber\w*|toAmount|finiteNumberOf)\s*\(/;

// ─── 検査 ──────────────────────────────────────────────────────────────

describe('保存する書き手は、画面と同じ読み方で数を読む (パス 496)', () => {
  it('★ 標本の分類が画面の読み方と一致する (読める / 読めない / 空欄)', () => {
    for (const s of READABLE) expect(readNumeric(s), `読めるはずの標本 ${JSON.stringify(s)}`).not.toBeNull();
    for (const s of UNREADABLE) {
      expect(s.trim(), `空欄ではない ${JSON.stringify(s)}`).not.toBe('');
      expect(readNumeric(s), `読めないはずの標本 ${JSON.stringify(s)}`).toBeNull();
    }
    for (const s of BLANK) expect(s.trim(), `空欄のはずの標本 ${JSON.stringify(s)}`).toBe('');
    // 共有の口 (`readEntryNumber`) も同じ 3 通りに分ける。
    for (const s of READABLE) expect(readEntryNumber(s)).toEqual({ kind: 'number', value: readNumeric(s)! + 0 });
    for (const s of UNREADABLE) expect(readEntryNumber(s)).toEqual({ kind: 'unreadable' });
    for (const s of BLANK) expect(readEntryNumber(s)).toEqual({ kind: 'blank' });
  });

  it('★ 走査の床 —— 書き手と欄の数が縮んでいない', () => {
    expect(new Set(probes.map((p) => p.writer)).size, '書き手の数').toBeGreaterThanOrEqual(16);
    expect(probes.length, '書き手 × 欄の数').toBeGreaterThanOrEqual(70);
  });

  it('★ 1. 言い直しても答えが変わらない (書き手 × 欄 × 標本)', () => {
    const split: string[] = [];
    for (const p of probes) {
      for (const s of SAMPLES) {
        const got = p.write(s);
        const want = p.write(restate(s));
        if (show(got) !== show(want)) {
          split.push(`${label(p)} ${JSON.stringify(s)}: ${show(got)} ≠ 言い直し ${JSON.stringify(restate(s))}: ${show(want)}`);
        }
      }
    }
    expect(split, '書き手が画面と別の読み方をしている').toEqual([]);
  });

  it('★ 2. 読めない入力は断る (黙って 0 や別の数にしない)', () => {
    const leaks: string[] = [];
    for (const p of probes) {
      for (const s of UNREADABLE) {
        const got = p.write(s);
        if (got.ok) leaks.push(`${label(p)} ${JSON.stringify(s)} → ${JSON.stringify(p.pick(got.value))}`);
      }
    }
    expect(leaks, '読めない入力が保存される').toEqual([]);
  });

  it('★ 2b. 断るときは理由の文を持つ (Error でない値・空の文で断らない)', () => {
    const mute: string[] = [];
    for (const p of probes) {
      const refusing = [...UNREADABLE, ...('refuse' in p.blank ? BLANK : [])];
      for (const s of refusing) {
        const got = p.write(s);
        if (!got.ok && got.mute === true) mute.push(`${label(p)} ${JSON.stringify(s)} → ${got.reason}`);
      }
    }
    expect(mute, '理由の無い断り (画面は理由を出せず、toThrow(文面) もこれを見分けない)').toEqual([]);
  });

  it('★ 2b の針: 理由の無い断りを数える (標本)', () => {
    const muteOf = (o: Outcome): boolean => !o.ok && o.mute === true;
    expect(muteOf(attempt(() => { throw undefined; }))).toBe(true);
    expect(muteOf(attempt(() => { throw null; }))).toBe(true);
    expect(muteOf(attempt(() => { throw new Error(''); }))).toBe(true);
    expect(muteOf(attempt(() => ({ ok: false })))).toBe(true);
    // 対照: 理由の文を持つ断りと、理由を持たないことを型で宣言する断り (null / NaN) は数えない
    expect(muteOf(attempt(() => { throw new Error('0 以上の数値で入力してください'); }))).toBe(false);
    expect(muteOf(attempt(() => ({ ok: false, reason: '売上原価が未入力です' })))).toBe(false);
    expect(muteOf(attempt(() => null))).toBe(false);
    expect(muteOf(attempt(() => Number.NaN))).toBe(false);
  });

  it('★ 3. 空欄は宣言どおり (空白だけ・全角の空白・タブも同じ)', () => {
    const wrong: string[] = [];
    for (const p of probes) {
      for (const s of BLANK) {
        const got = p.write(s);
        if ('refuse' in p.blank) {
          if (got.ok) wrong.push(`${label(p)} ${JSON.stringify(s)}: 断るはずが ${JSON.stringify(p.pick(got.value))} を保存`);
        } else if (!got.ok) {
          wrong.push(`${label(p)} ${JSON.stringify(s)}: ${JSON.stringify(p.blank.value)} のはずが断った (${got.reason})`);
        } else if (JSON.stringify(p.pick(got.value)) !== JSON.stringify(p.blank.value)) {
          wrong.push(`${label(p)} ${JSON.stringify(s)}: ${JSON.stringify(p.blank.value)} のはずが ${JSON.stringify(p.pick(got.value))}`);
        }
      }
    }
    expect(wrong, '空欄の扱いが宣言と違う').toEqual([]);
  });

  it('★ 4. 読めた数はそのまま保存される (範囲の外は断ってよい)', () => {
    const wrong: string[] = [];
    const accepted = new Map<string, number>();
    for (const p of probes) {
      let n = 0;
      for (const s of READABLE) {
        const got = p.write(s);
        if (!got.ok) continue;
        n += 1;
        const read = readNumeric(s)! + 0;
        const want = p.stored ? p.stored(read) : read;
        if (JSON.stringify(p.pick(got.value)) !== JSON.stringify(want)) {
          wrong.push(`${label(p)} ${JSON.stringify(s)}: ${JSON.stringify(want)} のはずが ${JSON.stringify(p.pick(got.value))}`);
        }
      }
      accepted.set(label(p), n);
    }
    expect(wrong, '読めた数と違う数が保存される').toEqual([]);
    // 空虚でない: どの欄も、読める標本のうち少なくとも 1 つを受け取る (土台の記録が正しい)。
    const never = [...accepted].filter(([, n]) => n === 0).map(([k]) => k);
    expect(never, '読める標本を 1 つも受け取らない欄 (土台の記録が誤っている)').toEqual([]);
  });

  it('★ 母集団: 画面が呼ぶ書き手は台帳どおり (両方向)', () => {
    const seen = importedWriters();
    expect([...seen.keys()].filter((n) => !Object.hasOwn(WRITER_LEDGER, n)).sort(), '台帳に無い書き手').toEqual([]);
    expect(Object.keys(WRITER_LEDGER).filter((n) => !seen.has(n)).sort(), '台帳の古い行').toEqual([]);
    for (const [n, row] of Object.entries(WRITER_LEDGER)) expect(row.why.length, `${n}: 理由が無い`).toBeGreaterThan(8);
  });

  it('★ 母集団: 数を読む書き手はどれも標本を持ち、標本の書き手はどれも台帳の numbers 行', () => {
    const probed = new Set(probes.map((p) => p.writer));
    const numbers = Object.entries(WRITER_LEDGER).filter(([, r]) => r.kind === 'numbers').map(([n]) => n);
    expect(numbers.filter((n) => !probed.has(n)).sort(), '標本の無い numbers 行').toEqual([]);
    expect([...probed].filter((n) => WRITER_LEDGER[n]?.kind !== 'numbers').sort(), '台帳が numbers と言わない書き手').toEqual([]);
  });

  it('★ 母集団: 数を読まないと言う行は、本当に数を読む口を呼ばない (構文木)', () => {
    const seen = importedWriters();
    const wrong: string[] = [];
    for (const [n, row] of Object.entries(WRITER_LEDGER)) {
      if (row.kind !== 'no-numbers') continue;
      const where = seen.get(n);
      if (where === undefined) continue; // 古い行は上の検査が名指しする
      const body = functionBody(resolveModule(where), n);
      if (body === null) wrong.push(`${n}: 関数の本体が見つからない`);
      else if (NUMBER_READERS.test(stripComments(body))) wrong.push(`${n}: 数を読む口を呼んでいる`);
    }
    expect(wrong).toEqual([]);
    // 標本: 針は数を読む口に当たり、読まない本体には当たらない。
    expect(NUMBER_READERS.test('const n = Number(v);')).toBe(true);
    expect(NUMBER_READERS.test('const r = readEntryNumber(v);')).toBe(true);
    expect(NUMBER_READERS.test('const name = (input.name ?? "").trim();')).toBe(false);
  });

  it('★ 走査の標本: 型だけの import と呼ばれない名前は数えない', () => {
    expect(WRITER_NAME.test('parseSalesEntry')).toBe(true);
    expect(WRITER_NAME.test('salesFromCsv')).toBe(true);
    expect(WRITER_NAME.test('orderToSalesEntry')).toBe(true);
    expect(WRITER_NAME.test('parse')).toBe(false);
    expect(WRITER_NAME.test('SalesEntry')).toBe(false);
  });
});
