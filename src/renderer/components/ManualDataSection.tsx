/**
 * どの画面にも出る「事業・数値の手入力」欄。
 *
 * `App.tsx` が現在の画面の後ろに 1 つだけ描く。画面ごとに貼って回ると
 * 必ずどれか 1 つが漏れるので、**貼る場所を 1 か所にする**。新しい
 * サービスが増えても、この欄は自動的に付く。
 *
 * 出るもの:
 * - **事業の登録** — 任意に足せる。ここに登録した事業へ数値を紐づけられる。
 * - **任意の数値** — どの画面でも足せる。アプリが計算しない数字を置く場所。
 * - **数値の置き換え** — その画面が一覧 (allowlist) を持つときだけ出る。
 *
 * 置き換えの適用そのものは各画面が行う (`applyManualOverrides`)。ここは
 * 入力と一覧表示だけを持ち、画面の数字をどう使うかには立ち入らない。
 */

import { useState } from 'react';
import { useCollection } from '../data/useCollection';
import { fireReported } from '../data/deviceStoreFailure';
import {
  BUSINESS_UNITS_COLLECTION,
  findBusinessName,
  parseBusinessUnit,
  sortBusinessUnits,
  type BusinessUnitInput,
  type BusinessUnitRecord,
} from '../data/businessUnits';
import {
  MANUAL_METRICS_COLLECTION,
  MANUAL_OVERRIDES_COLLECTION,
  metricsForScope,
  overridesForScope,
  parseManualMetric,
  sectionsFor,
  hasCatalog,
  type ManualMetricEntry,
  type ManualOverrideEntry,
} from '../data/manualData';
import { formatMetric, parseOverrideValue, type MetricUnit } from '../data/overviewOverrides';

const input: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
};

const UNIT_LABELS: readonly { value: MetricUnit; label: string }[] = [
  { value: 'yen', label: '円' },
  { value: 'pct', label: '％' },
  { value: 'count', label: '件' },
  { value: 'days', label: '日' },
  { value: 'months', label: 'か月' },
];

