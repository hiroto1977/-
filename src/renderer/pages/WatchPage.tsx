/**
 * 見張りアシスタント —— 貼り付けたメール・スラック・予定の文から平日の要約と返信の下書きを、
 * 週ごとの数字 (エックス・広告・アナリティクス) から週次レポートを作る画面 (2026-11-21)。
 *
 * **送信も投稿もしない。** この画面は端末の外へ出す口を 1 つも持たず、作った文は「コピー」で
 * 持ち主の手に渡すだけである (送る・投稿するのは持ち主)。
 *
 * 読み取り・要約・下書きは `shared/watchAssistant.ts`、週ごとの数字とレポートは
 * `data/watchWeekly.ts` に在り、この画面は入力を集めて描くだけである。
 *
 * - 貼り付けた文は画面の中にだけ在る (保存しない・画面を離れると消える)。
 * - 週ごとの数字は端末の record store (`watch-weekly`) に置く。同じ週が既に在るかは、
 *   押した時点の保管層を読み直して判じる。
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Section } from '../components/StatusBar';
import { RowWindowMore } from '../components/RowWindowMore';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { useRowWindow } from '../data/useRowWindow';
import { fireReported } from '../data/deviceStoreFailure';
import { readCollectionNow, unreadableForJudgementNote } from '../data/readCollectionNow';
import { displayField } from '../../shared/apiResponse';
import { localIsoDate } from '../../shared/localDate';
import {
  MAX_WATCH_BODY_CHARS,
  WATCH_DIGEST_EMPTY_NOTE,
  WATCH_NO_REPLY_FOR_CALENDAR,
  WATCH_OWNER_NOTE,
  WATCH_PRIVACY_NOTE,
  WATCH_REPLY_INTENTS,
  WATCH_REPLY_INTENT_LABEL,
  WATCH_SOURCES,
  WATCH_TEXT_SOURCES,
  WATCH_TEXT_SOURCE_LABEL,
  buildWatchDigest,
  draftWatchReply,
  isWatchReplyIntent,
  isWatchTextSource,
  parseWatchItem,
  readWatchSignals,
  suggestWatchReplyIntent,
  watchDraftNote,
  watchFromText,
  watchItemsFullNote,
  watchLine,
  watchReasons,
  type WatchItem,
  type WatchReplyIntent,
  type WatchTextSource,
} from '../../shared/watchAssistant';
import {
  WATCH_METRICS,
  WATCH_NUMBER_SOURCES,
  WATCH_NUMBER_SOURCE_LABEL,
  WATCH_REPORT_EMPTY_NOTE,
  WATCH_WEEKLY_COLLECTION,
  buildWatchWeeklyReport,
  countUnreadableWatchWeeks,
  duplicateWatchWeekMessage,
  hasWatchWeek,
  parseWatchWeek,
  unreadableWatchWeeksNote,
  watchMetricOf,
  type WatchMetricKey,
  type WatchWeekEntry,
} from '../data/watchWeekly';

const INPUT: CSSProperties = {
  fontSize: 13,
  padding: '6px 8px',
  minHeight: 32,
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
};
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)' };
const MUTED: CSSProperties = { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 };
const ALERT: CSSProperties = { color: 'var(--danger)', fontSize: 12, lineHeight: 1.6, margin: '6px 0' };
const WARN: CSSProperties = { color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, margin: '6px 0' };

/** 画面の中に持つ材料 1 件 (保存しない)。 */
interface HeldItem {
  readonly id: number;
  readonly item: WatchItem;
  readonly intent: WatchReplyIntent;
}

/** アシスタントの答え 1 つ。 */
interface Answer {
  readonly id: number;
  readonly title: string;
  readonly text: string;
  readonly note?: string;
}

const EMPTY_ITEM_FORM = { source: 'mail' as WatchTextSource, from: '', subject: '', body: '' };
const EMPTY_METRICS = Object.fromEntries(WATCH_METRICS.map((m) => [m.key, ''])) as Record<WatchMetricKey, string>;

