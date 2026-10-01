/**
 * 書類スタジオの交付前チェック —— **指摘の中身 (段階・欄・根拠条文・文面) を値ごと留める**
 * (2026-09-30 · パス 502)
 *
 * 変異検査 (Stryker) が `docStudioChecks.ts` に残した「殺されていない変異体」を 1 件ずつ
 * 仕分けた。大半は**既存の検査が断片 (`toContain`) か、差引・届出の「出る側」しか見ていなかった**
 * ために生き残っていた:
 *
 *  - 指摘の `level` / `field` / `basis` (根拠条文) / 文面 —— 「この入力ならこの指摘が出る」は
 *    見ていても、段階や根拠条文を空文字に替えてもどの検査も落ちなかった。**根拠条文は利用者が
 *    読んで書類に残す**ので、空になって黙って通るのは困る。
 *  - 「出ない側」の境目 —— `決議額 > 0` / `標準賞与額 <= 0` / `Number.isFinite(…)` /
 *    `届出日 !== ''` ほか。読めない入力・空欄・境目ちょうどで**指摘が出ないこと**を見ていなかった。
 *  - 書式が宣言しない物 —— 合計の行に `minus` が無い書面・欄の一覧に無い鍵・本文に表が無い書面。
 *
 * ## 期待値の作り方
 *
 * **原文の式から組まない** (原文と同じ式で組むと、原文が変わったときに両辺が一緒に動いて素通りする)。
 * 金額・日付・条文番号は、この検査の中で**独立に書き下した値**で、指摘は `toEqual` で
 * **オブジェクトごと** (段階・欄・文面・根拠) 留める。「出ない」側はすべて、同じ器で**出る側の標本**
 * (対照) を添えて、針が的に当たることを示す。
 *
 * 対象を引くのは `it` の中 (describe 直下で書くと、例外を投げる変異体が「テスト失敗」ではなく
 * 「収集失敗 = テスト 0 件」になり、生存に数えられる)。
 */
import { describe, expect, it } from 'vitest';
import { STUDIO_TEMPLATES, type DocTable, type StudioDoc } from '../data/docStudioData';
import { blankCounts, checkDoc, parseJpDate, type DocIssue } from '../data/docStudioChecks';

type Values = Record<string, string>;

/** 書式を引く。**`it` の中で呼ぶ** (上の注記)。 */
const tpl = (id: string): StudioDoc => {
  const found = STUDIO_TEMPLATES.find((d) => d.id === id);
  if (!found) throw new Error(`template not found: ${id}`);
  return found;
};

/**
 * 文面が `prefix` で始まる指摘だけを取る。**段階・欄・根拠は選別に使わない** ——
 * それを留めるのがこの検査で、選別に使うと変異体が選別ごと消えて素通りする。
 */
const startingWith = (issues: readonly DocIssue[], prefix: string): DocIssue[] =>
  issues.filter((i) => i.message.startsWith(prefix));

const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString().slice(0, 10));

