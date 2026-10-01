import type { CSSProperties } from 'react';
import { guardCounts, guardNumber, type GuardIssue, type NumSpec } from '../data/inputGuards';

/**
 * 数値入力欄 + その場の指摘。
 *
 * 読めない値・空欄を画面がどう扱ったかを、入力欄のすぐ下に出し、枠の色も変える ——
 * 黙っていると、画面には自信のある間違った数字が出る。**何と言うかは宣言が決める**
 * (パス 493l): 0 として計算する欄は「0 として計算されています」、段ごと断る欄は
 * 「この欄を使う判定は出していません」、保存の欄は「保存できません」。関門が選んだ結果は
 * `data-guard-outcome` にも載せる (検査が文ではなく値で読めるように)。
 */

const FATAL = '#e5484d';
const WARN = '#e08c1a';

export function GuardedNumber({
  spec,
  value,
  onChange,
  style,
  width,
  placeholder,
}: {
  spec: NumSpec;
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
  width?: number;
  /** 入力例。数値の桁感を示すために残す（e2e もこれで欄を特定している）。 */
  placeholder?: string;
}) {
  const issue = guardNumber(value, spec);
  const color = issue?.level === 'fatal' ? FATAL : issue ? WARN : undefined;
  return (
    <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {spec.label}
      <input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        aria-label={spec.label}
        aria-invalid={issue?.level === 'fatal' || undefined}
        data-guard={issue ? issue.level : 'ok'}
        data-guard-outcome={issue?.outcome ?? undefined}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--bg-elev)',
          border: `1px solid ${color ?? 'var(--border)'}`,
          borderRadius: 10,
          color: 'var(--text)',
          padding: '6px 8px',
          fontSize: 13,
          width: width ?? 140,
          ...style,
        }}
      />
      {issue && (
        <span style={{ color, fontSize: 10, lineHeight: 1.5, maxWidth: width ?? 140 }}>
          {issue.level === 'fatal' ? '⛔ ' : '⚠️ '}
          {issue.message}
        </span>
      )}
    </label>
  );
}

/**
 * 入力欄が多い画面用のまとめ表示。欄ごとに出すと画面が壊れる場所で使う。
 * 指摘がなければ何も描かない（平常時に場所を取らない）。
 *
 * ★ **見出しと前置きは、指摘が述べた結果から組む** (パス 493l)。それまで見出しは ⛔ の件数を
 * 「読み取れない入力 N 件」と呼び、前置きは指摘の中身を問わず「読み取れなかった欄は 0 として
 * 計算されています」と出していた。実測: iDeCo の掛金が上限を超えただけ (読める値) で
 * 「読み取れない入力 1 件」、扶養の人数が 20 人を超えただけ (計算は 20 人で行う) でも
 * 「0 として計算されています」と言っていた。前置きは **0 として計算した欄が在るときだけ**、その数を言う。
 */
export function GuardSummary({ issues, title = '入力の確認' }: { issues: readonly GuardIssue[]; title?: string }) {
  if (issues.length === 0) return null;
  const { fatal, warn } = guardCounts(issues);
  const zeroed = issues.filter((i) => i.outcome === 'computedAsZero').length;
  return (
    <div
      data-guard-summary
      data-fatal={fatal}
      data-warn={warn}
      style={{
        border: `1px solid ${fatal ? FATAL : WARN}`,
        borderRadius: 10,
        padding: '10px 12px',
        background: 'var(--bg-elev)',
        fontSize: 12,
        lineHeight: 1.7,
        margin: '10px 0',
      }}
    >
      <strong style={{ fontSize: 12 }}>
        {fatal ? '⛔' : '⚠️'} {title} — 直す必要のある入力 {fatal} 件 / 要確認 {warn} 件
      </strong>
      {zeroed > 0 && (
        <div data-guard-summary-zeroed={zeroed} style={{ color: 'var(--text-mute)' }}>
          0 として計算した欄が {zeroed} 件あります。下の数字はその前提の値です。
        </div>
      )}
      {issues.map((it, i) => (
        <div key={i} style={{ color: it.level === 'fatal' ? FATAL : WARN, marginTop: 4 }}>
          {it.level === 'fatal' ? '⛔' : '⚠️'} 「{it.label}」{it.message}
        </div>
      ))}
    </div>
  );
}
