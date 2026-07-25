import { useEffect, useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import {
  DOC_DISCLAIMER,
  SHUGYO_CHAPTERS,
  SHUGYO_FIELDS,
  SHUGYO_NOTES,
  SHUGYO_STEPS,
  STUDIO_TEMPLATES,
  TEIKAN_FORMS,
  TEIKAN_NOTES,
  TEIKAN_STEPS,
  buildGkChapters,
  buildKkChapters,
  teikanClosing,
  type DocBlock,
  type DocField,
  type TeikanChapter,
} from '../data/docStudioData';

/**
 * 書類スタジオ — これまで単体 HTML として配布していた 3 ツール
 * （経営書類スタジオ 12 書式／電子定款メーカー／就業規則メーカー）を
 * アプリ内サービスとして統合したページ。テンプレートは
 * data/docStudioData.ts の単一データソースから描画する。
 * 入力は localStorage に自動保存し、印刷時は書面のみを出力する
 * （styles.css の body.ds-printing ルール）。
 */

type Collection = 'studio' | 'teikan' | 'shugyo';
type Values = Record<string, string>;

interface StoreShape {
  studio?: Record<string, Values>;
  teikan?: { kk?: Values; gk?: Values };
  shugyo?: Values;
}

const LS_KEY = 'servicehub.docstudio.v1';

function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as StoreShape) : {};
  } catch {
    return {};
  }
}
function saveStore(s: StoreShape): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota — best-effort */
  }
}

function yen(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
const fmt = (n: number) => n.toLocaleString('ja-JP');

/** {{k}} プレースホルダを差込 span に展開する。 */
function Fill({ text, fields, values }: { text: string; fields: readonly DocField[]; values: Values }) {
  const parts: React.ReactNode[] = [];
  const re = /{{(\w+)}}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const key = m[1]!;
    const v = values[key] ?? '';
    const f = fields.find((x) => x.k === key);
    parts.push(
      <span key={i++} className={v ? 'ds-fill' : 'ds-fill ds-empty'}>
        {v || `【${f ? f.label : key}】`}
      </span>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** 経営書類の明細表（品目1..3・税10%集計）。 */
function ItemsTable({ values }: { values: Values }) {
  const rows = [1, 2, 3]
    .map((i) => ({ item: values[`item${i}`] ?? '', amount: yen(values[`amount${i}`] ?? '') }))
    .filter((r) => r.item || r.amount !== null);
  const subtotal = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const tax = Math.floor(subtotal * 0.1);
  return (
    <table className="ds-table">
      <thead>
        <tr><th>品目</th><th>金額（税抜）</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td>（フォームで品目と金額を入力してください）</td><td className="ds-num">—</td></tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}><td>{r.item || '—'}</td><td className="ds-num">{r.amount !== null ? `${fmt(r.amount)} 円` : '—'}</td></tr>
          ))
        )}
      </tbody>
      <tfoot>
        <tr><td>小計（税抜）</td><td className="ds-num">{fmt(subtotal)} 円</td></tr>
        <tr><td>消費税（10%）</td><td className="ds-num">{fmt(tax)} 円</td></tr>
        <tr className="ds-total"><td>合計（税込）</td><td className="ds-num">{fmt(subtotal + tax)} 円</td></tr>
      </tfoot>
    </table>
  );
}

