import type { CSSProperties } from 'react';
import { guardCounts, guardNumber, type GuardIssue, type NumSpec } from '../data/inputGuards';

/**
 * 数値入力欄 + その場の指摘。
 *
 * 試算画面の入力は読めなければ 0 に落ちる。0 に落ちたことを黙っていると、
 * 画面には自信のある間違った数字が出る。ここでは入力欄のすぐ下に
 * 「0 として計算されています」を出し、枠の色も変える。
 */

const FATAL = '#e5484d';
const WARN = '#e08c1a';

export function GuardedNumber({
  spec,
  value,
  onChange,
  style,
  width,
}: {
  spec: NumSpec;
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
  width?: number;
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
        aria-label={spec.label}
        aria-invalid={issue?.level === 'fatal' || undefined}
        data-guard={issue ? issue.level : 'ok'}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--bg-elev)',
          border: `1px solid ${color ?? 'var(--border)'}`,
          borderRadius: 6,
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
 */
export function GuardSummary({ issues, title = '入力の確認' }: { issues: readonly GuardIssue[]; title?: string }) {
  if (issues.length === 0) return null;
  const { fatal, warn } = guardCounts(issues);
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
        {fatal ? '⛔' : '⚠️'} {title} — 読み取れない入力 {fatal} 件 / 要確認 {warn} 件
      </strong>
      <div style={{ color: 'var(--text-mute)' }}>
        読み取れなかった欄は 0 として計算されています。下の数字はその前提の値です。
      </div>
      {issues.map((it, i) => (
        <div key={i} style={{ color: it.level === 'fatal' ? FATAL : WARN, marginTop: 4 }}>
          {it.level === 'fatal' ? '⛔' : '⚠️'} 「{it.label}」{it.message}
        </div>
      ))}
    </div>
  );
}
