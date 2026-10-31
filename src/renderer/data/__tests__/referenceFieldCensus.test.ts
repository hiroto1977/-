/**
 * **参照は、参照先と同じ形でなければならない。** (2026-09-23 · パス 421)
 *
 * ## なぜ機械が要るか —— 3 パス続けて人が 1 件ずつ見つけた
 *
 * | パス | 見つけ方 | 見つけた物 |
 * | --- | --- | --- |
 * | 419 | 入口の天井の**定数**から母集団を引く | 15 欄 / 5 画面 |
 * | 420 | `COLLECTION_SHAPES` の**文字列の欄**から引く | 3 欄 (うち 1 つは天井でなく**参照の形**) |
 * | 421 | **画面の断りの文**を読んで気付く | `hydroponics-setup.cropId` (10,033 → **210,534 字**) |
 *
 * ★ **3 回とも針が違い、3 回とも前の針では見えなかった。** パス 421 の欄は
 *   一覧にも表にも出ず、**「参照が解決できなかったときの 1 文」の中にだけ**現れるので、
 *   419 の「入口の定数」にも 420 の「画面に出る自由文」にも掛からなかった。
 *
 * ## この検査が持つ不変条件
 *
 * **保管値が他の何かの id を指すなら、その欄は台帳に載り、行は 4 つのどれかを名乗る**:
 *
 * - `entrance-checked` —— 入口が参照先と同じ形を要求する (`parseBatch` の `CROP_ID_RE`)。
 * - `resolved-not-printed` —— 画面は**解決した先の値**しか刷らない (id そのものは出ない)。
 * - `printed-with-ceiling` —— id が文へ入るので、**天井を通す** (`cropIdText` ほか)。
 * - `write-only` —— その collection を**読み戻す画面が 1 つも無い** (実測)。
 *
 * **母集団は形の表から機械で引く** —— `COLLECTION_SHAPES[*].fields` (パス 130 が
 * 個人情報の走査のために足した runtime の欄名) を `*Id` / `*Ids` の綴りで濾す。
 * **両方向**である —— 形の表に参照の欄が増えれば「どれか名乗れ」と落ち、
 * 台帳に在る欄が形の表から消えても落ちる。
 *
 * ★ **最初に書いた版はこの主張が偽だった** —— docblock は「両方向」と述べながら、
 *   `referenceFields()` は**台帳をそのまま返していた** (母集団を 1 度も引いていない)。
 *   引き直したら **7 件**出て、**台帳に無い 1 件** (`connector-output.connectorId`) が
 *   在った。法則 `mention-vs-declaration` の、この検査自身での現れである。
 *
 * ★ **針の死角を測って書く** —— 針は綴り (`*Id`) なので、**id を指すのに
 *   そう綴られていない欄は映らない**。実測した 2 件はどちらも安全だった:
 *   `manual-overrides.path` は**固定の目録**に対する引きの鍵で (`byPath.get(f.path)` ——
 *   目録に無い path の行は画面に 1 行も出ない)、`manual-metrics.scope` は
 *   絞り込みの述語 (`r.data.scope === scope`) で、**どちらも刷らない**。
 *
 * ★ **分類は人が書く** —— 「その文字列が id を指すか」は綴りからは決まらない。
 *   機械が数えるのは**母集団**で、**なぜ安全かは散文が持つ**。
 */
import { describe, expect, it } from 'vitest';
import { COLLECTION_SHAPES } from '../collectionShapes';
import { CROP_ID_RE } from '../../../shared/hydroponicCrops';
import { parseBatch } from '../hydroponicsLog';
import { cropIdText, batchIdText } from '../../../shared/hydroponicsControl';

type Kind = 'entrance-checked' | 'resolved-not-printed' | 'printed-with-ceiling' | 'write-only';

interface Row {
  readonly collection: string;
  readonly field: string;
  readonly kind: Kind;
  /** 参照先 (何の id か)。 */
  readonly refersTo: string;
  readonly why: string;
}

