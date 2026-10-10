/**
 * 金融機関等提出用の書面 — 経営サマリーを A4 縦の「項目 / 数値 / 算式・備考」で出す。
 *
 * `BankSubmissionSheet` は書面そのもの (印刷される部分)。`BankSubmissionPanel` は
 * その上に載る操作 (書式の選択・提出者情報・印刷・戻る) で、印刷時は
 * `styles.css` の `@media print` が `.bank-toolbar` を隠す。
 */
import { useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import {
  AMOUNT_UNITS,
  ERA_LABEL,
  ERA_STYLES,
  NEGATIVE_LABEL,
  NEGATIVE_STYLES,
  ROUNDING_LABEL,
  ROUNDING_MODES,
  UNIT_LABEL,
  parseBankFormat,
} from '../../shared/bankFormat';
import {
  BANK_SUBMISSION_COLLECTION,
  parseSubmissionProfile,
  settingsFromRecord,
  type BankSubmissionSettings,
  type BankSubmissionSheetModel,
  type SheetMeta,
  type SubmissionProfile,
} from '../data/bankSubmission';
import { printDocument } from '../data/printDocument';
import { fireReported } from '../data/deviceStoreFailure';
import { busyLatestNote, unreadableForJudgementNote } from '../data/readCollectionNow';
import type { LatestForm } from '../data/useLatestForm';
import { ChangedLatestNote, LatestFormLoading } from './ChangedLatestNote';

/** 提出者情報の表 (2 組 × 4 行)。 */
function metaPairs(meta: readonly SheetMeta[]): SheetMeta[][] {
  const rows: SheetMeta[][] = [];
  for (let i = 0; i < meta.length; i += 2) rows.push(meta.slice(i, i + 2));
  return rows;
}

export function BankSubmissionSheet({ model }: { model: BankSubmissionSheetModel }) {
  return (
    <article className="bank-sheet" aria-label={`${model.stamp} ${model.title}`}>
      <div className="bank-sheet-stamp">{model.stamp}</div>
      <h1>{model.title}</h1>
      <p className="bank-sheet-sub">{model.subtitle}</p>
      <table className="bank-meta">
        <tbody>
          {metaPairs(model.meta).map((pair) => (
            <tr key={pair.map((m) => m.label).join('/')}>
              {pair.map((m) => (
                <MetaCell key={m.label} label={m.label} value={m.value} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bank-unit">{model.unitCaption}</div>
      {model.sections.map((s) => (
        <section className="bank-section" key={s.title}>
          <h2>{s.title}</h2>
          <table className="bank-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>数値</th>
                <th>算式・備考</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={`${i}-${r.label}`}>
                  <td>{r.label}</td>
                  <td className="bank-num">{r.value}</td>
                  <td className="bank-note">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.caption !== null && <p className="bank-caption">{s.caption}</p>}
        </section>
      ))}
      <section className="bank-section bank-notes">
        <h2>注記</h2>
        <ol>
          {model.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ol>
      </section>
      <section className="bank-attest">
        <p>{model.attestation.statement}</p>
        <table>
          <tbody>
            <tr>
              <th>作成日</th>
              <td>{model.attestation.date}</td>
            </tr>
            <tr>
              <th>商号</th>
              <td>{model.attestation.companyName}</td>
            </tr>
            <tr>
              <th>代表者</th>
              <td>
                {model.attestation.representative}
                <span className="bank-seal" aria-hidden="true">印</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </article>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <th scope="row">{label}</th>
      <td>{value}</td>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '4px 6px',
  minWidth: 160,
};

/**
 * 書式の選択・提出者情報・印刷・戻る (書面の上に載る操作)。
 *
 * **提出者情報と書式は「最新の 1 件を採用する」1 つの記録** (パス 500)。欄の状態は `useLatestForm` が
 * 持つ —— 直す前は `useState({ ...settings.profile })` で開き、士業の画面から「書面を開いた状態で」来ると
 * 保存値が届く前の空欄で開いて、届いても開き直さなかった。1 欄を直して保存すると、保存していた
 * 他の欄を空欄で覆った。書式の変更も `settings.profile` (描画した時の写し) で記録を丸ごと書いていた。
 */
export function BankSubmissionPanel({
  model,
  form,
  onClose,
}: {
  model: BankSubmissionSheetModel;
  /** 提出者情報の欄 (`OverviewPage` が持つ —— 書面の表示も同じ購読の最新を読む)。 */
  form: LatestForm<BankSubmissionSettings, SubmissionProfile>;
  onClose: () => void;
}) {
  const settings = settingsFromRecord(form.latest?.data);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const submit = useSubmitGuard();

  async function saveProfile(): Promise<void> {
    const r = parseSubmissionProfile(form.form);
    if (!r.ok) {
      setSaved(false);
      setError(r.reason);
      return;
    }
    setError(undefined);
    // 書式は**欄の元** (開いた時の最新) から取る。同じ画面で選んだ書式は `applyToLatest` が元を進めて
    // いるので含まれ、別の画面で選ばれた書式は元が古いので保存ごと断られる (覆わない)。
    setSaved(await form.save({ profile: r.profile, format: settingsFromRecord(form.base?.data).format }));
  }

  /**
   * 書式は選んだ瞬間に保存する (書面がその場で変わる)。知らない値は既定へ倒れる。
   *
   * **今の最新に当てる** (パス 500) —— 描画した時の写しの提出者情報で記録を丸ごと書くと、保存値が届く前
   * なら空欄で、別の画面の保存の後なら古い値で提出者情報を覆う。
   */
  async function changeFormat(patch: Record<string, string>): Promise<void> {
    const r = await form.applyToLatest((current) => {
      const now = settingsFromRecord(current?.data);
      return { profile: now.profile, format: parseBankFormat({ ...now.format, ...patch }) };
    });
    if (r.status === 'busy') setError(busyLatestNote('書式'));
    else if (r.status === 'unreadable') setError(unreadableForJudgementNote('書式', '今の提出者情報と書式'));
  }

  const field = (key: keyof SubmissionProfile, label: string, placeholder = '') => (
    <label className="bank-field">
      {label}
      <input
        type="text"
        aria-label={label}
        value={form.form[key]}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          form.update((prev) => ({ ...prev, [key]: v }));
          setSaved(false);
        }}
        style={inputStyle}
      />
    </label>
  );

  return (
    <div>
      <div className="bank-toolbar">
        <div className="bank-toolbar-row">
          <button type="button" onClick={onClose}>経営サマリーへ戻る</button>
          <button type="button" className="bank-print" onClick={() => printDocument()}>印刷 / PDF に保存</button>
          <span className="bank-hint">A4 縦で書面だけを印刷します。PDF にするには印刷先で「PDF に保存」を選びます。</span>
        </div>
        {!form.ready ? (
          <LatestFormLoading collection={BANK_SUBMISSION_COLLECTION} what="書式と提出者情報" />
        ) : (
        <>
        <div className="bank-toolbar-row">
          <label className="bank-field">
            表示単位
            <select aria-label="表示単位" value={settings.format.unit} onChange={(e) => fireReported(changeFormat({ unit: e.target.value }))}>
              {AMOUNT_UNITS.map((u) => (
                <option key={u} value={u}>{UNIT_LABEL[u]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            負数の表記
            <select aria-label="負数の表記" value={settings.format.negative} onChange={(e) => fireReported(changeFormat({ negative: e.target.value }))}>
              {NEGATIVE_STYLES.map((n) => (
                <option key={n} value={n}>{NEGATIVE_LABEL[n]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            端数処理
            <select aria-label="端数処理" value={settings.format.rounding} onChange={(e) => fireReported(changeFormat({ rounding: e.target.value }))}>
              {ROUNDING_MODES.map((r) => (
                <option key={r} value={r}>{ROUNDING_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            年号
            <select aria-label="年号" value={settings.format.era} onChange={(e) => fireReported(changeFormat({ era: e.target.value }))}>
              {ERA_STYLES.map((era) => (
                <option key={era} value={era}>{ERA_LABEL[era]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="bank-toolbar-row">
          {field('companyName', '商号', '株式会社〇〇')}
          {field('representative', '代表者', '代表取締役 〇〇 〇〇')}
          {field('address', '所在地', '東京都〇〇区…')}
          {field('fiscalYearEnd', '決算期', '2026-03')}
          <button type="button" onClick={() => fireReported(submit.run(saveProfile))} disabled={submit.busy}>提出者情報を保存</button>
          {error !== undefined && <span role="alert" className="bank-error">{error}</span>}
          {saved && error === undefined && <span role="status" className="bank-saved">保存しました。書面に反映されています。</span>}
        </div>
        <ChangedLatestNote
          changed={form.changed}
          what="提出者情報"
          then="もう一度「提出者情報を保存」を押すと、この欄の内容で上書きします。"
          onLoadSaved={() => {
            form.loadSaved();
            setSaved(false);
            setError(undefined);
          }}
        />
        </>
        )}
      </div>
      <BankSubmissionSheet model={model} />
    </div>
  );
}
