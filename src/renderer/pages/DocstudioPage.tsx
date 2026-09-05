import { useEffect, useMemo, useState } from 'react';
import { printDocument } from '../data/printDocument';
import { localIsoDate } from '../../shared/localDate';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import {
  DOC_DISCLAIMER,
  SHUGYO_CHAPTERS,
  SHUGYO_FIELDS,
  SHUGYO_NOTES,
  SHUGYO_STEPS,
  STUDIO_CATEGORIES,
  STUDIO_TEMPLATES,
  TEIKAN_FORMS,
  TEIKAN_NOTES,
  TEIKAN_STEPS,
  type DocBlock,
  type DocField,
  type DocTable,
  type StudioDoc,
} from '../data/docStudioData';
import {
  buildGkChapters,
  buildKkChapters,
  teikanClosing,
  type TeikanChapter,
} from '../data/docStudioTeikan';
import { checkDoc, countBlank, toNum, type DocIssue } from '../data/docStudioChecks';
import { LEVEL_COLOR, LEVEL_MARK, LEVEL_NAME, borderColorFor } from '../components/issueLevelUi';
import { byIssueLevel, countByLevel } from '../../shared/issueLevel';
import { labelOf, lawOf, triageFor } from '../data/businessTriage';
import { navigateTo, takeNavigationIntent } from '../navigate';
import { useCollection } from '../data/useCollection';
import { latestRecord } from '../data/latestRecord';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../data/kpiActuals';
import { BALANCE_SHEET_COLLECTION, type BalanceSheet } from '../data/balanceSheet';
import { BANK_SUBMISSION_COLLECTION, settingsFromRecord, type BankSubmissionSettings } from '../data/bankSubmission';
import { buildKessanImport } from '../data/kessanImport';
import { KESSAN_SHEETS, docIdOfSheet, fieldsForSheet, inheritedNote, isKessanSheet, sheetDef, sheetOfDoc, type KessanSheet } from '../data/kessanSheets';
import { sanitizeDocstudioStore, type StoreShape, type Values } from '../data/docstudioStore';
import { buildBusinessPlanImport, buildCashPlanImport, type ImportPreview } from '../data/docImports';
import { tableStyle, thStyle, tdStyle, tdNum } from '../components/tableStyles';
import {
  STATUS_DESCRIPTION,
  STATUS_LABEL,
  countByStatus,
  legalStatusOf,
  statusRank,
  type LegalStatus,
} from '../data/docLegalStatus';
import { EligibilityChecker } from '../components/EligibilityChecker';
import {
  MAX_SHAREHOLDERS,
  addShareholder,
  canAddShareholder,
  canRemoveShareholder,
  listShareholders,
  readShareholderCount,
  removeShareholder,
  shareholderKey,
  totalHeldShares,
  type ShareholderField,
} from '../data/shareholders';
import {
  PLAN_ITEMS,
  PLAN_MONTHS,
  buildCashPlan,
  checkCashPlan,
  monthsOfRunway,
  planKey,
} from '../data/cashPlan';
import {
  ACCOUNTS,
  buildBalanceRows,
  buildIncomeRows,
  buildPublicNoticeRows,
  checkStatements,
  incomeTotals,
  type StatementRow,
} from '../data/statementAccounts';
import {
  buildEquityRows,
  buildNoteSections,
  checkEquity,
  type EquityOptions,
  type EquityRow,
  type NoteOptions,
  type NoteSection,
} from '../data/statementEquity';
import type { ProfessionalId } from '../data/professionalMap';
import { readNumber } from '../data/inputGuards';
import {
  MAX_ITEM_RATE,
  ROUNDING_LABEL,
  groupByTaxKind,
  lineAmount,
  perLineRoundingDelta,
  rateLabel,
  type RoundingMode,
  type TaxKind,
  type TaxLine,
} from '../../shared/invoiceTax';

/**
 * 書類スタジオ — これまで単体 HTML として配布していた 3 ツール
 * （経営書類スタジオ 12 書式／電子定款メーカー／就業規則メーカー）を
 * アプリ内サービスとして統合したページ。テンプレートは
 * data/docStudioData.ts の単一データソースから描画する。
 * 入力は localStorage に自動保存し、印刷時は書面のみを出力する
 * （styles.css の body.ds-printing ルール）。
 */

type Collection = 'studio' | 'teikan' | 'shugyo' | 'kessan';
const LS_KEY = 'servicehub.docstudio.v1';

function loadStore(): StoreShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    // 保存値は型が守らない —— 形の合う欄だけを受ける (2026-09-05 に 'foo' で画面が落ちた)。
    return sanitizeDocstudioStore(raw ? JSON.parse(raw) : null);
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
    .map((i) => ({ item: values[`item${i}`] ?? '', amount: readNumber(values[`amount${i}`]) }))
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

/**
 * 未入力のフィールドに `def` を埋めた値を返す。
 *
 * select の既定値を入力欄の表示だけに効かせると、「画面には選ばれているのに
 * 書面には出ない」というズレが生まれる。フォーム・書面・チェックの三者が
 * 同じ値を見るように、ここで一度だけ既定を解決する。
 */
function withDefaults(fields: readonly DocField[], values: Values): Values {
  let out: Values | null = null;
  for (const f of fields) {
    if (f.def === undefined) continue;
    if ((values[f.k] ?? '') !== '') continue;
    if (!out) out = { ...values };
    out[f.k] = f.def;
  }
  return out ?? values;
}

/** 画面の選択肢 → 税率区分。'（使わない）' はその行ごと捨てる。 */
const KIND_BY_LABEL: Record<string, TaxKind> = {
  '標準税率': 'standard',
  '軽減税率': 'reduced',
  '任意税率A': 'customA',
  '任意税率B': 'customB',
  '免税（輸出取引等）': 'exportExempt',
  '非課税': 'nonTaxable',
  '不課税（対象外）': 'outOfScope',
};
const ROUNDING_BY_LABEL: Record<string, RoundingMode> = {
  '切捨て': 'floor',
  '切上げ': 'ceil',
  '四捨五入': 'round',
};

/** 差込フォームの i1..iN から明細行を組み立てる。 */
function readTaxLines(values: Values, max = 6): TaxLine[] {
  const out: TaxLine[] = [];
  for (let n = 1; n <= max; n += 1) {
    const kindLabel = values[`i${n}kind`] ?? '';
    // 素の添字だと `'constructor'` 等がプロトタイプ側の値を返す。`values` は
    // 保存された書類レコード (JSON) なので、画面の選択肢以外も入りうる。
    const kind = Object.hasOwn(KIND_BY_LABEL, kindLabel) ? KIND_BY_LABEL[kindLabel] : undefined;
    if (!kind) continue; // 未選択 / （使わない）
    const name = values[`i${n}name`] ?? '';
    const qtyRaw = values[`i${n}qty`] ?? '';
    const priceRaw = values[`i${n}price`] ?? '';
    const qty = readNumber(qtyRaw);
    const unitPrice = readNumber(priceRaw) ?? 0;
    out.push({ name, qty: qty === null ? (qtyRaw.trim() === '' ? 1 : 0) : qty, unitPrice, kind });
  }
  return out;
}

/**
 * 適格請求書の明細 — 品目ごとに割り当てた税率区分で自動的に仕分けし、
 * 区分の合計に対して1回だけ端数処理して消費税額を出す
 * （行ごとに端数処理して積み上げる方式は認められない・消費税法57条の4）。
 */
