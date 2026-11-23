import { useEffect, useMemo, useRef, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { MAX_CSV_IMPORT_BYTES, importSaveFailedNote, readImportText, skippedRowsDetail } from '../data/importFile';
import { fireReported } from '../data/deviceStoreFailure';
import { localIsoDate } from '../../shared/localDate';
import { isoMonthOf } from '../../shared/isoDate';
import {
  SALES_COLLECTION,
  SALES_CHANNELS,
  CHANNEL_LABEL,
  parseSalesEntry,
  summarizeSales,
  monthlyTotals,
  type SalesEntry,
  type SalesChannel,
  duplicateOrdersNote,
  findDuplicateOrders,
  readableSalesRows,
  unreadableSalesRowsNote,
  MAX_SALES_NOTE_CHARS,
  isSalesChannel,
  salesNoteText,
} from '../data/sales';
import { changePctText, compareThisMonth, monthLabel, monthTrendRows } from '../data/salesTrend';
import { displayField, finiteNumberOf } from '../../shared/apiResponse';
import { DASH } from '../../shared/formatters';
import { SALES_CSV_COLUMNS, salesToCsv, salesFromCsv } from '../data/salesCsv';
import { CSV_BOM } from '../data/csv';
import { useRowWindow } from '../data/useRowWindow';
import { RowWindowMore } from '../components/RowWindowMore';
import { LabeledField } from '../components/LabeledField';
import { changedRecordNote, readCollectionNow, unreadableForJudgementNote, vanishedRecordNote } from '../data/readCollectionNow';
import { planSalesSheet, droppedFromSheetNote, tooManyForSheetNote } from '../data/salesSheet';
import { ProxyRequiredNote } from '../components/ProxyRequiredNote';
import { externalTextOnOneLine } from '../data/assistantMarkdown';
import type { ActionData } from '../../shared/actionData';
import {
  MANUAL_OVERRIDES_COLLECTION,
  applyManualOverrides,
  type ManualOverrideEntry,
} from '../data/manualData';

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });

/**
 * 保管した金額を刷る。数として読めなければ `—` (パス 442)。
 *
 * `shared/formatters.ts` の `jpyOrDash` は使わない —— あちらは `¥` (U+00A5)、
 * この一覧は `Intl` の `￥` (U+FFE5) で、揃えると**正しい行の見た目まで変わる**。
 * 床の意味は同じなので、ここは綴りではなく判定を借りる。
 */
function salesAmountText(v: unknown): string {
  const n = finiteNumberOf(v);
  return n === null ? DASH : yen.format(n);
}

const CHANNEL_COLOR: Record<SalesChannel, string> = {
  amazon: '#ff9900',
  shopify: '#95bf47',
  base: '#2c6ef2',
  rakuten: '#bf0000',
  mercari: '#ff0211',
  other: '#94a3b8',
};

const EMPTY = { date: '', channel: 'amazon' as SalesChannel, amount: '', orders: '', note: '' };

/**
 * 1 件を 1 行で言う (「記録しました」「直しました」「消しました」の後ろに付ける)。
 *
 * 消した行は保管した行で、型を検めずに届く (復元・古い版) —— 欄ごとに型から読み、
 * 日付は表示の天井を通す (読めない欄は「不明」と言う)。入力から作った行なら、読める値がそのまま出る。
 */
function entryLine(e: SalesEntry): string {
  const date = displayField(e.date);
  const channel = isSalesChannel(e.channel) ? CHANNEL_LABEL[e.channel] : '販売先不明';
  return `${date === '' ? '日付不明' : date} · ${channel} · ${salesAmountText(e.amount)}`;
}

/**
 * 一覧の 1 行を入力欄へ読み込む形にする。保管した行は型を検めずに届く (復元・古い版) ので、
 * 欄ごとに型から読む —— 読めない欄は空にして、利用者が入れ直す。
 */
function entryToForm(e: SalesEntry): typeof EMPTY {
  const amount = finiteNumberOf(e.amount);
  const orders = finiteNumberOf(e.orders);
  return {
    date: typeof e.date === 'string' ? e.date : '',
    channel: isSalesChannel(e.channel) ? e.channel : 'other',
    amount: amount === null ? '' : String(amount),
    orders: orders === null ? '' : String(orders),
    note: salesNoteText(e),
  };
}

