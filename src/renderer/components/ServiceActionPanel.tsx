import { useReducer, useState } from 'react';
import { MAX_RECORD_NOTE_CHARS, type RecordEntryServiceId } from '../../shared/recordEntryLimits';
import type { ActionData } from '../../shared/actionData';
import type { AdviceInputFor } from '../../shared/serviceAdvisor';
import { Section } from './StatusBar';
import { parseAmountInput, sanitizeNote } from './serviceActionUtils';
import { classifyActionResult } from '../data/actionOutcome';
import {
  actionReducer,
  adviceResult,
  errorText,
  feedbackText,
  INITIAL_ACTION_STATE,
  isAdvising,
  isRecording,
} from './serviceActionMachine';

/**
 * 業務操作パネル — record-entry / advise を実行する UI。
 *
 * **載っているのは 2 画面** (`RealEstatePage` / `MutualFundsPage`) —— この注記は
 * 2026-09-12 まで「uber-eats / demae-can / real-estate / mutual-funds の 4 つ」と
 * 書いていたが、実測では前の 2 つは**どの画面にもこのパネルを載せていない**
 * (パス 167 で訂正)。型 (`RecordEntryServiceId`) は 4 つを通す —— 台帳
 * `recordEntryLimits.ts` が持つ 4 サービスは `record-entry` / `advise` を**持つ**
 * 側の一覧で、「画面が在る」一覧ではない。この食い違いは
 * `shared/voiceWriteRequirements.ts` の `screenInput` が既に**測って**持っており
 * (uber-eats / demae-can は `false`)、音声から呼べない理由として使われている。
 * 注記だけが古かった。
 *
 * ## メモの天井は、画面が述べる (パス 167)
 *
 * 入力欄は `maxLength={2000}` を字面で持っていた。数の写しであると同時に、
 * **`maxLength` はブラウザが黙って落とす** —— 2,000 字を超える文章を貼ると
 * 超えた分は消え、画面には天井の存在すら出ていなかった (走査した: `文字` `残り`
 * `上限` `length` のどれも、この部品には無かった)。そのメモは業務記録として
 * 保存される側なので、「送ったつもりの全文が入っていない」が起こる。
 *
 * 直したあとは **`maxLength` を使わず、同じ天井を `onChange` で掛け、
 * 落ちた字数を述べる**。天井そのものも常に画面に出す。
 * (パス 112 が AI の入力で採った「黙って切らない」と同じ向き。あちらは切らずに
 *  断れたが、ここは 1 行の入力欄なので、落ちた事実と字数を述べる形にした。)
 *
 * **重要な UX 契約:**
 * - record-entry の戻り値 `persisted: false` を **可視的に表示** する。
 *   Phase 6 で Library 永続化を入れるまでは「メモのみ・保存はされません」と
 *   ユーザーに伝える。動いているふりを構造的に防ぐ (PR #4 R1 BLOCKING-3)。
 * - advise の `disclaimer` / `notForRealMoney` を必ず表示。投資系
 *   (mutual-funds / real-estate) は法的 disclaimer 必須 (R1 BLOCKING-1)。
 * - advise は **画面が渡した集計** (`adviseInput`) から `shared/serviceAdvisor.ts` の規則で
 *   組む (2026-09-09 · パス 119)。それまでは payload を読まない固定文で、見本の数字
 *   (「大阪市ワンルームが空室」「平均利回り 6.15%」) を利用者の物件として語り、ブラウザ版は
 *   `action_not_found` だった。提案の `basis` (何件・どの数字から組んだか) も刷る。
 */
export interface ServiceActionPanelProps<S extends RecordEntryServiceId> {
  /** record-entry / advise を持つ 4 サービスに限る (台帳の鍵 `${RecordEntryServiceId}/record-entry` が全部在る)。 */
  readonly serviceId: S;
  /** 例: "Uber Eats"。トースト / 表示用 */
  readonly serviceLabel: string;
  /** 提案の元になる数字 —— 画面が刷っている集計をそのまま渡す (提案が言う数字と画面の数字を一致させるため)。 */
  readonly adviseInput: AdviceInputFor<S>;
}

