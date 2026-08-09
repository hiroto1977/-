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
import { checkDoc, countBlank, type DocIssue } from '../data/docStudioChecks';
import { labelOf, lawOf, triageFor } from '../data/businessTriage';
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
  checkStatements,
  incomeTotals,
  type StatementRow,
} from '../data/statementAccounts';
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
type Values = Record<string, string>;

interface StoreShape {
  studio?: Record<string, Values>;
  teikan?: { kk?: Values; gk?: Values };
  shugyo?: Values;
  kessan?: Values;
  /** 最近使った書式 id（新しい順）。書式が増えたので探す手間を減らす。 */
  recent?: string[];
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
    const kind = KIND_BY_LABEL[kindLabel];
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
  const total = spec.sum ? spec.sum.keys.reduce((s, k) => s + (yen(values[k] ?? '') ?? 0), 0) : null;
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

const LEVEL_COLOR: Record<DocIssue['level'], string> = { fatal: '#e5484d', warn: '#e08c1a', info: 'var(--text-mute)' };
const LEVEL_MARK: Record<DocIssue['level'], string> = { fatal: '⛔', warn: '⚠️', info: '🕒' };
const LEVEL_NAME: Record<DocIssue['level'], string> = { fatal: 'このままでは無効', warn: '要確認', info: '交付後にやること' };

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
  const counts = { fatal: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level] += 1;
  const clean = counts.fatal === 0 && counts.warn === 0;
  return (
    <div
      data-check-panel
      data-fatal={counts.fatal}
      data-warn={counts.warn}
      style={{
        border: `1px solid ${counts.fatal ? LEVEL_COLOR.fatal : counts.warn ? LEVEL_COLOR.warn : 'var(--border)'}`,
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
 * 決算書の書面 — 損益計算書と貸借対照表。
 *
 * 当期純利益は損益計算書で確定してから貸借対照表へ渡す。二表を別々に組むと
 * 連結が切れて、貸借だけ合っているのに利益が反映されていない書面が出来上がる。
 */
function KessanSheets({ values, fields }: { values: Values; fields: readonly DocField[] }) {
  const inc = incomeTotals(values);
  const opt = {
    retainedEarningsOpening: readNumber(values['retainedEarningsOpening']) ?? 0,
    dividends: readNumber(values['dividends']) ?? 0,
  };
  const bs = buildBalanceRows(values, opt, inc.netIncome);
  return (
    <div data-kessan-sheets>
      <div className="ds-title"><Fill text="{{company}} 損益計算書" fields={fields} values={values} /></div>
      <div className="ds-right">
        <Fill text="自 {{fyStart}}　至 {{fyEnd}}" fields={fields} values={values} />
      </div>
      <StatementTable title="損益計算書" rows={buildIncomeRows(values)} />

      <div className="ds-title" style={{ marginTop: 24 }}>
        <Fill text="{{company}} 貸借対照表" fields={fields} values={values} />
      </div>
      <div className="ds-right"><Fill text="{{fyEnd}} 現在" fields={fields} values={values} /></div>
      <StatementTable title="資産の部" rows={bs.assets} />
      <StatementTable title="負債・純資産の部" rows={bs.liabilitiesEquity} />
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
  const opt = {
    retainedEarningsOpening: readNumber(values['retainedEarningsOpening']) ?? 0,
    dividends: readNumber(values['dividends']) ?? 0,
  };
  const issues = checkStatements(values, opt);
  const fatal = issues.filter((i) => i.level === 'fatal').length;
  const warn = issues.filter((i) => i.level === 'warn').length;
  return (
    <div
      data-kessan-check
      data-fatal={fatal}
      data-warn={warn}
      style={{
        border: `1px solid ${fatal ? LEVEL_COLOR.fatal : warn ? LEVEL_COLOR.warn : 'var(--border)'}`,
        borderRadius: 10, padding: '12px 14px', background: 'var(--bg-elev)',
        fontSize: 12, lineHeight: 1.7, marginTop: 12,
      }}
    >
      <strong style={{ fontSize: 13 }}>
        🧮 決算書の検算 — {fatal === 0 && warn === 0 ? '貸借は一致しています' : `⛔ ${fatal} 件 / ⚠️ ${warn} 件`}
      </strong>
      <div style={{ color: 'var(--text-mute)', marginTop: 2 }}>
        資産合計と負債・純資産合計の一致、当期純利益が繰越利益剰余金に入っているかを突き合わせています。
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
  { id: 'kessan', label: '📊 決算書（PL / BS）' },
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
  ...ACCOUNTS.map((a) => ({ k: a.k, num: true as const, label: a.contra ? `${a.name}（控除）` : a.name, ph: '0' })),
];

const KESSAN_STEPS: readonly (readonly [string, string])[] = [
  ['① 残高を入れる', '試算表（決算整理後）の科目残高を、区分ごとに正の値で入力します。期末商品棚卸高・減価償却累計額・貸倒引当金は控除項目なので、そのまま正の値で入れれば自動で差し引きます。'],
  ['② 貸借の一致を確認', '資産合計と負債・純資産合計が一致しているかを自動で検算します。差額が当期純利益と一致した場合は、繰越利益剰余金の期首残高に当期純利益を二重に足している可能性が高いです。'],
  ['③ 印刷 / PDF 保存', '「印刷 / PDF 保存」で損益計算書と貸借対照表を出力します。'],
  ['④ 残る2点を揃える', '会社法の計算書類は株主資本等変動計算書と個別注記表を含めた4点です。定時株主総会の承認を受けたうえで、貸借対照表（大会社は損益計算書も）を公告してください。'],
];

const KESSAN_NOTES: readonly string[] = [
  '計算書類は貸借対照表・損益計算書・株主資本等変動計算書・個別注記表の4点で、作成した時から10年間の保存義務があります（会社法435条2項・4項）。',
  '定時株主総会の終結後は遅滞なく貸借対照表（大会社は損益計算書も）の公告が必要です（会社法440条1項）。',
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

export function DocstudioPage() {
  const { source, status, errorMessage, refresh } = useServiceData('docstudio', SNAPSHOT.docstudio);
  const [store, setStore] = useState<StoreShape>(() => loadStore());
  const [collection, setCollection] = useState<Collection>('studio');
  const [docId, setDocId] = useState<string>(STUDIO_TEMPLATES[0]!.id);
  const [teikanType, setTeikanType] = useState<'kk' | 'gk'>('kk');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('すべて');

  useEffect(() => saveStore(store), [store]);

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
    collection === 'studio' ? studioDoc.fields
      : collection === 'teikan' ? TEIKAN_FORMS[teikanType]
        : collection === 'kessan' ? KESSAN_FIELDS
          : SHUGYO_FIELDS;

  // 書面の描画・チェック・入力欄はすべてこの値を見る（既定値のズレを作らない）。
  const filled = useMemo(() => withDefaults(fields, values), [fields, values]);

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

  const hits = useMemo(
    () => STUDIO_TEMPLATES.filter((d) => (cat === 'すべて' || d.cat === cat) && matches(d, query)),
    [cat, query],
  );
  const recent = useMemo(
    () => (store.recent ?? []).map((id) => STUDIO_TEMPLATES.find((d) => d.id === id)).filter((d): d is StudioDoc => !!d),
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
          who={<>書類スタジオ · 経営{STUDIO_TEMPLATES.length}書式 + 電子定款 + 就業規則 — 入力→交付前チェック→印刷/PDF</>}
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

          <Section title="差込フォーム（入力は端末内に自動保存）" count={fields.length}>
            {collection === 'studio' && (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>
                ＊ は空欄のまま交付すると書類として成立しない項目。未入力 {blanks} / {fields.length} 件。
              </div>
            )}
            <FieldInputs fields={fields} values={filled} onChange={setValue} flagged={flagged} />
            {collection === 'studio' && docId === 'shikin-guri' && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 6 }}>
                  月ごとの入出金（前月繰越は自動で引き継ぐので入力しません）
                </div>
                <CashPlanInputs values={values} onChange={setValue} />
              </div>
            )}
          </Section>

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
            {collection === 'kessan' && <KessanSheets values={filled} fields={fields} />}
            <div className="ds-disclaimer">{DOC_DISCLAIMER}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