function TaxItemsTable({ values }: { values: Values }) {
  const lines = readTaxLines(values);
  const pct = (k: string) => {
    const v = readNumber(values[k] ?? '');
    return v === null ? 0 : Math.min(MAX_ITEM_RATE, Math.max(0, v / 100));
  };
  const totals = groupByTaxKind(lines, {
    customRateA: pct('rateA'),
    customRateB: pct('rateB'),
    rounding: ROUNDING_BY_LABEL[values['rounding'] ?? ''] ?? 'floor',
  });
  const delta = perLineRoundingDelta(totals);

  return (
    <div data-tax-items>
      <table className="ds-table">
        <thead>
          <tr><th>品目</th><th>数量</th><th>単価（税抜）</th><th>税率</th><th>金額（税抜）</th></tr>
        </thead>
        <tbody>
          {totals.groups.length === 0 ? (
            <tr><td colSpan={4}>（フォームで品目・単価・税率区分を入力してください）</td><td className="ds-num">—</td></tr>
          ) : (
            totals.groups.flatMap((g) =>
              g.lines.map((l, i) => (
                <tr key={`${g.kind}-${i}`} data-item-kind={g.kind}>
                  <td>{(l.name || '—') + (g.isReduced ? ' ※' : '')}</td>
                  <td className="ds-num">{fmt(l.qty)}</td>
                  <td className="ds-num">{fmt(l.unitPrice)} 円</td>
                  <td>{rateLabel(g)}</td>
                  <td className="ds-num">{fmt(lineAmount(l))} 円</td>
                </tr>
              )),
            )
          )}
        </tbody>
        <tfoot>
          {totals.groups.map((g) => (
            <tr key={g.kind} data-group={g.kind}>
              <td colSpan={3}>
                {g.label}
                {g.taxable && g.rate !== null ? ` ${rateLabel(g)} 対象 計（税抜）` : ' 計'}
              </td>
              <td>{g.taxable && g.rate !== null ? `消費税額 ${fmt(g.tax)} 円` : '—'}</td>
              <td className="ds-num">{fmt(g.subtotal)} 円</td>
            </tr>
          ))}
          <tr className="ds-total">
            <td colSpan={3}>合計（税込）</td>
            <td>消費税額 計 {fmt(totals.totalTax)} 円</td>
            <td className="ds-num">{fmt(totals.grandTotal)} 円</td>
          </tr>
        </tfoot>
      </table>
      {totals.hasReduced && <p className="ds-p">※ は軽減税率（8%）の対象品目です。</p>}
      <p className="ds-p" style={{ fontSize: 11 }}>
        消費税額は税率ごとに1回だけ{ROUNDING_LABEL[totals.rounding]}で計算しています
        {delta !== 0 && `（行ごとに${ROUNDING_LABEL[totals.rounding]}して積み上げる方法は認められません。その方法との差は ${fmt(Math.abs(delta))} 円です）`}。
      </p>
    </div>
  );
}

