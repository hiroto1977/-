/**
 * AssistantPage — 確証済みナレッジと全サービスを統合した、Claude 駆動の
 * 専用 AI チャットページ。
 *
 *   - 頭脳     → `serviceHub.invoke('assistant','chat', { system, messages })`
 *                (Electron: main の Anthropic 中継 / ブラウザ: web-shim が直接呼ぶ)
 *   - 文脈     → `data/assistantContext.buildSystemPrompt` が確証済みナレッジ +
 *                関連サービスを RAG 注入 (単一の真実源から導出)
 *   - 成果物   → `data/assistantMarkdown.parseMarkdown` で表・箇条書きを安全描画
 *   - 代替     → API 未設定/失敗時は決定論ルールエンジン (`data/chatbot.replyTo`) に
 *                フォールバックし、案内・手取り計算・カウンセリングは常時オフライン動作
 *   - 背景     → ユーザーがカスタマイズ可能 (既定: 背景白 / 文字黒)。localStorage 永続化
 *
 * 画面遷移は `servicehub:navigate` CustomEvent (App.tsx が listen)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SERVICES } from '../services';
import type { ServiceId } from '../../shared/serviceId';
import { buildSystemPromptAsync, KNOWLEDGE_CORPUS, retrieveServices, type AssistantService } from '../data/assistantContext';
import { parseMarkdown, type Block, type InlineToken } from '../data/assistantMarkdown';
import { replyTo } from '../data/chatbot';
import { buildOrgIndex, type RawOrg, type RawTeam } from '../data/chatOrg';
import { CAPABILITIES } from '../components/VoiceCommandBar';
import { org as registryOrg, teams as registryTeams } from '../../../orchestration/registry.json';

interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  /** 関連サービス (アシスタント発話のとき、回答に紐づく案内ボタン用)。 */
  readonly services?: readonly AssistantService[];
  /** オフライン (ルールエンジン) 応答か。 */
  readonly offline?: boolean;
}

interface Theme {
  readonly bg: string;
  readonly fg: string;
  readonly image: string;
}

const HISTORY_KEY = 'assistant-history';
const THEME_KEY = 'assistant-theme';
const HISTORY_MAX = 50;
const TURN_WINDOW = 16; // Claude へ渡す直近会話数

const DEFAULT_THEME: Theme = { bg: '#ffffff', fg: '#000000', image: '' };

// 注: `SERVICES` への依存はモジュール評価時ではなくコンポーネント内 (useMemo) で
// 解決する。services.ts → AssistantPage の循環 import があるため、トップレベルで
// SERVICES を読むと初期化前で undefined になる (罠)。
const ORG_INDEX = buildOrgIndex(registryOrg as RawOrg, registryTeams as readonly RawTeam[]);

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
    /* 保存失敗は無視 */
  }
}

function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return DEFAULT_THEME;
    const p = JSON.parse(raw) as Partial<Theme>;
    return {
      bg: typeof p.bg === 'string' ? p.bg : DEFAULT_THEME.bg,
      fg: typeof p.fg === 'string' ? p.fg : DEFAULT_THEME.fg,
      image: typeof p.image === 'string' ? p.image : '',
    };
  } catch {
    return DEFAULT_THEME;
  }
}

function navigateTo(serviceId: ServiceId): void {
  window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: serviceId }));
}

/** インライントークン列を React ノードへ。 */
function renderInline(spans: readonly InlineToken[], fg: string) {
  return spans.map((t, i) => {
    if (t.code) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(127,127,127,0.18)',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: '0.9em',
          }}
        >
          {t.text}
        </code>
      );
    }
    if (t.bold) return <strong key={i}>{t.text}</strong>;
    return <span key={i} style={{ color: fg }}>{t.text}</span>;
  });
}