/** 適格請求書の明細（税率別集計・端数は税率ごとに1回切捨て）。 */
function InvoiceTable({ values }: { values: Values }) {
  const n10 = yen(values['amount10'] ?? '');
  const n8 = yen(values['amount8'] ?? '');
  const tax10 = n10 !== null ? Math.floor(n10 * 0.1) : 0;
  const tax8 = n8 !== null ? Math.floor(n8 * 0.08) : 0;
  const base10 = n10 ?? 0;
  const base8 = n8 ?? 0;
  const rows: { label: string; rate: string; amount: number | null }[] = [];
  if (values['item10a'] || n10 !== null) rows.push({ label: values['item10a'] || '—', rate: '10%', amount: n10 });
  if (values['item8a'] || n8 !== null) rows.push({ label: `${values['item8a'] || '—'}（軽減税率対象）`, rate: '8%', amount: n8 });
  return (
    <table className="ds-table">
      <thead>
        <tr><th>品目</th><th>税率</th><th>金額（税抜）</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td>（フォームで品目と金額を入力してください）</td><td>—</td><td className="ds-num">—</td></tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}><td>{r.label}</td><td>{r.rate}</td><td className="ds-num">{r.amount !== null ? `${fmt(r.amount)} 円` : '—'}</td></tr>
          ))
        )}
      </tbody>
      <tfoot>
        <tr><td>10%対象 計（税抜）</td><td>消費税額 {fmt(tax10)} 円</td><td className="ds-num">{fmt(base10)} 円</td></tr>
        <tr><td>8%対象 計（税抜）</td><td>消費税額 {fmt(tax8)} 円</td><td className="ds-num">{fmt(base8)} 円</td></tr>
        <tr className="ds-total"><td>合計（税込）</td><td /><td className="ds-num">{fmt(base10 + tax10 + base8 + tax8)} 円</td></tr>
      </tfoot>
    </table>
  );
}

function SignBlock({ values }: { values: Values }) {
  const sides = [
    { label: '甲', addr: values['kouAddr'], name: values['kou'], rep: values['kouRep'] },
    { label: '乙', addr: values['otsuAddr'], name: values['otsu'], rep: values['otsuRep'] },
  ];
  return (
    <div className="ds-sign">
      {sides.map((s) => (
        <div key={s.label} className="ds-sign-side">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>【{s.label}】</div>
          <div>住所: {s.addr || '＿＿＿＿＿＿＿＿＿＿＿＿＿＿'}</div>
          <div>{s.name || '＿＿＿＿＿＿＿＿＿＿＿＿＿＿'}</div>
          <div>{(s.rep || '代表者 ＿＿＿＿＿＿＿＿＿＿') + '\u3000\u3000㊞'}</div>
        </div>
      ))}
    </div>
  );
}

/** 書類本文ブロック列の描画（経営書類用）。 */
function Blocks({ blocks, fields, values }: { blocks: readonly DocBlock[]; fields: readonly DocField[]; values: Values }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.center) return <div key={i} className="ds-title"><Fill text={b.center} fields={fields} values={values} /></div>;
        if (b.h) return <div key={i} className="ds-h"><Fill text={b.h} fields={fields} values={values} /></div>;
        if (b.p) return <p key={i} className="ds-p"><Fill text={b.p} fields={fields} values={values} /></p>;
        if (b.right) return <div key={i} className="ds-right"><Fill text={b.right} fields={fields} values={values} /></div>;
        if (b.list) {
          return (
            <div key={i}>
              {b.list.map((item, j) => (
                <p key={j} className="ds-li">({j + 1}) <Fill text={item} fields={fields} values={values} /></p>
              ))}
            </div>
          );
        }
        if (b.items) return <ItemsTable key={i} values={values} />;
        if (b.invoiceItems) return <InvoiceTable key={i} values={values} />;
        if (b.sign) return <SignBlock key={i} values={values} />;
        if (b.bigAmount) {
          const n = yen(values['amount'] ?? '');
          return <div key={i} className="ds-big">{n !== null ? `金 ${fmt(n)} 円 也（税込）` : '金 ＿＿＿＿＿＿＿ 円 也'}</div>;
        }
        if (b.stamp) return <div key={i} className="ds-stamp">収入印紙（紙で5万円以上の場合・電子交付は不要）</div>;
        return null;
      })}
    </>
  );
}

