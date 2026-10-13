/**
 * **平文で書き出す前に「何が入るか」を言う分類は、形の表の全 collection を覆う。**
 * (2026-09-23 · パス 423)
 *
 * ## 見つけた欠陥
 *
 * 個人情報の判定は**欄の名前** (`email` / `phone` / `address` / `representative`) と、
 * 名前から導けない入れ子の台帳 (`NESTED_PERSONAL_DATA`) の 2 つから導かれていた。
 * どちらも**欄の名前**を手がかりにするので、**何を記録しているかだけが機微**な
 * collection は母集団に入らない。実測 (2026-09-23 · 直す前):
 *
 * | 利用者 | 直す前 | 直した後 |
 * | --- | --- | --- |
 * | 士業の相談記録だけ 3 件 | **確認文が `null`** (無言で平文へ書く) | 「…3 件入ります: 士業の相談記録 3 件」 |
 * | 連絡先 1 + 相談 2 | **「個人情報を含む記録が 1 件入ります」** | 「…3 件入ります: 連絡先 1 件・相談記録 2 件」 |
 *
 * ★ **2 つ目のほうが鋭い** —— 確認文は**数を名乗る**ので、過少申告は
 *   「1 件なら平文でいいか」と利用者を**油断させる向き**に外れる。
 *   パス 422 (「60 文字まで」と言って 31 文字で断る) と同じ家系で、
 *   **アプリが数を述べ、その数が実物と違う**。
 *
 * ★ **同じ士業 CRM の中で分類が割れていた** —— 連絡先 (電話・メール) は個人情報と
 *   判定されるのに、**「いつ・どの士業に・何を相談したか」**は判定されない。
 *   入口の placeholder は「例: 決算前の節税相談」で、弁護士・司法書士の画面なら
 *   相続・解雇・破産の相談テーマがそのまま入る。
 *
 * ## この検査が持つ不変条件
 *
 * **形の表のどの collection も、4 つのどれか 1 つに属する**:
 *
 * - `field-name` —— 欄の名前で走査に当たる
 * - `nested` —— 入れ物の形なので台帳 (`NESTED_PERSONAL_DATA`)
 * - `content` —— 中身で機微なので台帳 (`SENSITIVE_BY_CONTENT`)
 * - `not-sensitive` —— **理由つきで**「持ち出しても困らない」と述べる
 *
 * ★ **床が私の「同上」を 3 つ捕まえた** (パス 421 と同じ) —— 省略を書くと、次に読む人は
 *   「何について同じなのか」を自分で確かめ直すことになる。**理由は毎行その行のことを言う。**
 *
 * **両方向**である —— 形の表に collection が増えれば「どれか名乗れ」と落ち、
 * 台帳に在る collection が形の表から消えても落ちる。
 * **理由の無い `not-sensitive` は認めない** —— この欠陥は「機微でないと判断した」
 * のではなく「**誰も問わなかった**」ために起きた。理由の欄が、問わせる。
 */
import { describe, expect, it } from 'vitest';
import {
  COLLECTION_SHAPES,
  NESTED_PERSONAL_DATA,
  PERSONAL_DATA_FIELDS,
  SENSITIVE_BY_CONTENT,
  personalDataCollections,
} from '../collectionShapes';
import { PERSONAL_DATA_LABELS, plaintextBackupConfirmMessage, plaintextExposure } from '../backup';

/**
 * **持ち出しても困らないと judged した collection と、その理由** (2026-09-23 実測)。
 *
 * 「自社の数値」と「第三者や自分について語る記録」の線で引いている ——
 * 確認文の目的は「持ち出す・共有するときに困るか」なので、
 * 自社の売上や栽培の運転値はここに入り、人について語る記録は上の 3 分類へ行く。
 */
const NOT_SENSITIVE: Readonly<Record<string, string>> = {
  'sales-entries': '自社の売上の記録。`note` は注文名 (重複の判定に使う) で、第三者の氏名・連絡先を入れる欄ではない。',
  'kpi-actuals': '自社の月次の数値 (売上・原価・販管費ほか)。人について語らない。',
  'kpi-budgets': '自社の月次の数値 (予算の側)。実績と同じ欄の並びで、人について語らない。',
  'balance-sheet': '自社の貸借対照表の数値。人について語らない。',
  'business-units': '自社の事業の名前・区分・数値。法人の事業であって個人ではない。',
  'realestate-properties': '自分が保有する物件の名前と金額。第三者の情報ではない。'
    + '★ `name` に部屋番号まで書けば所在が分かるが、それは利用者自身の資産であり、'
    + '確認文が守ろうとしている「他人のデータを平文で持ち出す」形ではない。',
  'mutualfund-holdings': '自分が保有する銘柄と金額。第三者の情報ではない。',
  'parameter-overrides': '計算の前提 (法定値・参考値・しきい値) の上書き。数だけで、人について語らない。',
  'manual-overrides': '経営サマリーの数値の手入力 (どのパスに何を置いたか)。数だけ。',
  'manual-metrics': '任意の指標の手入力 (項目名・値・メモ)。自社の数値についての覚書。',
  'overview-overrides': '経営サマリーの数値の手入力 (別名の collection)。数だけで、今日はどの画面も購読していない。',
  'overview-custom-metrics': '任意の指標の手入力 (別名の collection)。項目名・値・メモで、人について語らない。',
  'hydroponics-setup': '栽培の設備と単価の設定。人について語らない。',
  'hydroponics-crops': '品目の一覧。人について語らない。',
  'hydroponics-readings': '測定値と日時。人について語らない。',
  'hydroponics-batches': 'ロットの日程。人について語らない。',
  'hydroponics-control': '栽培の運転の目標域と調製の設定 (水温・EC・タンク容量ほか)。数だけ。',
  'highlight-settings': '経営ハイライトが警告を出すしきい値 (連続下落の回数・人件費率ほか)。数だけ。',
  'connector-output': 'コネクタの出力。★ `payload` は `any` なので形の上は何でも入るが、'
    + '今日の入力は `ConnectorsPage` のハードコードされた見本だけで、'
    + '利用者や第三者のデータが入る道は無い (実測)。入力が広がったらここを問い直す。',
};