export function ServiceActionPanel<S extends RecordEntryServiceId>({ serviceId, serviceLabel, adviseInput }: ServiceActionPanelProps<S>) {
  const [note, setNote] = useState('');
  /** 直前の入力が天井を超えていた字数 (0 なら超えていない)。 */
  const [noteOverflow, setNoteOverflow] = useState(0);
  const [amount, setAmount] = useState('');
  const [state, dispatch] = useReducer(actionReducer, INITIAL_ACTION_STATE);

  const recBusy = isRecording(state);
  const advBusy = isAdvising(state);
  const feedback = feedbackText(state);
  const error = errorText(state);
  const advice = adviceResult(state);

  async function submitRecord() {
    const cleanNote = sanitizeNote(note);
    if (cleanNote.length === 0) {
      dispatch({ type: 'error', text: 'note を入力してください' });
      return;
    }
    const payload: { note: string; amount?: number } = { note: cleanNote };
    const parsed = parseAmountInput(amount);
    if (!parsed.ok) {
      dispatch({ type: 'error', text: 'amount は数値で入力してください (全角・カンマ区切り可)' });
      return;
    }
    if (parsed.value !== undefined) {
      payload.amount = parsed.value;
    }
    dispatch({ type: 'record/start' });
    try {
      // 戻り値の形は台帳を読む (パス 117 —— それまでここに `serviceId` を落とした写しが在った)。
      // 4 鍵の和 —— 1 つでも台帳に無ければ tsc が落ちる。
      const r = await window.serviceHub.invoke<ActionData<`${RecordEntryServiceId}/record-entry`>>(serviceId, 'record-entry', payload);
      // BLOCKING-3 対応: persisted=false を構造的に表示。
      // 分類は `data/actionOutcome.ts` に集約 — 音声・チャットと同じ読み方をする。
      const classified = classifyActionResult(r);
      if (classified.verdict === 'failed') {
        dispatch({ type: 'error', text: `保存に失敗: ${classified.message}` });
        return;
      }
      const note2 =
        classified.verdict === 'accepted-not-saved'
          ? '⚠ メモを受け付けました (Phase 6 まで保存されません)'
          : '✅ 保存しました';
      dispatch({
        type: 'record/success',
        text: `${note2} · ${new Date(classified.data.recordedAt).toLocaleTimeString()}`,
      });
      setNote('');
      setNoteOverflow(0);
      setAmount('');
    } catch (e) {
      dispatch({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function submitAdvise() {
    dispatch({ type: 'advise/start' });
    try {
      const r = await window.serviceHub.invoke<ActionData<`${RecordEntryServiceId}/advise`>>(serviceId, 'advise', adviseInput);
      if (!r.ok) {
        dispatch({ type: 'error', text: `改善提案の取得に失敗: ${r.message}` });
        return;
      }
      dispatch({ type: 'advise/success', advice: r.data });
    } catch (e) {
      dispatch({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Section title={`業務操作 (${serviceLabel})`} count={2}>
      {/* record-entry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="text"
          value={note}
          onChange={(e) => {
            // **天井は掛けるが、黙っては落とさない。** `maxLength` に任せると
            // ブラウザが貼り付けを切ってしまい、落ちたことを画面が知れない。
            const raw = e.target.value;
            setNoteOverflow(Math.max(0, raw.length - MAX_RECORD_NOTE_CHARS));
            setNote(raw.slice(0, MAX_RECORD_NOTE_CHARS));
          }}
          placeholder="メモ (例: 売上記録 / 修繕費発生)"
          style={inputStyle}
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="金額 (任意)"
          inputMode="decimal"
          style={inputStyle}
        />
        <button type="button" onClick={submitRecord} disabled={recBusy || note.length === 0} style={buttonStyle}>
          {recBusy ? '送信中…' : 'メモを記録'}
        </button>
      </div>
      {noteOverflow > 0 && (
        <div
          data-note-overflow={noteOverflow}
          role="alert"
          style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8, lineHeight: 1.6 }}
        >
          ⚠ メモは {MAX_RECORD_NOTE_CHARS} 字までです。直前の入力はこれを {noteOverflow} 字超えていたため、
          超えた分は入っていません（元の文章を短くしてから貼り直してください）。
        </div>
      )}
      <div data-note-cap style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.5 }}>
        ※ メモは {MAX_RECORD_NOTE_CHARS} 字まで。現フェーズでは入力受信のみ。Library への永続化は Phase 6 で接続予定です。
      </div>

      {feedback && <div style={{ ...feedbackStyle, color: '#22c55e' }}>{feedback}</div>}
      {error && <div style={{ ...feedbackStyle, color: '#ef4444' }}>{error}</div>}

      {/* advise */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
        <button type="button" onClick={submitAdvise} disabled={advBusy} style={buttonStyle}>
          {advBusy ? '生成中…' : '💡 改善提案'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          画面の数字から規則で組み立てます (AI ではありません。Phase 6 で LLM 接続)
        </span>
      </div>

      {advice && (
        <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }}>
          {/* 何件・どの数字から組んだか。提案が言う数字を、画面のタイルと突き合わせられるように。 */}
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>根拠: {advice.basis}</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {advice.recommendations.map((r, i) => (
              <li key={i} style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>{r.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{r.rationale}</div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid #fbbf24', borderRadius: 4, fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
            ⚠ {advice.disclaimer}
          </div>
        </div>
      )}
    </Section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const feedbackStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  marginBottom: 8,
  borderRadius: 4,
};
