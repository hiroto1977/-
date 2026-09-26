/**
 * ChatbotWidget — AI オーケストレーション組織のコンシェルジュ。
 *
 * 描き方は 2 通り (2026-09-26): 画面右下の 🤖 ボタンから開く**浮いた窓** (既定) と、
 * 「すっきり」のデザインで広い画面のときに App が置く**列** (`docked` —— サイドバー | この列 | 画面 の 3 列)。
 * 中身 (会話・入力・確認) は 1 つで、違うのは外枠と開け閉めの口だけ。判断ロジックは
 * 純粋核 (`../data/chatbot.ts` / `../data/chatOrg.ts`) に全委譲し、本コンポーネントは
 * I/O の配線だけを担う:
 *   - 画面遷移   → `servicehub:navigate` CustomEvent (App.tsx が listen)
 *   - 操作の実行 → `window.serviceHub.invoke` (破壊的操作は確認ボタンを経由)
 *   - 要望の記録 → localStorage (`chatbot-requests`) + Markdown エクスポート
 *   - 自由質問   → Ollama 接続時のみ `invoke('ollama','chat')` へフォールバック
 *
 * 知識はすべて単一の真実源から導出する (SERVICES / orchestration registry /
 * 音声コマンドの能力テーブル) ため、将来のサービス・組織の拡張に自動連動する。
 */
import { escapeMarkdownInline } from '../../shared/escape';
import { navigateTo } from '../navigate';
import { arrayOf, chatMessages, isRecord, storedLabel, type ChatFieldReaders } from '../data/persistedShape';
import { classifyActionResult } from '../data/actionOutcome';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES } from '../services';
import { replyTo, type ChatReply } from '../data/chatbot';
import { buildOrgIndex, type RawOrg, type RawTeam } from '../data/chatOrg';
import { CAPABILITIES } from './VoiceCommandBar';
import { isExecutableIntent, type VoiceIntent } from '../data/voiceCommand';
import { org as registryOrg, teams as registryTeams } from '../../../orchestration/registry.json';
import { writeLocalJson, type LocalWriteResult } from '../data/localWrite';
import {
  voiceWriteRefusal,
  voiceWriteRefusalMessage,
} from '../../shared/voiceWriteRequirements';
import { MAX_OLLAMA_PROMPT_CHARS, type OllamaSnapshot } from '../../shared/ollama';
import {
  CHATBOT_MODEL_KEY,
  chatbotOllamaModel,
  ollamaRefusalNote,
} from '../data/chatbotOllama';
import { CeilingNotice } from './CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import type { ActionData } from '../../shared/actionData';

/** チャット履歴 1 件。 */
interface ChatMessage {
  readonly role: 'user' | 'bot';
  readonly text: string;
  readonly routedThrough?: string;
}

const HISTORY_KEY = 'chatbot-history';
const REQUESTS_KEY = 'chatbot-requests';
const HISTORY_MAX = 50;

/** 組織索引はモジュール読込時に 1 度だけ構築 (registry は静的データ)。 */
const ORG_INDEX = buildOrgIndex(registryOrg as RawOrg, registryTeams as readonly RawTeam[]);

const CHAT_CONTEXT = {
  services: SERVICES.map((s) => ({ id: s.id, label: s.label, description: s.description })),
  org: ORG_INDEX,
  capabilities: CAPABILITIES,
};

/** 保存された要望 1 件の形。text と at が文字列でなければ書き出しで落ちる。 */
interface FeatureRequest {
  readonly text: string;
  readonly at: string;
}
const isFeatureRequest = (v: unknown): v is FeatureRequest => isRecord(v) && typeof v.text === 'string' && typeof v.at === 'string';

/**
 * 保存した会話の、`role` / `text` 以外の欄の読み手 (パス 489) —— 型が全部の欄を要求する。
 * `routedThrough` は「🪪 …」の札として素で描くので、物が 1 つ入るとこの部品が投げる。
 * この部品は画面の境界の外に居るので、直す前はそれで**アプリ全体が白くなった**。
 */
const HISTORY_READERS: ChatFieldReaders<ChatMessage> = { routedThrough: storedLabel };

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    // 保存値は型が守らない —— role / text の形が合う要素だけ、追加の欄は読み手が読めた物だけ。
    return chatMessages<ChatMessage>(JSON.parse(raw), ['user', 'bot'], HISTORY_MAX, HISTORY_READERS);
  } catch {
    return [];
  }
}