describe('parseJpDate — 和暦は先頭から、区切りには空白だけを挟んで読む', () => {
  it('和暦の前の空白 (半角・全角・タブ) は落として読む', () => {
    for (const raw of ['  令和8年9月30日', '　令和8年9月30日', ' R8.9.30', '\t令8/9/30']) {
      expect(iso(parseJpDate(raw)), JSON.stringify(raw)).toBe('2026-09-30');
    }
    // 対照: 空白が無くても同じ日に読める (標本が的に当たる)
    expect(iso(parseJpDate('令和8年9月30日'))).toBe('2026-09-30');
  });

  it('和暦は先頭から読む —— 日付の前に別の語が付いた入力は日付に読まない', () => {
    // 文中に埋まった "R8.9.30" や "令和8年9月30日" まで日付に読むと、
    // 「納期R8.9.30」のような散文を法定の判定 (60 日・30 日) に流してしまう。
    for (const raw of ['第令和8年9月30日', '支払は令和8年9月30日', 'xR8.9.30', '納期R8.9.30']) {
      expect(parseJpDate(raw), JSON.stringify(raw)).toBeNull();
    }
    // 対照: 同じ日付でも先頭から書けば読める
    expect(iso(parseJpDate('令和8年9月30日'))).toBe('2026-09-30');
    expect(iso(parseJpDate('R8.9.30'))).toBe('2026-09-30');
  });

  it('年・月と区切りの間には空白だけを挟める。別の字は挟めない', () => {
    for (const raw of ['令和8ヶ年9月30日', '令和8年9ヶ月30日', 'R8ヶ.9.30', 'R8.9ヶ.30']) {
      expect(parseJpDate(raw), JSON.stringify(raw)).toBeNull();
    }
    // 対照: 空白を挟んだ書き方は読める
    for (const raw of ['令和 8 年 9 月 30 日', 'R 8 . 9 . 30', '令和8 年9 月30日']) {
      expect(iso(parseJpDate(raw)), JSON.stringify(raw)).toBe('2026-09-30');
    }
  });

  it('月は 1〜2 桁で読む (10・11・12 月も和暦で書ける)', () => {
    expect(iso(parseJpDate('令和8年12月30日'))).toBe('2026-12-30');
    expect(iso(parseJpDate('令和8年10月1日'))).toBe('2026-10-01');
    expect(iso(parseJpDate('R8.11.2'))).toBe('2026-11-02');
    // 対照: 1 桁の月
    expect(iso(parseJpDate('令和8年2月3日'))).toBe('2026-02-03');
  });
});

describe('読めない日付の断り (検収書) — 欄名・文面・並びを値ごと留める', () => {
  /** 「日付として読み取れません」の指摘だけ。 */
  const unreadable = (issues: readonly DocIssue[]): DocIssue[] =>
    issues.filter((i) => i.message.includes('を日付として読み取れません'));

  it('納入（受領）日が読めないとき、その欄名で「60日以内の判定を行いませんでした」と言う', () => {
    const said = unreadable(checkDoc(tpl('kenshu'), { receiveDate: 'むかし', payday: '2026年11月29日' }));
    expect(said).toEqual([
      {
        level: 'warn',
        field: 'receiveDate',
        message: '「納入（受領）日」を日付として読み取れません（入力値: むかし）。60日以内の判定を行いませんでした。',
      },
    ]);
  });

  it('両方読めなければ、納入（受領）日 → 代金の支払期日の順に 1 件ずつ言う', () => {
    const said = unreadable(checkDoc(tpl('kenshu'), { receiveDate: 'むかし', payday: 'そのうち' }));
    expect(said).toEqual([
      {
        level: 'warn',
        field: 'receiveDate',
        message: '「納入（受領）日」を日付として読み取れません（入力値: むかし）。60日以内の判定を行いませんでした。',
      },
      {
        level: 'warn',
        field: 'payday',
        message: '「代金の支払期日」を日付として読み取れません（入力値: そのうち）。60日以内の判定を行いませんでした。',
      },
    ]);
  });

  it('空白だけの日付は「未入力」で「読めない」ではない。前後の空白は入力値から落として見せる', () => {
    // 半角だけ・全角だけの空白は未入力と同じ扱い (「読めない」と言うと、何も書いていない人に断る)。
    expect(unreadable(checkDoc(tpl('kenshu'), { receiveDate: '   ', payday: '　' }))).toEqual([]);
    // 対照: 読めない入力は前後の空白を落として文面に載せる
    const padded = unreadable(checkDoc(tpl('kenshu'), { receiveDate: '  むかし  ', payday: '2026年11月29日' }));
    expect(padded.map((i) => i.message)).toEqual([
      '「納入（受領）日」を日付として読み取れません（入力値: むかし）。60日以内の判定を行いませんでした。',
    ]);
  });

  it('書式の欄の一覧に無い鍵を指したときは、欄名の代わりに鍵をそのまま言う (黙って隠さない)', () => {
    const noFields: StudioDoc = { ...tpl('kenshu'), fields: [] };
    expect(unreadable(checkDoc(noFields, { payday: 'そのうち' }))).toEqual([
      {
        level: 'warn',
        field: 'payday',
        message: '「payday」を日付として読み取れません（入力値: そのうち）。60日以内の判定を行いませんでした。',
      },
    ]);
    // 対照: 欄が在れば欄名を言う
    expect(unreadable(checkDoc(tpl('kenshu'), { payday: 'そのうち' })).map((i) => i.message)).toEqual([
      '「代金の支払期日」を日付として読み取れません（入力値: そのうち）。60日以内の判定を行いませんでした。',
    ]);
  });
});