/** Markdown ブロックを安全に描画 (HTML 文字列を使わない)。 */
function MarkdownView({ blocks, fg }: { blocks: Block[]; fg: string }) {
  const border = '1px solid rgba(127,127,127,0.4)';
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const size = b.level <= 2 ? 18 : b.level === 3 ? 16 : 14;
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: size, margin: '8px 0 4px', color: fg }}>
              {renderInline(b.spans, fg)}
            </div>
          );
        }
        if (b.type === 'paragraph') {
          return (
            <p key={i} style={{ margin: '4px 0', lineHeight: 1.7, color: fg }}>
              {renderInline(b.spans, fg)}
            </p>
          );
        }
        if (b.type === 'code') {
          return (
            <pre
              key={i}
              style={{
                background: 'rgba(127,127,127,0.14)',
                padding: 10,
                borderRadius: 8,
                overflowX: 'auto',
                fontSize: 12.5,
                margin: '6px 0',
              }}
            >
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag key={i} style={{ margin: '4px 0', paddingLeft: 22, lineHeight: 1.7, color: fg }}>
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it, fg)}</li>
              ))}
            </Tag>
          );
        }
        // table
        return (
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, color: fg }}>
              <thead>
                <tr>
                  {b.headers.map((cell, c) => (
                    <th
                      key={c}
                      style={{ border, padding: '6px 10px', textAlign: 'left', background: 'rgba(127,127,127,0.12)' }}
                    >
                      {renderInline(cell, fg)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} style={{ border, padding: '6px 10px' }}>
                        {renderInline(cell, fg)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadTheme());
  const [showTheme, setShowTheme] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // SERVICES は循環 import 回避のためコンポーネント内で解決する (初期化済み)。
  const serviceCatalog = useMemo<AssistantService[]>(
    () => SERVICES.map((s) => ({ id: s.id, label: s.label, description: s.description })),
    [],
  );
  const chatContext = useMemo(
    () => ({
      services: serviceCatalog.map((s) => ({
        id: s.id as ServiceId,
        label: s.label,
        description: s.description,
      })),
      org: ORG_INDEX,
      capabilities: CAPABILITIES,
    }),
    [serviceCatalog],
  );

  const suggestions = useMemo(
    () => ['資金調達の選択肢を表で比較して', '今月の経営課題を3つ挙げて', '額面50万円の手取りは？', '何ができる？'],
    [],
  );

  useEffect(() => {
    saveHistory(messages);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      /* 無視 */
    }
  }, [theme]);

  const append = (msg: ChatMessage) => setMessages((prev) => [...prev, msg].slice(-HISTORY_MAX));

  /** ルールエンジンによるオフライン応答 (フォールバック)。 */
  const replyOffline = (text: string) => {
    const reply = replyTo(text, chatContext);
    const services = reply.navigateTo
      ? serviceCatalog.filter((s) => s.id === reply.navigateTo)
      : retrieveServices(text, serviceCatalog);
    append({ role: 'assistant', text: reply.text, services, offline: true });
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    const history = [...messages, { role: 'user' as const, text }];
    setMessages(history.slice(-HISTORY_MAX));
    setBusy(true);
    try {
      const hub = window.serviceHub;
      if (!hub) {
        replyOffline(text);
        return;
      }
      const turns = history
        .slice(-TURN_WINDOW)
        .map((m) => ({ role: m.role, content: m.text }));
      const system = await buildSystemPromptAsync(text, serviceCatalog);
      const res = await hub.invoke<{ text: string; model?: string }>('assistant', 'chat', {
        system,
        messages: turns,
      });
      if (res.ok) {
        append({
          role: 'assistant',
          text: res.data.text,
          services: retrieveServices(text, serviceCatalog),
        });
      } else {
        // API 未設定/失敗 → 決定論フォールバック。一度だけ理由を添える。
        append({
          role: 'assistant',
          text: `（AI 応答を利用できないため簡易モードで回答します: ${res.message}）`,
          offline: true,
        });
        replyOffline(text);
      }
    } catch (e) {
      append({ role: 'assistant', text: `エラー: ${e instanceof Error ? e.message : String(e)}`, offline: true });
      replyOffline(text);
    } finally {
      setBusy(false);
    }
  };

  const clearChat = () => setMessages([]);

  const pageStyle: React.CSSProperties = {
    background: theme.bg,
    backgroundImage: theme.image ? `url(${theme.image})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: theme.fg,
    borderRadius: 12,
    padding: 16,
    minHeight: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
  };

  const bubbleBase: React.CSSProperties = {
    maxWidth: '88%',
    borderRadius: 12,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: 1.7,
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
  };

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <strong style={{ fontSize: 18 }}>🤖 AI アシスタント</strong>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Claude を頭脳に、5 コレクション・{KNOWLEDGE_CORPUS.length} 件の確証済みナレッジを
            6 役員ロール並列検索して回答します
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setShowTheme((v) => !v)} title="背景をカスタマイズ">
            🎨 背景
          </button>
          <button type="button" onClick={clearChat} title="会話履歴を消去" disabled={messages.length === 0}>
            🗑 消去
          </button>
        </div>
      </div>

      {showTheme ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 10,
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            背景色
            <input
              type="color"
              value={theme.bg}
              aria-label="背景色"
              onChange={(e) => setTheme((t) => ({ ...t, bg: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            文字色
            <input
              type="color"
              value={theme.fg}
              aria-label="文字色"
              onChange={(e) => setTheme((t) => ({ ...t, fg: e.target.value }))}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
            背景画像URL
            <input
              type="url"
              value={theme.image}
              placeholder="https://… (任意)"
              aria-label="背景画像URL"
              onChange={(e) => setTheme((t) => ({ ...t, image: e.target.value.trim() }))}
              style={{ flex: 1, padding: '4px 8px', borderRadius: 6 }}
            />
          </label>
          <button type="button" onClick={() => setTheme(DEFAULT_THEME)}>
            既定に戻す
          </button>
        </div>
      ) : null}

      <div
        ref={listRef}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}
      >
        {messages.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.8 }}>
            ご質問・ご相談をどうぞ。経営・税務・労務・法務のアドバイス、表や計画などの成果物作成、
            アプリ内サービスへの案内ができます。確証済みナレッジ（出典つき）を根拠に回答します。
          </div>
        ) : null}

        {messages.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <div
                style={{
                  ...bubbleBase,
                  background: isUser ? 'var(--accent, #4f7cff)' : 'rgba(127,127,127,0.10)',
                  color: isUser ? '#fff' : theme.fg,
                  border: isUser ? 'none' : '1px solid rgba(127,127,127,0.28)',
                  whiteSpace: isUser ? 'pre-wrap' : 'normal',
                }}
              >
                {isUser ? m.text : <MarkdownView blocks={parseMarkdown(m.text)} fg={theme.fg} />}
                {m.offline ? (
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>簡易モード（オフライン）</div>
                ) : null}
              </div>
              {!isUser && m.services && m.services.length > 0 ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {m.services.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => navigateTo(s.id as ServiceId)}
                      style={{ fontSize: 11, borderRadius: 999, padding: '3px 10px' }}
                      title={s.description}
                    >
                      ↗ {s.label}を開く
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {busy ? <div style={{ fontSize: 12, opacity: 0.7 }}>考え中…</div> : null}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 0 6px', flexWrap: 'wrap' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={busy}
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
        style={{ display: 'flex', gap: 8, paddingTop: 4 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例: 補助金の候補を表で比較して / 創業計画のたたき台を作って"
          aria-label="アシスタントへの入力"
          style={{
            flex: 1,
            padding: '10px 12px',
            border: '1px solid rgba(127,127,127,0.4)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.6)',
            color: '#111',
            fontSize: 14,
          }}
        />
        <button type="submit" className="primary" disabled={busy || !input.trim()}>
          送信
        </button>
      </form>
    </div>
  );
}
