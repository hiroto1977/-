import { useState, type CSSProperties, type ReactElement } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { busyLatestNote, unreadableForJudgementNote } from '../data/readCollectionNow';
import type { ChangeCrops, CropChangeOutcome } from '../data/useCropList';
import type { HydroponicCrop } from '../../shared/hydroponics';
import {
  CROP_FIELD_LABELS,
  CROP_NUMERIC_FIELDS,
  DEFAULT_CROP_LIST,
  addCrop,
  findCrop,
  isBuiltinCropId,
  missingBuiltinCrops,
  parseCropNumber,
  removeCrop,
  restoreBuiltinCrops,
  type CropListChange,
  type CropNumericField,
} from '../../shared/hydroponicCrops';

/**
 * 水耕栽培の品目を増やす・減らす欄 (2026-11-19)。
 *
 * この欄は経営サマリーの試算の中にだけ在った。運転管理の画面 (ロットを足す所) で品目を
 * 選ぶ人は、足したい品目が無いと画面を移って探すことになっていた —— 同じ欄を両方に置く。
 * 欄の中身はここに 1 つだけ持つ (画面ごとに書くと、守る約束が片方だけ古びる)。
 *
 * 守る約束:
 * - 変更は**保管層の今の最新**に当てる (`changeCrops` · 画面の写しには当てない)。
 * - 断られたら理由を出す (読めなかった・別の保存と重なった・入力の誤り・最後の 1 品目)。
 * - 最後の 1 品目は消せない。消した参考値の品目は戻せる。
 * - 値は桁と形だけ確かめる (正しさは実測で置き換える)。
 */

/** 品目の入力欄の文字列 (品目名 + 数値の欄)。 */
type CropDraftForm = Record<'label' | CropNumericField, string>;

/** 選んでいる品目の値を入力欄へ写す (似た品目から少し変えて足すのが普通の使い方)。 */
function cropDraftFrom(c: HydroponicCrop): CropDraftForm {
  const draft = { label: '' } as CropDraftForm;
  for (const f of CROP_NUMERIC_FIELDS) draft[f] = String(c[f]);
  return draft;
}

const cropFieldLabel: CSSProperties = {
  fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2,
};

const cropFieldInput: CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--control-border)', borderRadius: 6,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 90,
};

export interface CropListEditorProps {
  /** 今の品目の一覧 (購読の写し —— 表示に使う)。 */
  crops: readonly HydroponicCrop[];
  changeCrops: ChangeCrops;
  /** 入力欄の初期値の元にする品目 (画面で選んでいる品目)。 */
  seed: HydroponicCrop;
  /**
   * 足した品目を呼び手へ知らせ、**足した後に何が起きたか**の文を受け取る。
   * 画面ごとに違う (試算は「設定を保存するまで変わらない」・ロットは「品目に選んだ」) ので、
   * ここで 1 つの文に決めない。
   */
  onAdded: (added: HydroponicCrop) => string;
  /** 消した品目について添える文 (その品目を使うロットが在る、など)。無ければ何も添えない。 */
  removedNote?: (id: string) => string | null;
}