describe('差引支給額の検算 — 支払明細書 4 種', () => {
  /** 4 書面。`field` は差引の行が足す支給の欄の先頭 (指摘が指す欄)。 */
  const SHEETS = [
    {
      id: 'kyuyo-meisai',
      field: 'base',
      // 支給 200,000 + 12,000 = 212,000 / 控除 100,000 + 100,000 + 20,000 = 220,000
      values: { base: '200000', commuteFree: '12000', health: '100000', pension: '100000', residentTax: '20000' },
      message: '控除額の合計（220,000 円）が支給額の合計（212,000 円）を超えています。差引支給額が -8,000 円 になります。',
    },
    {
      id: 'shoyo-meisai',
      field: 'bonus',
      // 支給 300,000 + 5,000 = 305,000 / 控除 150,000 + 100,000 + 30,000 + 30,000 = 310,000
      values: { bonus: '300000', otherPay: '5000', health: '150000', pension: '100000', empIns: '30000', incomeTax: '30000' },
      message: '控除額の合計（310,000 円）が支給額の合計（305,000 円）を超えています。差引支給額が -5,000 円 になります。',
    },
    {
      id: 'yakuin-hoshu-meisai',
      field: 'hoshu',
      // 支給 100,000 + 1,000 = 101,000 / 控除 60,000 + 10,000 + 30,000 + 5,000 = 105,000
      values: { hoshu: '100000', otherPay: '1000', health: '60000', care: '10000', pension: '30000', incomeTax: '5000' },
      message: '控除額の合計（105,000 円）が支給額の合計（101,000 円）を超えています。差引支給額が -4,000 円 になります。',
    },
    {
      id: 'yakuin-shoyo-meisai',
      field: 'bonus',
      // 支給 500,000 / 控除 300,000 + 250,000 = 550,000
      values: { bonus: '500000', health: '300000', pension: '250000' },
      message: '控除額の合計（550,000 円）が支給額の合計（500,000 円）を超えています。差引支給額が -50,000 円 になります。',
    },
  ] as const;

  it('控除が支給を超えたら、段階 (warn)・欄 (支給の先頭)・文面・根拠条文 (労基法24条1項) をそろえて 1 件出す', () => {
    for (const s of SHEETS) {
      expect(startingWith(checkDoc(tpl(s.id), s.values), '控除額の合計'), s.id).toEqual([
        { level: 'warn', field: s.field, message: s.message, basis: '労働基準法24条1項' },
      ]);
    }
  });

  it('支給か控除のどちらかが読めなければ、差引は検算しない (NaN を「超えている」と言わない)', () => {
    for (const s of SHEETS) {
      // 支給の欄が読めない / 空欄 (空欄は合計に 0 で入るが、先頭の欄が読めなければ合計も読めない)
      expect(startingWith(checkDoc(tpl(s.id), { [s.field]: 'abc', health: '1000' }), '控除額の合計'), `${s.id} / 支給が読めない`).toEqual([]);
      // 控除の欄が読めない
      expect(startingWith(checkDoc(tpl(s.id), { [s.field]: '100000', health: 'abc' }), '控除額の合計'), `${s.id} / 控除が読めない`).toEqual([]);
      // 対照: どちらも読めて控除が超えていれば出る
      expect(startingWith(checkDoc(tpl(s.id), { [s.field]: '100', health: '1000' }), '控除額の合計'), `${s.id} / 対照`).toHaveLength(1);
    }
  });

  it('差引の行 (minus つきの合計) を持たない書面では、検算そのものが成り立たないので黙る', () => {
    const base = tpl('kyuyo-meisai');
    type Sum = NonNullable<DocTable['sum']>;
    const docWith = (sum?: Sum): StudioDoc => ({
      ...base,
      fields: [],
      body: sum === undefined ? [] : [{ table: { head: ['', '金額'], rows: [], sum } }],
    });

    // 本文に表が無い (検算を行う相手が無い)
    expect(checkDoc(docWith(), { a: '-100', d: '100' }), '本文に表が無い').toEqual([]);
    // minus が空 (支給の側だけが負でも、引く相手が宣言されていない)
    expect(checkDoc(docWith({ label: '合計', keys: ['a'], minus: [] }), { a: '-100' }), 'minus が空').toEqual([]);
    // keys が空 (控除の側だけが在っても、引かれる相手が宣言されていない)
    expect(checkDoc(docWith({ label: '合計', keys: [], minus: ['d'] }), { d: '100' }), 'keys が空').toEqual([]);
    // minus を宣言しない普通の合計
    expect(checkDoc(docWith({ label: '合計', keys: ['a'] }), { a: '-100' }), '普通の合計').toEqual([]);

    // 対照: keys と minus が両方揃えば、同じ器で控除超過を警告する (標本が的に当たる)
    expect(checkDoc(docWith({ label: '差引', keys: ['a'], minus: ['d'] }), { a: '100', d: '300' })).toEqual([
      {
        level: 'warn',
        field: 'a',
        message: '控除額の合計（300 円）が支給額の合計（100 円）を超えています。差引支給額が -200 円 になります。',
        basis: '労働基準法24条1項',
      },
    ]);
  });
});