export function WatchPage() {
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [itemError, setItemError] = useState<string>();
  const [held, setHeld] = useState<readonly HeldItem[]>([]);
  const [answers, setAnswers] = useState<readonly Answer[]>([]);
  const [copied, setCopied] = useState<{ id: number; ok: boolean }>();
  const [nextId, setNextId] = useState(1);

  const { records, add, remove } = useCollection<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION);
  const rowWindow = useRowWindow(records);
  const [week, setWeek] = useState(() => localIsoDate());
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [weekError, setWeekError] = useState<string>();
  const [weekSaved, setWeekSaved] = useState<string>();
  const submit = useSubmitGuard();

  const weekRows = useMemo(() => records.map((r) => r.data), [records]);
  const unreadableNote = unreadableWatchWeeksNote(countUnreadableWatchWeeks(weekRows));
  const fullNote = watchItemsFullNote(held.length);

  /** 答えを 1 つ足す (新しい答えが下に並ぶ)。 */
  function say(title: string, text: string, note?: string) {
    setAnswers((prev) => [...prev, { id: nextId, title, text, note }]);
    setNextId((n) => n + 1);
  }

  function onAddItem() {
    if (fullNote !== null) {
      setItemError(fullNote);
      return;
    }
    let parsed: WatchItem;
    try {
      parsed = parseWatchItem(itemForm);
    } catch (e) {
      setItemError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    setItemError(undefined);
    const intent = suggestWatchReplyIntent(readWatchSignals(parsed));
    setHeld((prev) => [...prev, { id: nextId, item: parsed, intent }]);
    setNextId((n) => n + 1);
    // 続けて同じ種類を渡しやすいよう、種類は残す。
    setItemForm((f) => ({ ...EMPTY_ITEM_FORM, source: f.source }));
  }

  function onDigest() {
    const digest = buildWatchDigest(held.map((h) => h.item), localIsoDate());
    if (digest === null) {
      say('平日の要約', WATCH_DIGEST_EMPTY_NOTE);
      return;
    }
    say('平日の要約', digest.text);
  }

  function onDraft(h: HeldItem) {
    const draft = draftWatchReply(h.item, h.intent);
    if (draft === null) {
      say('返信の下書き', WATCH_NO_REPLY_FOR_CALENDAR);
      return;
    }
    say(`返信の下書き (${WATCH_REPLY_INTENT_LABEL[h.intent]})`, draft.text, `${watchDraftNote(draft.slots)} ${WATCH_OWNER_NOTE}`);
  }

  function onReport() {
    const report = buildWatchWeeklyReport(weekRows);
    if (report === null) {
      say('週次レポート', WATCH_REPORT_EMPTY_NOTE);
      return;
    }
    say('週次レポート', report.text);
  }

  async function onCopy(answer: Answer) {
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied({ id: answer.id, ok: true });
    } catch {
      setCopied({ id: answer.id, ok: false });
    }
  }

  async function onSaveWeek() {
    setWeekSaved(undefined);
    let parsed: WatchWeekEntry;
    try {
      parsed = parseWatchWeek({ week, ...metrics });
    } catch (e) {
      setWeekError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    // 同じ週が既に在るかは、購読の写しではなく押した時点の保管層で判じる。
    const stored = await readCollectionNow<WatchWeekEntry>(WATCH_WEEKLY_COLLECTION);
    if (stored === null) {
      setWeekError(unreadableForJudgementNote('週ごとの数字の一覧', '同じ週の記録が在るか'));
      return;
    }
    if (hasWatchWeek(stored, parsed.week)) {
      setWeekError(duplicateWatchWeekMessage(parsed.week));
      return;
    }
    setWeekError(undefined);
    await add(parsed);
    setMetrics(EMPTY_METRICS);
    setWeekSaved(`${parsed.week} の週を記録しました。`);
  }

  return (
    <div data-watch-page>
      <p style={{ ...MUTED, marginBottom: 8 }}>
        メール・予定・スラック・エックス・広告・アナリティクスの内容から、平日の要約・返信の下書き・週次レポートを作ります。
      </p>
      <p role="note" data-watch-owner-note style={{ ...MUTED, color: 'var(--text)', marginBottom: 8 }}>
        {WATCH_OWNER_NOTE}
      </p>
      <ul data-watch-sources style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {WATCH_SOURCES.map((s) => (
          <li key={s.id} className="badge" style={{ fontSize: 11 }}>
            {s.label} — {s.how}
          </li>
        ))}
      </ul>

      <Section title="① 文を渡す (メール・スラック・予定)">
        <p style={{ ...MUTED, marginBottom: 8 }}>{WATCH_PRIVACY_NOTE}</p>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={FIELD}>
            種類
            <select
              value={itemForm.source}
              aria-label="材料の種類"
              onChange={(e) => {
                const next = e.target.value;
                if (isWatchTextSource(next)) setItemForm({ ...itemForm, source: next });
              }}
              style={INPUT}
            >
              {WATCH_TEXT_SOURCES.map((s) => (
                <option key={s} value={s}>{WATCH_TEXT_SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label style={FIELD}>
            相手の名前 (任意)
            <input
              type="text"
              value={itemForm.from}
              aria-label="相手の名前"
              placeholder="例: A 社の方"
              onChange={(e) => setItemForm({ ...itemForm, from: e.target.value })}
              style={INPUT}
            />
          </label>
          <label style={FIELD}>
            件名 (任意)
            <input
              type="text"
              value={itemForm.subject}
              aria-label="件名"
              placeholder="例: お見積りの件"
              onChange={(e) => setItemForm({ ...itemForm, subject: e.target.value })}
              style={INPUT}
            />
          </label>
        </div>
        <label style={{ ...FIELD, marginBottom: 8 }}>
          本文 ({MAX_WATCH_BODY_CHARS} 文字まで)
          <textarea
            value={itemForm.body}
            aria-label="本文"
            rows={5}
            placeholder="ここにメールやスラックの文、予定の内容を貼り付けます"
            onChange={(e) => setItemForm({ ...itemForm, body: e.target.value })}
            style={{ ...INPUT, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>
        <button type="button" className="primary" onClick={onAddItem}>
          ＋ 材料を渡す
        </button>
        {itemError !== undefined && (
          <p role="alert" data-watch-item-error style={ALERT}>{itemError}</p>
        )}
      </Section>

      <Section title="受け取った材料" count={held.length}>
        {held.length === 0 ? (
          <p data-watch-items-empty style={MUTED}>{WATCH_DIGEST_EMPTY_NOTE}</p>
        ) : (
          held.map((h) => {
            const line = watchLine(h.item);
            const reasons = watchReasons(readWatchSignals(h.item));
            return (
              <div
                key={h.id}
                data-watch-item={h.id}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}
              >
                <span className="badge" style={{ fontSize: 11 }}>{WATCH_TEXT_SOURCE_LABEL[h.item.source]}</span>
                <span style={{ flex: '1 1 180px', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {watchFromText(h.item)} — {line}
                  {reasons.length > 0 && (
                    <span style={{ display: 'block', ...MUTED }}>{reasons.join(' / ')}</span>
                  )}
                </span>
                {h.item.source !== 'calendar' && (
                  <>
                    <select
                      value={h.intent}
                      aria-label={`「${line}」への返信の方向`}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (isWatchReplyIntent(next)) {
                          setHeld((prev) => prev.map((x) => (x.id === h.id ? { ...x, intent: next } : x)));
                        }
                      }}
                      style={{ ...INPUT, minWidth: 140 }}
                    >
                      {WATCH_REPLY_INTENTS.map((i) => (
                        <option key={i} value={i}>{WATCH_REPLY_INTENT_LABEL[i]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => onDraft(h)} aria-label={`「${line}」への返信の下書きを作る`}>
                      返信の下書き
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setHeld((prev) => prev.filter((x) => x.id !== h.id))}
                  aria-label={`材料「${line}」を消す`}
                  style={{ minWidth: 28, minHeight: 28 }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="primary" onClick={onDigest} data-watch-digest>
            平日の要約を作る
          </button>
        </div>
      </Section>

      <Section title="② 週ごとの数字 (エックス・広告・アナリティクス)">
        <p style={{ ...MUTED, marginBottom: 8 }}>
          それぞれの管理画面で見た 1 週間の数字を写します。分かる数字だけで構いません（空欄は 0 ではなく「未入力」として扱います）。この端末の中だけに保存し、どこにも送りません。
        </p>
        <label style={{ ...FIELD, marginBottom: 8, maxWidth: 220 }}>
          週の日付 (その週のどの日でも可)
          <input type="date" value={week} aria-label="週の日付" onChange={(e) => setWeek(e.target.value)} style={INPUT} />
        </label>
        {WATCH_NUMBER_SOURCES.map((source) => (
          <fieldset key={source} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', margin: '0 0 8px' }}>
            <legend style={{ fontSize: 12, padding: '0 4px' }}>{WATCH_NUMBER_SOURCE_LABEL[source]}</legend>
            <div className="field-grid">
              {WATCH_METRICS.filter((m) => m.source === source).map((m) => (
                <label key={m.key} style={FIELD}>
                  {m.label} ({m.unit})
                  <input
                    type="text"
                    inputMode="numeric"
                    value={metrics[m.key]}
                    aria-label={`${WATCH_NUMBER_SOURCE_LABEL[source]}の${m.label}`}
                    onChange={(e) => setMetrics({ ...metrics, [m.key]: e.target.value })}
                    style={INPUT}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={() => fireReported(submit.run(onSaveWeek))} disabled={submit.busy}>
            ＋ この週を記録
          </button>
          <button type="button" onClick={onReport} data-watch-report>
            週次レポートを作る
          </button>
        </div>
        {weekError !== undefined && (
          <p role="alert" data-watch-week-error style={ALERT}>{weekError}</p>
        )}
        {weekSaved !== undefined && (
          <p role="status" data-watch-week-saved style={{ ...MUTED, color: 'var(--success)', margin: '6px 0' }}>{weekSaved}</p>
        )}
        {unreadableNote !== null && (
          <p role="alert" data-watch-week-unreadable style={WARN}>{unreadableNote}</p>
        )}
        {records.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ ...MUTED, marginBottom: 4 }}>記録した週 ({records.length} 件)</div>
            {rowWindow.visible.map((r) => {
              const label = displayField(r.data.week, 16) || '日付なし';
              const filled = WATCH_METRICS.filter((m) => watchMetricOf(r.data[m.key]) !== null).length;
              return (
                <div
                  key={r.id}
                  data-watch-week={r.id}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}
                >
                  <span style={{ flex: '1 1 160px', minWidth: 0 }}>{label} の週 — 数字 {filled} 個</span>
                  <button
                    type="button"
                    onClick={() => fireReported(submit.run(() => remove(r.id)))}
                    disabled={submit.busy}
                    aria-label={`${label} の週の記録を削除`}
                    style={{ minWidth: 28, minHeight: 28 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <RowWindowMore hidden={rowWindow.hidden} total={rowWindow.total} showMore={rowWindow.showMore} />
          </div>
        )}
      </Section>

      <Section title="アシスタントの答え" count={answers.length}>
        {answers.length === 0 ? (
          <p data-watch-answers-empty style={MUTED}>
            「平日の要約を作る」「返信の下書き」「週次レポートを作る」を押すと、ここに答えが並びます。
          </p>
        ) : (
          <>
            {answers.map((a) => (
              <div
                key={a.id}
                data-watch-answer={a.id}
                style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', margin: '0 0 8px' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🤖 {a.title}</div>
                <div data-watch-answer-text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 13, lineHeight: 1.7 }}>{a.text}</div>
                {a.note !== undefined && <p style={{ ...MUTED, margin: '6px 0 0' }}>{a.note}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <button type="button" onClick={() => fireReported(submit.run(() => onCopy(a)))} aria-label={`「${a.title}」をコピー`}>
                    コピー
                  </button>
                  {copied?.id === a.id && (
                    <span role="status" style={MUTED}>
                      {copied.ok ? 'コピーしました。' : 'コピーできませんでした。文を長押しして選び、コピーしてください。'}
                    </span>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setAnswers([])} data-watch-clear>
              答えを消す
            </button>
          </>
        )}
      </Section>
    </div>
  );
}
