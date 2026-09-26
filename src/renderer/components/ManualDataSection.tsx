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
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { fireReported } from '../data/deviceStoreFailure';
import { displayField } from '../../shared/apiResponse';
import {
  BUSINESS_CATEGORY_MAX,
  BUSINESS_NAME_MAX,
  BUSINESS_NOTE_MAX,
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
  belongsToScope,
  inertOverrideNote,
  inertOverrides,
  overrideCause,
  parseManualMetric,
  sectionsFor,
  hasCatalog,
  type InertOverride,
  type ManualMetricEntry,
  type ManualOverrideEntry,
} from '../data/manualData';
import {
  CUSTOM_METRIC_MAX_LABEL,
  CUSTOM_METRIC_MAX_NOTE,
  formatMetric,
  parseOverrideValue,
  type MetricUnit,
} from '../data/overviewOverrides';

const input: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
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
  /*
   * **この画面のものを選ぶ規則は 1 本** (`belongsToScope`)。
   *
   * パス 170 まで、見出しの件数は `metricsForScope` で数え、並べる行は
   * `records.filter((r) => r.data.scope === scope)` と**書き直して**いた ——
   * 同じ量を 2 通りに導いていたので、片方だけが動くと
   * 「3 件」と書いて 2 行しか出ない形になりうる (パス 61 の家系)。
   * **件数は並べる配列の長さから出す。**
   */
  const myMetrics = metrics.records.filter((r) => belongsToScope(scope, r.data));
  const myOverrides = overrides.records.filter((r) => belongsToScope(scope, r.data));
  /*
   * **効く行と効かない行を、同じ 1 つの判定 (`overrideCause`) で分ける**
   * (2026-09-24 · パス 447)。置き換え欄の緑の札は「効いている」という主張なので、
   * 捨てられる行にそれを出すと**適用されていない値を適用されたと名乗る**
   * (実測: 値が `NaN` の行は「手入力 NaN 円」と緑で出ながら、画面の数字は自動値のまま)。
   */
  const inert = inertOverrides(scope, myOverrides);
  const appliedOverrides = myOverrides.filter((r) => overrideCause(scope, r.data) === null);

  return (
    <div
      data-manual-data
      data-scope={scope}
      style={{
        marginTop: 20,
        border: '1px solid var(--border)',
        borderRadius: 16,
        background: 'var(--bg-elev)',
        boxShadow: 'var(--shadow-sm)',
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
          この画面に任意の数値を足す / 置き換える（{myMetrics.length} 件
          {myOverrides.length > 0 ? ` ・置き換え ${myOverrides.length} 件` : ''}
          {inert.length > 0 ? `（うち ${inert.length} 件は未適用）` : ''}）
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
            rows={myMetrics.map((r) => ({ id: r.id, data: r.data }))}
            onAdd={(e) => metrics.add({ ...e, scope } as ManualMetricEntry)}
            onRemove={(id) => metrics.remove(id)}
          />

          {hasCatalog(scope) && (
            <Overrides
              scope={scope}
              rows={appliedOverrides}
              onSave={async (path, value) => {
                const existing = myOverrides.find((r) => r.data.path === path);
                if (existing !== undefined) await overrides.edit(existing.id, { value });
                else await overrides.add({ scope, path, value } as ManualOverrideEntry);
              }}
              onClear={(id) => overrides.remove(id)}
            />
          )}

          {/*
            **`hasCatalog` では囲わない** —— 一覧を持たない画面に保存された上書きは、
            囲うとこの欄ごと消えて「数えられるだけで見ることも消すこともできない」
            状態になる (実測: `linux` に 1 件置くと見出しは「置き換え 1 件」と言い、
            パネルは出ず「削除」は 0 件)。逃げ口は保存できた所に置く。
          */}
          {inert.length > 0 && (
            <InertOverrides rows={inert} onRemove={(id) => overrides.remove(id)} />
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
  const submit = useSubmitGuard();

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
          <strong style={{ minWidth: 140 }}>{displayField(u.data.name, BUSINESS_NAME_MAX)}</strong>
          {typeof u.data.category === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{displayField(u.data.category, BUSINESS_CATEGORY_MAX)}</span>
          )}
          {typeof u.data.startedOn === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{u.data.startedOn}〜</span>
          )}
          {typeof u.data.note === 'string' && (
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{displayField(u.data.note, BUSINESS_NOTE_MAX)}</span>
          )}
          {typeof u.data.revenue === 'number' && Number.isFinite(u.data.revenue) && (
            <span data-business-amounts style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              月次 売上 {u.data.revenue.toLocaleString()} 円
              {typeof u.data.variableCost === 'number' && Number.isFinite(u.data.variableCost) && ` / 変動費 ${u.data.variableCost.toLocaleString()} 円`}
              {typeof u.data.fixedCost === 'number' && Number.isFinite(u.data.fixedCost) && ` / 固定費 ${u.data.fixedCost.toLocaleString()} 円`}
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
        <button type="button" onClick={() => fireReported(submit.run(add))} disabled={submit.busy} style={{ fontSize: 12 }}>
          事業を追加
        </button>
        {error !== undefined && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
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
  const submit = useSubmitGuard();

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
            <span style={{ minWidth: 170 }}>{displayField(r.data.label, CUSTOM_METRIC_MAX_LABEL)}</span>
            <strong>{formatMetric(r.data.value, r.data.unit)}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              {business === null ? '事業の指定なし' : displayField(business, BUSINESS_NAME_MAX)}
            </span>
            {typeof r.data.note === 'string' && (
              <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{displayField(r.data.note, CUSTOM_METRIC_MAX_NOTE)}</span>
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
              {displayField(u.data.name, BUSINESS_NAME_MAX)}
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
        <button type="button" onClick={() => fireReported(submit.run(add))} disabled={submit.busy} style={{ fontSize: 12 }}>
          数値を追加
        </button>
        {error !== undefined && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
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
  const submit = useSubmitGuard();

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
                      color: 'var(--success)',
                      border: '1px solid var(--success)',
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
                <button type="button" onClick={() => fireReported(submit.run(() => save(f.path, f.unit)))} disabled={submit.busy} style={{ fontSize: 12 }}>
                  保存
                </button>
                {hit !== undefined && (
                  <button type="button" onClick={() => fireReported(onClear(hit.id))} style={{ fontSize: 12 }}>
                    自動に戻す
                  </button>
                )}
                {(errors[f.path] ?? '') !== '' && (
                  <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errors[f.path]}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * 保存されているのに効かない上書きの一覧 (2026-09-24 · パス 447)。
 *
 * 置き換え欄は**一覧 (catalog) を並べる**ので、一覧に無いパスの行は行そのものが
 * 生えない。ここが**その行を見せて消せる唯一の面**である。
 *
 * パスは保管した文字列なので `displayField` の天井を通す —— 形の表は
 * `path: str` としか言わず長さを見ないので、復元や別の道具が入れた行は
 * いくらでも長くなりうる (パス 419 / 420 の家系)。天井は共有の既定 (256 字) で、
 * 一覧のパスは最長 30 字ほどなので**正当な値は 1 字も切らない**。
 */
function InertOverrides({
  rows,
  onRemove,
}: {
  rows: readonly InertOverride[];
  onRemove: (id: string) => Promise<void> | void;
}) {
  const note = inertOverrideNote(rows);
  return (
    <div data-inert-overrides style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Heading text="使われていない置き換え" hint="保存されていますが、計算には使われていません。" />
      {note !== null && (
        <div role="alert" style={{ fontSize: 11, color: 'var(--warning)', lineHeight: 1.6 }}>
          ⚠ {note}
        </div>
      )}
      {rows.map((r) => (
        <div
          key={r.id}
          data-inert-override={r.cause}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {displayField(r.path)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            {Number.isFinite(r.value) ? r.value.toLocaleString('ja-JP') : String(r.value)}
          </span>
          <button type="button" onClick={() => fireReported(onRemove(r.id))} style={{ fontSize: 12 }}>
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