describe('標準賞与額の検算 — 賞与明細 2 種', () => {
  const BONUS_SHEETS = ['shoyo-meisai', 'yakuin-shoyo-meisai'] as const;

  it('標準賞与額が賞与額を超えたら、段階 (warn)・欄 (stdBonus)・文面・根拠条文 (健保法45条) をそろえて 1 件出す', () => {
    for (const id of BONUS_SHEETS) {
      // 役員賞与の側は賞与の欄を `bonus` と読む (鍵を取り違えると、この書面だけ検算が黙る)
      expect(startingWith(checkDoc(tpl(id), { bonus: '600000', stdBonus: '6000000' }), '標準賞与額'), id).toEqual([
        {
          level: 'warn',
          field: 'stdBonus',
          message:
            '標準賞与額（6,000,000 円）が賞与額（600,000 円）を超えています。'
            + '標準賞与額は賞与額の 1,000 円未満を切り捨てた額なので、賞与額を超えることはありません。',
          basis: '健康保険法45条',
        },
      ]);
    }
  });

  it('読めない・空欄・0 円・同額では検算しない (境目ちょうどまで)', () => {
    const NOT_CHECKED: ReadonlyArray<readonly [string, Values]> = [
      ['賞与額が読めない', { bonus: 'abc', stdBonus: '600000' }],
      ['標準賞与額が読めない', { bonus: '600000', stdBonus: 'abc' }],
      ['標準賞与額が空欄', { bonus: '600000', stdBonus: '' }],
      // 標準賞与額 0 = 算定していない。賞与額がマイナスの打ち間違いでも、ここでは検算しない (境目ちょうど)
      ['標準賞与額が 0 円', { bonus: '-100', stdBonus: '0' }],
      ['標準賞与額が賞与額と同額', { bonus: '600000', stdBonus: '600000' }],
    ];
    for (const id of BONUS_SHEETS) {
      for (const [label, values] of NOT_CHECKED) {
        expect(startingWith(checkDoc(tpl(id), values), '標準賞与額'), `${id} / ${label}`).toEqual([]);
      }
      // 対照: 1 円でも超えれば出る
      expect(startingWith(checkDoc(tpl(id), { bonus: '600000', stdBonus: '600001' }), '標準賞与額'), `${id} / 対照`).toHaveLength(1);
    }
  });
});