/**
 * 保存した会話履歴を端末から消す。**成否を返す** (ストレージが拒むと投げうる)。
 *
 * 2 つの口が読む —— この部品の「🗑 履歴」と、部品が描画で落ちたときに App の境界が出す
 * 「会話履歴を消去してやり直す」。台帳は会話の中身を `sensitive` と名乗るのに、2026-09-26
 * (パス 489) まで**消す手が「すべてのデータを削除」しか無かった** (法則 `escape-hatch-stays-open`)。
 */
export function clearChatbotHistory(): boolean {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)));
  } catch {
    // 保存失敗は無視 (チャット自体は続行できる)。
  }
}

/**
 * 要望を記録する。**成否を返す。**
 *
 * 返事は「最高戦略責任者 (CSO) 配下のバックログ候補として記録します」と言い切る。
 * 2026-09-06 まで、ここは `catch {}` で失敗を捨てていた —— 容量超過や
 * プライベートモードでは**記録しないまま「記録します」と答えていた**。
 * すぐ上の `runIntent` には「`persisted: false` を見ずに『実行しました』と
 * 言うな」(2026-08 監査) と書いてあるのに、同じ理屈がこちらには掛かっていなかった。
 *
 * 読み出しが壊れているときは空から積み直す —— その保存値はもう誰にも読めないので、
 * 残しても取り出せず、残せば以後どの要望も記録できなくなる。
 */
function recordRequest(text: string): LocalWriteResult {
  let list: FeatureRequest[] = [];
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    list = arrayOf(raw ? JSON.parse(raw) : [], isFeatureRequest);
  } catch {
    list = [];
  }
  list.push({ text, at: new Date().toISOString() });
  return writeLocalJson(REQUESTS_KEY, list);
}

/**
 * 要望の一覧を Markdown の本文にする。**export しているのは検査のため** ——
 * ダウンロードの中に埋めたままだと、門を通っていることを DOM 無しで確かめられない
 * (`downloadRequests` は `URL.createObjectURL` と `<a>.click()` を使う)。
 */
export function requestsMarkdown(list: readonly FeatureRequest[]): string {
  return [
    '# チャットボット経由の機能要望 (オーケストレーション backlog 候補)',
    '',
    ...list.map(
      (r) => `- [ ] ${escapeMarkdownInline(r.text)} _(受付: ${escapeMarkdownInline(r.at.slice(0, 10))})_`,
    ),
    '',
  ].join('\n');
}

