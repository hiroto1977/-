import { useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { busyLatestNote, unreadableForJudgementNote } from '../data/readCollectionNow';
import { parseCropNumber } from '../../shared/hydroponicCrops';
import {
  addFarmItem,
  findFarmItem,
  isFarmBuiltinId,
  missingFarmBuiltins,
  removeFarmItem,
  restoreFarmBuiltins,
  type FarmItem,
  type FarmListChange,
  type FarmListSpec,
} from '../../shared/farmProductList';

/**
 * 品目の一覧 (養蜂の産物・養殖の魚種) を増やす・減らす欄 (2026-11-18)。
 *
 * 水耕栽培の「品目を増やす・減らす」と同じ約束を守る:
 * - 変更は**保管層の今の最新**に当てる (`changeList` · 画面の写しには当てない)。
 * - 断られたら理由を出す (読めなかった・別の保存と重なった・入力の誤り・最後の 1 件)。
 * - 最後の 1 件は消せない。消した参考の品目は戻せる。
 * - 値は桁と形だけ確かめる (読み取りは画面の他の欄と同じ `readNumeric` · `parseCropNumber`)。
 */

/** 一覧の変更の結果。**当てた一覧** (`before`) も返す —— 消した品目の名前はそこから引く。 */
export type FarmChangeOutcome<T> = FarmListChange<T> & { readonly before: readonly T[] };

const fieldLabel: CSSProperties = {
  fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 2,
};

const fieldInput: CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--control-border)', borderRadius: 6,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 90,
};

export interface FarmListEditorProps<F extends string, X> {
  spec: FarmListSpec<F, X>;
  items: readonly FarmItem<F, X>[];
  /** 一覧の 1 行に添える説明 (数値の要約)。 */
  describe: (item: FarmItem<F, X>) => string;
  /**
   * 一覧を変える —— `change` を**保管層の今の最新**に当て、断られなければ保存する。
   * 読めなければ `null`・別の保存と重なり続けたら `'busy'`。
   */
  changeList: (
    change: (current: readonly FarmItem<F, X>[]) => FarmListChange<FarmItem<F, X>>,
  ) => Promise<FarmChangeOutcome<FarmItem<F, X>> | 'busy' | null>;
  /** 数値でない欄の入力 (養殖の水の種類)。足すときに `extraDraft` と一緒に渡る。 */
  extraFields?: ReactNode;
  extraDraft?: Readonly<Record<string, unknown>>;
  /** 足した品目を呼び手へ知らせる (養殖は足した魚種を選ぶ)。 */
  onAdded?: (item: FarmItem<F, X>) => void;
}

export function FarmListEditor<F extends string, X>({
  spec,
  items,
  describe,
  changeList,
  extraFields,
  extraDraft,
  onAdded,
}: FarmListEditorProps<F, X>): ReactElement {
  const noun = spec.noun;
  const [label, setLabel] = useState('');
  const [numbers, setNumbers] = useState<Readonly<Record<string, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const submit = useSubmitGuard();
  const missing = missingFarmBuiltins(spec, items);

  const apply = async (
    change: (current: readonly FarmItem<F, X>[]) => FarmListChange<FarmItem<F, X>>,
  ): Promise<(FarmChangeOutcome<FarmItem<F, X>> & { ok: true }) | null> => {
    const r = await changeList(change);
    if (r === null) {
      setNotice(unreadableForJudgementNote(`${noun}の一覧`, `今の${noun}の一覧`));
      return null;
    }
    if (r === 'busy') {
      setNotice(busyLatestNote(`${noun}の一覧`));
      return null;
    }
    if (!r.ok) {
      setNotice(r.issues.join('。'));
      return null;
    }
    return r;
  };

  const onAdd = async (): Promise<void> => {
    const draft = {
      ...extraDraft,
      label,
      ...Object.fromEntries(spec.numericFields.map((f) => [f, parseCropNumber(numbers[f] ?? '')])),
    };
    const done = await apply((current) => addFarmItem(spec, current, draft));
    if (done === null) return;
    const added = done.items[done.items.length - 1]!;
    setLabel('');
    setNotice(`「${added.label}」を足しました。`);
    onAdded?.(added);
  };

  const onRemove = async (id: string): Promise<void> => {
    const done = await apply((current) => removeFarmItem(spec, current, id));
    if (done === null) return;
    // 名前は**当てた一覧**から引く (画面の写しの行ではない —— 消したのはそちらの品目である)。
    setNotice(`「${findFarmItem(done.before, id)?.label ?? noun}」を消しました。`);
  };

  const onRestore = async (): Promise<void> => {
    if ((await apply((current) => restoreFarmBuiltins(spec, current))) === null) return;
    setNotice(`参考の${noun}を戻しました。`);
  };

  return (
    <details data-farm-list-editor={noun} style={{ marginBottom: 10 }}>
      <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', minHeight: 24 }}>
        {noun}を増やす・減らす（現在 {items.length} 件）
      </summary>
      <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.6, margin: 0 }}>
          参考の {spec.builtins.length} 件は出発点です。自分の{noun}を足し、使わない{noun}は消せます
          （最後の 1 件は消せません）。値は桁と形だけ確かめます — 正しさは自分の実績で置き換えてください。
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.9 }}>
          {items.map((c) => (
            <li key={c.id} data-farm-item={c.id}>
              {c.label}
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {isFarmBuiltinId(spec, c.id) ? '（参考）' : '（追加）'}
                {describe(c)}
              </span>{' '}
              <button
                type="button"
                disabled={submit.busy || items.length <= 1}
                aria-label={`${c.label} を消す`}
                onClick={() => fireReported(submit.run(() => onRemove(c.id)))}
                style={{ fontSize: 11, minHeight: 24 }}
              >
                消す
              </button>
            </li>
          ))}
        </ul>
        {missing.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => fireReported(submit.run(onRestore))}
              disabled={submit.busy}
              style={{ fontSize: 11, minHeight: 24 }}
            >
              参考の{noun}を戻す（{missing.map((c) => c.label).join('・')}）
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fieldLabel}>
            {noun}の名前
            <input
              type="text"
              value={label}
              aria-label={`${noun}の名前`}
              onChange={(e) => setLabel(e.target.value)}
              style={{ ...fieldInput, width: 150 }}
            />
          </label>
          {extraFields}
          {spec.numericFields.map((f) => (
            <label key={f} style={fieldLabel}>
              {spec.labels[f]}
              <input
                type="text"
                inputMode="decimal"
                value={numbers[f] ?? ''}
                aria-label={spec.labels[f]}
                onChange={(e) => setNumbers((d) => ({ ...d, [f]: e.target.value }))}
                style={fieldInput}
              />
            </label>
          ))}
          <button type="button" onClick={() => fireReported(submit.run(onAdd))} disabled={submit.busy}>
            この{noun}を足す
          </button>
        </div>
        {notice !== null && <div role="status" data-farm-list-notice style={{ fontSize: 12, lineHeight: 1.6 }}>{notice}</div>}
      </div>
    </details>
  );
}
