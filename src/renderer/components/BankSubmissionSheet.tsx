/**
 * 金融機関等提出用の書面 — 経営サマリーを A4 縦の「項目 / 数値 / 算式・備考」で出す。
 *
 * `BankSubmissionSheet` は書面そのもの (印刷される部分)。`BankSubmissionPanel` は
 * その上に載る操作 (書式の選択・提出者情報・印刷・戻る) で、印刷時は
 * `styles.css` の `@media print` が `.bank-toolbar` を隠す。
 */
import { useState } from 'react';
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
  parseSubmissionProfile,
  type BankSubmissionSettings,
  type BankSubmissionSheetModel,
  type SheetMeta,
} from '../data/bankSubmission';
import { printDocument } from '../data/printDocument';
import { fireReported } from '../data/recordStoreFailure';

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

export function BankSubmissionPanel({
  model,
  settings,
  onSave,
  onClose,
}: {
  model: BankSubmissionSheetModel;
  settings: BankSubmissionSettings;
  onSave: (s: BankSubmissionSettings) => Promise<void> | void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ ...settings.profile });
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function saveProfile(): Promise<void> {
    const r = parseSubmissionProfile(form);
    if (!r.ok) {
      setSaved(false);
      setError(r.reason);
      return;
    }
    setError(undefined);
    await onSave({ profile: r.profile, format: settings.format });
    setSaved(true);
  }

  /** 書式は選んだ瞬間に保存する (書面がその場で変わる)。知らない値は既定へ倒れる。 */
  function changeFormat(patch: Record<string, string>): void {
    fireReported(onSave({ profile: settings.profile, format: parseBankFormat({ ...settings.format, ...patch }) }));
  }

  const field = (key: keyof typeof form, label: string, placeholder = '') => (
    <label className="bank-field">
      {label}
      <input
        type="text"
        aria-label={label}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => {
          setForm((prev) => ({ ...prev, [key]: e.target.value }));
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
        <div className="bank-toolbar-row">
          <label className="bank-field">
            表示単位
            <select aria-label="表示単位" value={settings.format.unit} onChange={(e) => changeFormat({ unit: e.target.value })}>
              {AMOUNT_UNITS.map((u) => (
                <option key={u} value={u}>{UNIT_LABEL[u]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            負数の表記
            <select aria-label="負数の表記" value={settings.format.negative} onChange={(e) => changeFormat({ negative: e.target.value })}>
              {NEGATIVE_STYLES.map((n) => (
                <option key={n} value={n}>{NEGATIVE_LABEL[n]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            端数処理
            <select aria-label="端数処理" value={settings.format.rounding} onChange={(e) => changeFormat({ rounding: e.target.value })}>
              {ROUNDING_MODES.map((r) => (
                <option key={r} value={r}>{ROUNDING_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <label className="bank-field">
            年号
            <select aria-label="年号" value={settings.format.era} onChange={(e) => changeFormat({ era: e.target.value })}>
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
          <button type="button" onClick={() => fireReported(saveProfile())}>提出者情報を保存</button>
          {error !== undefined && <span role="alert" className="bank-error">{error}</span>}
          {saved && error === undefined && <span role="status" className="bank-saved">保存しました。書面に反映されています。</span>}
        </div>
      </div>
      <BankSubmissionSheet model={model} />
    </div>
  );
}
