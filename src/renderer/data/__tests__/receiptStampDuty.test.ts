/**
 * **領収書の印紙税は階級で決まる —— 1 階級の数を答えとして名乗らない** (2026-09-24 · パス 438)。
 *
 * 直す前の `RULES.ryoshu` は `num(v, 'amount') >= 50_000` と**利用者が入れた金額を使って
 * 発火**しながら、文が名乗る金額は「（5万円以上100万円以下は200円）」の **1 階級ぶんだけ**で、
 * どの金額でも同じ文を返していた。実測 (2026-09-24 · 直す前 · 実物の `checkDoc`):
 *
 * | 受取金額 | 画面が名乗った額 | 実際の印紙税額 |
 * | ---: | ---: | ---: |
 * | 50,000 | 200 円 | 200 円 ✅ |
 * | 5,000,000 | **200 円** | **1,000 円** |
 * | 30,000,000 | **200 円** | **6,000 円** |
 * | 2,000,000,000 | **200 円** | **200,000 円** (**1,000 倍**) |
 *
 * ★ **向きが過少申告である** —— 印紙税法20条の過怠税は不足額の **3 倍**。
 * しかもこの数字は画面で読んで**紙に貼る**もので、書式は収入印紙枠を実際に刷る。
 *
 * ★ **同じ studio の他の課税文書は、この誤りを犯していない** —— 第1号の3 と第2号は
 * 階級制なので金額を名乗らず、第7号 (4,000円) は本当に定額。
 * **金額を手に持っている唯一の書式だけが、1 階級の数を答えとして名乗っていた。**
 *
 * ## この検査の形
 *
 * - **階級の名前は独立に導く** —— 期待値を表から写すと、表が誤っていても一致してしまう。
 *   `upTo` の境目から日本語のラベルを組み直して突き合わせる (誤った階級名と、
 *   文字列リテラルを潰す変異体の両方が鳴る)。
 * - **境目は表から回す** —— 階級を 1 本足した日も、その境目が自動で検査に入る。
 * - **背骨は振る舞い** —— 実物の `checkDoc` を実物の書式に当て、**画面に出る文**が
 *   その階級の額を名乗ることを見る。
 * - **母集団は原文の走査** —— 印紙税を述べる指摘を全部拾い、理由つきの台帳と**両方向**。
 *   階級制の文が税額をリテラルで名乗っていたら鳴る (= この欠陥そのものの形)。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  RECEIPT_STAMP_BANDS,
  RECEIPT_STAMP_FLOOR,
  checkDoc,
  receiptStampDuty,
} from '../docStudioChecks';
import { STUDIO_TEMPLATES } from '../docStudioData';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { messageSource, objectsMatching } from './docCheckSource';

const SRC = readOriginalSource(join(__dirname, '..', 'docStudioChecks.ts'));

const RYOSHU = STUDIO_TEMPLATES.find((d) => d.id === 'ryoshu')!;

/** ＊ を含め全欄を埋めた素の入力 (金額だけを動かす)。 */
function filled(amount: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of RYOSHU.fields) v[f.k] = f.def ?? (f.num ? '1' : 'x');
  v['amount'] = amount;
  return v;
}

const stampIssues = (amount: string) => checkDoc(RYOSHU, filled(amount)).filter((i) => i.message.includes('印紙'));

/** 円 → 「N万」「N億」。**表のラベルを写さずに組み直すための独立した実装**。 */
function ja(n: number): string {
  return n >= 100_000_000
    ? `${(n / 100_000_000).toLocaleString('ja-JP')}億`
    : `${(n / 10_000).toLocaleString('ja-JP')}万`;
}

/** 階級の名前を境目から組み直す (`lo` は 1 つ前の上限・先頭は null)。 */
function bandLabel(lo: number | null, hi: number): string {
  if (lo === null) return `${ja(hi)}円以下`;
  return Number.isFinite(hi) ? `${ja(lo)}円超${ja(hi)}円以下` : `${ja(lo)}円超`;
}

