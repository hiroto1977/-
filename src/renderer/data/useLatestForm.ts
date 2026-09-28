import { useState } from 'react';
import { latestRecord } from './latestRecord';
import { latestTokenOf, sameLatest, type StoredRecord } from './store';
import { useCollection, type LatestApply } from './useCollection';

/**
 * **最新の 1 件を採用する設定の欄は、保管層が答えてから開き、保存のとき開いた時の最新がまだ最新かを
 * 確かめる。** (2026-09-28 · パス 500)
 *
 * 「最新の 1 件を採用する」collection (水耕栽培の設定・経営ハイライトのしきい値・提出者情報・運転の設定)
 * は、保存のたびに**全部の欄**を 1 件の新しい行として足し、読む側は最新の 1 件を使う。欄が古い値を
 * 持ったまま保存すると、その古い値が新しい最新になる —— 知らなかった保存は黙って覆われる。
 *
 * ## 直す前 (実測 2026-09-28)
 *
 * 経営サマリーの水耕栽培の欄は `useState(保存値 ?? 既定値)` で開いていた。保存値は `useCollection` が
 * IndexedDB から読むので**最初の描画ではまだ届いていない** —— 欄は既定値で開き、届いても開き直さない。
 * 実 chromium で同じ画面を 5 回開き直すと **5 回とも**欄は既定値 (床面積 330・段数 10・販売単価 150・
 * 人件費 3,000,000・地代家賃 600,000) で、同じ節の見出しは保存値から組んだ「日産 3,424 株」だった。
 * 販売単価だけ直して保存すると、**保存していた 4 欄 (床面積・段数・人件費・地代家賃) が既定値へ黙って
 * 戻った** —— 画面は「保存しました。経営サマリーに反映されています。」と言った。経営ハイライトのしきい値は
 * 読みの届く順で割れ、5 回のうち 2 回が既定値だった (1.5 秒待っても直らない)。
 *
 * ## この hook が約束すること
 *
 * 1. **保管層が答えるまで欄を出さない** (`ready`) —— 既定値で開いた欄は、それを出した時点で
 *    「保存値はこれです」と主張している。
 * 2. **まだ触っていない欄は最新に付いていく** —— 別のタブが保存すれば (パス 499 で知らせが届く) 開き直す。
 *    触った欄は開き直さない (打ち込んだ値を黙って捨てない)。
 * 3. **保存は、欄の元 (`base`) がまだ最新のときだけ** (`addIfLatest` —— 比べて足すまでが 1 つの取引)。
 *    違えば何も書かずに断り、入力を残し、元を今の最新へ移す (もう 1 度押せば、知ったうえで上書きする)。
 *    **保存を押した時点で、欄は見ている値に決まる** —— 触っていない欄でも、保存の間に届いた最新へ
 *    開き直さない (開き直すと、断った時に「保存していません」と言いながら入力が別の値へ入れ替わる)。
 * 4. **保存されている内容から始め直せる** (`loadSaved`) —— 入力を捨て、今の最新から開き直す。
 *
 * ## 読めなかったとき (正直に書く)
 *
 * 保管層の読みが失敗しても `useCollection` は `loading` を落とす (「読み込み中…」を永遠に出さない
 * ため) ので、欄は**既定値で開く**。そのときの失敗は端末の保存の報せが画面の上端に出す。欄は
 * 「保存値はこれです」とは言えないが、保存は守られている —— 元は `null` (何も無いと思って開いた)
 * なので、保管層に保存が在れば `addIfLatest` が断る。
 *
 * collection の購読はこの hook が持つ (`latest` を表示にも使う) —— 画面が別に `useCollection` を持って
 * 同じ collection を読むと、2 つの写しが別々の時に届いて一瞬食い違う。
 */
