/**
 * ChatbotWidget — AI オーケストレーション組織のコンシェルジュ (フローティング UI)。
 *
 * 画面右下の 🤖 ボタンからどのページでも開けるチャットパネル。判断ロジックは
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES } from '../services';
import type { ServiceId } from '../../shared/serviceId';
import { replyTo, type ChatReply } from '../data/chatbot';
import { buildOrgIndex, type RawOrg, type RawTeam } from '../data/chatOrg';
import { CAPABILITIES } from './VoiceCommandBar';
import type { VoiceIntent } from '../data/voiceCommand';
import { org as registryOrg, teams as registryTeams } from '../../../orchestration/registry.json';

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

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]).slice(-HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-HISTORY_MAX)));
  } catch {
    // 保存失敗は無視 (チャット自体は続行できる)。
  }
}

function recordRequest(text: string): void {
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? (parsed as { text: string; at: string }[]) : [];
    list.push({ text, at: new Date().toISOString() });
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(list));
  } catch {
    // 記録失敗は無視。
  }
}

/** 記録済み要望を Markdown でダウンロードする (オーケストレーション backlog 連携用)。 */
function downloadRequests(): void {
  let list: { text: string; at: string }[] = [];
  try {
    const raw = localStorage.getItem(REQUESTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) list = parsed as { text: string; at: string }[];
  } catch {
    list = [];
  }
  const lines = [
    '# チャットボット経由の機能要望 (オーケストレーション backlog 候補)',
    '',
    ...list.map((r) => `- [ ] ${r.text} _(受付: ${r.at.slice(0, 10)})_`),
    '',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chatbot-requests.md';
  a.click();
  URL.revokeObjectURL(url);
}

function navigateTo(serviceId: ServiceId): void {
  window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: serviceId }));
}

/** Ollama 接続時の自由質問フォールバック (失敗したら null)。 */
async function tryOllama(prompt: string): Promise<string | null> {
  if (!window.serviceHub) return null;
  const model = (() => {
    try {
      return localStorage.getItem('chatbot-ollama-model') ?? 'llama3.2';
    } catch {
      return 'llama3.2';
    }
  })();
  try {
    const res = await window.serviceHub.invoke<{ response?: string; message?: string }>(
      'ollama',
      'chat',
      { model, prompt },
    );
    if (res.ok) {
      const data = res.data;
      const text = data.response ?? data.message ?? '';
      return text || null;
    }
    return null;
  } catch {
    return null;
  }
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 72,
  width: 'min(380px, calc(100vw - 32px))',
  maxHeight: 'min(520px, calc(100vh - 120px))',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-elev, #1b1d22)',
  border: '1px solid var(--border, #333)',
  borderRadius: 12,
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  zIndex: 1000,
  overflow: 'hidden',
};

const fabStyle: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  width: 48,
  height: 48,
  borderRadius: '50%',
  border: '1px solid var(--border, #333)',
  background: 'var(--accent, #4f7cff)',
  color: '#fff',
  fontSize: 22,
  cursor: 'pointer',
  zIndex: 1000,
  boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
};

export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<VoiceIntent | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => ['何ができる？', '組織の体制を教えて', '税務試算を開いて'],
    [],
  );

  useEffect(() => {
    saveHistory(messages);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const append = (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-HISTORY_MAX));

  const runIntent = async (intent: VoiceIntent) => {
    if (!window.serviceHub || intent.serviceId === undefined || intent.action === undefined) return;
    setBusy(true);
    const res = await window.serviceHub.invoke(intent.serviceId, intent.action, intent.params ?? {});
    setBusy(false);
    if (res.ok) {
      append({ role: 'bot', text: '✅ 実行しました。対象ページへご案内します。' });
      navigateTo(intent.serviceId);
    } else {
      append({ role: 'bot', text: `⚠ 実行に失敗しました: ${res.message}` });
    }
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    append({ role: 'user', text });

    const reply: ChatReply = replyTo(text, CHAT_CONTEXT);

    if (reply.kind === 'request') {
      recordRequest(text);
    }

    // 解釈不能のときだけ、Ollama 接続環境なら自由質問として LLM へ。
    if (reply.kind === 'fallback') {
      setBusy(true);
      const llm = await tryOllama(text);
      setBusy(false);
      if (llm) {
        append({ role: 'bot', text: `🧠 ${llm}`, routedThrough: 'Ollama (ローカル LLM)' });
        return;
      }
    }

    append({ role: 'bot', text: reply.text, routedThrough: reply.routedThrough });

    if (reply.kind === 'action' && reply.intent) {
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

  return (
    <>
      {open ? (
        <div style={panelStyle} role="dialog" aria-label="AI コンシェルジュ">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border, #333)',
              fontSize: 13,
            }}
          >
            <strong>🤖 AI コンシェルジュ</strong>
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={downloadRequests}
                title="受け付けた機能要望を Markdown で書き出す (orchestration backlog 候補)"
                aria-label="要望リストをエクスポート"
              >
                📥 要望
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="チャットを閉じる">
                ✕
              </button>
            </span>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}>
                AI オーケストレーション組織 (役員 {ORG_INDEX.counts.executives} / 部長{' '}
                {ORG_INDEX.counts.managers} / チーム {ORG_INDEX.counts.teams}) がご要望を承ります。
                サービスへの案内・操作・説明・機能要望の受付ができます。
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.role === 'user' ? 'var(--accent, #4f7cff)' : 'var(--bg, #111)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border, #333)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {m.text}
                {m.routedThrough ? (
                  <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 4 }}>
                    🪪 {m.routedThrough}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>考え中…</div> : null}
            {pendingIntent ? (
              <div
                role="alertdialog"
                aria-label="実行確認"
                style={{ fontSize: 12, border: '1px solid var(--danger, #ef4444)', borderRadius: 8, padding: 8 }}
              >
                <strong style={{ color: 'var(--danger, #ef4444)' }}>確認:</strong> 書き込み操作を実行しますか？
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
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

          <div style={{ display: 'flex', gap: 6, padding: '8px 12px 4px', flexWrap: 'wrap' }}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                style={{ fontSize: 11, borderRadius: 999, padding: '3px 10px' }}
              >
                {s}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            style={{ display: 'flex', gap: 6, padding: 12, borderTop: '1px solid var(--border, #333)' }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例: 税務試算を開いて / 福利厚生の機能が欲しい"
              aria-label="チャット入力"
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'var(--bg, #111)',
                border: '1px solid var(--border, #333)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 13,
              }}
            />
            <button type="submit" className="primary" disabled={busy || !input.trim()}>
              送信
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        style={fabStyle}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'チャットを閉じる' : 'AI コンシェルジュを開く'}
        title="AI コンシェルジュ (オーケストレーション組織が応答)"
      >
        {open ? '✕' : '🤖'}
      </button>
    </>
  );
}