describe('受取書の印紙税 — 階級の表', () => {
  it('★ 階級の名前は境目から導いたものと一致する (ラベルを写していない)', () => {
    for (const [i, b] of RECEIPT_STAMP_BANDS.entries()) {
      const lo = i === 0 ? null : RECEIPT_STAMP_BANDS[i - 1]!.upTo;
      expect(b.band, `階級 ${i}`).toBe(bandLabel(lo, b.upTo));
    }
    expect(RECEIPT_STAMP_BANDS.length, '階級の数 (床)').toBeGreaterThanOrEqual(14);
  });

  it('★ 上限も税額も単調に増え、最後の階級は上限なし', () => {
    for (let i = 1; i < RECEIPT_STAMP_BANDS.length; i += 1) {
      const prev = RECEIPT_STAMP_BANDS[i - 1]!;
      const cur = RECEIPT_STAMP_BANDS[i]!;
      expect(cur.upTo, `上限 ${i}`).toBeGreaterThan(prev.upTo);
      expect(cur.yen, `税額 ${i}`).toBeGreaterThan(prev.yen);
    }
    // ここが有限になると `receiptStampDuty` の `return null` が本物の穴になる
    // (高額の受取書で「印紙は不要」と黙ることになる)。
    expect(RECEIPT_STAMP_BANDS[RECEIPT_STAMP_BANDS.length - 1]!.upTo).toBe(Number.POSITIVE_INFINITY);
  });

  it('★ 境目ちょうどはその階級・+1 は次の階級 (表から回す)', () => {
    for (const [i, b] of RECEIPT_STAMP_BANDS.entries()) {
      if (!Number.isFinite(b.upTo)) continue;
      expect(receiptStampDuty(b.upTo), `${b.band} の上限ちょうど`).toBe(b);
      expect(receiptStampDuty(b.upTo + 1), `${b.band} の上限 +1`).toBe(RECEIPT_STAMP_BANDS[i + 1]);
    }
  });

  it('★ 5 万円未満は非課税・読めない金額は null', () => {
    expect(RECEIPT_STAMP_FLOOR).toBe(50_000);
    expect(receiptStampDuty(RECEIPT_STAMP_FLOOR - 1), '床の 1 円下').toBeNull();
    expect(receiptStampDuty(RECEIPT_STAMP_FLOOR), '床ちょうど').toBe(RECEIPT_STAMP_BANDS[0]);
    expect(receiptStampDuty(0)).toBeNull();
    expect(receiptStampDuty(Number.NaN), '読めない金額').toBeNull();
  });
});

describe('受取書の印紙税 — 画面に出る文 (振る舞い)', () => {
  it('★ どの階級でも、その階級の額を名乗る (直す前は 14 階級すべてで 200 円だった)', () => {
    for (const [i, b] of RECEIPT_STAMP_BANDS.entries()) {
      const amount = Number.isFinite(b.upTo) ? b.upTo : 2_000_000_000;
      const issues = stampIssues(String(amount));
      expect(issues, `${b.band}: 指摘が 1 件`).toHaveLength(1);
      const msg = issues[0]!.message;
      expect(msg, `${b.band}: 階級を名乗る`).toContain(b.band);
      expect(msg, `${b.band}: 税額を名乗る`).toContain(`${b.yen.toLocaleString('ja-JP')} 円`);
      expect(msg, `${b.band}: 受取金額を名乗る`).toContain(amount.toLocaleString('ja-JP'));
      // 欠陥そのもの —— 先頭以外の階級で 200 円と言ってはいけない。
      if (i > 0) expect(msg, `${b.band}: 200 円と言わない`).not.toContain('印紙税額は 200 円');
    }
  });

  it('★ 非課税・読めない金額では 1 件も出さない', () => {
    expect(stampIssues(String(RECEIPT_STAMP_FLOOR - 1))).toHaveLength(0);
    expect(stampIssues('abc')).toHaveLength(0);
    expect(stampIssues(''), '未入力').toHaveLength(0);
  });

  it('★ 段階は info のまま (印紙は紙を作る時に貼る物で、領収の効力は変わらない)', () => {
    const issues = stampIssues('5000000');
    expect(issues[0]!.level).toBe('info');
    expect(issues[0]!.basis).toBe('印紙税法（課税物件表第17号の1）');
  });
});

/** 非課税の床を述べる句 (税額ではないので、税額の走査から先に落とす)。 */
const FLOOR_CLAUSE = /[0-9０-９][0-9０-９,，]*(?:万|億)?円(?:未満|以下)は非課税/g;
/** 文がリテラルで名乗る 円 の数。 */
const YEN = /[0-9０-９][0-9０-９,，]*\s*(?:万|億)?円/g;