type Kind = 'field-name' | 'nested' | 'content' | 'not-sensitive';

function kindOf(collection: string): Kind | null {
  const shape = COLLECTION_SHAPES[collection];
  if (shape !== undefined && shape.fields.some((f) => PERSONAL_DATA_FIELDS.includes(f))) return 'field-name';
  if (Object.hasOwn(NESTED_PERSONAL_DATA, collection)) return 'nested';
  if (Object.hasOwn(SENSITIVE_BY_CONTENT, collection)) return 'content';
  if (Object.hasOwn(NOT_SENSITIVE, collection)) return 'not-sensitive';
  return null;
}

describe('平文で書き出す前の分類 (パス 423)', () => {
  it('★ 走査が死んでいない (形の表に collection が在る)', () => {
    expect(Object.keys(COLLECTION_SHAPES).length, '形の表が空 —— 走査が死んでいる').toBeGreaterThanOrEqual(20);
  });

  it('★ 形の表のどの collection も 4 つのどれかを名乗る (増えたら「分類しろ」と落ちる)', () => {
    const unclassified = Object.keys(COLLECTION_SHAPES).filter((c) => kindOf(c) === null);
    expect(
      unclassified,
      `分類の無い collection: ${unclassified.join(' / ')} —— `
        + '持ち出すと困るなら SENSITIVE_BY_CONTENT へ、困らないなら NOT_SENSITIVE へ理由つきで',
    ).toEqual([]);
  });

  it('★ 台帳の行は形の表に在る (消えた collection が残っていない)', () => {
    for (const c of [...Object.keys(NESTED_PERSONAL_DATA), ...Object.keys(SENSITIVE_BY_CONTENT), ...Object.keys(NOT_SENSITIVE)]) {
      expect(Object.hasOwn(COLLECTION_SHAPES, c), `${c} は形の表に無い —— 台帳から消すこと`).toBe(true);
    }
  });

  it('★ 理由が空でない (「誰も問わなかった」を通さない)', () => {
    for (const [c, why] of Object.entries(NOT_SENSITIVE)) {
      expect(why.length, `${c} の理由が短すぎる`).toBeGreaterThan(15);
    }
    for (const [c, e] of Object.entries(SENSITIVE_BY_CONTENT)) {
      expect(e.why.length, `${c} の理由が短すぎる`).toBeGreaterThan(15);
      expect(e.fields.length, `${c} の欄が空`).toBeGreaterThan(0);
    }
  });

  it('★ 同じ collection が 2 つの分類に出ない', () => {
    for (const c of Object.keys(SENSITIVE_BY_CONTENT)) {
      expect(Object.hasOwn(NOT_SENSITIVE, c), `${c} が機微と非機微の両方に在る`).toBe(false);
      expect(Object.hasOwn(NESTED_PERSONAL_DATA, c), `${c} が 2 つの台帳に在る`).toBe(false);
    }
    for (const c of Object.keys(NESTED_PERSONAL_DATA)) {
      expect(Object.hasOwn(NOT_SENSITIVE, c), `${c} が機微と非機微の両方に在る`).toBe(false);
    }
  });

  it('★ 機微と判定した collection には表示名が在る', () => {
    for (const p of personalDataCollections()) {
      expect(PERSONAL_DATA_LABELS[p.collection], `${p.collection} の表示名が無い`).toBeDefined();
    }
  });

  // --- 振る舞い (この欠陥そのものの回帰) ---------------------------------

  const rec = (collection: string, n: number): { collection: string }[] =>
    Array.from({ length: n }, () => ({ collection }));

  it('★ 相談記録だけの利用者にも確認文が出る (直す前は null だった)', () => {
    const msg = plaintextBackupConfirmMessage(plaintextExposure(rec('shigyo-consultations', 3)));
    expect(msg, '相談記録だけだと無言で平文へ書いている').not.toBeNull();
    expect(msg!).toContain('3 件入ります');
    expect(msg!).toContain('士業の相談記録');
  });

  it('★ 件数は実物と一致する (直す前は 1 と言って 3 件入れていた)', () => {
    const records = [...rec('shigyo-contacts', 1), ...rec('shigyo-consultations', 2)];
    const x = plaintextExposure(records);
    expect(x.total, '確認文が名乗る件数が実物と違う').toBe(3);
    expect(plaintextBackupConfirmMessage(x)!).toContain('3 件入ります');
  });

  it('★ 自社の数値だけなら今までどおり確認しない (正当な答えは変えていない)', () => {
    const x = plaintextExposure([...rec('sales-entries', 5), ...rec('kpi-actuals', 3)]);
    expect(x.total).toBe(0);
    expect(plaintextBackupConfirmMessage(x)).toBeNull();
  });
});