/**
 * **実測した台帳** (2026-09-23 · どの行も実物を読んで・描いて確かめた)。
 */
const LEDGER: readonly Row[] = [
  {
    collection: 'hydroponics-batches', field: 'cropId', kind: 'entrance-checked',
    refersTo: '品目一覧の id (`CROP_ID_RE`)',
    why: 'パス 420 —— `parseBatch` が参照先と同じ式を要求する。画面に出る 2 か所は `cropIdText` の天井も通る。',
  },
  {
    collection: 'hydroponics-setup', field: 'cropId', kind: 'printed-with-ceiling',
    refersTo: '品目一覧の id (`CROP_ID_RE`)',
    why: 'パス 421 —— 入口 (`OverviewPage` の保存) は**解決した品目の id** を書くので構造的に安全だが、復元で入った値は「一覧にありません」の 1 文に載る。天井は `cropIdText`。',
  },
  {
    collection: 'hydroponics-readings', field: 'batchId', kind: 'resolved-not-printed',
    refersTo: 'ロットの id',
    why: '実測 —— 200,000 字を入れても画面に 1 文字も届かない (読み手は `batches.items.find` で解決し、見つからなければ `undefined` へ落ちる)。文へ入れる所は `batchIdText` を通る。',
  },
  {
    collection: 'manual-metrics', field: 'businessId', kind: 'resolved-not-printed',
    refersTo: '事業 (`business-units`) の行 id',
    why: '実測 —— `findBusinessName` が解決し、見つからなければ「事業の指定なし」。**id そのものは画面に出ない** (解決した名前は `BUSINESS_NAME_MAX` の天井を通る · パス 419)。',
  },
  {
    collection: 'shigyo-contacts', field: 'serviceId', kind: 'resolved-not-printed',
    refersTo: '`ServiceId`',
    why: '実測 —— 画面はこの欄で**絞り込む**だけで刷らない。知らない id の行はどの士業の画面にも現れない (消すのは設定の点検パネル · 法則 `escape-hatch-stays-open`)。',
  },
  {
    collection: 'shigyo-consultations', field: 'serviceId', kind: 'resolved-not-printed',
    refersTo: '`ServiceId`',
    why: '実測 —— 相談の一覧も同じ `serviceId` で絞り込むだけで刷らない。'
      + '★ **床が私の「同上」を捕まえた** —— 理由の欄に省略を書くと、'
      + '次に読む人は「連絡先と同じ」が**どの性質について同じ**なのかを自分で確かめ直すことになる。',
  },
  {
    collection: 'connector-output', field: 'connectorId', kind: 'write-only',
    refersTo: 'コネクタの id',
    why: '実測 —— この collection を**読み戻す画面が 1 つも無い** '
      + '(`CONNECTOR_OUTPUT_COLLECTION` の読みは 0 件・字面 `\'connector-output\'` も '
      + '書く側と検査にしか無い)。`ConnectorsPage` が刷る `s.connectorId` は '
      + '`resolveHookPlan` が組んだ**手順**の欄で、保管値ではない。'
      + '唯一この collection に触るのは点検パネルだが、そこが刷るのは '
      + '**collection の名前と件数だけ** (`summarizeMalformed`) なので、'
      + '長い id でも逃げ口は開いたままである (法則 `escape-hatch-stays-open`)。'
      + '★ **この行は、母集団を引き直して初めて出た** —— 人が読んで作った 6 行には無かった。',
  },
];

/**
 * **母集団を形の表から引く** —— 台帳は返さない (返すと両方向の主張が空になる · 上の ★)。
 * `fields` は `shape()` が付ける runtime の欄名で、宣言そのものから来る。
 */
function referenceFields(): { collection: string; field: string }[] {
  const out: { collection: string; field: string }[] = [];
  for (const [collection, shape] of Object.entries(COLLECTION_SHAPES)) {
    for (const field of shape.fields) {
      if (/Ids?$/.test(field)) out.push({ collection, field });
    }
  }
  return out;
}