describe('請求書の明細 — 単価・数量が「緩い読みでは読めるが、金額の読みでは読めない」とき', () => {
  /** 品目 1 の単価・数量に関する指摘だけ (末尾の info や他の欄の指摘は混ぜない)。 */
  const item1 = (v: Values): DocIssue[] =>
    checkDoc(tpl('invoice'), { i1kind: '標準税率', ...v }).filter((i) => i.field === 'i1price' || i.field === 'i1qty');

  const PRICE_SAID = (raw: string): DocIssue => ({
    level: 'warn',
    field: 'i1price',
    message: `品目1 の単価「${raw}」を金額として読み取れません。金額 0 円として計算されます。`,
  });
  const QTY_SAID = (raw: string): DocIssue => ({
    level: 'warn',
    field: 'i1qty',
    message: `品目1 の数量「${raw}」を数として読み取れません。数量 0 として計算されます。`,
  });

  it('単価が読めなければ、段階 (warn)・欄 (単価)・文面をそろえて 1 件出す。品名が空でも単価が入った行は明細である', () => {
    expect(item1({ i1name: 'X', i1price: '30 000', i1qty: '1' })).toEqual([PRICE_SAID('30 000')]);
    // 品名の無い行 (単価だけ入った行) も明細として数える
    expect(item1({ i1price: '100m2' })).toEqual([PRICE_SAID('100m2')]);
  });

  it('数量が読めなければ、段階 (warn)・欄 (数量)・文面をそろえて 1 件出す。単価と両方なら単価 → 数量の順', () => {
    expect(item1({ i1name: 'X', i1price: '1000', i1qty: '2 個 3' })).toEqual([QTY_SAID('2 個 3')]);
    expect(item1({ i1name: 'X', i1price: '30 000', i1qty: '2 個 3' })).toEqual([PRICE_SAID('30 000'), QTY_SAID('2 個 3')]);
  });

  it('数量だけが入った行は明細ではないので、数量が読めなくても言わない (品名か単価が在れば言う)', () => {
    expect(item1({ i1qty: '2 個 3' })).toEqual([]);
    // 対照 (標本が的に当たる): 品名か単価が在れば同じ数量で言う
    expect(item1({ i1name: 'X', i1price: '1000', i1qty: '2 個 3' })).toEqual([QTY_SAID('2 個 3')]);
    expect(item1({ i1price: '1000', i1qty: '2 個 3' })).toEqual([QTY_SAID('2 個 3')]);
    // 品名だけの行は単価が未入力と言われ、数量の断りも並ぶ
    expect(item1({ i1name: 'X', i1qty: '2 個 3' }).map((i) => i.field)).toEqual(['i1price', 'i1qty']);
  });

  it('緩い読みでも読めない入力 (abc) は総称の断りだけが言う (この規則と 2 件並ばない)', () => {
    const generic = (label: string, raw: string, field: string): DocIssue => ({
      level: 'warn',
      field,
      message: `「${label}」を数値として読み取れません（入力値: ${raw}）。`,
    });
    expect(item1({ i1name: 'X', i1price: '1000', i1qty: 'abc' })).toEqual([generic('品目1 数量', 'abc', 'i1qty')]);
    expect(item1({ i1name: 'X', i1price: 'abc', i1qty: '1' })).toEqual([generic('品目1 単価（税抜・円）', 'abc', 'i1price')]);
  });

  it('空欄は「読めない」と言わない。数量の空欄は何も言わず、単価の空欄だけが「未入力」と言う', () => {
    // 数量は空欄でよい (言わない)
    expect(item1({ i1name: 'X', i1price: '1000' })).toEqual([]);
    // 単価の空欄は「未入力」の文面だけ (「読み取れません」とは言わない)
    expect(item1({ i1name: 'X' })).toEqual([
      { level: 'warn', field: 'i1price', message: '品目1 の単価が未入力です。金額 0 円として計算されます。' },
    ]);
  });

  it('読める単価・数量では何も言わない (いつでも鳴る形になっていない)', () => {
    expect(item1({ i1name: 'X', i1price: '1,234', i1qty: '3' })).toEqual([]);
    expect(item1({ i1name: 'X', i1price: '１，２３４', i1qty: '1.5' })).toEqual([]);
  });
});

