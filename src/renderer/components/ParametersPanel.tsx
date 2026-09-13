/**
 * 数値パラメータの設定画面 —— 台帳 (`shared/parameters.ts`) の各値を、機能ごとに
 * 並べて上書き / 既定に戻す。
 *
 * - 入力は文字列で持ち、`readNumber` で読む (全角・桁区切りを受け、読めない値は
 *   黙って 0 にしない)。範囲は `parameterIssue` が内部値で見る。
 * - **隣の欄との順序は `parameterOrderIssueFor` が見る** (`parameterIssue` は 1 欄ずつ
 *   しか見えないので、「良好の下限 40 / 注意の下限 60」のような組は素通りしていた)。
 *   すでに保存されている矛盾は、検索で絞っても消えない画面上部の断りで言う。
 * - 「保存」は値が変わっていて通るときだけ押せる。既定と同じ値を保存すると
 *   **上書きとして残る** (既定が改正で動いても、置いた値は動かない)。
 * - 行は `key` に有効値を含める — 既定へ戻したときに入力欄も既定の表示へ戻る
 *   (state を effect で同期する代わりに、行を組み直す)。
 */
import { useMemo, useState } from 'react';
import {
  PARAMETERS,
  PARAMETER_KIND_LABEL,
  fromDisplayValue,
  overriddenCount,
  parameterFeatures,
  parameterIssue,
  toDisplayValue,
  type ParameterDef,
  type ParameterId,
  type ParameterValues,
} from '../../shared/parameters';
import { parameterOrderIssueFor, parameterOrderIssues } from '../../shared/parameterOrder';
import { useParameters } from '../data/parameterOverrides';
import { readNumber } from '../data/inputGuards';

const inputStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '5px 8px',
  fontSize: 13,
  width: 120,
} as const;

const buttonStyle = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
} as const;

/** 検索語が id / 名前 / 機能 / 出典のどれかに当たるか (空なら全件)。 */
export function matchesParameterQuery(def: ParameterDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [def.id, def.label, def.feature, def.source ?? '', def.note ?? ''].some((s) =>
    s.toLowerCase().includes(q),
  );
}

function ParameterRow({
  def,
  value,
  values,
  overridden,
  onSave,
  onReset,
}: {
  def: ParameterDef;
  value: number;
  /** 全欄の有効値 — 隣の欄との順序を見るのに要る。 */
  values: ParameterValues;
  overridden: boolean;
  onSave: (internal: number) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [text, setText] = useState(String(toDisplayValue(def, value)));
  const [busy, setBusy] = useState(false);
  const shown = readNumber(text);
  const candidate = shown === null ? Number.NaN : fromDisplayValue(def, shown);
  const rangeIssue = parameterIssue(def, candidate);
  // 範囲を通っても、隣の欄と矛盾する値は保存させない (1 欄ずつの検査では見えない)。
  const orderIssue =
    rangeIssue === null ? parameterOrderIssueFor(def.id as ParameterId, candidate, values) : null;
  const issue = rangeIssue ?? orderIssue;
  const unchanged = issue === null && candidate === value;
  const defaultShown = `${toDisplayValue(def, def.defaultValue)}${def.unit}`;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-parameter={def.id}
      data-overridden={overridden ? 'true' : 'false'}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {def.label}{' '}
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              color: 'var(--text-mute)',
              marginLeft: 4,
            }}
          >
            {PARAMETER_KIND_LABEL[def.kind]}
          </span>
          {overridden && (
            <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 6 }}>上書き中</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          既定 {defaultShown}
          {def.source ? ` · 出典: ${def.source}` : ''}
          {def.note ? ` · ${def.note}` : ''}
        </div>
        {issue !== null && (
          <div role="alert" style={{ fontSize: 11, color: '#ef4444' }}>
            {issue}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          aria-label={def.label}
          aria-invalid={issue !== null}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={inputStyle}
        />
        <span style={{ fontSize: 12, color: 'var(--text-mute)', minWidth: 24 }}>{def.unit}</span>
        <button
          type="button"
          aria-label={`${def.label} を保存`}
          disabled={busy || unchanged || issue !== null}
          onClick={() => run(() => onSave(candidate))}
          style={buttonStyle}
        >
          保存
        </button>
        <button
          type="button"
          aria-label={`${def.label} を既定に戻す`}
          disabled={busy || !overridden}
          onClick={() => run(onReset)}
          style={buttonStyle}
        >
          既定に戻す
        </button>
      </div>
    </div>
  );
}

export function ParametersPanel() {
  const params = useParameters();
  const [query, setQuery] = useState('');
  const overridden = overriddenCount(params.overrides);
  const visible = useMemo(() => PARAMETERS.filter((p) => matchesParameterQuery(p, query)), [query]);
  // 古い版で置いた上書き・復元したバックアップは保存の関門を通っていないので、
  // 現在の有効値に対しても同じ検査を出す (検索で絞っても消さない — 直す欄が
  // 画面外に在るときこそ要る)。
  const orderIssues = useMemo(() => parameterOrderIssues(params.values), [params.values]);
  const features = parameterFeatures().filter((f) => visible.some((p) => p.feature === f));

  async function resetAll() {
    // 上書きを全部捨てる — 元に戻す手段が無いので確認を挟む。
    if (!window.confirm(`上書きした ${overridden} 件をすべて既定に戻します。よろしいですか？`)) return;
    await params.resetAll();
  }

  return (
    <div data-parameters="">
      <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.7, margin: '0 0 10px' }}>
        各機能が計算に使う法定値・参考値・しきい値・前提です。法改正や医師の指示、自分の実測に
        合わせて上書きできます。<strong>範囲は桁誤りを止める幅で、値が正しいかは見ません</strong>
        — 出典を確かめてから変えてください。ただし<strong>帯の下限と上限が入れ替わる組み合わせは
        保存しません</strong> (届かない段ができ、低い点数に高い評価が付くため)。通信や保存の
        安全上限はここには出しません。
      </p>
      {orderIssues.length > 0 && (
        <div
          role="alert"
          data-parameter-order-issues={orderIssues.length}
          style={{
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 10,
            fontSize: 12,
            lineHeight: 1.7,
            color: '#ef4444',
          }}
        >
          <strong>⛔ 保存されている値が矛盾しています</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {orderIssues.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          aria-label="パラメータを検索"
          placeholder="名前・機能・出典で絞り込む"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, width: 240 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-mute)' }} data-overridden-count={overridden}>
          {params.loading ? '読み込み中…' : `上書き ${overridden} / ${PARAMETERS.length} 件`}
        </span>
        <button
          type="button"
          disabled={params.loading || overridden === 0}
          onClick={() => void resetAll()}
          style={buttonStyle}
        >
          すべて既定に戻す
        </button>
      </div>
      {features.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>該当するパラメータはありません</div>
      )}
      {features.map((feature) => (
        <div key={feature} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '8px 0 2px' }}>{feature}</div>
          {visible
            .filter((p) => p.feature === feature)
            .map((def) => {
              const id = def.id as ParameterId;
              const value = params.values[id];
              return (
                <ParameterRow
                  key={`${id}:${value}`}
                  def={def}
                  value={value}
                  values={params.values}
                  overridden={params.overrides[id] !== undefined}
                  onSave={(v) => params.set(id, v)}
                  onReset={() => params.reset(id)}
                />
              );
            })}
        </div>
      ))}
    </div>
  );
}