/** 非課税の床を除いた、文がリテラルで名乗る金額。 */
function dutyFigures(message: string): readonly string[] {
  return message.replace(FLOOR_CLAUSE, '').match(YEN) ?? [];
}

interface StampRow {
  /** message の書き出し 20 字 (補間を落として・空白を除く)。 */
  readonly key: string;
  /** 課税物件表の号。 */
  readonly article: string;
  /** 税額が記載金額の階級で決まるか、記載金額によらない定額か。 */
  readonly rate: 'flat' | 'graduated';
  /** 非課税の床を除いて、文がリテラルで名乗る金額。**階級制なら空でなければならない**。 */
  readonly literalYen: readonly string[];
  readonly why: string;
}

/** 印紙税を述べる指摘の全件。**両方向** —— 増えても減っても鳴る。 */
const STAMP_LEDGER: readonly StampRow[] = [
  {
    key: '紙で作成する場合は印紙税第1号の3文書と', article: '第1号の3', rate: 'graduated', literalYen: [],
    why: '消費貸借。階級制なので「記載金額に応じた収入印紙」と述べて金額を名乗らない。',
  },
  {
    key: '請負に関する注文請書は印紙税第2号文書と', article: '第2号', rate: 'graduated', literalYen: [],
    why: '請負。階級制で、この規則は金額を受け取らないので個別の税額を出せない。名乗るのは非課税の床だけ。',
  },
  {
    key: '継続的取引の基本となる契約書は印紙税第7', article: '第7号', rate: 'flat', literalYen: ['4,000円'],
    why: '第7号は記載金額によらない定額 4,000 円。**本当に定額なので名乗ってよい**。',
  },
  {
    key: '紙で交付する受取書には収入印紙が必要です', article: '第17号の1', rate: 'graduated', literalYen: [],
    why: '売上代金に係る受取書。階級制で、この書式だけが金額を持つので税額は表から導く (パス 438)。',
  },
];

function stampMessages(): readonly { readonly body: string; readonly message: string }[] {
  const out: { body: string; message: string }[] = [];
  for (const body of objectsMatching(SRC, /level:\s*'(?:fatal|warn|info)'/)) {
    const message = messageSource(body);
    if (message !== null && message.includes('印紙')) out.push({ body, message });
  }
  return out;
}

const keyOf = (message: string): string => message.replace(/\s+/g, '').slice(0, 20);

describe('印紙税を述べる指摘 — 母集団 (原文の走査)', () => {
  it('★ 印紙税を述べる指摘はすべて台帳に在る (両方向)', () => {
    const found = stampMessages().map((m) => keyOf(m.message));
    expect([...found].sort(), '走査 vs 台帳').toEqual([...STAMP_LEDGER.map((r) => r.key)].sort());
    expect(found.length, '走査が空虚でない (床)').toBeGreaterThanOrEqual(4);
  });

  it('★ 階級制の文は税額をリテラルで名乗らない (導くなら補間する)', () => {
    const byKey = new Map(stampMessages().map((m) => [keyOf(m.message), m] as const));
    for (const row of STAMP_LEDGER) {
      const found = byKey.get(row.key);
      expect(found, row.key).toBeDefined();
      expect(dutyFigures(found!.message), `${row.article}: リテラルで名乗る金額`).toEqual([...row.literalYen]);
      if (row.rate === 'graduated') {
        const derives = found!.body.includes('${');
        expect(
          row.literalYen.length === 0 || derives,
          `${row.article}: 階級制なのに税額をリテラルで名乗っている`,
        ).toBe(true);
      }
    }
  });

  it('★ 針は的に当たる —— 直す前の文は税額をリテラルで名乗っていた (標本)', () => {
    const before = '紙で交付する受取書は、受取金額5万円以上で収入印紙が必要です（5万円以上100万円以下は200円）。'
      + '消費税額を区分記載していれば税抜金額で判定できます。電子交付なら不要です。';
    expect(dutyFigures(before), '直す前の文').toContain('200円');
    // 非課税の床だけを述べる文は、床の句を落としたあと空になる (針が床で鳴らないこと)。
    expect(dutyFigures('請負に関する注文請書は課税されます（1万円未満は非課税）。')).toEqual([]);
  });

  it('★ 台帳の理由は省略形でない', () => {
    for (const row of STAMP_LEDGER) {
      expect(row.why.length, row.article).toBeGreaterThanOrEqual(15);
      expect(row.why, row.article).not.toMatch(/^同上[。）)]?$/);
    }
  });
});