describe('役員報酬の定期同額給与 — 決議による月額との食い違い', () => {
  const teiki = (v: Values): DocIssue[] => startingWith(checkDoc(tpl('yakuin-hoshu-meisai'), v), '決議による月額');

  it('決議の月額と支給額が違えば、段階 (warn)・欄 (hoshu)・文面・根拠条文 (法人税法34条1項1号) をそろえて 1 件出す', () => {
    expect(teiki({ resolutionAmount: '800000', hoshu: '900000' })).toEqual([
      {
        level: 'warn',
        field: 'hoshu',
        message:
          '決議による月額（800,000 円）と支給額（900,000 円）が一致しません。'
          + '定期同額給与から外れると、その差額は原則として損金不算入です。'
          + '定時改定・業績の著しい悪化による改定に当たるか確認してください。',
        basis: '法人税法34条1項1号',
      },
    ]);
  });

  it('決議額が無い (空欄・読めない・0 円・負) か、支給額が読めないか、一致していれば出さない', () => {
    const NOT_SAID: ReadonlyArray<readonly [string, Values]> = [
      ['支給額が読めない', { resolutionAmount: '800000', hoshu: 'abc' }],
      ['支給額が空欄', { resolutionAmount: '800000', hoshu: '' }],
      ['決議額が読めない', { resolutionAmount: 'abc', hoshu: '900000' }],
      ['決議額が空欄', { resolutionAmount: '', hoshu: '900000' }],
      // 決議額 0 = 決議していない。境目ちょうど
      ['決議額が 0 円', { resolutionAmount: '0', hoshu: '900000' }],
      ['決議額が負', { resolutionAmount: '-800000', hoshu: '900000' }],
      ['一致している', { resolutionAmount: '800000', hoshu: '800000' }],
    ];
    for (const [label, values] of NOT_SAID) expect(teiki(values), label).toEqual([]);
    // 対照: 決議額が 1 円でも在って違えば出る
    expect(teiki({ resolutionAmount: '1', hoshu: '900000' })).toHaveLength(1);
  });
});