const key = (r: { collection: string; field: string }): string => `${r.collection}.${r.field}`;

describe('参照の欄の母集団 (パス 421)', () => {
  it('★ 走査が死んでいない (形の表から実際に欄が引けている)', () => {
    const found = referenceFields();
    // 床 —— 母集団が空になったら「台帳が全部を覆っている」が自明に真になる。
    expect(found.length, '形の表から参照の欄が 1 つも引けない —— 走査が死んでいる').toBeGreaterThanOrEqual(7);
    // 引いた欄は実在する collection の実在する欄である。
    for (const f of found) {
      expect(COLLECTION_SHAPES[f.collection]!.fields, key(f)).toContain(f.field);
    }
  });

  it('★ 形の表の参照の欄は、すべて台帳に在る (増えたら「どれか名乗れ」と落ちる)', () => {
    const known = new Set(LEDGER.map(key));
    const missing = referenceFields().map(key).filter((k) => !known.has(k));
    expect(missing, `台帳に無い参照の欄: ${missing.join(' / ')} —— 種類と理由を書くこと`).toEqual([]);
  });

  it('★ 台帳の行は、すべて形の表に在る (消えた欄が残っていない)', () => {
    const found = new Set(referenceFields().map(key));
    for (const r of LEDGER) {
      expect(Object.hasOwn(COLLECTION_SHAPES, r.collection), `${r.collection} が形の表に無い`).toBe(true);
      expect(found.has(key(r)), `${key(r)} は形の表の参照の欄ではない —— 台帳から消すこと`).toBe(true);
    }
  });

  it('★ 行はどれも 4 つの種類のどれかを名乗り、理由が空でない', () => {
    const kinds: Kind[] = ['entrance-checked', 'resolved-not-printed', 'printed-with-ceiling', 'write-only'];
    for (const r of LEDGER) {
      expect(kinds, key(r)).toContain(r.kind);
      expect(r.why.length, `${key(r)} の理由が空`).toBeGreaterThan(20);
      expect(r.refersTo.length, `${key(r)} の参照先が空`).toBeGreaterThan(2);
    }
  });

  it('★ `entrance-checked` の行は、入口が参照先と同じ形を実際に断る (振る舞い)', () => {
    const good = { id: 'b1', cropId: 'leaf-lettuce', sowDate: '2026-09-01', panels: '10', state: 'nursery' };
    // 参照先の形に合う id は通る。
    expect(() => parseBatch(good)).not.toThrow();
    // 合わない id は断る —— **参照先の式そのもの**で確かめる (写しを作らない)。
    for (const bad of ['A B/C', '../../evil', 'x'.repeat(200)]) {
      expect(CROP_ID_RE.test(bad), `標本 ${bad.slice(0, 12)} が参照先の形に合ってしまう`).toBe(false);
      expect(() => parseBatch({ ...good, cropId: bad })).toThrow(/品目の id/);
    }
  });

  it('★ `printed-with-ceiling` の行の天井は、参照先の形が許す最大を超えない', () => {
    // 品目 id は `CROP_ID_RE` で 40 字までなので、天井 40 字は**正当な値を 1 つも切らない**。
    expect(cropIdText('leaf-lettuce')).toBe('leaf-lettuce');
    expect(CROP_ID_RE.test('a'.repeat(40))).toBe(true);
    expect(cropIdText('a'.repeat(40))).toBe('a'.repeat(40));
    // 参照先が作れない長さは切る。
    expect(CROP_ID_RE.test('a'.repeat(41))).toBe(false);
    expect(cropIdText('a'.repeat(200_000)).endsWith('…')).toBe(true);
    // ロット名も同じ形。
    expect(batchIdText('b1')).toBe('b1');
    expect(batchIdText('b'.repeat(200_000)).endsWith('…')).toBe(true);
  });
});
