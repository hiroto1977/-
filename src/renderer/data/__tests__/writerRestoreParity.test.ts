/**
 * **書き手が断る記録を、復元が通してはいけない** —— 綴りを見ない走査 (パス 224)。
 *
 * パス 223 は「欄と欄の関係」を綴りで数えた (`より前` / `下限が上限` ほか)。その走査は
 * 2 つの形をまるごと見落とした:
 *
 *   - **ヘルパー越しの断り** —— `parseBalanceSheet` の `atMost(v, limit, message)` は文を
 *     **引数**で受けるので、`throw new Error('…以下で…')` を探す走査に映らない。
 *     `if (v !== undefined && v > limit)` も比較が連言の片側なので構文の走査にも映らない。
 *   - **言い回しの違う断り** —— 「人件費は販管費以下で入力してください」ほか。
 *
 * **だからここは綴りを見ない。** ある欄へ**別の欄の値を借りてくる** ——
 * 借りた値はその欄でアプリ自身が書いた値なので、**それ自体は正当**である。だから
 * 借用で書き手が断ったなら、理由は「その値が単独で駄目」か「**組として駄目**」の
 * どちらかしかない。書き手が断り復元が通す組を全部拾い、台帳で 1 件ずつ裁定する。
 *
 * ## 実測 (2026-09-14)
 *
 * 見つけた時 (直す前・任意欄を空にした基準の記録): 借用 496 通り → **書き手が断り復元が
 * 通す 35 件**。裁定すると **7 件が関係**で、残りは「復元は型だけ見る」意図された差。
 *
 * 直した後 (この検査が常設で回す・欄を全部埋めた基準の記録): 16 collection /
 * **借用 508 通り** / 書き手が断る **120 件** / 壊れた欄で数えて **35 鍵**。
 * うち復元が通すのは **16 借用 (6 鍵)** で、すべて「その欄単独の話」である。
 *
 * ## この検査が守っている 3 方向
 *
 *   1. **未裁定の組は落ちる** —— 新しい欄・新しい collection が関係を連れてきたら、
 *      台帳に理由を書くまで CI が赤い。
 *   2. **`relation` と裁定した組は、実際に両方の入口が断つ** —— `RECORD_RELATIONS` から
 *      1 件落とすと、その組が「書き手は断るが復元は通す」に戻って落ちる。
 *   3. **台帳に死んだ行が無い** —— 欄が消えた・書き手が断らなくなった行は落ちる
 *      (この検査を書いた時、私が測らずに書いた 9 行がここで落ちた)。
 *
 * **借用が届く範囲は、基準の記録の値で決まる。** 例えば `cash > 流動資産` を借用で作るには
 * 流動資産より大きい値を持つ欄が要る。だから「宣言した関係が両方の入口で効くこと」の
 * 総当たりは `recordRelations.test.ts` が直に組んだ記録で持つ —— ここは**発見**の役。
 *
 * 基準の記録は**欄を全部埋めた 1 件**を使う (組を全部作るため)。任意欄の有無の往復は
 * `collectionShapesRoundTrip.test.ts` が別に見ている —— 目的が違うので写しではない。
 */
import { describe, expect, it } from 'vitest';
import { hasCollectionShape } from '../collectionShapes';
import { RECORD_RELATIONS, relationIssue } from '../recordRelations';
import { parseSalesEntry } from '../sales';
import { parseKpiActual } from '../kpiActuals';
import { parseBalanceSheet } from '../balanceSheet';
import { parseMember } from '../members';
import { parseBusinessUnit } from '../businessUnits';
import { parseShigyoContact, parseShigyoConsultation } from '../shigyoDirectory';
import { parseHoldingEntry, parsePropertyEntry } from '../investments';
import { parseManualMetric } from '../manualData';
import { parseCustomMetric } from '../overviewOverrides';
import { parseHighlightSettings } from '../highlightSettings';
import { parseBatch, parseControlRecord, parseReading } from '../hydroponicsLog';

type Rec = Record<string, unknown>;

/** IndexedDB / バックアップと同じ往復 (undefined の欄は消える)。 */
const viaJson = (v: unknown): Rec => JSON.parse(JSON.stringify(v)) as Rec;