export interface LatestForm<T extends Record<string, unknown>, F> {
  /** 保存されている最新 (無ければ `null`)。表示にもこれを使う。 */
  readonly latest: StoredRecord<T> | null;
  /** 保管層が答えたか。答えるまで欄を出さない。 */
  readonly ready: boolean;
  readonly form: F;
  /**
   * 欄の元 —— 欄を開いた (または最後に付いていった) 時の最新。保存はこれがまだ最新のときだけ書く。
   * 欄に無い部分 (提出者情報の書式など) はここから取る。
   */
  readonly base: StoredRecord<T> | null;
  /** 欄が見ている値に決まっているか (触った・保存を押した)。決まっていれば最新に付いていかない。 */
  readonly dirty: boolean;
  /** 直前の保存を「開いた後に保存し直されていた」で断ったか。 */
  readonly changed: boolean;
  /** 欄を変える (触った印を立てる)。 */
  update(fn: (prev: F) => F): void;
  /** 保存する。書けたら `true`・断ったら `false` (入力は残り、元は今の最新へ移る)。 */
  save(data: T): Promise<boolean>;
  /** 入力を捨て、保存されている最新から開き直す。 */
  loadSaved(): void;
  /**
   * 今の最新に `change` を当てて足す (欄とは別の書き込み —— 書式を選んだ瞬間に保存する、など)。
   * 当てた行が**欄の元のまま**なら、元を足した行へ進める —— 進めないと、同じ画面の自分の書き込みを
   * 「別の画面の保存」として次の保存で断る。
   */
  applyToLatest(change: (current: StoredRecord<T> | null) => T | null): Promise<LatestApply<T>>;
}

interface State<T, F> {
  readonly form: F;
  readonly base: StoredRecord<T> | null;
  readonly dirty: boolean;
  readonly changed: boolean;
  readonly seeded: boolean;
  /** 欄を変えた回数 (減らない)。保存を待つ間に打ち込まれたかを、欄の同一性ではなくこれで見る。 */
  readonly edits: number;
}

export function useLatestForm<T extends Record<string, unknown>, F>(
  collection: string,
  toForm: (saved: T | null) => F,
): LatestForm<T, F> {
  const col = useCollection<T>(collection);
  const latest = latestRecord(col.records);
  const [st, setSt] = useState<State<T, F>>(() => ({
    form: toForm(null),
    base: null,
    dirty: false,
    changed: false,
    seeded: false,
    edits: 0,
  }));

  // **描画の中で合わせる** —— effect で合わせると、既定値の欄が 1 度描かれてから直る (その 1 回に
  // 打ち込んだ値は次の合わせで消える)。合わせた後は条件が偽になるので繰り返さない。
  if (!col.loading && (!st.seeded || (!st.dirty && !sameLatest(st.base, latest)))) {
    setSt((prev) => ({ ...prev, form: toForm(latest?.data ?? null), base: latest, dirty: false, changed: false, seeded: true }));
  }

  return {
    latest,
    // 開いたのは保管層が答えた後だけ (上の合わせは `loading` が落ちてから走る)。collection は hook の
    // 一生で変えない —— 変えるなら呼び手が `key` で作り直す (写しが別の collection の元を持ち越さない)。
    ready: st.seeded,
    form: st.form,
    base: st.base,
    dirty: st.dirty,
    changed: st.changed,
    update(fn) {
      setSt((prev) => ({ ...prev, form: fn(prev.form), dirty: true, edits: prev.edits + 1 }));
    },
    async save(data) {
      const editsAtSave = st.edits;
      // 押した時点で欄は見ている値に決まる (上の docblock の 3)。
      setSt((prev) => ({ ...prev, dirty: true }));
      const r = await col.addIfLatest(latestTokenOf(st.base), data);
      if (r.status === 'saved') {
        // 保存を待つ間に打ち込まれた値は「触った」ままにする (付いていく開き直しで消さない)。
        setSt((prev) => ({ ...prev, base: r.record, dirty: prev.edits !== editsAtSave, changed: false }));
        return true;
      }
      // 断った —— **入力は残す**。元は今の最新へ移す (もう 1 度押せば上書きする)。
      setSt((prev) => ({ ...prev, base: r.current, dirty: true, changed: true }));
      return false;
    },
    loadSaved() {
      setSt((prev) => ({ ...prev, form: toForm(latest?.data ?? null), base: latest, dirty: false, changed: false }));
    },
    async applyToLatest(change) {
      const r = await col.applyToLatest(change);
      if (r.status === 'saved') {
        setSt((prev) => (sameLatest(prev.base, r.basedOn) ? { ...prev, base: r.record } : prev));
      }
      return r;
    },
  };
}