function Tile({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      flex: wide ? '1 1 100%' : 1,
      minWidth: 150,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** Horizontal stacked bar of channel shares. */
function ChannelBar({ parts }: { parts: readonly { channel: SalesChannel; share: number }[] }) {
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', margin: '8px 0' }}>
      {parts.map((p) => (
        <div
          key={p.channel}
          title={`${CHANNEL_LABEL[p.channel]} ${p.share.toFixed(1)}%`}
          style={{ width: `${p.share}%`, background: CHANNEL_COLOR[p.channel] }}
        />
      ))}
    </div>
  );
}

export function SalesPage() {
  const { records, add, addMany, editIfUnchanged, remove } = useCollection<SalesEntry>(SALES_COLLECTION);
  // 日付は今日から始める (売上は「今日の分」を入れることがいちばん多い)。
  const [form, setForm] = useState(() => ({ ...EMPTY, date: localIsoDate() }));
  /** 一覧の「直す」で読み込んだ行。`base` は読み込んだ時の中身 (保存のとき、書き換えられていないかを比べる)。 */
  const [editing, setEditing] = useState<{ readonly id: string; readonly base: SalesEntry } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const submit = useSubmitGuard();
  const [notice, setNotice] = useState<string>();
  /** 「×」で消した直後の 1 件。「元に戻す」が入れ直す (次に記録・修正・取り込みをすると消える)。 */
  const [undo, setUndo] = useState<SalesEntry | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** スプレッドシートへの書き出し。`configured` は Google ドライブの資格情報が在るか (分からなければ `null`)。 */
  const sheetSubmit = useSubmitGuard();
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);
  const [sheetResult, setSheetResult] = useState<
    { readonly kind: 'ok'; readonly message: string; readonly url: string } | { readonly kind: 'error'; readonly message: string }
  >();
  useEffect(() => {
    let alive = true;
    // 分からなければ押せるままにする (断りは送った後の答えが言う)。知っている「無い」だけで止める。
    window.serviceHub
      ?.listConfigured()
      .then((ids) => {
        if (alive) setDriveConfigured(ids.includes('drive'));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const entries = useMemo(() => records.map((r) => r.data), [records]);
  // 明細の窓 (パス 538 · R-3): CSV で 20 万行まで入るので、全行を描くと画面が止まる。
  const rowWindow = useRowWindow(records);
  const computedSummary = useMemo(() => summarizeSales(entries), [entries]);
  // 手入力の上書きを重ねる。入力欄は App が全画面共通で描くので、
  // ここは読んで適用するだけ。上書きが無ければ計算値がそのまま出る。
  const overridesCol = useCollection<ManualOverrideEntry>(MANUAL_OVERRIDES_COLLECTION);
  const overrideRecords = overridesCol.records;
  const applied = useMemo(
    () => applyManualOverrides('sales', computedSummary, overrideRecords.map((r) => r.data)),
    [computedSummary, overrideRecords],
  );
  const summary = applied.overview;
  const months = useMemo(() => monthlyTotals(entries), [entries]);
  const trend = useMemo(() => monthTrendRows(months), [months]);
  // 今月と先月。今月の記録がまだ無ければ額は null (0 円とは言わない)。
  const thisMonth = useMemo(() => {
    const month = isoMonthOf(localIsoDate());
    return month === null ? null : compareThisMonth(months, month);
  }, [months]);
  // 日付が読める行だけの部分集合 (パス 360 の漏斗)。**1 度だけ組んで両方の断りが読む** ——
  // 分子と分母を同じ部分集合から取る (法則 `one-subset-per-answer`)。
  const readable = useMemo(() => readableSalesRows(entries), [entries]);
  // 日付が読めない行は月次推移から落ちる (パス 360)。**落としたことを言う** ——
  // 黙って除くと売上高が小さく出て、利用者は気づけない。
  // 日付と「金額・受注件数」は**別の原因**なので、出る文だけを並べる (パス 442)。
  const unreadableDateNote = useMemo(() => unreadableSalesRowsNote(readable), [readable]);
  // 同じ注文名の重複 (既に在る分)。一覧の上で「2 度数えられている」と言う (パス 126)。
  // **合計と同じ部分集合から数える** —— 素の購読から数えると、日付が読めなくて合計に
  // 入っていない行の重複を「売上高と受注件数に 2 度数えられています」と述べることになり、
  // その文が偽になる (`overview.ts` は 2026-09-22 からそう書いていて、この画面だけが
  // 素のままだった。実測: 総売上 1,000,000 のまま「2 度数えられています」と言っていた)。
  const duplicateNote = useMemo(() => duplicateOrdersNote(findDuplicateOrders(readable.rows)), [readable]);
  /**
   * **読める行が 1 件も無いときの集計は「—」** (2026-09-24 · パス 442)。
   *
   * 空集合の和は算術としては 0 だが、画面の「総売上 ￥0」は*売れていない*という
   * **事実の主張**として読める。実際は*記録が読めていない*で、その理由は
   * すぐ上の断り (`data-unreadable-sales-dates`) が述べている ——
   * パス 395 が書面 §2 と経営サマリーについて下した判断と同じで、
   * **この画面のタイルだけが残っていた** (実測: 日付が読めない行 1 件だけの控えで
   * 総売上 ￥0 / 総注文件数 0 / チャネル数 0)。
   *
   * ★ **手で置いた値は消さない** —— 上書きした欄は利用者自身の主張なので、
   *   読める行が 0 でもその値を出す (パス 382 の `overridden` を読む)。
   * ★ **一覧そのものは畳まない** —— × で消せる逃げ口を閉じない (パス 425)。
   */
  const overridden = useMemo(() => new Set(applied.overridden), [applied]);
  const aggregateText = (path: string, text: string): string =>
    readable.rows.length > 0 || overridden.has(path) ? text : DASH;

  async function onSave() {
    try {
      // 日付は選ぶ欄なので、読めないのは空のときだけ —— 形式の話ではなく「選んでください」と言う。
      if (form.date === '') {
        setError('日付を選んでください。');
        return;
      }
      const parsed = parseSalesEntry(form);
      setError(undefined);
      setNotice(undefined);
      setUndo(null);
      if (editing !== null) {
        // 重ね書きは欄を消せない —— メモを消した修正は、空の文字で上書きする (読む側は空をメモなしと読む)。
        const patch: SalesEntry =
          parsed.note === undefined && editing.base.note !== undefined ? { ...parsed, note: '' } : parsed;
        const result = await editIfUnchanged(editing.id, editing.base, patch);
        if (result.status === 'changed') {
          // 読み込んだ後に別の画面で書き換えられていた —— 書かずに言い、入力を残す。比べる基準を今の行へ移す:
          // もう一度押せば、知ったうえで上書きできる (パス 499)。
          setEditing({ id: editing.id, base: result.current.data });
          setError(changedRecordNote('直していた記録', '入力は残してあります。このまま上書きするなら、もう一度「更新」を押してください。書き換えられた内容から始め直すなら、一覧の「直す」を押してください。'));
          return;
        }
        setEditing(null);
        if (result.status === 'vanished') {
          // 直す相手が消えていた (別の画面で削除) —— 入力は残し、消された行を黙って作り直さない (パス 498)。
          setError(vanishedRecordNote('直していた記録', '入力は残してあります。新しい記録として入れるなら「追加」を押してください。'));
          return;
        }
        setNotice(`直しました: ${entryLine(parsed)}`);
      } else {
        await add(parsed);
        setNotice(`記録しました: ${entryLine(parsed)}`);
      }
      setForm((f) => ({ ...EMPTY, channel: f.channel, date: f.date }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  /** 一覧の「直す」: その行を入力欄へ読み込む。 */
  function onStartEdit(id: string, stored: SalesEntry) {
    setForm(entryToForm(stored));
    setEditing({ id, base: stored });
    setError(undefined);
    setNotice(undefined);
    setUndo(null);
    // 入力欄は一覧より上に在る。スマホでは画面の外なので、見える所へ運ぶ。
    formRef.current?.scrollIntoView?.({ block: 'start' });
  }

  function onCancelEdit() {
    setEditing(null);
    setForm((f) => ({ ...EMPTY, channel: f.channel, date: localIsoDate() }));
    setError(undefined);
  }

  /**
   * 一覧の「×」: その行を消し、消した 1 件を「元に戻す」に取っておく。
   *
   * 「直す」と「×」は隣り合う (スマホでは押し間違える)。確認の窓で止める代わりに、消した後で戻せるようにする。
   * 消せなかったとき (保存先が断った) は取っておかない —— 理由は画面上端の知らせが言う。
   */
  async function onRemove(id: string, stored: SalesEntry) {
    setError(undefined);
    setNotice(undefined);
    await remove(id);
    setUndo(stored);
    // 直している最中の行を消したら、修正をやめる (消した行を「更新」で探しに行かない)。
    if (editing?.id === id) {
      setEditing(null);
      setForm((f) => ({ ...EMPTY, channel: f.channel, date: localIsoDate() }));
    }
  }

  /** 「元に戻す」: 消した 1 件を入れ直す。入れられなかったら取っておいたまま (もう一度押せる)。 */
  async function onUndo() {
    if (undo === null) return;
    await add(undo);
    setNotice(`元に戻しました: ${entryLine(undo)}`);
    setUndo(null);
  }

  function onExport() {
    // Prepend a UTF-8 BOM so Excel opens Japanese text correctly.
    const blob = new Blob([CSV_BOM + salesToCsv(entries)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${localIsoDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 「スプレッドシートに書き出す」: 読める売上の記録を表にし、確かめてから Google へ送る。
   * 送る先と中身は押す前に画面が言い (下の断り)、押した後にもう 1 度確認の窓で言う。
   */
  async function onExportSheet() {
    setSheetResult(undefined);
    // 書き出すのは**保管層の今の一覧** (パス 384 / 497) —— 画面の写しは一覧が届く前・別のタブで書いた後にずれる。
    const stored = await readCollectionNow<SalesEntry>(SALES_COLLECTION);
    if (stored === null) {
      setSheetResult({ kind: 'error', message: unreadableForJudgementNote('売上の一覧') });
      return;
    }
    const plan = planSalesSheet(stored, localIsoDate());
    if (plan.kind === 'empty') {
      setSheetResult({ kind: 'error', message: '書き出せる記録がありません。' });
      return;
    }
    if (plan.kind === 'too-many') {
      setSheetResult({ kind: 'error', message: tooManyForSheetNote(plan.count) });
      return;
    }
    const dropped = droppedFromSheetNote(plan.dropped);
    const ok = window.confirm(
      `売上の記録 ${plan.payload.rows.length} 件 (日付・販売先・金額・注文の数・メモ) を Google に送信し、` +
        `あなたの Google ドライブに新しいスプレッドシート「${plan.payload.title}」を作ります。よろしいですか？` +
        (dropped === null ? '' : `\n${dropped}`),
    );
    if (!ok) return;
    const res = await window.serviceHub.invoke<ActionData<'drive/export-sheet'>>('drive', 'export-sheet', { ...plan.payload });
    if (res.ok) {
      setSheetResult({
        kind: 'ok',
        message: `スプレッドシートを作りました (${plan.payload.rows.length} 件)。${dropped ?? ''}`,
        url: res.data.url,
      });
    } else {
      setSheetResult({ kind: 'error', message: externalTextOnOneLine(res.message) });
    }
  }

  async function onImportFile(file: File) {
    setError(undefined);
    setNotice(undefined);
    setUndo(null);
    // 読む前に大きさで断る (`data/importFile.ts`)。読んでからでは落ちるのが先。
    let text: string;
    try {
      text = await readImportText(file, MAX_CSV_IMPORT_BYTES, 'CSV ファイル');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    /*
     * **重複の判定は保管層から読み直した一覧で行う** (パス 384)。
     *
     * ここで画面の `entries` (= `useCollection` の購読の写し) を渡すと、一覧が
     * IndexedDB から届く前に CSV を選んだときだけ空と比べることになり、
     * `stored = 0` / `allStored = false` で**重複の検出が丸ごと働かない** ——
     * 実測では「2 件を取り込みました」だけが出て、重複を含んだ総売上が並んだ。
     * 「比べられなかった」を「重複が無い」と混ぜない (`readSalesForImport` は
     * 読めなければ `null`)。
     */
    const existing = await readCollectionNow<SalesEntry>(SALES_COLLECTION);
    if (existing === null) {
      setError(unreadableForJudgementNote('売上の一覧'));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const { entries: parsed, errors, stored, allStored } = salesFromCsv(text, existing);
    // 読めた行が**すべて**既存の記録と同じ内容なら、同じファイルを 2 度読んだと判断して断る (パス 126)。
    // 同じ内容の別の売上はありうるので、一部が同じだけなら取り込んで件数を言う (下)。
    if (allStored) {
      setError(
        `この CSV の ${parsed.length} 行はすべて既に取り込まれている記録と同じ内容（日付・販売先・金額・件数・メモ）です。同じファイルを 2 度読んだと判断し、取り込みませんでした。本当に同じ売上が 2 度あったのなら、その行だけ上のフォームから追加してください。`,
      );
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    // Atomic: all valid rows commit together or none (no partial import).
    if (parsed.length > 0) {
      try {
        await addMany(parsed);
      } catch {
        // 保存が断られた (理由と打ち手は画面上端の知らせが言う —— `useCollection` の入口が届けた)。
        // ここで受け止めないと、この関数は**ファイルの欄を空にする前に**抜ける: 拒否は誰にも
        // 受け取られず、同じファイルを選び直しても変更が起きないので**やり直せなかった** (パス 493o)。
        setError(importSaveFailedNote(parsed.length));
        if (fileRef.current) fileRef.current.value = '';
        return;
      }
    }
    const ok = parsed.length;
    const ng = errors.length;
    if (ok === 0 && ng === 0) {
      // 見出しの案内は列の定義から導く (書き出しと取り込みが読む 1 つ —— 手で写すと列を足した日に古びる)。
      setError(`取り込める行がありませんでした (ヘッダ: ${SALES_CSV_COLUMNS.join(',')})`);
    } else {
      setNotice(
        `${ok} 件を取り込みました${ng > 0 ? ` / ${ng} 件はスキップ (${skippedRowsDetail(errors)})` : ''}${stored > 0 ? `。うち ${stored} 件は既存の記録と同じ内容です（同じファイルを 2 度読んだのなら、一覧で該当行を消してください）` : ''}`,
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '8px 10px',
    fontSize: 14,
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  } as const;

  // 消した直後の知らせ。一覧の上に出す (押した所の近く)。最後の 1 件を消したときは、空の案内の上に出す。
  const undoBar = undo !== null && (
    <div
      role="status"
      data-sales-undo
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, margin: '8px 0' }}
    >
      <span style={{ overflowWrap: 'anywhere' }}>消しました: {entryLine(undo)}</span>
      <button type="button" onClick={() => fireReported(submit.run(onUndo))} disabled={submit.busy}>元に戻す</button>
    </div>
  );

  return (
    <div>
      <Section title={editing === null ? '売上を記録する' : '記録を直す'}>
        <p style={{ color: 'var(--text-mute)', fontSize: 12, margin: '0 0 8px', lineHeight: 1.6 }}>
          {editing === null
            ? '売れた日・販売先・金額を入れて「追加」を押します。記録はこの端末だけに保存されます。'
            : '下の欄を直して「更新」を押します。やめるときは「やめる」を押します。'}
        </p>
        <div
          ref={formRef}
          data-sales-form
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'end' }}
        >
          <LabeledField label="日付">
            <input
              type="date"
              value={form.date}
              placeholder="YYYY-MM-DD"
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              style={inputStyle}
            />
          </LabeledField>
          <LabeledField label="販売先">
            <select
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as SalesChannel }))}
              style={inputStyle}
            >
              {SALES_CHANNELS.map((c) => (
                <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="売上金額 (円)">
            <input
              value={form.amount}
              placeholder="売上金額"
              inputMode="numeric"
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              style={inputStyle}
            />
          </LabeledField>
          <LabeledField label="注文の数 (件)">
            <input
              value={form.orders}
              placeholder="注文件数"
              inputMode="numeric"
              onChange={(e) => setForm((f) => ({ ...f, orders: e.target.value }))}
              style={inputStyle}
            />
          </LabeledField>
          <LabeledField label="メモ">
            <input
              value={form.note}
              placeholder="メモ (任意)"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              style={inputStyle}
            />
          </LabeledField>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="primary" onClick={() => void submit.run(onSave)} disabled={submit.busy}>
              {editing === null ? '追加' : '更新'}
            </button>
            {editing !== null && (
              <button type="button" onClick={onCancelEdit} disabled={submit.busy}>やめる</button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button type="button" onClick={() => fileRef.current?.click()}>CSV インポート</button>
          <button type="button" onClick={onExport} disabled={entries.length === 0}>
            CSV エクスポート
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-mute)', flex: '1 1 160px' }}>
            まとめて入れるときは、1 行目が {SALES_CSV_COLUMNS.join(',')} の CSV を取り込めます。
          </span>
        </div>
        <div data-sheet-export style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <ProxyRequiredNote what="スプレッドシートの作成" />
          <p style={{ color: 'var(--text-mute)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            「スプレッドシートに書き出す」を押すと、読める売上の記録 (日付・販売先・金額・注文の数・メモ) を Google に送信します。
            送った記録で、あなたの Google ドライブに新しいスプレッドシートを作ります。送る前に件数を確かめます。
          </p>
          {driveConfigured === false && (
            <p role="note" data-sheet-export-needs-drive style={{ color: 'var(--warning)', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              まだ Google に接続していません。「グーグルドライブ」の画面で Google に接続してから押してください。
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-sheet-export-button
              onClick={() => fireReported(sheetSubmit.run(onExportSheet))}
              disabled={sheetSubmit.busy || entries.length === 0 || driveConfigured === false}
            >
              {sheetSubmit.busy ? '書き出し中…' : 'スプレッドシートに書き出す'}
            </button>
            {sheetResult?.kind === 'ok' && (
              <span role="status" data-sheet-export-done style={{ color: 'var(--success)', fontSize: 12 }}>
                {sheetResult.message}{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    void window.serviceHub?.openExternal(sheetResult.url);
                  }}
                >
                  スプレッドシートを開く
                </a>
              </span>
            )}
            {sheetResult?.kind === 'error' && (
              <span role="alert" data-sheet-export-error style={{ color: 'var(--danger)', fontSize: 12 }}>
                {sheetResult.message}
              </span>
            )}
          </div>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        {notice && <div role="status" data-sales-notice style={{ color: 'var(--success)', fontSize: 12, marginTop: 6 }}>{notice}</div>}
        {duplicateNote !== null && (
          <p role="alert" style={{ color: 'var(--warning)', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            {duplicateNote}
          </p>
        )}
        {unreadableDateNote !== null && (
          <p role="alert" data-unreadable-sales-dates style={{ color: 'var(--warning)', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            {unreadableDateNote}
          </p>
        )}
      </Section>

      {entries.length === 0 ? (
        <>
          {undoBar}
          <p data-sales-empty style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 12, lineHeight: 1.7 }}>
            まだ記録がありません。上の欄に 1 件入れると、ここに「今月の売上」「販売先ごとの内訳」「月ごとの推移」が出ます。
          </p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            {thisMonth !== null && (
              // 今月の記録がまだ無ければ「—」と理由 (0 円とは言わない —— 0 円は「売れていない」という主張になる)。
              <Tile
                wide
                label={`今月の売上 (${monthLabel(thisMonth.month)})`}
                value={thisMonth.amount === null ? DASH : yen.format(thisMonth.amount)}
                sub={
                  thisMonth.amount === null
                    ? '今月の記録はまだありません'
                    : thisMonth.prevAmount === null
                      ? '先月の記録はありません'
                      : `先月 ${yen.format(thisMonth.prevAmount)} ・ 先月比 ${changePctText(thisMonth.changePct)}`
                }
              />
            )}
            <Tile label="総売上" value={aggregateText('totalAmount', yen.format(summary.totalAmount))} />
            <Tile label="総注文件数" value={aggregateText('totalOrders', summary.totalOrders.toLocaleString('ja-JP'))} />
            {/* 注文が 0 件なら「—」。`¥0` は「平均単価が 0 円」という主張になる
                (経緯は `data/sales.ts` の `SalesSummary.aov`)。 */}
            <Tile label="平均注文単価" value={summary.aov === null ? DASH : yen.format(Math.round(summary.aov))} />
            {/* チャネル数は上書きの対象ではない (一覧の異なり数なので置き換える欄が無い)。 */}
            <Tile label="販売先の数" value={aggregateText('', `${summary.byChannel.length}`)} />
          </div>

          <Section title="販売先ごとの内訳">
            <ChannelBar parts={summary.byChannel} />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 8px' }}>販売先</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>割合</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>注文</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>平均単価</th>
                </tr>
              </thead>
              <tbody>
                {summary.byChannel.map((c) => (
                  <tr key={c.channel} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CHANNEL_COLOR[c.channel], marginRight: 6 }} />
                      {c.label}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(c.amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.share.toFixed(1)}%</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.orders.toLocaleString('ja-JP')}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{c.aov === null ? '—' : yen.format(Math.round(c.aov))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {trend.length > 0 && (
            <Section title="月ごとの推移">
              <table data-sales-trend style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                    <th style={{ padding: '4px 8px' }}>月</th>
                    <th style={{ padding: '4px 8px' }} aria-hidden="true" />
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>売上</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>前月比</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((m) => (
                    <tr key={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{monthLabel(m.month)}</td>
                      <td style={{ padding: '4px 8px', width: '40%' }} aria-hidden="true">
                        <div style={{ height: 10, borderRadius: 5, background: 'var(--border)' }}>
                          <div style={{ height: 10, borderRadius: 5, width: `${m.barPct}%`, background: 'var(--accent-strong)' }} />
                        </div>
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{yen.format(m.amount)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-mute)' }}>{changePctText(m.changePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="明細" count={records.length}>
            {undoBar}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                  <th style={{ padding: '4px 6px' }}>日付</th>
                  <th style={{ padding: '4px 6px' }}>販売先・メモ</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>売上</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>注文</th>
                  <th style={{ padding: '4px 6px' }} />
                </tr>
              </thead>
              <tbody>
                {rowWindow.visible.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    {/*
                      一覧は**素の購読**を描く (日付が読めない行もここに出るから × で消せる・パス 425)。
                      だから値は**画面の側で型から読む** —— 物を素で置くと React が
                      「Objects are not valid as a React child」で落とし、その画面ごと開けなくなる。
                      数は `finiteNumberOf` を通す: `Intl` の `format` は投げないが**嘘を刷る**
                      (実測 パス 442: `null` → `￥0` / `[1]` → `￥1` / `true` → `￥1`)。
                    */}
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{displayField(r.data.date)}</td>
                    <td style={{ padding: '4px 6px' }}>
                      {CHANNEL_LABEL[r.data.channel]}
                      {/* メモは販売先の下に 1 行で出す (列にすると、スマホ幅で 1 文字ずつ縦に折れる)。 */}
                      <div data-sales-note style={{ color: 'var(--text-mute)', fontSize: 12, overflowWrap: 'anywhere' }}>
                        {displayField(r.data.note, MAX_SALES_NOTE_CHARS)}
                      </div>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{salesAmountText(r.data.amount)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{finiteNumberOf(r.data.orders) ?? DASH}</td>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" onClick={() => onStartEdit(r.id, r.data)} style={{ marginRight: 6 }}>直す</button>
                      <button type="button" onClick={() => fireReported(submit.run(() => onRemove(r.id, r.data)))} aria-label="削除">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <RowWindowMore hidden={rowWindow.hidden} total={rowWindow.total} showMore={rowWindow.showMore} />
          </Section>
        </>
      )}
    </div>
  );
}