export function CropListEditor({ crops, changeCrops, seed, onAdded, removedNote }: CropListEditorProps): ReactElement {
  const [draft, setDraft] = useState<CropDraftForm>(() => cropDraftFrom(seed));
  const [cropNotice, setCropNotice] = useState<string | null>(null);
  const submit = useSubmitGuard();
  const missingBuiltins = missingBuiltinCrops(crops);

  /**
   * 一覧の増減を**今の一覧**に当てて保存し、当てる前と後の一覧を返す。断られたら文言を出して
   * null (投げない)。
   *
   * ★ 今の一覧は保管層から読み直す (パス 497)。品目の一覧は**まるごと 1 記録**で、変更の
   * たびに 1 件足して最新を採用する —— 購読の写し (`crops`) に当てていた頃は、別のタブで
   * 足した品目を知らないまま一覧を丸ごと書き、**その品目が消えた** (lost update・実測)。
   */
  const applyCrops = async (
    change: (current: readonly HydroponicCrop[]) => CropListChange,
  ): Promise<CropChangeOutcome & { ok: true } | null> => {
    const r = await changeCrops(change);
    if (r === null) {
      setCropNotice(unreadableForJudgementNote('品目の一覧', '今の品目の一覧'));
      return null;
    }
    if (r === 'busy') {
      setCropNotice(busyLatestNote('品目の一覧'));
      return null;
    }
    if (!r.ok) {
      setCropNotice(r.issues.join('。'));
      return null;
    }
    return r;
  };
  const onAddCrop = async () => {
    const done = await applyCrops((current) => addCrop(current, {
      ...draft,
      ...Object.fromEntries(CROP_NUMERIC_FIELDS.map((f) => [f, parseCropNumber(draft[f])])),
    }));
    if (done === null) return;
    const added = done.crops[done.crops.length - 1]!;
    setDraft((d) => ({ ...d, label: '' }));
    setCropNotice(onAdded(added));
  };
  const onRemoveCrop = async (id: string) => {
    const done = await applyCrops((current) => removeCrop(current, id));
    if (done === null) return;
    // 名前は**当てた一覧**から引く (画面の写しの行ではない —— 消したのはそちらの品目である)。
    const extra = removedNote?.(id) ?? null;
    setCropNotice(`「${findCrop(done.before, id)?.label ?? id}」を消しました。${extra ?? ''}`);
  };
  const onRestoreCrops = async () => {
    if ((await applyCrops(restoreBuiltinCrops)) === null) return;
    setCropNotice('参考値の品目を戻しました。');
  };

  return (
    <details data-crop-list-editor style={{ marginBottom: 10 }}>
      {/* 見出しは本文の色で少し太く —— 薄い小さな字だと、品目を選ぶ欄のすぐ上に在っても見落とす。 */}
      <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', minHeight: 24 }}>
        品目を増やす・減らす（現在 {crops.length} 品目）
      </summary>
      <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: 'var(--text-mute)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
          参考値の {DEFAULT_CROP_LIST.length} 品目は出発点です。自分の品目を足し、使わない品目は消せます
          （最後の 1 品目は消せません）。値は桁と形だけ確かめます — 正しさは実測で置き換えてください。
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.9 }}>
          {crops.map((c) => (
            <li key={c.id} data-crop-item={c.id}>
              {c.label}
              <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                {isBuiltinCropId(c.id) ? '（参考値）' : '（追加）'}
                育苗 {c.nurseryDays} 日・定植後 {c.growOutDays} 日・{c.harvestWeightG} g/株・パネル {c.plantsPerPanel} 穴
              </span>{' '}
              <button
                type="button"
                disabled={submit.busy || crops.length <= 1}
                aria-label={`${c.label} を消す`}
                onClick={() => fireReported(submit.run(() => onRemoveCrop(c.id)))}
                style={{ fontSize: 11 }}
              >
                消す
              </button>
            </li>
          ))}
        </ul>
        {missingBuiltins.length > 0 && (
          <div>
            <button type="button" onClick={() => fireReported(submit.run(onRestoreCrops))} disabled={submit.busy} style={{ fontSize: 11 }}>
              参考値の品目を戻す（{missingBuiltins.map((c) => c.label).join('・')}）
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={cropFieldLabel}>
            品目名
            <input
              type="text"
              value={draft.label}
              aria-label="品目名"
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              style={{ ...cropFieldInput, width: 150 }}
            />
          </label>
          {CROP_NUMERIC_FIELDS.map((f) => (
            <label key={f} style={cropFieldLabel}>
              {CROP_FIELD_LABELS[f]}
              <input
                type="text"
                inputMode="decimal"
                value={draft[f]}
                aria-label={CROP_FIELD_LABELS[f]}
                onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                style={cropFieldInput}
              />
            </label>
          ))}
          <button type="button" onClick={() => fireReported(submit.run(onAddCrop))} disabled={submit.busy}>
            この品目を足す
          </button>
        </div>
        {cropNotice && <div role="status" style={{ fontSize: 12, lineHeight: 1.6 }}>{cropNotice}</div>}
      </div>
    </details>
  );
}