/** 章＋条の連番描画（定款・就業規則で共用）。 */
function Chapters({ chapters, fields, values }: { chapters: readonly TeikanChapter[]; fields: readonly DocField[]; values: Values }) {
  let artNo = 0;
  return (
    <>
      {chapters.map((ch, ci) => (
        <div key={ci}>
          <div className="ds-chapter">{ch.chapter}</div>
          {ch.articles.map((a, ai) => {
            artNo += 1;
            return (
              <div key={ai}>
                <div className="ds-h">{`第${artNo}条\u3000${a.t}`}</div>
                {a.body.map((b, bi) => (
                  <p key={bi} className="ds-p">
                    {a.body.length > 1 ? `${bi + 1}. ` : ''}
                    <Fill text={b} fields={fields} values={values} />
                  </p>
                ))}
                {a.list?.map((item, li) => (
                  <p key={`l${li}`} className="ds-li">({li + 1}) <Fill text={item} fields={fields} values={values} /></p>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function FieldInputs({ fields, values, onChange }: { fields: readonly DocField[]; values: Values; onChange: (k: string, v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f) => (
        <label key={f.k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-mute)' }}>
          {f.label}
          {f.options ? (
            <select
              value={values[f.k] ?? f.options[0]}
              onChange={(e) => onChange(f.k, e.target.value)}
              aria-label={f.label}
              style={{ padding: '8px 10px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={values[f.k] ?? ''}
              placeholder={f.ph ?? ''}
              inputMode={f.num ? 'numeric' : undefined}
              onChange={(e) => onChange(f.k, e.target.value)}
              aria-label={f.label}
              style={{ padding: '8px 10px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function GuideBox({ title, steps, notes }: { title: string; steps?: readonly (readonly [string, string])[]; notes: readonly string[] }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-elev)', fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
      {steps?.map(([t, b]) => (
        <div key={t} style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700 }}>{t}</div>
          <div style={{ color: 'var(--text-mute)' }}>{b}</div>
        </div>
      ))}
      <div style={{ marginTop: 10, fontWeight: 700 }}>⚖️ 根拠法令と実務上の注意（検証済み知識ベースより）</div>
      {notes.map((n, i) => (
        <div key={i} style={{ color: 'var(--text-mute)', marginTop: 4 }}>• {n}</div>
      ))}
    </div>
  );
}

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'studio', label: '🗂 経営書類（12種）' },
  { id: 'teikan', label: '📜 電子定款' },
  { id: 'shugyo', label: '📖 就業規則' },
];

export function DocstudioPage() {
  const { source, status, errorMessage, refresh } = useServiceData('docstudio', SNAPSHOT.docstudio);
  const [store, setStore] = useState<StoreShape>(() => loadStore());
  const [collection, setCollection] = useState<Collection>('studio');
  const [docId, setDocId] = useState<string>(STUDIO_TEMPLATES[0]!.id);
  const [teikanType, setTeikanType] = useState<'kk' | 'gk'>('kk');

  useEffect(() => saveStore(store), [store]);

  const studioDoc = useMemo(() => STUDIO_TEMPLATES.find((d) => d.id === docId) ?? STUDIO_TEMPLATES[0]!, [docId]);

  const values: Values =
    collection === 'studio'
      ? store.studio?.[studioDoc.id] ?? {}
      : collection === 'teikan'
        ? store.teikan?.[teikanType] ?? {}
        : store.shugyo ?? {};

  function setValue(k: string, v: string) {
    setStore((prev) => {
      if (collection === 'studio') {
        return { ...prev, studio: { ...prev.studio, [studioDoc.id]: { ...prev.studio?.[studioDoc.id], [k]: v } } };
      }
      if (collection === 'teikan') {
        return { ...prev, teikan: { ...prev.teikan, [teikanType]: { ...prev.teikan?.[teikanType], [k]: v } } };
      }
      return { ...prev, shugyo: { ...prev.shugyo, [k]: v } };
    });
  }

  const fields: readonly DocField[] =
    collection === 'studio' ? studioDoc.fields : collection === 'teikan' ? TEIKAN_FORMS[teikanType] : SHUGYO_FIELDS;

  const val = (k: string) => values[k] ?? '';
  const teikanChapters = useMemo(
    () => (collection === 'teikan' ? (teikanType === 'kk' ? buildKkChapters(val) : buildGkChapters(val)) : []),
    // val は values から導出される安定した参照ではないため values を依存に取る
    // （react-hooks/exhaustive-deps は eslint.config.js で off。抑制指示は不要）
    [collection, teikanType, values],
  );

  function printDoc() {
    document.body.classList.add('ds-printing');
    const cleanup = () => {
      document.body.classList.remove('ds-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  const notes = collection === 'studio' ? studioDoc.note : collection === 'teikan' ? TEIKAN_NOTES : SHUGYO_NOTES;
  const steps = collection === 'teikan' ? TEIKAN_STEPS[teikanType] : collection === 'shugyo' ? SHUGYO_STEPS : undefined;

  const cats = useMemo(() => {
    const out: string[] = [];
    for (const d of STUDIO_TEMPLATES) if (!out.includes(d.cat)) out.push(d.cat);
    return out;
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ds-side">
        <StatusBar
          serviceId="docstudio"
          source={source}
          status={status}
          errorMessage={errorMessage}
          isConfigured
          onRefresh={refresh}
          who={<>書類スタジオ · 経営12書式 + 電子定款 + 就業規則 — 入力→即プレビュー→印刷/PDF</>}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {COLLECTIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              data-collection={c.id}
              onClick={() => setCollection(c.id)}
              className={collection === c.id ? 'primary' : ''}
              style={{ fontSize: 13, padding: '9px 14px' }}
            >
              {c.label}
            </button>
          ))}
          <button type="button" onClick={printDoc} style={{ marginLeft: 'auto', fontSize: 13, padding: '9px 14px' }}>
            🖨 印刷 / PDF 保存
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="ds-side" style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 440 }}>
          {collection === 'studio' && (
            <Section title="書類を選ぶ" count={STUDIO_TEMPLATES.length}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cats.map((cat) => (
                  <div key={cat}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)', margin: '4px 0' }}>{cat}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {STUDIO_TEMPLATES.filter((d) => d.cat === cat).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          data-doc-id={d.id}
                          onClick={() => setDocId(d.id)}
                          className={d.id === studioDoc.id ? 'primary' : ''}
                          style={{ fontSize: 12, padding: '7px 10px' }}
                        >
                          {d.icon} {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {collection === 'teikan' && (
            <Section title="会社形態" count={2}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" data-doc-id="teikan-kk" className={teikanType === 'kk' ? 'primary' : ''} onClick={() => setTeikanType('kk')} style={{ flex: 1, padding: '10px 8px' }}>
                  株式会社
                </button>
                <button type="button" data-doc-id="teikan-gk" className={teikanType === 'gk' ? 'primary' : ''} onClick={() => setTeikanType('gk')} style={{ flex: 1, padding: '10px 8px' }}>
                  合同会社
                </button>
              </div>
            </Section>
          )}

          <Section title="差込フォーム（入力は端末内に自動保存）" count={fields.length}>
            <FieldInputs fields={fields} values={values} onChange={setValue} />
          </Section>

          <GuideBox
            title={
              collection === 'teikan'
                ? `📄 電子定款にする手順（${teikanType === 'kk' ? '株式会社' : '合同会社'}）`
                : collection === 'shugyo'
                  ? '📋 導入の手順（作成 → 意見聴取 → 届出 → 周知）'
                  : '📌 この書式について'
            }
            steps={steps}
            notes={notes}
          />
        </div>

        <div style={{ flex: '2 1 420px', minWidth: 0 }}>
          <div className="ds-paper">
            {collection === 'studio' && <Blocks blocks={studioDoc.body} fields={fields} values={values} />}
            {collection === 'teikan' && (
              <>
                <div className="ds-title">{val('shogo') || (teikanType === 'kk' ? '株式会社【商号】' : '合同会社【商号】')} 定款</div>
                <Chapters chapters={teikanChapters} fields={fields} values={values} />
                {(() => {
                  const c = teikanClosing(val, teikanType);
                  return (
                    <>
                      <p className="ds-p" style={{ marginTop: 18 }}>{c.closing}</p>
                      <div className="ds-right">{c.date}</div>
                      {c.signers.map((s, i) => (
                        <div key={i} className="ds-right">{s}</div>
                      ))}
                    </>
                  );
                })()}
              </>
            )}
            {collection === 'shugyo' && (
              <>
                <div className="ds-title"><Fill text="{{company}} 就業規則" fields={fields} values={values} /></div>
                <Chapters chapters={SHUGYO_CHAPTERS} fields={fields} values={values} />
              </>
            )}
            <div className="ds-disclaimer">{DOC_DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