export function ManualDataSection({ scope }: { scope: string }) {
  const [open, setOpen] = useState(false);
  const units = useCollection<BusinessUnitInput>(BUSINESS_UNITS_COLLECTION);
  const metrics = useCollection<ManualMetricEntry>(MANUAL_METRICS_COLLECTION);
  const overrides = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);

  const unitRecords: BusinessUnitRecord[] = units.records.map((r) => ({ id: r.id, data: r.data }));
  const sorted = sortBusinessUnits(unitRecords);
  const mine = metricsForScope(
    scope,
    metrics.records.map((r) => r.data),
  );
  const mineWithId = metrics.records.filter((r) => r.data.scope === scope);
  const scopedOverrides = overridesForScope(
    scope,
    overrides.records.map((r) => r.data),
  );

  return (
    <div
      data-manual-data
      data-scope={scope}
      style={{
        marginTop: 20,
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--bg-elev)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          padding: '10px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>事業・数値の手入力</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-mute)' }}>
          この画面に任意の数値を足す / 置き換える（{mine.length} 件
          {scopedOverrides.length > 0 ? ` ・置き換え ${scopedOverrides.length} 件` : ''}）
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BusinessUnits
            units={sorted}
            onAdd={(e) => units.add(e)}
            onRemove={(id) => units.remove(id)}
          />

          <ManualMetrics
            scope={scope}
            units={sorted}
            rows={mineWithId.map((r) => ({ id: r.id, data: r.data }))}
            onAdd={(e) => metrics.add({ ...e, scope } as ManualMetricEntry)}
            onRemove={(id) => metrics.remove(id)}
          />

          {hasCatalog(scope) && (
            <Overrides
              scope={scope}
              rows={overrides.records.filter((r) => r.data.scope === scope)}
              onSave={async (path, value) => {
                const existing = overrides.records.find(
                  (r) => r.data.scope === scope && r.data.path === path,
                );
                if (existing !== undefined) await overrides.edit(existing.id, { value });
                else await overrides.add({ scope, path, value } as ManualOverrideEntry);
              }}
              onClear={(id) => overrides.remove(id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Heading({ text, hint }: { text: string; hint: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{text}</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>{hint}</div>
    </div>
  );
}

function BusinessUnits({
  units,
  onAdd,
  onRemove,
}: {
  units: readonly BusinessUnitRecord[];
  onAdd: (e: BusinessUnitInput) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    name: '',
    category: '',
    startedOn: '',
    note: '',
    revenue: '',
    variableCost: '',
    fixedCost: '',
  });
  const [error, setError] = useState<string>();

  async function add() {
    const parsed = parseBusinessUnit(draft);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(undefined);
    await onAdd(parsed.entry);
    setDraft({ name: '', category: '', startedOn: '', note: '', revenue: '', variableCost: '', fixedCost: '' });
  }

  return (
    <div data-business-units style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Heading
        text="事業"
        hint="複数の事業を持っている場合はここに登録すると、数値を事業ごとに分けられます。事業を消しても数値は残ります。月次の売上高を入れると、経営サマリーの「事業別 財務指標分析」に自分の事業として並びます。"
      />
      {units.map((u) => (
        <div
          key={u.id}
          data-business-unit
          style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}
        >
          <strong style={{ minWidth: 140 }}>{u.data.name}</strong>
          {typeof u.data.category === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.data.category}</span>
          )}
          {typeof u.data.startedOn === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.data.startedOn}〜</span>
          )}
          {typeof u.data.note === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.data.note}</span>
          )}
          {typeof u.data.revenue === 'number' && (
            <span data-business-amounts style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              月次 売上 {u.data.revenue.toLocaleString()} 円
              {typeof u.data.variableCost === 'number' && ` / 変動費 ${u.data.variableCost.toLocaleString()} 円`}
              {typeof u.data.fixedCost === 'number' && ` / 固定費 ${u.data.fixedCost.toLocaleString()} 円`}
            </span>
          )}
          <button type="button" onClick={() => fireReported(onRemove(u.id))} style={{ fontSize: 12 }}>
            削除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          aria-label="事業名"
          placeholder="事業名"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          style={{ ...input, width: 170 }}
        />
        <input
          type="text"
          aria-label="区分"
          placeholder="区分 (任意)"
          value={draft.category}
          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
          style={{ ...input, width: 120 }}
        />
        <input
          type="text"
          aria-label="開始時期"
          placeholder="開始 YYYY-MM (任意)"
          value={draft.startedOn}
          onChange={(e) => setDraft((d) => ({ ...d, startedOn: e.target.value }))}
          style={{ ...input, width: 150 }}
        />
        <input
          type="text"
          aria-label="事業のメモ"
          placeholder="メモ (任意)"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          style={{ ...input, width: 170 }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="月次の売上高"
          placeholder="月次 売上高 (任意)"
          value={draft.revenue}
          onChange={(e) => setDraft((d) => ({ ...d, revenue: e.target.value }))}
          style={{ ...input, width: 150 }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="月次の変動費"
          placeholder="月次 変動費 (任意)"
          value={draft.variableCost}
          onChange={(e) => setDraft((d) => ({ ...d, variableCost: e.target.value }))}
          style={{ ...input, width: 150 }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="月次の固定費"
          placeholder="月次 固定費 (任意)"
          value={draft.fixedCost}
          onChange={(e) => setDraft((d) => ({ ...d, fixedCost: e.target.value }))}
          style={{ ...input, width: 150 }}
        />
        <button type="button" onClick={() => fireReported(add())} style={{ fontSize: 12 }}>
          事業を追加
        </button>
        {error !== undefined && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
      </div>
    </div>
  );
}

function ManualMetrics({
  scope,
  units,
  rows,
  onAdd,
  onRemove,
}: {
  scope: string;
  units: readonly BusinessUnitRecord[];
  rows: readonly { id: string; data: ManualMetricEntry }[];
  onAdd: (e: Record<string, unknown>) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    label: '',
    value: '',
    unit: 'yen' as MetricUnit,
    note: '',
    businessId: '',
  });
  const [error, setError] = useState<string>();

  async function add() {
    const parsed = parseManualMetric(draft);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(undefined);
    await onAdd(parsed.entry as unknown as Record<string, unknown>);
    setDraft({ label: '', value: '', unit: 'yen', note: '', businessId: '' });
  }

  return (
    <div data-manual-metrics style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Heading
        text="任意の数値"
        hint={`この画面（${scope}）に、アプリが計算しない数字を足せます。事業を選ぶと事業ごとに分かれます。`}
      />
      {rows.map((r) => {
        const business = findBusinessName(units, r.data.businessId);
        return (
          <div
            key={r.id}
            data-manual-metric
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}
          >
            <span style={{ minWidth: 170 }}>{r.data.label}</span>
            <strong>{formatMetric(r.data.value, r.data.unit)}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              {business ?? '事業の指定なし'}
            </span>
            {typeof r.data.note === 'string' && (
              <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{r.data.note}</span>
            )}
            <button type="button" onClick={() => fireReported(onRemove(r.id))} style={{ fontSize: 12 }}>
              削除
            </button>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          aria-label="項目名"
          placeholder="項目名"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
          style={{ ...input, width: 170 }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="値"
          placeholder="値"
          value={draft.value}
          onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
          style={{ ...input, width: 100 }}
        />
        <select
          aria-label="単位"
          value={draft.unit}
          onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value as MetricUnit }))}
          style={{ ...input, width: 90 }}
        >
          {UNIT_LABELS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <select
          aria-label="紐づける事業"
          value={draft.businessId}
          onChange={(e) => setDraft((d) => ({ ...d, businessId: e.target.value }))}
          style={{ ...input, width: 150 }}
        >
          <option value="">事業の指定なし</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.data.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="数値のメモ"
          placeholder="メモ (任意)"
          value={draft.note}
          onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
          style={{ ...input, width: 170 }}
        />
        <button type="button" onClick={() => fireReported(add())} style={{ fontSize: 12 }}>
          数値を追加
        </button>
        {error !== undefined && <span style={{ fontSize: 11, color: '#ef4444' }}>{error}</span>}
      </div>
    </div>
  );
}

function Overrides({
  scope,
  rows,
  onSave,
  onClear,
}: {
  scope: string;
  rows: readonly { id: string; data: ManualOverrideEntry }[];
  onSave: (path: string, value: number) => Promise<void> | void;
  onClear: (id: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const byPath = new Map(rows.map((r) => [r.data.path, r]));

  async function save(path: string, unit: MetricUnit) {
    const parsed = parseOverrideValue(draft[path] ?? '', unit);
    if (!parsed.ok) {
      setErrors((e) => ({ ...e, [path]: parsed.reason }));
      return;
    }
    setErrors((e) => ({ ...e, [path]: '' }));
    await onSave(path, parsed.value);
    setDraft((d) => ({ ...d, [path]: '' }));
  }

  return (
    <div data-manual-overrides style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Heading
        text="計算値の置き換え"
        hint="アプリが計算した数字を手で置き換えます。置いた数字から計算される指標は自動値のままなので、必要なものは併せて置いてください。"
      />
      {sectionsFor(scope).map((group) => (
        <div key={group.section} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 2 }}>
            {group.section}
          </div>
          {group.fields.map((f) => {
            const hit = byPath.get(f.path);
            return (
              <div
                key={f.path}
                data-override-row={f.path}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 13, minWidth: 170 }}>{f.label}</span>
                {hit !== undefined && (
                  <span
                    data-overridden
                    style={{
                      fontSize: 11,
                      color: '#22c55e',
                      border: '1px solid #22c55e',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    手入力 {formatMetric(hit.data.value, f.unit)}
                  </span>
                )}
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${f.label} を手入力`}
                  placeholder={hit === undefined ? '手入力' : '上書き'}
                  value={draft[f.path] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                  style={{ ...input, width: 110 }}
                />
                <button type="button" onClick={() => fireReported(save(f.path, f.unit))} style={{ fontSize: 12 }}>
                  保存
                </button>
                {hit !== undefined && (
                  <button type="button" onClick={() => fireReported(onClear(hit.id))} style={{ fontSize: 12 }}>
                    自動に戻す
                  </button>
                )}
                {(errors[f.path] ?? '') !== '' && (
                  <span style={{ fontSize: 11, color: '#ef4444' }}>{errors[f.path]}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