/** 汎用の差込表（36協定・精算書・株主名簿など）。sum があれば最終列を合計する。 */
function FillTable({ spec, fields, values }: { spec: DocTable; fields: readonly DocField[]; values: Values }) {
  // 検算（docStudioChecks）と同じ toNum で読む。ここだけ別のパーサを使うと、
  // 書面には差額が出ているのに検算は何も言わない、という食い違いが生まれる。
  const total = spec.sum ? spec.sum.keys.reduce((s, k) => s + (toNum(values[k]) ?? 0), 0) : null;
  const cls = (i: number) => (spec.align?.[i] === 'r' ? 'ds-num' : undefined);
  return (
    <table className="ds-table">
      <thead>
        <tr>{spec.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {spec.rows.map((row, r) => (
          <tr key={r}>
            {spec.head.map((_, c) => (
              <td key={c} className={cls(c)}>
                {row[c] ? <Fill text={row[c]!} fields={fields} values={values} /> : '　'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {spec.sum && total !== null && (
        <tfoot>
          <tr className="ds-total">
            <td colSpan={Math.max(1, spec.head.length - 1)}>{spec.sum.label}</td>
            <td className="ds-num">{fmt(total)} 円</td>
          </tr>
        </tfoot>
      )}
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
        if (b.taxItems) return <TaxItemsTable key={i} values={values} />;
        if (b.table) return <FillTable key={i} spec={b.table} fields={fields} values={values} />;
        if (b.cashPlan) return <CashPlanTable key={i} values={values} />;
        if (b.shareholders) return <ShareholderTable key={i} values={values} />;
        if (b.sign) return <SignBlock key={i} values={values} />;
        if (b.bigAmount) {
          const n = toNum(values['amount']);
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



function FieldInputs({
  fields,
  values,
  onChange,
  flagged = {},
}: {
  fields: readonly DocField[];
  values: Values;
  onChange: (k: string, v: string) => void;
  flagged?: Record<string, DocIssue['level']>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map((f) => {
        const level = flagged[f.k];
        const border = level ? `1px solid ${LEVEL_COLOR[level]}` : '1px solid var(--border)';
        return (
          <label key={f.k} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-mute)' }}>
            <span>
              {f.label}
              {f.req && <span style={{ color: '#e5484d', marginLeft: 4 }} title="必須">＊</span>}
            </span>
            {f.options ? (
              <select
                value={values[f.k] ?? f.options[0]}
                onChange={(e) => onChange(f.k, e.target.value)}
                aria-label={f.label}
                data-field={f.k}
                style={{ padding: '8px 10px', background: 'var(--bg-elev)', border, borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
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
                data-field={f.k}
                style={{ padding: '8px 10px', background: 'var(--bg-elev)', border, borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** 事前チェックの結果。fatal → warn → info の順で、根拠つきで並べる。 */
function CheckPanel({ issues }: { issues: readonly DocIssue[] }) {
  const counts = countByLevel(issues);
  const clean = counts.fatal === 0 && counts.warn === 0;
  return (
    <div
      data-check-panel
      data-fatal={counts.fatal}
      data-warn={counts.warn}
      style={{
        border: `1px solid ${borderColorFor(counts)}`,
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--bg-elev)',
        fontSize: 12,
        lineHeight: 1.7,
        marginTop: 12,
      }}
    >
      <strong style={{ fontSize: 13 }}>
        🔍 交付前チェック — {clean ? '無効リスクは見つかりませんでした' : `⛔ ${counts.fatal} 件 / ⚠️ ${counts.warn} 件`}
      </strong>
      <div style={{ color: 'var(--text-mute)', marginTop: 2 }}>
        入力した値を法令の要件と突き合わせています。空欄・数値の矛盾・上限超過など、書いた本人が気づきにくい失敗だけを挙げます。
      </div>
      {issues.length === 0 ? (
        <div style={{ marginTop: 8 }}>指摘はありません。</div>
      ) : (
        issues.map((it, i) => (
          <div key={i} style={{ marginTop: 8 }}>
            <div style={{ color: LEVEL_COLOR[it.level], fontWeight: it.level === 'info' ? 400 : 700 }}>
              {LEVEL_MARK[it.level]} [{LEVEL_NAME[it.level]}] {it.message}
            </div>
            {it.basis && <div style={{ color: 'var(--text-mute)' }}>根拠: {it.basis}</div>}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * 決算書の入力を数値に読み替える。書面・検算・注記がすべてこの 1 本を通る。
 *
 * 読み替えを画面ごとに書くと、片方だけ既定値がずれても誰も気づけない。
 */
function kessanOptions(values: Values): EquityOptions & NoteOptions {
  const n = (k: string) => readNumber(values[k]) ?? 0;
  const t = (k: string) => values[k] ?? '';
  return {
    retainedEarningsOpening: n('retainedEarningsOpening'),
    dividends: n('dividends'),
    reserveTransfer: n('reserveTransfer'),
    newShares: n('newShares'),
    newSharesSurplus: n('newSharesSurplus'),
    sharesIssued: n('sharesIssued'),
    inventoryPolicy: t('inventoryPolicy'),
    depreciationPolicy: t('depreciationPolicy'),
    allowancePolicy: t('allowancePolicy'),
    consumptionTaxPolicy: t('consumptionTaxPolicy'),
    contingent: t('contingent'),
    otherNote: t('otherNote'),
  };
}

/** 株主資本等変動計算書の表。列は株主資本の内訳 + 合計。 */
function EquityTable({ rows }: { rows: readonly EquityRow[] }) {
  return (
    <table className="ds-table" data-statement="株主資本等変動計算書">
      <thead>
        <tr>
          <th aria-label="変動事由" /><th>資本金</th><th>資本剰余金</th><th>利益準備金</th><th>繰越利益剰余金</th><th>純資産合計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={`${r.label}-${i}`}
            className={r.kind === 'ending' ? 'ds-total' : undefined}
            data-row-kind={r.kind}
          >
            <td style={{ paddingLeft: r.kind === 'change' ? 20 : undefined, fontWeight: r.kind === 'change' ? 400 : 700 }}>
              {r.label}
            </td>
            <td className="ds-num">{fmt(r.capital)}</td>
            <td className="ds-num">{fmt(r.capitalSurplus)}</td>
            <td className="ds-num">{fmt(r.legalReserve)}</td>
            <td className="ds-num">{fmt(r.retained)}</td>
            <td className="ds-num" style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 個別注記表。見出しごとに注記を並べる（表ではなく文章）。 */
function NotesSheet({ sections }: { sections: readonly NoteSection[] }) {
  return (
    <div data-statement="個別注記表">
      {sections.map((sec) => (
        <div key={sec.heading} style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700 }}>{sec.heading}</div>
          {sec.items.map((line, i) => (
            <div key={i} style={{ paddingLeft: 16, lineHeight: 1.9 }}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 決算書の書面 — 会社法435条2項の計算書類 4 点。
 *
 * 当期純利益は損益計算書で確定してから貸借対照表へ渡し、株主資本等変動計算書の
 * 当期末残高は貸借対照表から取る。4 枚を別々に組むと連結が切れて、貸借だけ合っているのに
 * 利益が反映されていない書面が出来上がる。
 */
function KessanSheets({ values, fields, sheet }: { values: Values; fields: readonly DocField[]; sheet: KessanSheet }) {
  // 1 点ずつ出すときも値は同じ 1 つの科目残高から組む（連結を切らない）。
  const show = (id: Exclude<KessanSheet, 'all'>) => sheet === 'all' || sheet === id;
  const inc = incomeTotals(values);
  const opt = kessanOptions(values);
  const bs = buildBalanceRows(values, opt, inc.netIncome);
  return (
    <div data-kessan-sheets={sheet}>
      {show('pl') && (<>
      <div className="ds-title"><Fill text="{{company}} 損益計算書" fields={fields} values={values} /></div>
      <div className="ds-right">
        <Fill text="自 {{fyStart}}　至 {{fyEnd}}" fields={fields} values={values} />
      </div>
      <StatementTable title="損益計算書" rows={buildIncomeRows(values)} />
      </>)}

      {show('bs') && (<>
      <div className="ds-title" style={{ marginTop: sheet === 'bs' ? 0 : 24 }}>
        <Fill text="{{company}} 貸借対照表" fields={fields} values={values} />
      </div>
      <div className="ds-right"><Fill text="{{fyEnd}} 現在" fields={fields} values={values} /></div>
      <StatementTable title="資産の部" rows={bs.assets} />
      <StatementTable title="負債・純資産の部" rows={bs.liabilitiesEquity} />
      </>)}

      {show('equity') && (<>
      <div className="ds-title" style={{ marginTop: sheet === 'equity' ? 0 : 24 }}>
        <Fill text="{{company}} 株主資本等変動計算書" fields={fields} values={values} />
      </div>
      <div className="ds-right">
        <Fill text="自 {{fyStart}}　至 {{fyEnd}}" fields={fields} values={values} />
      </div>
      <EquityTable rows={buildEquityRows(values, opt, inc.netIncome)} />
      </>)}

      {show('notes') && (<>
      <div className="ds-title" style={{ marginTop: sheet === 'notes' ? 0 : 24 }}>
        <Fill text="{{company}} 個別注記表" fields={fields} values={values} />
      </div>
      <div className="ds-right"><Fill text="{{fyEnd}} 現在" fields={fields} values={values} /></div>
      <NotesSheet sections={buildNoteSections(values, opt, inc.netIncome)} />
      </>)}

      {show('bs') && (<>
      <div className="ds-title" style={{ marginTop: 24 }}>決算公告（貸借対照表の要旨）</div>
      <div className="ds-right">
        <Fill text="{{company}}　{{fyEnd}} 現在" fields={fields} values={values} />
      </div>
      <StatementTable title="貸借対照表の要旨" rows={buildPublicNoticeRows(values, opt, inc.netIncome)} />
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>
        定時株主総会の終結後、遅滞なく公告してください。官報・日刊新聞紙を公告方法とする会社はこの要旨で足ります（会社法440条1項・2項）。
        <strong>電子公告を公告方法としている場合は要旨では足りず、貸借対照表の全文が必要です。</strong>
      </div>
      </>)}
    </div>
  );
}

/**
 * 資金繰り表 — 12 か月の入出金と繰越。
 *
 * 前月繰越は入力させず、必ず前月の翌月繰越から引き継ぐ。手で転記させると
 * 1 か月ずれたまま表としては辻褄が合ってしまい、誰も気づけない。
 */
function CashPlanTable({ values }: { values: Values }) {
  const opening = readNumber(values['openingBalance']) ?? 0;
  const plan = buildCashPlan(values, opening);
  const issues = checkCashPlan(plan);
  const runway = monthsOfRunway(plan);
  const shortfall = plan.shortfallMonth;
  return (
    <div data-cash-plan data-shortfall={shortfall ?? 0}>
      <table className="ds-table">
        <thead>
          <tr>
            <th>月</th><th>前月繰越</th><th>経常収入</th><th>経常支出</th>
            <th>経常収支</th><th>財務収支</th><th>当月収支</th><th>翌月繰越</th>
          </tr>
        </thead>
        <tbody>
          {plan.months.map((m) => (
            <tr key={m.month} data-month={m.month} data-short={m.closing < 0 ? '1' : undefined}>
              <td>{m.month} か月目</td>
              <td className="ds-num">{fmt(m.opening)}</td>
              <td className="ds-num">{fmt(m.operatingIn)}</td>
              <td className="ds-num">{fmt(m.operatingOut)}</td>
              <td className="ds-num" style={{ color: m.operatingNet < 0 ? LEVEL_COLOR.warn : undefined }}>
                {fmt(m.operatingNet)}
              </td>
              <td className="ds-num">{fmt(m.financeNet)}</td>
              <td className="ds-num">{fmt(m.net)}</td>
              <td className="ds-num" style={{ fontWeight: 700, color: m.closing < 0 ? LEVEL_COLOR.fatal : undefined }}>
                {fmt(m.closing)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="ds-total">
            <td>年間計</td>
            <td className="ds-num">—</td>
            <td className="ds-num">{fmt(plan.totalOperatingIn)}</td>
            <td className="ds-num">{fmt(plan.totalOperatingOut)}</td>
            <td className="ds-num">{fmt(plan.totalOperatingIn - plan.totalOperatingOut)}</td>
            <td className="ds-num">{fmt(plan.totalFinanceIn - plan.totalFinanceOut)}</td>
            <td className="ds-num">—</td>
            <td className="ds-num">{fmt(plan.endingBalance)}</td>
          </tr>
        </tfoot>
      </table>
      <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-mute)' }}>
        期首残高 {fmt(plan.openingBalance)} 円 ／ 期中の最低残高 {fmt(plan.minClosing)} 円
        {runway !== null && ` ／ 期末残高は平均月次経常支出の ${runway.toFixed(1)} か月分`}
      </div>
      <div
        data-cash-check
        data-fatal={issues.filter((i) => i.level === 'fatal').length}
        style={{
          border: `1px solid ${shortfall !== null ? LEVEL_COLOR.fatal : 'var(--border)'}`,
          borderRadius: 10, padding: '10px 12px', marginTop: 10,
          fontSize: 12, lineHeight: 1.7, background: 'var(--bg-elev)',
        }}
      >
        <strong>💰 資金繰りの検算 — {shortfall === null ? '期間中に資金ショートは起きません' : `⛔ ${shortfall} か月目にショート`}</strong>
        {issues.map((it, i) => (
          <div key={i} style={{ marginTop: 6, color: LEVEL_COLOR[it.level], fontWeight: it.level === 'info' ? 400 : 700 }}>
            {LEVEL_MARK[it.level]} {it.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 法的な位置づけの色。
 *
 * 「法定」だけを目立たせ、「条件付き」は中間色にする。**任意を灰色にして
 * 埋もれさせない** — 任意の書式も普通に使うものなので、区別が付けば十分。
 */
const LEGAL_COLOR: Readonly<Record<LegalStatus, string>> = {
  mandatory: '#e5484d',
  conditional: '#f5a623',
  optional: '#8b95a5',
  unclassified: '#c026d3',
};

/** 書式名の横に出す小さな区分バッジ。 */
function LegalBadge({ docId, size = 10 }: { docId: string; size?: number }) {
  const info = legalStatusOf(docId);
  const color = LEGAL_COLOR[info.status];
  const title = [STATUS_DESCRIPTION[info.status], info.basis && `根拠: ${info.basis}`, info.when]
    .filter(Boolean)
    .join(' / ');
  return (
    <span
      data-legal={info.status}
      title={title}
      style={{
        fontSize: size,
        fontWeight: 700,
        color,
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: '0 4px',
        marginLeft: 5,
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABEL[info.status]}
    </span>
  );
}

/** 選択中の書式について、義務の有無と根拠・保存期間を 1 枚で見せる。 */
function LegalPanel({ docId }: { docId: string }) {
  const info = legalStatusOf(docId);
  const color = LEGAL_COLOR[info.status];
  return (
    <div
      data-legal-panel={info.status}
      style={{
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 8,
        padding: 10,
        marginTop: 12,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ color, fontWeight: 700 }}>{STATUS_LABEL[info.status]}</span>
        <span style={{ color: 'var(--text-mute)' }}>{STATUS_DESCRIPTION[info.status]}</span>
      </div>
      {info.basis && (
        <div style={{ marginTop: 4 }}>
          <strong>根拠</strong>: {info.basis}
        </div>
      )}
      {info.when && (
        <div style={{ marginTop: 2, color: 'var(--text-mute)' }}>
          <strong>義務になる場合</strong>: {info.when}
        </div>
      )}
      {info.retention && (
        <div style={{ marginTop: 2 }}>
          <strong>保存期間</strong>: {info.retention}
        </div>
      )}
      {info.caveat && (
        <div style={{ marginTop: 4, color: 'var(--text-mute)' }}>※ {info.caveat}</div>
      )}
    </div>
  );
}

/** 株主名簿の本文テーブル（行数は入力に追従する）。 */
function ShareholderTable({ values }: { values: Values }) {
  const rows = listShareholders(values);
  const sum = totalHeldShares(values);
  return (
    <table className="ds-table" data-shareholders={rows.length}>
      <thead>
        <tr>
          <th>株主の氏名又は名称</th><th>住所</th><th className="ds-num">株式数（株）</th><th>取得日</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.index}>
            <td>{r.name}</td>
            <td>{r.addr}</td>
            <td className="ds-num">{r.shares}</td>
            <td>{r.date}</td>
          </tr>
        ))}
        <tr>
          <td colSpan={2}>合計</td>
          <td className="ds-num">{sum > 0 ? fmt(sum) : ''}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

/**
 * 株主名簿の株主欄（人数を任意に増減できる）。
 *
 * **表ではなく 1 名 1 枚のカードで並べる。** 差込フォームは横幅の狭い
 * 側パネルにあり、4 列の表にすると氏名・住所の欄が潰れて入力できなく
 * なる（実ブラウザの撮影で確認）。カードなら狭い幅でも縦に伸びるだけで、
 * スマホ幅でも横スクロールが出ない。
 */
function ShareholderInputs({
  values,
  onPatch,
  onChange,
}: {
  values: Values;
  onPatch: (patch: Record<string, string>) => void;
  onChange: (k: string, v: string) => void;
}) {
  const rows = listShareholders(values);
  const count = readShareholderCount(values);
  const canAdd = canAddShareholder(values);
  const canRemove = canRemoveShareholder(values);
  const total = totalHeldShares(values);
  const cols: readonly { f: ShareholderField; label: string; ph: string; num?: true; wide?: true }[] = [
    { f: 'name', label: '氏名・名称', ph: '山田 太郎' },
    { f: 'shares', label: '株式数', ph: '60', num: true },
    { f: 'addr', label: '住所', ph: '東京都千代田区…', wide: true },
    { f: 'date', label: '取得日', ph: '2020年4月1日' },
  ];
  return (
    <div style={{ marginTop: 12 }} data-shareholder-inputs={count}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
          株主（{count} 名）{total > 0 && ` ／ 記載株式数 計 ${fmt(total)} 株`}
        </span>
        <button type="button" onClick={() => onPatch(addShareholder(values))} disabled={!canAdd}>
          ＋ 株主を追加
        </button>
        {!canAdd && (
          <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
            上限 {MAX_SHAREHOLDERS} 名に達しました
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => (
          <div
            key={r.index}
            style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-mute)' }}>株主 {r.index}</span>
              <button
                type="button"
                aria-label={`株主${r.index} を削除`}
                onClick={() => onPatch(removeShareholder(values, r.index))}
                disabled={!canRemove}
                style={{ fontSize: 11, padding: '3px 10px', whiteSpace: 'nowrap' }}
              >
                削除
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))',
                gap: 8,
              }}
            >
              {cols.map((c) => {
                const k = shareholderKey(r.index, c.f);
                return (
                  <label
                    key={c.f}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      fontSize: 11,
                      color: 'var(--text-mute)',
                      gridColumn: c.wide ? '1 / -1' : undefined,
                    }}
                  >
                    <span>{c.label}</span>
                    <input
                      aria-label={`株主${r.index} ${c.label}`}
                      inputMode={c.num ? 'numeric' : undefined}
                      value={values[k] ?? ''}
                      placeholder={c.ph}
                      onChange={(e) => onChange(k, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
        ※ 削除すると以降の行が繰り上がります（名簿の途中に空行を残さないため）。
        株主名簿は<strong>株主全員</strong>の記載が要ります（会社法121条）。
      </div>
    </div>
  );
}

/** 資金繰り表の月次入力（12 か月 × 項目）。 */
function CashPlanInputs({ values, onChange }: { values: Values; onChange: (k: string, v: string) => void }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ds-table" data-cash-inputs>
        <thead>
          <tr>
            <th>項目</th>
            {Array.from({ length: PLAN_MONTHS }, (_, i) => <th key={i}>{i + 1}月目</th>)}
          </tr>
        </thead>
        <tbody>
          {PLAN_ITEMS.map((it) => (
            <tr key={it.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{it.label}</td>
              {Array.from({ length: PLAN_MONTHS }, (_, i) => {
                const k = planKey(i + 1, it.id);
                return (
                  <td key={k}>
                    <input
                      aria-label={`${it.label} ${i + 1}月目`}
                      inputMode="numeric"
                      value={values[k] ?? ''}
                      placeholder="0"
                      onChange={(e) => onChange(k, e.target.value)}
                      style={{ width: 90, fontSize: 12 }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 決算書の 1 表（損益計算書 / 貸借対照表の片側）。 */
function StatementTable({ title, rows }: { title: string; rows: readonly StatementRow[] }) {
  return (
    <table className="ds-table" data-statement={title}>
      <thead>
        <tr><th>{title}</th><th>金額（円）</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={`${r.label}-${i}`}
            className={r.kind === 'total' ? 'ds-total' : undefined}
            data-row-kind={r.kind}
          >
            <td style={{ paddingLeft: r.indent ? 20 : undefined, fontWeight: r.kind === 'item' ? 400 : 700 }}>
              {r.contra ? `${r.label}（△）` : r.label}
            </td>
            <td className="ds-num">
              {r.contra ? `△ ${fmt(Math.abs(r.amount))}` : fmt(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 決算書の検算。
 *
 * 交付前チェックと役割は同じだが、見るものが違う。こちらは貸借の一致と
 * 二表の連結という、合計欄を眺めていても気づけない失敗を挙げる。
 */
function KessanCheckPanel({ values }: { values: Values }) {
  const opt = kessanOptions(values);
  const netIncome = incomeTotals(values).netIncome;
  // 貸借対照表側と株主資本等変動計算書側を 1 枚のパネルに集約する。
  // 別々に出すと片方を閉じたまま印刷され、指摘が読まれない。
  const issues = [...checkStatements(values, opt), ...checkEquity(values, opt, netIncome)]
    .slice()
    .sort(byIssueLevel);
  const { fatal, warn } = countByLevel(issues);
  return (
    <div
      data-kessan-check
      data-fatal={fatal}
      data-warn={warn}
      style={{
        border: `1px solid ${borderColorFor({ fatal, warn })}`,
        borderRadius: 10, padding: '12px 14px', background: 'var(--bg-elev)',
        fontSize: 12, lineHeight: 1.7, marginTop: 12,
      }}
    >
      <strong style={{ fontSize: 13 }}>
        🧮 計算書類の検算 — {fatal === 0 && warn === 0 ? '貸借は一致しています' : `⛔ ${fatal} 件 / ⚠️ ${warn} 件`}
      </strong>
      <div style={{ color: 'var(--text-mute)', marginTop: 2 }}>
        資産合計と負債・純資産合計の一致、当期純利益が繰越利益剰余金に入っているか、準備金の積立が足りているかを突き合わせています。
      </div>
      {issues.map((it, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div style={{ color: LEVEL_COLOR[it.level], fontWeight: it.level === 'info' ? 400 : 700 }}>
            {LEVEL_MARK[it.level]} [{LEVEL_NAME[it.level]}] {it.message}
          </div>
          {it.basis && <div style={{ color: 'var(--text-mute)' }}>根拠: {it.basis}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * 事業仕分け — 「この書類、自分で作って出していいのか」に答える。
 *
 * 交付前チェックが「入力が正しいか」を見るのに対し、こちらは「誰がやる仕事か」を見る。
 * 士業法の独占はいずれも「他人の求めに応じ」「業として」が要件なので、自社分は
 * 原則やってよい。その事実を先に出さないと、作れる書類の前で手が止まる。
 */
function TriagePanel({ doc }: { doc: string }) {
  const t = triageFor(doc);
  if (!t) return null;
  const names = (ids: readonly ProfessionalId[]) => ids.map((id) => labelOf(id)).join('・');
  return (
    <div
      data-triage-panel
      data-doc={doc}
      data-exclusive={t.exclusiveTo.length}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--bg-elev)',
        fontSize: 12,
        lineHeight: 1.7,
        marginTop: 12,
      }}
    >
      <strong style={{ fontSize: 13 }}>⚖️ 事業仕分け — 自社でやるか、士業に頼むか</strong>

      <div style={{ marginTop: 8 }}>
        <span style={{ fontWeight: 700, color: 'var(--ok, #2e7d32)' }}>
          自社分: 作成から提出まで自分でできます{t.ownUse === 'ok-with-care' ? '（手順に注意）' : ''}
        </span>
        <div style={{ color: 'var(--text-mute)' }}>{t.ownNote}</div>
      </div>

      <div style={{ marginTop: 8 }}>
        {t.exclusiveTo.length > 0 ? (
          <>
            <span style={{ fontWeight: 700 }}>
              他人のために業として行うなら: {names(t.exclusiveTo)}の独占業務
            </span>
            <div style={{ color: 'var(--text-mute)' }}>
              根拠: {t.exclusiveTo.map((id) => lawOf(id)).join(' / ')}
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-mute)' }}>
            他人のために業として作成しても、それ自体はどの士業の独占業務にも当たりません。
          </span>
        )}
      </div>

      {t.caseByCase && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontWeight: 700 }}>事案によって変わる点</span>
          <div style={{ color: 'var(--text-mute)' }}>{t.caseByCase}</div>
        </div>
      )}

      {t.consult.length > 0 && (
        <div style={{ marginTop: 8, color: 'var(--text-mute)' }}>
          迷ったら相談: {names(t.consult)}
        </div>
      )}

      {(t.exclusiveTo.length > 0 || t.consult.length > 0) && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[...t.exclusiveTo, ...t.consult.filter((id) => !t.exclusiveTo.includes(id))].map((id) => (
            <button key={id} type="button" onClick={() => navigateTo(id)} style={{ fontSize: 11 }}>
              {labelOf(id)}のページへ →
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, color: 'var(--text-mute)', fontSize: 11 }}>
        独占規定はいずれも「他人の求めに応じ」「業として」を要件に置くため、自社の書類を自社の名で
        出す分は制限されません。ただし形式だけ本人名義にして実質が他人からの依頼なら、同じく制限を受けます。
      </div>
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
  { id: 'studio', label: `🗂 経営書類（${STUDIO_TEMPLATES.length}種）` },
  { id: 'teikan', label: '📜 電子定款' },
  { id: 'shugyo', label: '📖 就業規則' },
  { id: 'kessan', label: '📊 計算書類（4点）' },
];

/**
 * 決算書の入力欄。勘定科目そのものが差込項目になる。
 *
 * 会社名・事業年度のあとに ACCOUNTS の順で並べる。並び順は決算書の表示順と
 * 揃えてあるので、上から順に埋めれば決算書の並びのまま入力できる。
 */
const KESSAN_FIELDS: readonly DocField[] = [
  { k: 'company', req: true, label: '会社名', ph: '株式会社サンプル' },
  { k: 'fyStart', label: '事業年度（自）', ph: '2026年4月1日' },
  { k: 'fyEnd', req: true, label: '事業年度（至）', ph: '2027年3月31日' },
  { k: 'retainedEarningsOpening', num: true, label: '繰越利益剰余金（期首残高）', ph: '0' },
  { k: 'dividends', num: true, label: '当期の剰余金の配当', ph: '0' },
  { k: 'reserveTransfer', num: true, label: '当期の利益準備金への積立額', ph: '0' },
  { k: 'newShares', num: true, label: '当期の新株発行（資本金の増加額）', ph: '0' },
  { k: 'newSharesSurplus', num: true, label: '当期の新株発行（資本剰余金の増加額）', ph: '0' },
  { k: 'sharesIssued', num: true, label: '発行済株式の総数（株）', ph: '100' },
  ...ACCOUNTS.map((a) => ({ k: a.k, num: true as const, label: a.contra ? `${a.name}（控除）` : a.name, ph: '0' })),
  // 個別注記表の文言。空欄なら既定の書きぶりで埋まるので、必須にはしない。
  { k: 'inventoryPolicy', label: '注記: 資産の評価基準及び評価方法', ph: '' },
  { k: 'depreciationPolicy', label: '注記: 固定資産の減価償却の方法', ph: '' },
  { k: 'allowancePolicy', label: '注記: 引当金の計上基準', ph: '' },
  { k: 'consumptionTaxPolicy', label: '注記: 消費税等の会計処理', ph: '' },
  { k: 'contingent', label: '注記: 保証債務その他の偶発債務', ph: '' },
  { k: 'otherNote', label: '注記: その他', ph: '' },
];

const KESSAN_STEPS: readonly (readonly [string, string])[] = [
  ['① 残高を入れる', '試算表（決算整理後）の科目残高を、区分ごとに正の値で入力します。期末商品棚卸高・減価償却累計額・貸倒引当金は控除項目なので、そのまま正の値で入れれば自動で差し引きます。'],
  ['② 当期の変動を入れる', '繰越利益剰余金の期首残高、剰余金の配当、利益準備金への積立、新株発行による増加額を入れます。期首残高は入力しません。期末残高から当期変動額を引いて逆算するので、内訳と食い違う期首を書けないようになっています。'],
  ['③ 貸借の一致を確認', '資産合計と負債・純資産合計が一致しているかを自動で検算します。差額が当期純利益と一致した場合は、繰越利益剰余金の期首残高に当期純利益を二重に足している可能性が高いです。'],
  ['④ 書面を選んで印刷 / PDF 保存', '「書面」で 4 点まとめてか 1 点ずつ（損益計算書・貸借対照表・株主資本等変動計算書・個別注記表）かを選び、「印刷 / PDF 保存」で選んだ書面だけを出力します。1 点ずつ扱っても値の入れ物は 1 つなので、当期純利益と純資産の連結は切れません。'],
  ['⑤ 承認と公告', '定時株主総会の承認を受けたうえで、貸借対照表（大会社は損益計算書も）を公告してください。作成した計算書類は10年間の保存義務があります。'],
];

const KESSAN_NOTES: readonly string[] = [
  '計算書類は貸借対照表・損益計算書・株主資本等変動計算書・個別注記表の4点で、作成した時から10年間の保存義務があります（会社法435条2項・4項）。この画面は4点すべてを同じ科目残高から組み立て、「書面」のタブで 1 点ずつ入力・出力することもできます（値の入れ物は 1 つのまま）。',
  '株主資本等変動計算書の当期末残高は、貸借対照表の純資産の部と一致します。期首残高は入力させず期末から逆算するので、二表がずれることはありません。',
  '剰余金の配当をするときは、配当により減少する剰余金の10分の1を資本準備金または利益準備金として計上する必要があります（会社法445条4項）。ただし準備金の合計が資本金の4分の1に達している場合を除きます。',
  '定時株主総会の終結後は遅滞なく貸借対照表（大会社は損益計算書も）の公告が必要です（会社法440条1項）。'
    + '官報・日刊新聞紙を公告方法とする会社は要旨で足りますが（同条2項）、電子公告を公告方法としている場合は要旨では足りず全文が必要です。',
  '注記すべき範囲は会社の区分（公開会社か、会計監査人設置会社か）で変わり、省略できる注記があります。この画面は省かずに並べるので、どれを残すかは税理士・公認会計士に確認してください。',
  'ここで作るのは科目残高の積み上げです。勘定科目への振り分け、引当金の計上要否、減価償却方法の選択、税効果といった会計・税務の判断そのものは代替しません。',
];

const RECENT_MAX = 6;

/** ラベル・カテゴリ・キーワード・差込項目名を横断して 1 語ずつ AND 検索する。 */
function matches(doc: StudioDoc, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [doc.label, doc.cat, ...(doc.kw ?? []), ...doc.fields.map((f) => f.label)].join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/**
 * 経営サマリーから書式へ取り込むパネル (計算書類 / 資金繰り表 / 事業計画書)。取り込む前に
 * 「どの欄に・いくら・どこから」を全部見せ、置き方の注記と取り込めない物を並べる。押すまで何も書かない。
 */
function OverviewImportPanel({
  intro,
  result,
  applied,
  onApply,
}: {
  intro: string;
  result: Pick<ImportPreview, 'rows' | 'notes' | 'skipped'>;
  applied: number | null;
  onApply: () => void;
}) {
  const hasRows = result.rows.length > 0;
  return (
    <Section title="経営サマリーから取り込む" count={result.rows.length}>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 8 }}>{intro}</div>
      {hasRows && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle} data-kessan-import>
            <thead>
              <tr>
                <th style={thStyle}>入力欄</th>
                <th style={thStyle}>取り込む値</th>
                <th style={thStyle}>出所</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.k}>
                  <td style={tdStyle}>{r.label}</td>
                  <td style={tdNum}>{/^-?\d+$/.test(r.value) ? Number(r.value).toLocaleString('ja-JP') : r.value}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-mute)' }}>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.skipped.length > 0 && (
        <ul style={{ fontSize: 12, color: 'var(--text-mute)', margin: '8px 0 0', paddingLeft: '1.4em' }}>
          {result.skipped.map((t) => (
            <li key={t}>取り込めない: {t}</li>
          ))}
        </ul>
      )}
      {result.notes.length > 0 && (
        <ul style={{ fontSize: 12, color: 'var(--text-mute)', margin: '8px 0 0', paddingLeft: '1.4em' }}>
          {result.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <button type="button" className="primary" disabled={!hasRows} onClick={onApply}>
          この内容で取り込む
        </button>
        <button type="button" onClick={() => navigateTo('overview')}>経営サマリーを開く →</button>
      </div>
      {applied !== null && (
        <div role="status" style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>
          {applied} 件を取り込みました。差込フォームと右の書面に反映されています。
        </div>
      )}
    </Section>
  );
}

export function DocstudioPage() {
  const { source, status, errorMessage, refresh } = useServiceData('docstudio', SNAPSHOT.docstudio);
  const [store, setStore] = useState<StoreShape>(() => loadStore());
  const [collection, setCollection] = useState<Collection>('studio');
  const [docId, setDocId] = useState<string>(STUDIO_TEMPLATES[0]!.id);
  const [teikanType, setTeikanType] = useState<'kk' | 'gk'>('kk');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('すべて');

  useEffect(() => saveStore(store), [store]);
  /** 計算書類で見ている書面。store に持たせるので、開き直しても同じ書面から続けられる。 */
  // 保存値は型が守らない（古い版・手で直した JSON）。知らない値は「まとめて」に倒し、画面を壊さない。
  const kessanSheet: KessanSheet = isKessanSheet(store.kessanSheet) ? store.kessanSheet : 'all';
  function setKessanSheet(sheet: KessanSheet) {
    setStore((prev) => ({ ...prev, kessanSheet: sheet }));
  }

  // 経営サマリー → 計算書類。KPI 実績・貸借対照表・提出者情報は record store に
  // あり、書類スタジオの入力は localStorage にある。ここで読んで写す (押すまで書かない)。
  const kpiCol = useCollection<KpiActual>(KPI_ACTUALS_COLLECTION);
  const bsCol = useCollection<BalanceSheet>(BALANCE_SHEET_COLLECTION);
  const submissionCol = useCollection<BankSubmissionSettings>(BANK_SUBMISSION_COLLECTION);
  const kessanImport = useMemo(
    () =>
      buildKessanImport({
        kpiActuals: kpiCol.records.map((r) => r.data),
        balanceSheet: latestRecord(bsCol.records)?.data ?? null,
        profile: settingsFromRecord(latestRecord(submissionCol.records)?.data).profile,
        existing: store.kessan ?? {},
      }),
    [kpiCol.records, bsCol.records, submissionCol.records, store.kessan],
  );
  // 資金繰り表は会計連携 (freee) の月次キャッシュフローから。未連携なら空 (snapshot は空)。
  const { data: freeeData } = useServiceData('freee', SNAPSHOT.freee);
  const submissionProfile = useMemo(
    () => settingsFromRecord(latestRecord(submissionCol.records)?.data).profile,
    [submissionCol.records],
  );
  const cashPlanImport = useMemo(
    () =>
      buildCashPlanImport({
        accounting: freeeData.monthly,
        balanceSheet: latestRecord(bsCol.records)?.data ?? null,
        profile: submissionProfile,
        existing: store.studio?.['shikin-guri'] ?? {},
      }),
    [freeeData.monthly, bsCol.records, submissionProfile, store.studio],
  );
  const businessPlanImport = useMemo(
    () =>
      buildBusinessPlanImport({
        kpiActuals: kpiCol.records.map((r) => r.data),
        profile: submissionProfile,
        today: localIsoDate(),
        existing: store.studio?.['jigyo-keikaku'] ?? {},
      }),
    [kpiCol.records, submissionProfile, store.studio],
  );
  /** 取り込んだ件数 (書類ごと)。別の書類へ移ると消える。 */
  const [importApplied, setImportApplied] = useState<{ doc: string; n: number } | null>(null);
  const appliedFor = (doc: string): number | null => (importApplied !== null && importApplied.doc === doc ? importApplied.n : null);
  /** 下書きの行だけを書く (出所の無い欄は触らない)。 */
  function applyImport(doc: string, rows: readonly { k: string; value: string }[]) {
    const patch: Record<string, string> = {};
    for (const r of rows) patch[r.k] = r.value;
    if (doc === 'kessan') {
      setStore((prev) => ({ ...prev, kessan: { ...prev.kessan, ...patch } }));
    } else {
      setStore((prev) => ({ ...prev, studio: { ...prev.studio, [doc]: { ...prev.studio?.[doc], ...patch } } }));
    }
    setImportApplied({ doc, n: rows.length });
  }

  /** 書類 id から画面の状態へ (士業のページや経営サマリーからの遷移)。知らない id は何もしない。 */
  function openDoc(doc: string) {
    const sheet = sheetOfDoc(doc);
    if (sheet !== null) {
      setCollection('kessan');
      setKessanSheet(sheet);
    } else if (doc === 'shugyo') {
      setCollection('shugyo');
    } else if (doc === 'teikan-kk' || doc === 'teikan-gk') {
      setCollection('teikan');
      setTeikanType(doc === 'teikan-kk' ? 'kk' : 'gk');
    } else if (STUDIO_TEMPLATES.some((d) => d.id === doc)) {
      setCollection('studio');
      pickDoc(doc);
    }
  }

  // 他の画面からの「開いたら最初にすること」。mount 時に 1 度だけ受け取る。
  useEffect(() => {
    const intent = takeNavigationIntent('docstudio');
    if (intent === null) return;
    if (intent.doc !== undefined) openDoc(intent.doc);
    if (intent.query !== undefined) {
      setCollection('studio');
      setQuery(intent.query);
    }
    if (intent.action === 'import-overview') setCollection('kessan');
  }, []);

  const studioDoc = useMemo(() => STUDIO_TEMPLATES.find((d) => d.id === docId) ?? STUDIO_TEMPLATES[0]!, [docId]);

  /** 書式を選ぶ。最近使った書類の先頭に積み直す。 */
  function pickDoc(id: string) {
    setDocId(id);
    setStore((prev) => ({ ...prev, recent: [id, ...(prev.recent ?? []).filter((x) => x !== id)].slice(0, RECENT_MAX) }));
  }

  const values: Values =
    collection === 'studio'
      ? store.studio?.[studioDoc.id] ?? {}
      : collection === 'teikan'
        ? store.teikan?.[teikanType] ?? {}
        : collection === 'kessan'
          ? store.kessan ?? {}
          : store.shugyo ?? {};

  /**
   * 複数のキーをまとめて書き込む。
   *
   * 株主名簿の行削除のように**一度に何十キーも動かす**操作があるため、
   * 1 キーずつ setValue を呼ぶのではなくまとめて 1 回で当てる。
   */
  function setValues(patch: Record<string, string>) {
    if (Object.keys(patch).length === 0) return;
    setStore((prev) => {
      if (collection === 'studio') {
        return { ...prev, studio: { ...prev.studio, [studioDoc.id]: { ...prev.studio?.[studioDoc.id], ...patch } } };
      }
      if (collection === 'teikan') {
        return { ...prev, teikan: { ...prev.teikan, [teikanType]: { ...prev.teikan?.[teikanType], ...patch } } };
      }
      // 決算書と就業規則は別の入れ物に入れる。どちらも company を持つので、
      // 同じ袋に入れると会社名が混線し、決算書の科目残高が就業規則側にも溜まる。
      if (collection === 'kessan') return { ...prev, kessan: { ...prev.kessan, ...patch } };
      return { ...prev, shugyo: { ...prev.shugyo, ...patch } };
    });
  }

  function setValue(k: string, v: string) {
    setValues({ [k]: v });
  }

  const fields: readonly DocField[] =
    collection === 'studio' ? studioDoc.fields
      : collection === 'teikan' ? TEIKAN_FORMS[teikanType]
        : collection === 'kessan' ? KESSAN_FIELDS
          : SHUGYO_FIELDS;

  // 書面の描画・チェック・入力欄はすべてこの値を見る（既定値のズレを作らない）。
  const filled = useMemo(() => withDefaults(fields, values), [fields, values]);
  // 計算書類は書面ごとに入力欄を絞る。書面と検算は 4 点分の値で組むので `fields` はそのまま。
  const inputFields: readonly DocField[] = collection === 'kessan' ? fieldsForSheet(kessanSheet, KESSAN_FIELDS) : fields;

  const val = (k: string) => values[k] ?? '';
  const teikanChapters = useMemo(
    () => (collection === 'teikan' ? (teikanType === 'kk' ? buildKkChapters(val) : buildGkChapters(val)) : []),
    // val は values から導出される安定した参照ではないため values を依存に取る
    // （react-hooks/exhaustive-deps は eslint.config.js で off。抑制指示は不要）
    [collection, teikanType, values],
  );

  function printDoc() {
    printDocument();
  }

  const notes = collection === 'studio' ? studioDoc.note
    : collection === 'teikan' ? TEIKAN_NOTES
      : collection === 'kessan' ? KESSAN_NOTES
        : SHUGYO_NOTES;
  const steps = collection === 'teikan' ? TEIKAN_STEPS[teikanType]
    : collection === 'shugyo' ? SHUGYO_STEPS
      : collection === 'kessan' ? KESSAN_STEPS
        : undefined;

  // 表示順は STUDIO_CATEGORIES で固定し、そこに無い cat は末尾に回す（追加漏れで消えないように）。
  const cats = useMemo(() => {
    const seen: string[] = [];
    for (const d of STUDIO_TEMPLATES) if (!seen.includes(d.cat)) seen.push(d.cat);
    return [...STUDIO_CATEGORIES.filter((c) => seen.includes(c)), ...seen.filter((c) => !STUDIO_CATEGORIES.includes(c))];
  }, []);

  // 法的区分での絞り込み。null は「すべて」。
  const [legalFilter, setLegalFilter] = useState<LegalStatus | null>(null);
  const hits = useMemo(
    () =>
      STUDIO_TEMPLATES.filter(
        (d) =>
          (cat === 'すべて' || d.cat === cat) &&
          matches(d, query) &&
          (legalFilter === null || legalStatusOf(d.id).status === legalFilter),
      )
        // 法定 → 条件付き → 任意 の順に並べる。分類したのに並びが元のままだと
        // 「一目で分かる」にならない。同じ区分の中は元の並びを保つ。
        .sort((a, b) => statusRank(legalStatusOf(a.id).status) - statusRank(legalStatusOf(b.id).status)),
    [cat, query, legalFilter],
  );
  /** 絞り込み前の全書式の内訳（ボタンに件数を出すため）。 */
  const legalCounts = useMemo(() => countByStatus(STUDIO_TEMPLATES.map((d) => d.id)), []);
  const recent = useMemo(
    // 保存値は型が守らない: 配列でなければ無視し、配列でも文字列だけを見る (`.map` が無い値で画面を落とさない)
    () => (Array.isArray(store.recent) ? store.recent : []).filter((id): id is string => typeof id === 'string').map((id) => STUDIO_TEMPLATES.find((d) => d.id === id)).filter((d): d is StudioDoc => !!d),
    [store.recent],
  );

  const issues = useMemo(() => (collection === 'studio' ? checkDoc(studioDoc, filled) : []), [collection, studioDoc, filled]);
  const flagged = useMemo(() => {
    const out: Record<string, DocIssue['level']> = {};
    for (const it of issues) {
      if (!it.field || it.level === 'info') continue;
      if (out[it.field] !== 'fatal') out[it.field] = it.level;
    }
    return out;
  }, [issues]);
  const blanks = collection === 'studio' ? countBlank(studioDoc, filled) : 0;
  const fatalCount = issues.filter((i) => i.level === 'fatal').length;

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
          who={<>書類スタジオ · 経営{STUDIO_TEMPLATES.length}書式 + 電子定款 + 就業規則 + 決算書 — 入力→交付前チェック→事業仕分け→印刷/PDF</>}
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
          {fatalCount > 0 && (
            <span
              data-fatal-badge
              style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, fontWeight: 700, color: LEVEL_COLOR.fatal }}
            >
              ⛔ このままでは無効になる指摘 {fatalCount} 件
            </span>
          )}
          <button
            type="button"
            onClick={printDoc}
            style={{ marginLeft: fatalCount > 0 ? 8 : 'auto', fontSize: 13, padding: '9px 14px' }}
          >
            🖨 印刷 / PDF 保存
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="ds-side" style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 440 }}>
          {collection === 'studio' && (
            <Section title="書類を選ぶ" count={hits.length}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="書式名・場面で検索（例: 残業 / 退職 / 未払 / 登記）"
                aria-label="書式を検索"
                data-doc-search
                style={{ width: '100%', padding: '9px 11px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {['すべて', ...cats].map((c) => (
                  <button
                    key={c}
                    type="button"
                    data-cat={c}
                    onClick={() => setCat(c)}
                    className={cat === c ? 'primary' : ''}
                    style={{ fontSize: 11, padding: '5px 9px' }}
                  >
                    {c}
                    <span style={{ opacity: 0.65, marginLeft: 4 }}>
                      {c === 'すべて' ? STUDIO_TEMPLATES.length : STUDIO_TEMPLATES.filter((d) => d.cat === c).length}
                    </span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)' }}>法的な位置づけ</span>
                <button
                  type="button"
                  data-legal-filter="all"
                  className={legalFilter === null ? 'primary' : ''}
                  onClick={() => setLegalFilter(null)}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  すべて {STUDIO_TEMPLATES.length}
                </button>
                {(['mandatory', 'conditional', 'optional'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-legal-filter={st}
                    className={legalFilter === st ? 'primary' : ''}
                    onClick={() => setLegalFilter(legalFilter === st ? null : st)}
                    style={{ fontSize: 11, padding: '4px 8px', color: legalFilter === st ? undefined : LEGAL_COLOR[st] }}
                  >
                    {STATUS_LABEL[st]} {legalCounts[st]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.6 }}>
                「条件付き」は一定の場合にだけ義務になるものです（36協定は時間外労働をさせるとき、就業規則は常時10人以上など）。
                書式を選ぶと根拠条文と保存期間を表示します。
              </div>

              {recent.length > 0 && !query && cat === 'すべて' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)', margin: '4px 0' }}>最近使った書類</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {recent.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        data-recent-id={d.id}
                        onClick={() => pickDoc(d.id)}
                        className={d.id === studioDoc.id ? 'primary' : ''}
                        style={{ fontSize: 12, padding: '7px 10px' }}
                      >
                        {d.icon} {d.label}
                        <LegalBadge docId={d.id} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {hits.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
                    該当する書式がありません。別の語で検索するか、カテゴリを「すべて」に戻してください。
                  </div>
                )}
                {cats.map((c) => {
                  const inCat = hits.filter((d) => d.cat === c);
                  if (inCat.length === 0) return null;
                  return (
                    <div key={c}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)', margin: '4px 0' }}>{c}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {inCat.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            data-doc-id={d.id}
                            onClick={() => pickDoc(d.id)}
                            className={d.id === studioDoc.id ? 'primary' : ''}
                            style={{ fontSize: 12, padding: '7px 10px' }}
                          >
                            {d.icon} {d.label}
                            <LegalBadge docId={d.id} />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
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

          {collection === 'kessan' && (
            <Section title="書面（4点まとめて / 1点ずつ）" count={KESSAN_SHEETS.length}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-kessan-sheet-tabs={kessanSheet}>
                {KESSAN_SHEETS.map((sh) => (
                  <button
                    key={sh.id}
                    type="button"
                    data-kessan-sheet={sh.id}
                    data-doc-id={sh.docId}
                    className={kessanSheet === sh.id ? 'primary' : ''}
                    onClick={() => setKessanSheet(sh.id)}
                    style={{ padding: '8px 10px', fontSize: 12 }}
                  >
                    {sh.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.6 }}>
                {sheetDef(kessanSheet).note}
                {inheritedNote(kessanSheet) !== null && (
                  <div data-kessan-inherited style={{ marginTop: 4 }}>※ {inheritedNote(kessanSheet)}</div>
                )}
              </div>
            </Section>
          )}
          {collection === 'kessan' && (
            <OverviewImportPanel
              intro="経営サマリーの KPI 実績・貸借対照表・提出者情報を計算書類の科目残高に写します。出所の無い科目 (資本金・役員報酬・地代家賃など) は今の値のまま残します。内訳の無い額は「その他」の科目に置き、置いた理由を下に出します。"
              result={kessanImport}
              applied={appliedFor('kessan')}
              onApply={() => applyImport('kessan', kessanImport.rows)}
            />
          )}
          {collection === 'studio' && docId === 'shikin-guri' && (
            <OverviewImportPanel
              intro="会計連携 (freee) の月次キャッシュフロー (直近 12 か月) を入出金の表へ、貸借対照表の現預金を期首残高へ写します。月次は収入・支出の合計しか無いので、収入は売上入金、支出はその他経費に置きます。"
              result={cashPlanImport}
              applied={appliedFor('shikin-guri')}
              onApply={() => applyImport('shikin-guri', cashPlanImport.rows)}
            />
          )}
          {collection === 'studio' && docId === 'jigyo-keikaku' && (
            <OverviewImportPanel
              intro="提出者情報の会社名・代表者と、直近の事業年度の KPI 実績を 1 年目の売上高・経常利益に写します。計画の出発点として置くので、数字は計画値へ直してください。"
              result={businessPlanImport}
              applied={appliedFor('jigyo-keikaku')}
              onApply={() => applyImport('jigyo-keikaku', businessPlanImport.rows)}
            />
          )}

          <LegalPanel
            docId={
              collection === 'teikan' ? `teikan-${teikanType}`
                : collection === 'shugyo' ? 'shugyo'
                  : collection === 'kessan' ? docIdOfSheet(kessanSheet)
                    : docId
            }
          />

          <Section title="差込フォーム（入力は端末内に自動保存）" count={inputFields.length}>
            {collection === 'studio' && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>
                ＊ は空欄のまま交付すると書類として成立しない項目。未入力 {blanks} / {fields.length} 件。
              </div>
            )}
            <FieldInputs fields={inputFields} values={filled} onChange={setValue} flagged={flagged} />
            {collection === 'studio' && docId === 'kabunushi-meibo' && (
              <ShareholderInputs values={values} onPatch={setValues} onChange={setValue} />
            )}
            {collection === 'studio' && docId === 'shikin-guri' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>
                  月ごとの入出金（前月繰越は自動で引き継ぐので入力しません）
                </div>
                <CashPlanInputs values={values} onChange={setValue} />
              </div>
            )}
          </Section>

          {collection === 'studio' && docId === 'plantfactory-plan' && (
            <Section title="使える制度の判定">
              <EligibilityChecker />
            </Section>
          )}

          {collection === 'studio' && <CheckPanel issues={issues} />}
          {collection === 'kessan' && <KessanCheckPanel values={filled} />}
          <TriagePanel
            doc={
              collection === 'teikan' ? `teikan-${teikanType}`
                : collection === 'shugyo' ? 'shugyo'
                  : collection === 'kessan' ? 'kessan'
                    : docId
            }
          />

          <GuideBox
            title={
              collection === 'teikan'
                ? `📄 電子定款にする手順（${teikanType === 'kk' ? '株式会社' : '合同会社'}）`
                : collection === 'shugyo'
                  ? '📋 導入の手順（作成 → 意見聴取 → 届出 → 周知）'
                  : collection === 'kessan'
                    ? '📊 決算書を作る手順（残高入力 → 貸借の検算 → 出力 → 公告）'
                    : '📌 この書式について'
            }
            steps={steps}
            notes={notes}
          />
        </div>

        <div style={{ flex: '2 1 420px', minWidth: 0 }}>
          <div className="ds-paper">
            {collection === 'studio' && <Blocks blocks={studioDoc.body} fields={fields} values={filled} />}
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
            {collection === 'kessan' && <KessanSheets values={filled} fields={fields} sheet={kessanSheet} />}
            <div className="ds-disclaimer">{DOC_DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