describe('役員賞与の事前確定届出給与 — 届出どおりの支給か', () => {
  /** 届出どおり・届出日あり・根拠は事前確定届出給与。ここから 1 つずつ壊す。 */
  const consistent = (): Values => {
    const kinds = tpl('yakuin-shoyo-meisai').fields.find((f) => f.k === 'kind')?.options;
    const notified = kinds?.[0];
    if (notified === undefined || !notified.startsWith('事前確定届出給与')) throw new Error('1 番目の選択肢が事前確定届出給与であること');
    return {
      kind: notified,
      notifiedDate: '2026年12月10日',
      payDate: '2026年12月10日',
      notifiedAmount: '1200000',
      bonus: '1200000',
      notifyDate: '2026年7月31日',
    };
  };
  const run = (over: Values): readonly DocIssue[] => checkDoc(tpl('yakuin-shoyo-meisai'), { ...consistent(), ...over });

  it('届出どおりなら、この書面の規則は何も言わない (壊す前の出発点)', () => {
    expect(startingWith(run({}), '届出した支給')).toEqual([]);
    expect(startingWith(run({}), '事前確定届出給与の届出日')).toEqual([]);
    expect(startingWith(run({}), '事前確定届出給与・業績連動給与')).toEqual([]);
  });

  it('根拠が「いずれにも当たらない」なら、段階 (warn)・欄 (kind)・文面・根拠条文 (法人税法34条1項) をそろえて言い、届出の突合は行わない', () => {
    const none = tpl('yakuin-shoyo-meisai').fields.find((f) => f.k === 'kind')?.options?.[2];
    expect(none, '3 番目の選択肢が「いずれにも当たらない」であること').toMatch(/^いずれにも当たらない/);
    // 届出の日付・額が食い違っていても、届出していない書面なので突合は行わない
    const issues = run({ kind: none!, payDate: '2026年12月11日', bonus: '1000000' });
    expect(startingWith(issues, '事前確定届出給与・業績連動給与のいずれにも当たらない')).toEqual([
      {
        level: 'warn',
        field: 'kind',
        message: '事前確定届出給与・業績連動給与のいずれにも当たらない役員賞与は、全額が損金不算入です。',
        basis: '法人税法34条1項',
      },
    ]);
    expect(startingWith(issues, '届出した支給')).toEqual([]);
  });

  it('届出した支給日と実際の支給日が違えば、段階 (fatal)・欄 (payDate)・文面・根拠条文 (法人税法34条1項2号) をそろえて 1 件出す', () => {
    expect(startingWith(run({ payDate: '2026年12月11日' }), '届出した支給日')).toEqual([
      {
        level: 'fatal',
        field: 'payDate',
        message:
          '届出した支給日（2026年12月10日）と実際の支給日（2026年12月11日）が一致していません。'
          + '事前確定届出給与を届出どおりに支給しない場合、原則として賞与の全額が損金不算入になります。',
        basis: '法人税法34条1項2号',
      },
    ]);
  });

  it('どちらかの日付が空欄なら、支給日の突合は行わない (空欄と違う日を「食い違い」と言わない)', () => {
    expect(startingWith(run({ notifiedDate: '', payDate: '2026年12月11日' }), '届出した支給日'), '届出した日が空欄').toEqual([]);
    expect(startingWith(run({ notifiedDate: '2026年12月10日', payDate: '' }), '届出した支給日'), '実際の日が空欄').toEqual([]);
    expect(startingWith(run({ notifiedDate: '', payDate: '' }), '届出した支給日'), '両方空欄').toEqual([]);
    // 対照: 両方在って違えば出る
    expect(startingWith(run({ notifiedDate: '2026年12月10日', payDate: '2026年12月11日' }), '届出した支給日')).toHaveLength(1);
  });

  it('届出した支給額と実際の支給額が違えば、段階 (fatal)・欄 (bonus)・文面・根拠条文 (法人税法34条1項2号) をそろえて 1 件出す', () => {
    expect(startingWith(run({ bonus: '1000000' }), '届出した支給額')).toEqual([
      {
        level: 'fatal',
        field: 'bonus',
        message:
          '届出した支給額（1,200,000 円）と実際の支給額（1,000,000 円）が一致していません。'
          + '事前確定届出給与を届出どおりに支給しない場合、原則として賞与の全額（差額ではなく全額）が損金不算入になります。',
        basis: '法人税法34条1項2号',
      },
    ]);
  });

  it('届出額が無い (空欄・読めない・0 円) か、実際の額が読めなければ、額の突合は行わない', () => {
    const NOT_SAID: ReadonlyArray<readonly [string, Values]> = [
      ['実際の額が読めない', { notifiedAmount: '1200000', bonus: 'abc' }],
      ['実際の額が空欄', { notifiedAmount: '1200000', bonus: '' }],
      ['届出額が読めない', { notifiedAmount: 'abc', bonus: '1000000' }],
      ['届出額が空欄', { notifiedAmount: '', bonus: '1000000' }],
      // 届出額 0 = 届出していない。境目ちょうど
      ['届出額が 0 円', { notifiedAmount: '0', bonus: '1000000' }],
    ];
    for (const [label, over] of NOT_SAID) expect(startingWith(run(over), '届出した支給額'), label).toEqual([]);
    // 対照: 届出額が 1 円でも在って違えば出る
    expect(startingWith(run({ notifiedAmount: '1', bonus: '1000000' }), '届出した支給額')).toHaveLength(1);
  });

  it('届出日が空欄なら、段階 (warn)・欄 (notifyDate)・文面・根拠条文 (法人税法施行令69条4項) をそろえて 1 件出す', () => {
    expect(startingWith(run({ notifyDate: '' }), '事前確定届出給与の届出日が空欄です')).toEqual([
      {
        level: 'warn',
        field: 'notifyDate',
        message:
          '事前確定届出給与の届出日が空欄です。'
          + '届出の期限は、決議日から1か月を経過する日または事業年度開始日から4か月を経過する日のいずれか早い日です。',
        basis: '法人税法施行令69条4項',
      },
    ]);
  });
});

describe('未入力の数 (blankCounts) — 任意の欄を埋めると任意の側だけが減る', () => {
  it('任意の欄を 1 つ埋めると optional が 1 減り、required は動かない。空白だけの欄は未入力のまま', () => {
    const d = tpl('nda');
    const requiredTotal = d.fields.filter((f) => f.req).length;
    const optionalTotal = d.fields.length - requiredTotal;
    const optionalKey = d.fields.find((f) => !f.req)?.k;
    expect(optionalKey, '任意の欄の標本').toBeDefined();

    expect(blankCounts(d, { [optionalKey!]: '入力あり' })).toEqual({
      required: requiredTotal,
      requiredTotal,
      optional: optionalTotal - 1,
      optionalTotal,
    });
    // 空白だけは埋めたことにならない
    expect(blankCounts(d, { [optionalKey!]: '  　' }).optional).toBe(optionalTotal);
  });
});