/** 断った理由 (文) か、通したなら null。`{ ok: false }` を返す書き手も「断った」。 */
type Writer = (r: Rec) => string | null;
const wrap =
  (f: (i: never) => unknown): Writer =>
  (r) => {
    try {
      const v = f(r as never) as { ok?: boolean; reason?: string; error?: string };
      if (v !== null && typeof v === 'object' && v.ok === false) {
        return `ok:false ${String(v.reason ?? v.error ?? '')}`;
      }
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

/** 画面のフォームから呼ばれる書き手は文字列しか受けないので、値を写してから渡す。 */
const asStrings = (r: Rec): Rec =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, v === null ? '' : typeof v === 'boolean' ? v : String(v)]),
  );

const entry = (r: unknown): Rec => viaJson((r as { entry: Rec }).entry);

interface WriterCase {
  readonly c: string;
  readonly base: Rec;
  readonly w: Writer;
  /** 文字列しか受けない書き手。 */
  readonly str?: boolean;
}

const WRITERS: readonly WriterCase[] = [
  {
    c: 'sales-entries',
    base: viaJson(parseSalesEntry({ date: '2026-04-01', channel: 'amazon', amount: 1000, orders: 2, note: 'x' })),
    w: wrap(parseSalesEntry),
  },
  {
    c: 'kpi-actuals',
    base: viaJson(parseKpiActual({ period: '2026-04', unit: '全社', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5, laborCost: 30 })),
    w: wrap(parseKpiActual),
  },
  {
    c: 'kpi-budgets',
    base: viaJson(parseKpiActual({ period: '2026-04', unit: '全社', revenue: 1000, cogs: 100, advertising: 10, sga: 50, depreciation: 5, laborCost: 30 })),
    w: wrap(parseKpiActual),
  },
  {
    c: 'balance-sheet',
    base: viaJson(parseBalanceSheet({ asOf: '2026-03-31', currentAssets: 8000, cash: 3000, inventory: 1000, accountsReceivable: 2000, fixedAssets: 4000, currentLiabilities: 5000, accountsPayable: 1000, fixedLiabilities: 3000, interestBearingDebt: 2000, netIncome: 100 })),
    w: wrap(parseBalanceSheet),
  },
  {
    c: 'team-members',
    base: viaJson(parseMember({ name: '山田', email: 'y@example.com', role: 'member' })),
    w: wrap(parseMember),
  },
  {
    c: 'business-units',
    base: entry(parseBusinessUnit({ name: 'EC', category: '小売', startedOn: '2026-01', note: 'n', revenue: '100', variableCost: '10', fixedCost: '5' })),
    w: wrap(parseBusinessUnit),
    str: true,
  },
  {
    c: 'shigyo-contacts',
    base: viaJson(parseShigyoContact({ serviceId: 'tax-accountant', name: '田中', firm: 'F', phone: '03-0000-0000', email: 'a@example.com' })),
    w: wrap(parseShigyoContact),
  },
  {
    c: 'shigyo-consultations',
    base: viaJson(parseShigyoConsultation({ serviceId: 'tax-accountant', date: '2026-04-01', topic: '決算', status: '相談予約' })),
    w: wrap(parseShigyoConsultation),
  },
  {
    c: 'realestate-properties',
    base: viaJson(parsePropertyEntry({ name: 'A', type: 'apartment', monthlyRent: 100000, purchasePrice: 10000000, occupied: true, monthlyExpenses: 1000, monthlyLoan: 50000 })),
    w: wrap(parsePropertyEntry),
  },
  {
    c: 'mutualfund-holdings',
    base: viaJson(parseHoldingEntry({ code: '1234', name: 'F', units: 10000, navPerUnit: 12345, acquisitionCost: 10000, ytdReturnPct: 1.5 })),
    w: wrap(parseHoldingEntry),
  },
  {
    c: 'manual-metrics',
    base: viaJson({ scope: 'sales', ...entry(parseManualMetric({ label: '来店数', value: '120', unit: 'count', note: 'n', businessId: 'b1' })) }),
    w: wrap(parseManualMetric),
    str: true,
  },
  {
    c: 'overview-custom-metrics',
    base: entry(parseCustomMetric({ label: 'L', value: '12', unit: 'pct', note: 'n' })),
    w: wrap(parseCustomMetric),
    str: true,
  },
  {
    c: 'highlight-settings',
    base: viaJson(parseHighlightSettings({ declineWarnStreak: 2, declineCriticalStreak: 4, laborShareWarnPct: 55, singleChannelWarnPct: 70 })),
    w: wrap(parseHighlightSettings),
  },
  {
    c: 'hydroponics-readings',
    base: viaJson(parseReading({ at: '2026-09-13', values: { ec: 1.8, ph: 6.2, waterTempC: 20, airTempC: 22, humidityPct: 65, co2Ppm: 800 }, batchId: null, note: 'n' })),
    w: wrap(parseReading),
  },
  {
    c: 'hydroponics-batches',
    base: viaJson(parseBatch({ id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-08-01', panels: 4, state: 'harvested', transplantedDate: '2026-08-10', harvestedDate: '2026-09-20', note: 'n' })),
    w: wrap(parseBatch),
  },
  { c: 'hydroponics-control', base: viaJson(parseControlRecord({})), w: wrap(parseControlRecord) },
];

/**
 * 裁定。鍵は `collection:こわした欄`。
 *
 * - `'relation'` —— 欄と欄の関係。`RECORD_RELATIONS` が持ち、**両方の入口**が断つ。
 * - `'per-field'` —— その欄単独の話 (書式・範囲・必須)。復元の形の検査は
 *   「挙げた欄の**型**だけ見る」と宣言しているので、ここは**意図された差**である
 *   (落とし過ぎは復元の欠落 = 別の事故になる。`collectionShapes.ts` の方針を参照)。
 */
const VERDICTS: Readonly<Record<string, { readonly verdict: 'relation' | 'per-field'; readonly why: string }>> = {
  // ── 欄と欄の関係 (`RECORD_RELATIONS` が持ち、両方の入口が断つ) ────────
  'balance-sheet:currentAssets': { verdict: 'relation', why: '流動資産は現預金・棚卸資産・売上債権の親項目 (小さくすると内数が超える)' },
  'balance-sheet:currentLiabilities': { verdict: 'relation', why: '流動負債は仕入債務の親項目・有利子負債の親項目の片側' },
  'balance-sheet:accountsPayable': { verdict: 'relation', why: '仕入債務 ≦ 流動負債 (CCC の仕入債務回転日数)' },
  'kpi-actuals:sga': { verdict: 'relation', why: '人件費 ≦ 販管費 (販管費は人件費の親項目)' },
  'kpi-actuals:laborCost': { verdict: 'relation', why: '人件費 ≦ 販管費' },
  'kpi-budgets:sga': { verdict: 'relation', why: '人件費 ≦ 販管費 (予算も同じ書き手)' },
  'kpi-budgets:laborCost': { verdict: 'relation', why: '人件費 ≦ 販管費 (予算も同じ書き手)' },
  'highlight-settings:declineWarnStreak': { verdict: 'relation', why: '連続下落 危険 ≧ 警告 (逆だと warning の枝が到達不能)' },
  'hydroponics-batches:sowDate': { verdict: 'relation', why: '播種 → 定植 → 収穫 の順序 (パス 223)' },
  'hydroponics-batches:transplantedDate': { verdict: 'relation', why: '定植 ≧ 播種 / 収穫 ≧ 定植 (パス 223)' },
  'hydroponics-batches:harvestedDate': { verdict: 'relation', why: '収穫 ≧ 播種・定植 (パス 223)' },
  'hydroponics-control:waterTempLowC': { verdict: 'relation', why: '養液温度 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:waterTempHighC': { verdict: 'relation', why: '養液温度 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:airTempLowC': { verdict: 'relation', why: '室温 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:airTempHighC': { verdict: 'relation', why: '室温 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:humidityLowPct': { verdict: 'relation', why: '相対湿度 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:humidityHighPct': { verdict: 'relation', why: '相対湿度 下限 ≦ 上限 (パス 223)' },
  'hydroponics-control:co2HighPpm': { verdict: 'relation', why: 'CO₂ 下限 ≦ 上限 (パス 223)' },

  // ── その欄単独の話 ────────────────────────────────────────────
  // 復元も落とす (列挙値・暦に在る日付は形の検査が見ている)。
  'sales-entries:date': { verdict: 'per-field', why: '日付の書式。復元も `calendarDate` で落とす' },
  'sales-entries:channel': { verdict: 'per-field', why: 'チャネルの列挙値。復元も `oneOf` で落とす' },
  'shigyo-consultations:date': { verdict: 'per-field', why: '相談日の書式。復元も `calendarDate` で落とす' },
  'shigyo-consultations:status': { verdict: 'per-field', why: 'ステータスの列挙値。復元も `oneOf` で落とす' },
  'team-members:role': { verdict: 'per-field', why: '役割の列挙値。復元も `oneOf` で落とす' },
  'business-units:startedOn': { verdict: 'per-field', why: '開始時期の書式。復元も `blankOrCalendar` で落とす' },
  'manual-metrics:unit': { verdict: 'per-field', why: '単位の列挙値。復元も `oneOf` で落とす' },
  'overview-custom-metrics:unit': { verdict: 'per-field', why: '単位の列挙値。復元も `oneOf` で落とす' },
  'hydroponics-readings:at': { verdict: 'per-field', why: '測定日の書式。復元も `calendarDate` で落とす' },
  'hydroponics-readings:values': { verdict: 'per-field', why: '1 項目以上という要件。復元は入れ物の形だけ見る (中身は読む側が項目ごとに落とす)' },
  'hydroponics-batches:state': { verdict: 'per-field', why: 'ロットの状態の列挙値。復元も `oneOf` で落とす' },
  // 復元は通す —— **意図された差**。形の検査は「挙げた欄の型だけ見る」と宣言している
  // (落とし過ぎは復元の欠落 = 別の事故になる。`collectionShapes.ts` の方針)。
  'kpi-actuals:period': { verdict: 'per-field', why: '期の書式 (YYYY-MM)。復元は文字列であることだけ見る —— 読む側が期でグループ化するとき不明な期は束にならないだけ' },
  'kpi-budgets:period': { verdict: 'per-field', why: '期の書式 (YYYY-MM)。復元は文字列であることだけ見る' },
  'team-members:email': { verdict: 'per-field', why: 'メールアドレスの書式。復元は文字列であることだけ見る (重複判定は `memberKey` が正規化して行う)' },
  'shigyo-contacts:email': { verdict: 'per-field', why: 'メールアドレスの書式。復元は任意欄の型だけ見る' },
  'shigyo-contacts:phone': { verdict: 'per-field', why: '電話番号の書式。復元は任意欄の型だけ見る' },
  'mutualfund-holdings:ytdReturnPct': { verdict: 'per-field', why: 'YTD リターンの範囲 (−100〜1000%)。復元は null か数値であることだけ見る' },
};

interface Borrow {
  readonly key: string;
  readonly c: string;
  readonly a: string;
  readonly b: string;
  readonly refusal: string;
  readonly restoreAccepts: boolean;
  readonly relationRefuses: boolean;
}

/** 借用を総当たりし、書き手が断った組だけ集める。 */
function census(): { borrows: number; refused: Borrow[]; collections: number } {
  const refused: Borrow[] = [];
  let borrows = 0;
  for (const { c, base, w: raw, str } of WRITERS) {
    const w = (r: Rec): string | null => raw(str === true ? asStrings(r) : r);
    // 基準の記録そのものは、両方の入口を通らなければならない (走査が生きている床)。
    expect(w(base), `${c}: 基準の記録が書き手に通らない`).toBeNull();
    expect(hasCollectionShape(c, base), `${c}: 基準の記録が復元に通らない`).toBe(true);
    const keys = Object.keys(base);
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        const va = base[a];
        const vb = base[b];
        // 型が違う値・同じ値・真偽値は借りない (借りた値がその欄で正当でなくなる)。
        if (typeof va !== typeof vb || va === vb || typeof vb === 'boolean') continue;
        borrows += 1;
        const cand = { ...base, [a]: vb };
        const refusal = w(cand);
        if (refusal === null) continue;
        refused.push({
          key: `${c}:${a}`,
          c,
          a,
          b,
          refusal,
          restoreAccepts: hasCollectionShape(c, viaJson(cand)),
          relationRefuses: relationIssue(c, cand) !== null,
        });
      }
    }
  }
  return { borrows, refused, collections: WRITERS.length };
}

const RESULT = census();

describe('書き手が断る記録を復元が通さない (借用による走査 · パス 224)', () => {
  it('走査が生きている —— 借用の母集団が在り、断られた組も在る', () => {
    expect(RESULT.collections).toBe(16);
    // 実測 508 / 120 (2026-09-14)。欄が増えれば増える量なので下限で留める。
    expect(RESULT.borrows).toBeGreaterThanOrEqual(450);
    expect(RESULT.refused.length).toBeGreaterThanOrEqual(100);
  });

  it('書き手が断った組は、すべて裁定されている (未裁定は落ちる)', () => {
    const unadjudicated = [...new Set(RESULT.refused.filter((r) => VERDICTS[r.key] === undefined).map((r) => r.key))];
    expect(
      unadjudicated,
      '書き手が断る組が裁定されていない —— 欄と欄の関係なら RECORD_RELATIONS へ、欄単独なら VERDICTS へ理由を書く',
    ).toEqual([]);
  });

  it('復元が通してしまう組は、すべて「その欄単独の話」である', () => {
    const hits = RESULT.refused.filter((r) => r.restoreAccepts);
    expect(hits.length, '走査が 1 件も拾わない —— 借用が壊れていないか').toBeGreaterThan(0);
    const wrong = hits.filter((h) => VERDICTS[h.key]?.verdict !== 'per-field');
    expect(
      wrong.map((h) => `${h.key} := ${h.b} → ⛔「${h.refusal}」`),
      '関係と裁定した組が復元を通っている —— RECORD_RELATIONS から落ちていないか',
    ).toEqual([]);
  });

  it('関係と裁定した組は、復元の入口も台帳の関係として断つ', () => {
    for (const [key, v] of Object.entries(VERDICTS)) {
      if (v.verdict !== 'relation') continue;
      const mine = RESULT.refused.filter((r) => r.key === key);
      expect(mine.length, `${key}: 関係と裁定したのに、借用で 1 度も断られない`).toBeGreaterThan(0);
      // 台帳の関係として断つ借用が **少なくとも 1 つ**在る (1 つの欄は複数の理由で
      // 断られうるので、全部が関係とは限らない —— 例えば日付は書式でも断られる)。
      expect(
        mine.some((h) => h.relationRefuses),
        `${key}: 台帳の関係が 1 つも当たらない —— RECORD_RELATIONS から落ちていないか`,
      ).toBe(true);
      // どの借用も復元を通らない。
      expect(
        mine.filter((h) => h.restoreAccepts).map((h) => `${key} := ${h.b}`),
        `${key}: 復元が通す`,
      ).toEqual([]);
    }
  });

  it('裁定の台帳に、使われていない行が無い (両方向)', () => {
    const exercised = new Set(RESULT.refused.map((r) => r.key));
    const dead = Object.keys(VERDICTS).filter((k) => !exercised.has(k));
    expect(dead, '裁定の台帳の行が、借用で 1 度も当たらない —— 欄が消えたか、書き手が断らなくなった').toEqual([]);
  });

  it('関係と裁定した鍵は、`RECORD_RELATIONS` を持つ collection にしか無い', () => {
    const withRelations = new Set(Object.keys(RECORD_RELATIONS));
    const stray = Object.entries(VERDICTS)
      .filter(([, v]) => v.verdict === 'relation')
      .map(([k]) => k)
      .filter((k) => !withRelations.has(k.slice(0, k.lastIndexOf(':'))));
    expect(stray, '関係と裁定したのに、その collection は台帳に関係を持たない').toEqual([]);
  });

  it('裁定にはすべて理由が書かれている', () => {
    for (const [key, v] of Object.entries(VERDICTS)) {
      expect(v.why.length, `${key}: 理由が短すぎる`).toBeGreaterThan(8);
    }
  });
});
