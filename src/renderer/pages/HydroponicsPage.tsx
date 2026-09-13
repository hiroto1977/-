import { useMemo, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { Stat } from '../components/Stat';
import { tableStyle, thStyle, tdStyle } from '../components/tableStyles';
import { useServiceData } from '../hooks/useServiceData';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { SNAPSHOT } from '../data/snapshot';
import { localIsoDate } from '../../shared/localDate';
import {
  HYDROPONIC_CROPS_COLLECTION,
  cropListFromRecords,
  HYDROPONICS_COLLECTION,
  HYDROPONICS_DEFAULTS,
  type HydroponicCropListRecord,
  type HydroponicsSetup,
} from '../data/hydroponicsSetup';
import { latestRecord } from '../data/latestRecord';
import {
  batchesFromRecords,
  controlRecordFromRecords,
  dosingFrom,
  HYDROPONICS_BATCHES_COLLECTION,
  HYDROPONICS_CONTROL_COLLECTION,
  HYDROPONICS_CONTROL_DEFAULTS,
  HYDROPONICS_READINGS_COLLECTION,
  MAX_BATCH_ID_CHARS,
  MAX_HYDROPONICS_NOTE_CHARS,
  parseBatch,
  parseControlRecord,
  parseReading,
  readingsFromRecords,
  settingsFrom,
  targetsFrom,
  type CultivationBatchRecord,
  type HydroponicReadingRecord,
  type HydroponicsControlRecord,
} from '../data/hydroponicsLog';
import {
  assessReading,
  batchSchedule,
  BATCH_STATE_LABELS,
  dailyTasks,
  latestReading,
  lowPotassiumSwitchDate,
  nextSolutionChange,
  READING_FIELDS,
  READING_FIELD_SPECS,
  summarize,
  TARGET_BASIS,
  type BatchState,
  type ControlInput,
  type DoseAdvice,
  type FieldStatus,
  type ReadingField,
  type TaskSeverity,
} from '../../shared/hydroponicsControl';
import { findCrop } from '../../shared/hydroponicCrops';

/**
 * 水耕栽培 — **運転管理**の画面 (2026-09-13 · パス 194)。
 *
 * 経営サマリーの「水耕栽培の試算」は**事業として成り立つか**を見る。ここは
 * **動いている栽培室を毎日回す**ための画面である:
 *
 *   今日やること ← 測定の判定 + 工程の日程 + 養液交換の周期
 *   測定を記録   → EC / pH / 温度 / 湿度 / CO₂ / 溶存酸素 / 液位
 *   栽培ロット   → 播種 → 定植 → 収穫 の予定と実績
 *   運転の設定   → 目標域・タンク容量・原液の EC 上昇率・アルカリ度
 *
 * **画面が守ること** (判定の側は `shared/hydroponicsControl.ts` が持つ):
 * - 空欄は「未測定」として保存し、0 にしない。判定も「未測定」を緑にしない
 * - 読めない値は保存する前に断る (文を出す)
 * - 量を出せないときは**足りない物の名前**を出す (推定値を出さない)
 * - 根拠が目安の値には印を付ける (`TARGET_BASIS`)
 */

const SEVERITY_COLOR: Readonly<Record<TaskSeverity, string>> = {
  alert: '#ef4444',
  warn: '#f59e0b',
  info: '#60a5fa',
};
const SEVERITY_LABEL: Readonly<Record<TaskSeverity, string>> = {
  alert: '要対応',
  warn: '今日',
  info: '確認',
};

const STATUS_LABEL: Readonly<Record<FieldStatus, string>> = {
  ok: '適正',
  low: '低い',
  high: '高い',
  unmeasured: '未測定',
  unreadable: '読めません',
};
const STATUS_COLOR: Readonly<Record<FieldStatus, string | undefined>> = {
  ok: '#22c55e',
  low: '#f59e0b',
  high: '#f59e0b',
  // **未測定は緑でも赤でもない。** 色を付けないことで「判定していない」を示す。
  unmeasured: undefined,
  unreadable: '#ef4444',
};

/** 目標域の表示。片側しか効かない項目は「N 以上」。 */
function rangeText(low: number | null, high: number | null, unit: string): string {
  if (low !== null && high !== null) return `${low}〜${high}${unit}`;
  if (low !== null) return `${low}${unit} 以上`;
  if (high !== null) return `${high}${unit} 以下`;
  return '—';
}

/** 調製の答えを 1 文にする。**量を出せないときは足りない物を並べる。** */
function doseText(d: DoseAdvice): string {
  switch (d.kind) {
    case 'none':
      return d.why;
    case 'add-stock':
      return `原液を約 ${Math.round(d.ml).toLocaleString('en-US')} mL 足す — ${d.why}`;
    case 'dilute':
      return `水を約 ${Math.round(d.liters).toLocaleString('en-US')} L 足して薄める — ${d.why}`;
    case 'add-acid':
      return `酸を約 ${Math.round(d.ml).toLocaleString('en-US')} mL — ${d.why}`;
    case 'top-up':
      return `水を約 ${Math.round(d.liters).toLocaleString('en-US')} L 補水 — ${d.why}`;
    case 'cannot':
      return `量は出せません (足りない: ${d.missing.join(' / ')})。${d.how}`;
    // Stryker disable next-line all: 網羅性チェック用の到達不能 default
    default: {
      const _exhaustive: never = d;
      return _exhaustive;
    }
  }
}

type ReadingForm = Record<ReadingField, string>;
const EMPTY_READING: ReadingForm = READING_FIELDS.reduce<ReadingForm>(
  (acc, f) => ({ ...acc, [f]: '' }),
  {} as ReadingForm,
);

interface BatchForm {
  id: string;
  cropId: string;
  sowDate: string;
  panels: string;
  state: BatchState;
  transplantedDate: string;
  harvestedDate: string;
  solutionChangedDate: string;
  note: string;
}

export function HydroponicsPage() {
  const { data, source, status, errorMessage, refresh } = useServiceData('hydroponics', SNAPSHOT.hydroponics);

  const readingCol = useCollection<HydroponicReadingRecord>(HYDROPONICS_READINGS_COLLECTION);
  const batchCol = useCollection<CultivationBatchRecord>(HYDROPONICS_BATCHES_COLLECTION);
  const controlCol = useCollection<HydroponicsControlRecord>(HYDROPONICS_CONTROL_COLLECTION);
  const setupCol = useCollection<HydroponicsSetup>(HYDROPONICS_COLLECTION);
  const cropCol = useCollection<HydroponicCropListRecord>(HYDROPONIC_CROPS_COLLECTION);

  const crops = useMemo(() => cropListFromRecords(cropCol.records), [cropCol.records]);
  const setup = useMemo(
    () => latestRecord(setupCol.records)?.data ?? HYDROPONICS_DEFAULTS,
    [setupCol.records],
  );
  const control = useMemo(() => controlRecordFromRecords(controlCol.records), [controlCol.records]);
  const readings = useMemo(() => readingsFromRecords(readingCol.records), [readingCol.records]);
  const batches = useMemo(() => batchesFromRecords(batchCol.records), [batchCol.records]);

  const today = localIsoDate();
  const input: ControlInput = useMemo(
    () => ({
      today,
      crops,
      batches: batches.items,
      readings: readings.items,
      targets: targetsFrom(control),
      dosing: dosingFrom(control),
      settings: settingsFrom(
        control,
        setup.lowPotassium === true,
        // 形の判定は `Number.isFinite` を必ず見る (パス 98) —— `typeof` だけだと
        // 保存された NaN を日数として通し、切替日が読めない日付になる。
        Number.isFinite(setup.switchDaysBeforeHarvest)
          ? (setup.switchDaysBeforeHarvest as number)
          : null,
      ),
    }),
    [today, crops, batches.items, readings.items, control, setup],
  );

  const tasks = useMemo(() => dailyTasks(input), [input]);
  const summary = useMemo(() => summarize(input), [input]);
  const latest = useMemo(() => latestReading(readings.items), [readings.items]);
  const assessment = useMemo(() => {
    if (latest === null) return null;
    const batch = latest.batchId === null ? undefined : batches.items.find((b) => b.id === latest.batchId);
    const crop = (batch === undefined ? undefined : findCrop(crops, batch.cropId)) ?? crops[0]!;
    return assessReading(latest, crop, input.targets);
  }, [latest, batches.items, crops, input.targets]);

  // --- 測定を記録 --------------------------------------------------------
  const [readingForm, setReadingForm] = useState<ReadingForm>(EMPTY_READING);
  const [readingAt, setReadingAt] = useState(today);
  const [readingBatch, setReadingBatch] = useState('');
  const [readingNote, setReadingNote] = useState('');
  const [readingError, setReadingError] = useState<string | null>(null);
  const [readingOk, setReadingOk] = useState<string | null>(null);
  const readingGuard = useSubmitGuard();

  async function saveReading(): Promise<void> {
    setReadingError(null);
    setReadingOk(null);
    let record: HydroponicReadingRecord;
    try {
      record = parseReading({
        at: readingAt,
        values: readingForm,
        batchId: readingBatch,
        note: readingNote,
      });
    } catch (err) {
      setReadingError(err instanceof Error ? err.message : String(err));
      return;
    }
    try {
      await readingCol.add(record);
    } catch {
      // 保存の失敗は端末の報せ (`useCollection` が経路へ流す) に加えて、押した場所にも出す。
      setReadingError('保存できませんでした (端末の保存領域を確認してください)');
      return;
    }
    setReadingForm(EMPTY_READING);
    setReadingNote('');
    setReadingOk(`${record.at} の測定を記録しました`);
  }

  // --- ロット ------------------------------------------------------------
  const [batchForm, setBatchForm] = useState<BatchForm>({
    id: '',
    cropId: crops[0]?.id ?? '',
    sowDate: today,
    panels: '',
    state: 'nursery',
    transplantedDate: '',
    harvestedDate: '',
    solutionChangedDate: '',
    note: '',
  });
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchOk, setBatchOk] = useState<string | null>(null);
  const batchGuard = useSubmitGuard();

  async function saveBatch(): Promise<void> {
    setBatchError(null);
    setBatchOk(null);
    let record: CultivationBatchRecord;
    try {
      record = parseBatch({ ...batchForm, cropId: batchForm.cropId || (crops[0]?.id ?? '') });
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (batches.items.some((b) => b.id === record.id)) {
      setBatchError(`ロット名 "${record.id}" は既に在ります (別の名前にしてください)`);
      return;
    }
    try {
      await batchCol.add(record);
    } catch {
      setBatchError('保存できませんでした (端末の保存領域を確認してください)');
      return;
    }
    setBatchForm((f) => ({ ...f, id: '', panels: '', note: '' }));
    setBatchOk(`ロット "${record.id}" を追加しました`);
  }

  const removeGuard = useSubmitGuard();

  /**
   * ロットを消す。**拒否を捨てない** —— `void col.remove(...)` にすると
   * 端末が断ったときに画面が何も言わない (`deviceStoreWritePolicy` の規則)。
   */
  async function removeBatch(batchId: string): Promise<void> {
    setBatchError(null);
    setBatchOk(null);
    const rec = batchCol.records.find((r) => (r.data as { id?: unknown }).id === batchId);
    if (rec === undefined) {
      // 別のタブで消された / 控えが読めない。**黙って何もしないのではなく言う。**
      setBatchError(`ロット "${batchId}" の控えが見つかりません (他のタブで消された可能性)。更新してください`);
      return;
    }
    try {
      await batchCol.remove(rec.id);
    } catch {
      setBatchError(`ロット "${batchId}" を削除できませんでした (端末の保存領域を確認してください)`);
      return;
    }
    setBatchOk(`ロット "${batchId}" を削除しました`);
  }

  // --- 運転の設定 --------------------------------------------------------
  const [controlForm, setControlForm] = useState<Record<string, string> | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlOk, setControlOk] = useState<string | null>(null);
  const controlGuard = useSubmitGuard();

  /** 入力欄を今の設定で開く (`null` = 閉じている)。 */
  function openControlForm(): void {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(control)) out[k] = v === null ? '' : String(v);
    setControlForm(out);
    setControlError(null);
    setControlOk(null);
  }

  async function saveControl(): Promise<void> {
    if (controlForm === null) return;
    setControlError(null);
    setControlOk(null);
    let record: HydroponicsControlRecord;
    try {
      record = parseControlRecord(controlForm);
    } catch (err) {
      setControlError(err instanceof Error ? err.message : String(err));
      return;
    }
    try {
      await controlCol.add(record);
    } catch {
      setControlError('保存できませんでした (端末の保存領域を確認してください)');
      return;
    }
    setControlForm(null);
    setControlOk('運転の設定を保存しました');
  }

  const label = (f: ReadingField): string => READING_FIELD_SPECS[f].label;
  const num = (n: number, digits: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <>
      <StatusBar
        who="水耕栽培 (運転管理)"
        serviceId="hydroponics"
        source={source}
        status={status}
        errorMessage={errorMessage}
        onRefresh={refresh}
      />

      <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.7, color: '#94a3b8' }}>
        毎日の測定を記録すると、<strong>判定と「今日やること」を自動で作ります</strong>。
        播種日と品目から定植・収穫・養液交換の日程も出します。
        測定値・ロット・設定は<strong>この端末の中だけ</strong>に保存され、外へは送りません。
      </p>
      <p
        data-hydroponics-basis
        style={{ margin: '0 0 16px', fontSize: 12, lineHeight: 1.7, color: '#fbbf24' }}
      >
        ⚠ 目標域の初期値は<strong>実務で広く使われる幅を置いた目安</strong>で、出典で検証した値では
        ありません。品目・季節・光量で適正域は動きます —— <strong>自分の実測に置き換えて</strong>
        使ってください (下の「運転の設定」で変えられます)。
      </p>

      {/* --- 今日やること --------------------------------------------- */}
      <Section title={`今日やること (${today})`} count={tasks.length}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <Stat label="要対応" value={`${summary.alerts} 件`} positive={summary.alerts === 0 ? true : false} />
          <Stat label="今日" value={`${summary.warns} 件`} />
          <Stat label="確認" value={`${summary.infos} 件`} />
          <Stat
            label="直近の測定"
            value={latest === null ? '—' : latest.at}
            positive={summary.allOk ? true : undefined}
          />
        </div>
        {summary.noReadings && (
          <p data-hydroponics-no-readings style={{ fontSize: 13, color: '#fbbf24', margin: '0 0 12px' }}>
            測定の記録がまだ 1 件もありません。<strong>「全部正常」ではなく「まだ分からない」</strong>状態です。
          </p>
        )}
        {tasks.length === 0 && !summary.noReadings && (
          <p style={{ fontSize: 13, color: '#22c55e', margin: 0 }}>
            今日やることはありません (直近の測定は全項目が適正域の中です)。
          </p>
        )}
        {tasks.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>重さ</th>
                <th style={thStyle}>作業</th>
                <th style={thStyle}>理由</th>
                <th style={thStyle}>期限</th>
                <th style={thStyle}>調製</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} data-hydroponics-task={t.id}>
                  <td style={{ ...tdStyle, color: SEVERITY_COLOR[t.severity], whiteSpace: 'nowrap' }}>
                    {SEVERITY_LABEL[t.severity]}
                  </td>
                  <td style={tdStyle}>{t.label}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#94a3b8' }}>{t.why}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {t.dueDate ?? '—'}
                    {t.overdueDays !== null && t.overdueDays > 0 ? ` (${t.overdueDays} 日遅れ)` : ''}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{t.dose === null ? '—' : doseText(t.dose)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* --- 直近の測定の判定 ----------------------------------------- */}
      <Section title="直近の測定の判定" count={assessment?.fields.length}>
        {assessment === null ? (
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>測定を記録すると判定が出ます。</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>
              {assessment.at} の測定 — 測れた {assessment.measured} 項目 / 未測定 {assessment.unmeasured} /
              読めない {assessment.unreadable} / 範囲外 {assessment.outOfRange}
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>項目</th>
                  <th style={thStyle}>測定値</th>
                  <th style={thStyle}>目標域</th>
                  <th style={thStyle}>判定</th>
                  <th style={thStyle}>根拠</th>
                </tr>
              </thead>
              <tbody>
                {assessment.fields.map((f) => {
                  const spec = READING_FIELD_SPECS[f.field];
                  return (
                    <tr key={f.field} data-hydroponics-field={f.field}>
                      <td style={tdStyle}>{spec.label}</td>
                      <td style={tdStyle}>
                        {f.value === null ? '—' : `${num(f.value, spec.digits)}${spec.unit}`}
                      </td>
                      <td style={tdStyle}>{rangeText(f.targetLow, f.targetHigh, spec.unit)}</td>
                      <td style={{ ...tdStyle, color: STATUS_COLOR[f.status] }}>
                        {STATUS_LABEL[f.status]}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#94a3b8' }}>
                        {TARGET_BASIS[f.field] === 'sourced' ? '出典あり' : '目安'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {readings.unreadable > 0 && (
          <p data-hydroponics-unreadable style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
            ⚠ 保存されている測定のうち {readings.unreadable} 件は読めませんでした (日付が壊れている控え)。
            件数だけ数えて集計から外しています。
          </p>
        )}
      </Section>

      {/* --- 測定を記録 ----------------------------------------------- */}
      <Section title="測定を記録">
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>
          <strong>測っていない項目は空欄のままにしてください</strong> —— 0 を入れると「0 を測った」
          という記録になります。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>
            測定日
            <input
              type="date"
              value={readingAt}
              onChange={(e) => setReadingAt(e.target.value)}
              data-hydroponics-input="at"
              style={{ marginLeft: 6 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            ロット (任意)
            <select
              value={readingBatch}
              onChange={(e) => setReadingBatch(e.target.value)}
              data-hydroponics-input="batchId"
              style={{ marginLeft: 6 }}
            >
              <option value="">指定しない</option>
              {batches.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {READING_FIELDS.map((f) => {
            const spec = READING_FIELD_SPECS[f];
            return (
              <label key={f} style={{ fontSize: 12, display: 'block' }}>
                {spec.label}
                {spec.unit === '' ? '' : ` (${spec.unit})`}
                <input
                  type="text"
                  inputMode="decimal"
                  value={readingForm[f]}
                  onChange={(e) => setReadingForm((v) => ({ ...v, [f]: e.target.value }))}
                  placeholder={`${spec.plausibleMin}〜${spec.plausibleMax}`}
                  data-hydroponics-input={f}
                  style={{ width: '100%', marginTop: 2 }}
                />
              </label>
            );
          })}
        </div>
        <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          メモ (任意)
          <input
            type="text"
            value={readingNote}
            onChange={(e) => setReadingNote(e.target.value)}
            data-hydroponics-input="note"
            style={{ width: '100%', marginTop: 2 }}
          />
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {MAX_HYDROPONICS_NOTE_CHARS.toLocaleString('en-US')} 字まで (超えると保存しません)
          </span>
        </label>
        <button
          type="button"
          data-hydroponics-save="reading"
          disabled={readingGuard.busy}
          onClick={() => void readingGuard.run(saveReading)}
          style={{ marginTop: 10 }}
        >
          {readingGuard.busy ? '保存中…' : '測定を記録'}
        </button>
        {readingError !== null && (
          <p data-hydroponics-error="reading" style={{ color: '#ef4444', fontSize: 13 }}>
            ⚠ {readingError}
          </p>
        )}
        {readingOk !== null && (
          <p data-hydroponics-ok="reading" style={{ color: '#22c55e', fontSize: 13 }}>
            ✅ {readingOk}
          </p>
        )}
      </Section>

      {/* --- 栽培ロット ----------------------------------------------- */}
      <Section title="栽培ロット" count={batches.items.length}>
        {batches.items.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 12px' }}>
            ロットがまだありません。播種日と品目を入れると、定植・収穫・養液交換の予定が出ます。
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>ロット</th>
                <th style={thStyle}>品目</th>
                <th style={thStyle}>状態</th>
                <th style={thStyle}>播種</th>
                <th style={thStyle}>定植予定</th>
                <th style={thStyle}>収穫予定</th>
                <th style={thStyle}>養液交換</th>
                <th style={thStyle}>K 抜き切替</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {batches.items.map((b) => {
                const crop = findCrop(crops, b.cropId);
                const sched = crop === undefined ? null : batchSchedule(b, crop);
                const kSwitch =
                  sched === null || input.settings.lowPotassiumSwitchDays === null
                    ? null
                    : lowPotassiumSwitchDate(sched, input.settings.lowPotassiumSwitchDays);
                return (
                  <tr key={b.id} data-hydroponics-batch={b.id}>
                    <td style={tdStyle}>{b.id}</td>
                    <td style={tdStyle}>{crop?.label ?? `(${b.cropId} — 見つかりません)`}</td>
                    <td style={tdStyle}>{BATCH_STATE_LABELS[b.state]}</td>
                    <td style={tdStyle}>{b.sowDate}</td>
                    <td style={tdStyle}>{sched?.transplantDue ?? '—'}</td>
                    <td style={tdStyle}>
                      {sched?.harvestDue ?? '—'}
                      {sched?.harvestCountedFrom === 'actual-transplant' ? ' (実績起算)' : ''}
                    </td>
                    <td style={tdStyle}>
                      {nextSolutionChange(b, input.settings.solutionChangeIntervalDays) ?? '—'}
                    </td>
                    <td style={tdStyle}>{input.settings.lowPotassium ? (kSwitch ?? '—') : '—'}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        data-hydroponics-remove-batch={b.id}
                        disabled={removeGuard.busy}
                        onClick={() => void removeGuard.run(() => removeBatch(b.id))}
                        style={{ color: '#ef4444' }}
                      >
                        {removeGuard.busy ? '削除中…' : '削除'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {batches.unreadable > 0 && (
          <p data-hydroponics-unreadable-batches style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
            ⚠ 保存されているロットのうち {batches.unreadable} 件は読めませんでした。
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <label style={{ fontSize: 12 }}>
            ロット名
            <input
              type="text"
              value={batchForm.id}
              maxLength={MAX_BATCH_ID_CHARS}
              onChange={(e) => setBatchForm((f) => ({ ...f, id: e.target.value }))}
              data-hydroponics-input="batch-id"
              style={{ marginLeft: 6 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            品目
            <select
              value={batchForm.cropId}
              onChange={(e) => setBatchForm((f) => ({ ...f, cropId: e.target.value }))}
              data-hydroponics-input="batch-crop"
              style={{ marginLeft: 6 }}
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            播種日
            <input
              type="date"
              value={batchForm.sowDate}
              onChange={(e) => setBatchForm((f) => ({ ...f, sowDate: e.target.value }))}
              data-hydroponics-input="batch-sow"
              style={{ marginLeft: 6 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            パネル枚数
            <input
              type="text"
              inputMode="numeric"
              value={batchForm.panels}
              onChange={(e) => setBatchForm((f) => ({ ...f, panels: e.target.value }))}
              data-hydroponics-input="batch-panels"
              style={{ marginLeft: 6, width: 80 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            状態
            <select
              value={batchForm.state}
              onChange={(e) => setBatchForm((f) => ({ ...f, state: e.target.value as BatchState }))}
              data-hydroponics-input="batch-state"
              style={{ marginLeft: 6 }}
            >
              {(Object.keys(BATCH_STATE_LABELS) as BatchState[]).map((s) => (
                <option key={s} value={s}>
                  {BATCH_STATE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            定植日 (済みなら)
            <input
              type="date"
              value={batchForm.transplantedDate}
              onChange={(e) => setBatchForm((f) => ({ ...f, transplantedDate: e.target.value }))}
              data-hydroponics-input="batch-transplanted"
              style={{ marginLeft: 6 }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            養液交換日 (最後)
            <input
              type="date"
              value={batchForm.solutionChangedDate}
              onChange={(e) => setBatchForm((f) => ({ ...f, solutionChangedDate: e.target.value }))}
              data-hydroponics-input="batch-changed"
              style={{ marginLeft: 6 }}
            />
          </label>
        </div>
        <button
          type="button"
          data-hydroponics-save="batch"
          disabled={batchGuard.busy}
          onClick={() => void batchGuard.run(saveBatch)}
          style={{ marginTop: 10 }}
        >
          {batchGuard.busy ? '保存中…' : 'ロットを追加'}
        </button>
        {batchError !== null && (
          <p data-hydroponics-error="batch" style={{ color: '#ef4444', fontSize: 13 }}>
            ⚠ {batchError}
          </p>
        )}
        {batchOk !== null && (
          <p data-hydroponics-ok="batch" style={{ color: '#22c55e', fontSize: 13 }}>
            ✅ {batchOk}
          </p>
        )}
      </Section>

      {/* --- 運転の設定 ----------------------------------------------- */}
      <Section title="運転の設定">
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>
          <strong>タンク容量・原液の EC 上昇率・アルカリ度を入れると、調製の量が出ます。</strong>
          入れていない間は「量は出せません」と足りない物の名前を出します —— 推定値では養液を壊すので
          出しません。
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>項目</th>
              <th style={thStyle}>今の値</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['養液温度の目標域', rangeText(control.waterTempLowC, control.waterTempHighC, '℃')],
              ['室温の目標域', rangeText(control.airTempLowC, control.airTempHighC, '℃')],
              ['相対湿度の目標域', rangeText(control.humidityLowPct, control.humidityHighPct, '%')],
              ['CO₂ の目標域', rangeText(control.co2LowPpm, control.co2HighPpm, 'ppm')],
              ['溶存酸素の下限', rangeText(control.dissolvedOxygenLowMgL, null, 'mg/L')],
              ['液位の下限', rangeText(control.waterLevelLowPct, null, '%')],
              ['養液タンクの容量', control.tankLiters === null ? '未入力' : `${control.tankLiters} L`],
              [
                '原液の EC 上昇率',
                control.stockEcRisePerMlPerL === null
                  ? '未入力'
                  : `${control.stockEcRisePerMlPerL} mS/cm (mL/L あたり)`,
              ],
              [
                '原水のアルカリ度',
                control.alkalinityMgCaCO3PerL === null
                  ? '未入力'
                  : `${control.alkalinityMgCaCO3PerL} mg-CaCO₃/L`,
              ],
              ['酸の規定度', control.acidNormality === null ? '未入力' : `${control.acidNormality} N`],
              ['残すアルカリ度', `${control.residualAlkalinityMgCaCO3PerL} mg-CaCO₃/L`],
              ['養液交換の周期', `${control.solutionChangeIntervalDays} 日`],
              ['記録の途絶と見なす日数', `${control.readingStaleDays} 日`],
              ['収穫の予告日数', `${control.harvestNoticeDays} 日`],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={tdStyle}>{k}</td>
                <td style={tdStyle} data-hydroponics-setting={k}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {controlForm === null ? (
          <button type="button" data-hydroponics-edit-control onClick={openControlForm} style={{ marginTop: 10 }}>
            設定を変更
          </button>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
                marginTop: 10,
              }}
            >
              {Object.keys(HYDROPONICS_CONTROL_DEFAULTS).map((k) => (
                <label key={k} style={{ fontSize: 12, display: 'block' }}>
                  {k}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={controlForm[k] ?? ''}
                    onChange={(e) => setControlForm((v) => (v === null ? v : { ...v, [k]: e.target.value }))}
                    data-hydroponics-control-input={k}
                    style={{ width: '100%', marginTop: 2 }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              data-hydroponics-save="control"
              disabled={controlGuard.busy}
              onClick={() => void controlGuard.run(saveControl)}
              style={{ marginTop: 10 }}
            >
              {controlGuard.busy ? '保存中…' : '設定を保存'}
            </button>
            <button type="button" onClick={() => setControlForm(null)} style={{ marginLeft: 8 }}>
              取消
            </button>
          </>
        )}
        {controlError !== null && (
          <p data-hydroponics-error="control" style={{ color: '#ef4444', fontSize: 13 }}>
            ⚠ {controlError}
          </p>
        )}
        {controlOk !== null && (
          <p data-hydroponics-ok="control" style={{ color: '#22c55e', fontSize: 13 }}>
            ✅ {controlOk}
          </p>
        )}
      </Section>

      {/* --- 測定項目の台帳 ------------------------------------------- */}
      <Section title="測定項目の台帳" count={data.fields.length}>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 8px' }}>
          「妥当範囲」は<strong>桁誤りと測定器の異常を止める幅</strong>で、栽培上の適正域では
          ありません (適正域は品目と上の設定で決まります)。
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>項目</th>
              <th style={thStyle}>単位</th>
              <th style={thStyle}>妥当範囲</th>
              <th style={thStyle}>目標域の出所</th>
              <th style={thStyle}>根拠</th>
            </tr>
          </thead>
          <tbody>
            {data.fields.map((f) => (
              <tr key={f.field} data-hydroponics-ledger={f.field}>
                <td style={tdStyle}>{f.label}</td>
                <td style={tdStyle}>{f.unit === '' ? '—' : f.unit}</td>
                <td style={tdStyle}>
                  {f.plausibleMin}〜{f.plausibleMax}
                </td>
                <td style={tdStyle}>{f.targetFrom === 'crop' ? '品目ごと' : '栽培室ごと'}</td>
                <td style={tdStyle}>{f.basis === 'sourced' ? '出典あり' : '目安'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.fields.length === 0 && (
          <p style={{ fontSize: 12, color: '#94a3b8' }}>
            台帳を取得できていません ({label('ec')} などの一覧は「更新」で読み直せます)。
          </p>
        )}
      </Section>
    </>
  );
}