/** 記録済み要望を Markdown でダウンロードする (オーケストレーション backlog 連携用)。 */
function downloadRequests(): void {
  let list: FeatureRequest[] = [];
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    list = arrayOf(raw ? JSON.parse(raw) : [], isFeatureRequest);
  } catch {
    list = [];
  }
  /*
   * **書き出す Markdown に自由文を素で入れない** (2026-09-20 · パス 332)。
   *
   * ここは利用者が打った要望文をそのまま `- [ ] …` の箇条書きにしていた。
   * `shared/escape.ts` の `escapeMarkdownInline` は**まさにこの場所のため**に在る
   * (docblock が「1 行で終わらなければならない場所すべて —— 見出し・箇条書きの
   * 1 項目・引用の 1 行」と書いている) のに、この 1 か所だけ通っていなかった。
   *
   * 実測 (2026-09-20・5 形のうち 4 形で差が出た):
   *
   * ```
   *   要望 <img src=x onerror=…>   → 今: 生のまま     門: &lt;img …
   *   要望\n## 承認済み\n- [x] …   → 今: 箇条書きから抜けて新しい構造を書く
   *   A|B の切替が欲しい            → 今: 表の桁がずれる
   *   末尾が \                      → 今: 後続の区切りを打ち消す
   * ```
   *
   * **到達の見立ては分けて書く。** `<` は今日この画面から打てる (入力欄は
   * 1 行の `<input>`)。改行は `<input>` には打てないので**今日の UI からは入らない**
   * —— ただし読み戻しの番人は `typeof v.text === 'string'` しか見ておらず、
   * 保存値が他の経路で入れば形は保証されない。どちらも直しは同じ 1 か所である。
   *
   * このファイルは名前のとおり**オーケストレーションの backlog 候補**として
   * 人へ渡る前提の成果物で、`escape.ts` が「書き出した `.md` はダウンロードして
   * 人に渡る」と述べている経路そのものである。`at` も保存値なので同じ門を通す。
   */
  const blob = new Blob([requestsMarkdown(list)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chatbot-requests.md';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 自由質問の結末。**「答えた」「断られた」「橋が無い」を混ぜない**
 * (2026-09-24 · パス 449)。直す前は 3 つとも `null` で、画面は
 * 「Ollama 接続時は自由質問にもお答えします。」とだけ言っていた ——
 * 接続している利用者にとって偽である。理由は `data/chatbotOllama.ts`。
 */
type OllamaTry = { readonly reply: string } | { readonly refusal: string } | null;

/** 上書きの読み。読めない端末 (プライベートモード等) は上書き無しとして扱う。 */
function storedChatbotModel(): string | null {
  try {
    return localStorage.getItem(CHATBOT_MODEL_KEY);
  } catch {
    return null;
  }
}

/**
 * 導入済みのモデル名。**取れなければ空** —— 名前を推測する材料が無いだけで、
 * 失敗ではない ({@link chatbotOllamaModel} が種をそのまま返し、断りが説明する)。
 */
async function installedOllamaModels(hub: Window['serviceHub']): Promise<string[]> {
  try {
    const snap = await hub.fetchSnapshot<OllamaSnapshot>('ollama');
    return snap.ok ? snap.data.models.map((m) => m.name) : [];
  } catch {
    return [];
  }
}

/** Ollama 接続時の自由質問フォールバック。 */
async function tryOllama(prompt: string): Promise<OllamaTry> {
  const hub = window.serviceHub;
  if (!hub) return null;
  // **名前は推測しない** —— アプリの 2 つの導入手順が別のモデルを入れるので、
  // 直書きの既定はどちらか一方にしか当たらない (`data/chatbotOllama.ts` の表)。
  const model = chatbotOllamaModel(storedChatbotModel(), await installedOllamaModels(hub));
  try {
    // 戻り値の型は台帳 (`ollama/chat` = 共有の `OllamaChatResult`) を読む (パス 113 / 117)。それまで
    // `{ response?, message? }` と手で写しており、実物の `reply` を 1 度も読めていなかった —— Ollama の
    // 答えは常に空として捨てられ、定型の「解釈できません」だけが出ていた。
    const res = await hub.invoke<ActionData<'ollama/chat'>>('ollama', 'chat', { model, prompt });
    // **断りを捨てない** —— アプリは既に原因と直す手を組んでいる (パス 449)。
    if (!res.ok) return { refusal: ollamaRefusalNote(res.message) };
    const text = res.data.reply.trim();
    return text.length > 0 ? { reply: text } : { refusal: ollamaRefusalNote('') };
  } catch {
    return { refusal: ollamaRefusalNote('') };
  }
}

/*
 * 見た目は `styles.css` の `.concierge*` (2026-09-26 に inline の指定から移した)。inline の頃は
 * `var(--border, #333)` のような**暗い配色の代わりの色**を 13 か所に持っており、トークンが読めない
 * 環境では明るい画面に暗い枠を描いた —— デザインを 2 つにしたので、色はトークンの表だけが決める。
 */

export interface ChatbotWidgetProps {
  /**
   * 列として描く (「すっきり」のデザインで広い画面 —— App.tsx が決める)。無ければ右下の浮いた窓。
   * 列は開け閉めの状態を持たない (列そのものの出し入れは App が持つ)。
   */
  readonly docked?: boolean;
  /** 列を畳む (`docked` のときだけ、見出しに「«」を出す)。 */
  readonly onCollapse?: () => void;
}

export function ChatbotWidget({ docked = false, onCollapse }: ChatbotWidgetProps = {}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  /* 貼り付けを黙って切らない (パス 175)。解釈できない入力は端末内のモデルへ回る (`tryOllama`)。 */
  const inputOver = charsOverCeiling(input, MAX_OLLAMA_PROMPT_CHARS);
  const [busy, setBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<VoiceIntent | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => ['何ができる？', '額面40万の手取りは？', '組織の体制を教えて'],
    [],
  );

  useEffect(() => {
    saveHistory(messages);
    // 最新の発言まで送る。`scrollTo` を持たない環境 (古い WebView・jsdom) は `scrollTop` へ倒す ——
    // 列 (docked) は開いた瞬間から描かれるので、ここで投げると部品ごと境界に受け止められて会話が消える。
    const list = listRef.current;
    if (list) {
      if (typeof list.scrollTo === 'function') list.scrollTo({ top: list.scrollHeight });
      else list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const append = (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-HISTORY_MAX));

  /*
   * **確認の門と同じものを見る。**
   *
   * 2026-08-26 の実測: ここは `intent.kind` を見ておらず、`serviceId` と
   * `action` が在れば実行していた。一方 `requiresConfirmation` は
   * `kind !== 'action'` で**即座に false** を返す。つまり
   * `{ kind: 'navigate', serviceId, action: 'delete' }` は
   * **確認を求められないまま invoke される**形だった
   * (`voiceCommand.test.ts` はこの向きを「kind ゲートが先に効くため確認不要」
   *  として**正しい挙動と書き留めて**いた)。
   *
   * 解析器が今そういう intent を作らないので実害は無かったが、**2 つの門が
   * 別々の物を見ている**状態そのものが穴である。兄弟の `VoiceCommandBar`
   * (`performIntent`) は最初から `kind === 'action'` を見ている。揃える。
   */
  const runIntent = async (intent: VoiceIntent) => {
    if (!window.serviceHub || !isExecutableIntent(intent)) return;
    setBusy(true);
    const res = await window.serviceHub.invoke(intent.serviceId, intent.action, intent.params ?? {});
    setBusy(false);
    // 分類は `data/actionOutcome.ts` に集約する。ここは文言だけを持つ。
    // `persisted: false` を見ずに「実行しました」と言うと、保存されないメモを
    // 保存したことにしてしまう (2026-08 監査)。
    const classified = classifyActionResult(res);
    if (classified.verdict === 'failed') {
      append({ role: 'bot', text: `⚠ 実行に失敗しました: ${classified.message}` });
      return;
    }
    append({
      role: 'bot',
      text:
        classified.verdict === 'accepted-not-saved'
          ? '⚠ 受け付けましたが、まだ保存されません (Phase 6 で対応)。対象ページへご案内します。'
          : '✅ 実行しました。対象ページへご案内します。',
    });
    navigateTo(intent.serviceId);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    append({ role: 'user', text });

    const reply: ChatReply = replyTo(text, CHAT_CONTEXT);

    // 記録できなかったら、**その返事に足す** (別の場所に出すと、言い切った文と
    // 離れてしまう)。返事の文面は `data/chatbot.ts` が持つので、ここでは足すだけ。
    let storeNote = '';
    if (reply.kind === 'request') {
      const stored = recordRequest(text);
      if (!stored.ok) storeNote = `\n\n⚠ ただし、この端末に記録できませんでした。${stored.message}`;
    }

    // 解釈不能のときだけ、Ollama 接続環境なら自由質問として LLM へ。
    let ollamaNote = '';
    if (reply.kind === 'fallback') {
      setBusy(true);
      const llm = await tryOllama(text);
      setBusy(false);
      if (llm !== null && 'reply' in llm) {
        append({ role: 'bot', text: `🧠 ${llm.reply}`, routedThrough: 'Ollama (ローカル LLM)' });
        return;
      }
      // 試して断られたなら、そう言う。橋が無い (`null`) ときは定型文が正しい
      // ——「Ollama 接続時は…」はその人にとって真である (パス 449)。
      if (llm !== null) ollamaNote = `\n\n${llm.refusal}`;
    }

    append({ role: 'bot', text: reply.text + storeNote + ollamaNote, routedThrough: reply.routedThrough });

    if (reply.kind === 'action' && reply.intent) {
      // **起こり得ないことに承認を求めない** (パス 109)。書き込み操作の必須項目は
      // `intent.params` から来るが、解析器はそれを設定しない —— 2026-09-09 まで
      // 「⚠ 書き込み操作のため、実行前に確認してください」と言って承認を取り、
      // invoke は毎回「channel and text are required」で落ちていた。
      // 判断は `shared/voiceWriteRequirements.ts` が 1 か所で持つ (音声も同じ物を読む)。
      const refusal = voiceWriteRefusal(reply.intent.serviceId, reply.intent.action, reply.intent.params);
      if (refusal !== null) {
        const label = SERVICES.find((sv) => sv.id === reply.intent?.serviceId)?.label
          ?? reply.intent.serviceId ?? '（サービス未特定）';
        append({
          role: 'bot',
          text: `⚠ ${voiceWriteRefusalMessage(label, reply.intent.action ?? '', refusal)}`,
        });
        if (reply.navigateTo) navigateTo(reply.navigateTo);
        return;
      }
      if (reply.needsConfirmation) {
        setPendingIntent(reply.intent);
      } else {
        await runIntent(reply.intent);
      }
      return;
    }

    if (reply.navigateTo) {
      navigateTo(reply.navigateTo);
    }
  };

  const panel = (
    <div
      className={docked ? 'concierge docked' : 'concierge floating'}
      data-concierge={docked ? 'docked' : 'floating'}
      // 浮いた窓は他の画面の上に開く「窓」なので dialog。列は画面の一部 (見出しの付いた欄は App の <aside> が持つ)。
      role={docked ? undefined : 'dialog'}
      aria-label={docked ? undefined : 'AI コンシェルジュ'}
    >
      <div className="concierge-head">
        <strong className="concierge-title">🤖 AI コンシェルジュ</strong>
        <span className="concierge-tools">
          <button
            type="button"
            className="ghost"
            onClick={downloadRequests}
            title="受け付けた機能要望を Markdown で書き出す (orchestration backlog 候補)"
            aria-label="要望リストをエクスポート"
          >
            📥 要望
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              clearChatbotHistory();
              setMessages([]);
            }}
            disabled={messages.length === 0}
            title="この端末に残した会話履歴を消去"
            aria-label="会話履歴を消去"
          >
            🗑 履歴
          </button>
          {docked ? (
            onCollapse ? (
              <button
                type="button"
                className="ghost"
                onClick={onCollapse}
                aria-label="チャット欄を畳む"
                title="チャット欄を畳む (上部バーの「💬 チャット」で戻せます)"
              >
                «
              </button>
            ) : null
          ) : (
            <button type="button" className="ghost" onClick={() => setOpen(false)} aria-label="チャットを閉じる">
              ✕
            </button>
          )}
        </span>
      </div>

      <div ref={listRef} className="concierge-log">
        {messages.length === 0 ? (
          <div className="concierge-intro">
            AI オーケストレーション組織 (役員 {ORG_INDEX.counts.executives} / 部長{' '}
            {ORG_INDEX.counts.managers} / チーム {ORG_INDEX.counts.teams}) がご要望を承ります。
            サービスへの案内・操作・説明・機能要望の受付ができます。
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'concierge-msg user' : 'concierge-msg bot'} data-concierge-role={m.role}>
            {m.text}
            {m.routedThrough ? <div className="concierge-route">🪪 {m.routedThrough}</div> : null}
          </div>
        ))}
        {busy ? <div className="concierge-busy">考え中…</div> : null}
        {pendingIntent ? (
          <div role="alertdialog" aria-label="実行確認" className="concierge-confirm">
            <strong>確認:</strong> 書き込み操作を実行しますか？
            <div className="concierge-confirm-actions">
              <button
                type="button"
                onClick={() => {
                  const intent = pendingIntent;
                  setPendingIntent(null);
                  void runIntent(intent);
                }}
              >
                実行
              </button>
              <button type="button" onClick={() => setPendingIntent(null)}>
                やめる
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="concierge-chips">
        {suggestions.map((s) => (
          <button key={s} type="button" onClick={() => void send(s)}>
            {s}
          </button>
        ))}
      </div>

      <CeilingNotice label="入力" value={input} max={MAX_OLLAMA_PROMPT_CHARS} />
      <form
        className="concierge-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="concierge-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例: 税務試算を開いて / 福利厚生の機能が欲しい"
          aria-label="チャット入力"
        />
        {/*
          読み上げの名前は「送信」を含めない —— 列は画面と並んで常に在るので、画面の側の「送信」
          (例: AI アシスタント) と同じ名前だと、名前で押す人 (と e2e の getByRole) がどちらか決められない。
        */}
        <button
          type="submit"
          className="primary"
          aria-label="コンシェルジュへ送る"
          disabled={busy || !input.trim() || inputOver > 0}
        >
          送信
        </button>
      </form>
    </div>
  );

  if (docked) return panel;

  return (
    <>
      {open ? panel : null}
      <button
        type="button"
        className={open ? 'chatbot-widget concierge-fab open' : 'chatbot-widget concierge-fab'}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'チャットを閉じる' : 'AI コンシェルジュを開く'}
        title="AI コンシェルジュ (オーケストレーション組織が応答)"
      >
        {open ? '✕' : '🤖'}
      </button>
    </>
  );
}
