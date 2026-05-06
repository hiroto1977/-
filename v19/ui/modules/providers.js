// v19/ui/modules/providers.js — マルチ プロバイダ クライアント (Ollama / Anthropic / Google)
// 対応 governance/12 §10 #36 (PDCA #25 v36): dashboard.js 最適化再構築
//
// 共通 sendStream インターフェース:
//   sendStream({ apiKey, model, maxTokens, system, messages, signal, onText })
//     → Promise<{ text: string, usage: { input_tokens?, output_tokens? } | null }>
//
// 設計原則 (35 反復 学び):
//   - 全プロバイダで browser-direct fetch (中継サーバー無し → C3 以上は送らない前提)
//   - INV-1: localOnly モードでも 物理的に呼出可能だが、UI 層で hidden により ブロック
//   - INV-9: SSE で input_tokens / output_tokens を維持
//   - エラーは ProviderError に統一 — UI 側 で err.message / err.providerId / err.status を参照
//   - DOM 非依存 — Node fetch 環境 でも (テスト用に) import 可能

export class ProviderError extends Error {
  constructor(message, { status, type, providerId } = {}) {
    super(message);
    this.status = status; this.type = type; this.providerId = providerId;
  }
}

export const HTTP_ERR_JA = {
  400: 'リクエスト不正',
  401: 'API キーが無効です',
  403: 'アクセス権限がありません（CORS / 課金状態をご確認ください）',
  404: 'モデルが見つかりません',
  413: 'リクエストが大きすぎます',
  429: 'レート制限に達しました。少し待ってから再試行してください',
  500: 'プロバイダ側のエラーです。少し待って再試行してください',
  529: 'API が混雑しています。少し待って再試行してください',
};

// ---------- SSE 共通 reader ----------
async function readSseLines(response, handleEvent) {
  if (!response.body) throw new ProviderError('ストリーミング応答を取得できません');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try { handleEvent(JSON.parse(payload)); }
      catch { /* skip malformed JSON chunk */ }
    }
  }
}

async function safeErrorBody(res) {
  try {
    const j = await res.json();
    return j?.error?.message || j?.message || JSON.stringify(j);
  } catch { return ''; }
}

// ---------- Message content helpers ----------
// Internal format: content is either a string (text-only) or
//   [{type:'text', text}, {type:'image', dataUrl:'data:image/...;base64,...', mimeType}]
export function partsOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}
export function textOf(content) {
  return partsOf(content).filter(p => p.type === 'text').map(p => p.text).join('');
}
export function imagesOf(content) {
  return partsOf(content).filter(p => p.type === 'image');
}
export function hasImages(content) { return imagesOf(content).length > 0; }
export function dataUrlPayload(dataUrl) {
  // "data:image/jpeg;base64,XXXX" → "XXXX"
  const i = dataUrl.indexOf(',');
  return i < 0 ? dataUrl : dataUrl.slice(i + 1);
}

// ---------- Anthropic ----------
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

async function anthropicSendStream({ apiKey, model, maxTokens, system, messages, signal, onText, onThinking, thinkingBudget }) {
  if (!apiKey) throw new ProviderError('API キーが設定されていません', { providerId: 'anthropic' });
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'anthropic' });

  const anthropicMessages = messages.map(m => {
    const parts = partsOf(m.content);
    const blocks = parts.map(p => {
      if (p.type === 'image') {
        return {
          type: 'image',
          source: { type: 'base64', media_type: p.mimeType || 'image/jpeg',
                    data: dataUrlPayload(p.dataUrl) },
        };
      }
      return { type: 'text', text: p.text };
    });
    return {
      role: m.role,
      content: (blocks.length === 1 && blocks[0].type === 'text') ? blocks[0].text : blocks,
    };
  });

  const body = { model, max_tokens: maxTokens, messages: anthropicMessages, stream: true };
  if (system && system.trim()) body.system = system;
  // Claude 4 系 拡張思考 (v39、PDCA #28): thinkingBudget が正の数なら有効化
  // Anthropic 仕様: thinking.budget_tokens は max_tokens 以下、最低 1024
  // 注: 拡張思考有効時は temperature/top_p/top_k は固定値推奨 (公式 docs 参照)
  if (Number.isFinite(thinkingBudget) && thinkingBudget >= 1024) {
    body.thinking = { type: 'enabled', budget_tokens: Math.min(thinkingBudget, maxTokens - 1) };
  }

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`接続エラー: ${err.message}（CORS / ネットワーク制限の可能性）`,
      { providerId: 'anthropic' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'anthropic' },
    );
  }

  let fullText = '';
  let fullThinking = '';
  let usage = null;
  await readSseLines(res, (evt) => {
    if (evt.type === 'content_block_delta') {
      // text_delta: 通常の応答テキスト (アシスタント発話)
      // thinking_delta: 拡張思考 (Claude 4 系、v39 で対応) — 推論過程
      if (evt.delta?.type === 'text_delta') {
        fullText += evt.delta.text;
        onText?.(evt.delta.text);
      } else if (evt.delta?.type === 'thinking_delta') {
        fullThinking += evt.delta.thinking;
        onThinking?.(evt.delta.thinking);
      }
    } else if (evt.type === 'message_delta' && evt.usage) {
      usage = { ...(usage || {}), ...evt.usage };
    } else if (evt.type === 'message_start' && evt.message?.usage) {
      usage = { ...evt.message.usage, ...(usage || {}) };
    } else if (evt.type === 'error') {
      throw new ProviderError(evt.error?.message || 'API エラー',
        { type: evt.error?.type, providerId: 'anthropic' });
    }
  });
  const result = { text: fullText, usage };
  if (fullThinking) result.thinking = fullThinking;
  return result;
}

// ---------- Google Gemini ----------
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function googleSendStream({ apiKey, model, maxTokens, system, messages, signal, onText }) {
  if (!apiKey) throw new ProviderError('API キーが設定されていません', { providerId: 'google' });
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'google' });

  const contents = messages.map(m => {
    const parts = [];
    for (const p of partsOf(m.content)) {
      if (p.type === 'image') {
        parts.push({ inlineData: { mimeType: p.mimeType || 'image/jpeg',
                                    data: dataUrlPayload(p.dataUrl) }});
      } else {
        parts.push({ text: p.text });
      }
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system && system.trim()) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const url = `${GOOGLE_API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(`接続エラー: ${err.message}（CORS / ネットワーク制限の可能性）`,
      { providerId: 'google' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'google' },
    );
  }

  let fullText = '';
  let usage = null;
  await readSseLines(res, (evt) => {
    const parts = evt?.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (typeof p.text === 'string' && p.text) {
        fullText += p.text;
        onText?.(p.text);
      }
    }
    if (evt?.usageMetadata) {
      usage = {
        input_tokens:  evt.usageMetadata.promptTokenCount,
        output_tokens: evt.usageMetadata.candidatesTokenCount,
      };
    }
  });
  return { text: fullText, usage };
}

// ---------- Ollama (local) ----------
const OLLAMA_DEFAULT_BASE = 'http://localhost:11434';

async function ollamaSendStream({ apiKey, model, maxTokens, system, messages, signal, onText }) {
  // For Ollama: apiKey field is repurposed as the base URL (default localhost:11434).
  const base = (apiKey || OLLAMA_DEFAULT_BASE).replace(/\/$/, '');
  if (!messages?.length) throw new ProviderError('メッセージが空です', { providerId: 'ollama' });

  const ollamaMessages = [];
  if (system && system.trim()) ollamaMessages.push({ role: 'system', content: system });
  for (const m of messages) {
    const text = textOf(m.content);
    const imgs = imagesOf(m.content);
    const out = { role: m.role === 'assistant' ? 'assistant' : 'user', content: text };
    if (imgs.length) out.images = imgs.map(p => dataUrlPayload(p.dataUrl));
    ollamaMessages.push(out);
  }

  const body = {
    model,
    messages: ollamaMessages,
    stream: true,
    options: { num_predict: maxTokens },
  };

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ProviderError(
      `Ollama に接続できません: ${err.message}\n` +
      `ヒント: ターミナルで \`ollama serve\` が起動済みで、` +
      `OLLAMA_ORIGINS=* または このページの Origin を許可していますか？`,
      { providerId: 'ollama' });
  }

  if (!res.ok) {
    const detail = await safeErrorBody(res);
    throw new ProviderError(
      `${HTTP_ERR_JA[res.status] || `HTTP ${res.status}`}${detail ? ` — ${detail}` : ''}`,
      { status: res.status, providerId: 'ollama' });
  }
  if (!res.body) throw new ProviderError('ストリーミング応答を取得できません');

  // Ollama returns NDJSON (newline-delimited JSON), not SSE.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let usage = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try { evt = JSON.parse(trimmed); } catch { continue; }
      if (evt.error) {
        throw new ProviderError(evt.error, { providerId: 'ollama' });
      }
      if (evt.message?.content) {
        fullText += evt.message.content;
        onText?.(evt.message.content);
      }
      if (evt.done) {
        usage = {
          input_tokens:  evt.prompt_eval_count,
          output_tokens: evt.eval_count,
        };
      }
    }
  }
  return { text: fullText, usage };
}

// ---------- Provider registry ----------
export const PROVIDERS = {
  ollama: {
    id: 'ollama',
    label: 'Ollama (ローカル)',
    icon: '🏠',
    keyHint: 'http://localhost:11434',
    keyDocsUrl: 'https://ollama.com/',
    keyDocsLabel: 'Ollama 公式サイト',
    keyLabelOverride: 'サーバー URL',
    keyHelpOverride: 'API キー不要。Ollama サーバーのベース URL（既定: http://localhost:11434）',
    defaultModel: 'llama3.2',
    modelSuggestions: [
      'llama3.2', 'llama3.1', 'qwen2.5', 'gemma3', 'mistral', 'phi4', 'deepseek-r1',
      'llama3.2-vision', 'llava', 'gemma3:vision', 'minicpm-v',
    ],
    note: 'お手元の PC で動作する Ollama に接続します（API キー不要・通信は外部に出ません）。' +
          '事前に <code>ollama serve</code> を起動し、ブラウザから呼ぶ場合は環境変数 ' +
          '<code>OLLAMA_ORIGINS=*</code> を設定してください。' +
          '画像を送る場合は <code>llama3.2-vision</code> や <code>llava</code> などのビジョン対応モデルを指定してください。',
    sendStream: ollamaSendStream,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    icon: '🤖',
    keyHint: 'sk-ant-api03-...',
    keyDocsUrl: 'https://console.anthropic.com/',
    keyDocsLabel: 'Anthropic Console',
    defaultModel: 'claude-opus-4-7',
    modelSuggestions: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    note: 'Anthropic 社の Claude API と直接通信します（クラウド・有償）。',
    sendStream: anthropicSendStream,
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    icon: '✨',
    keyHint: 'AIza...',
    keyDocsUrl: 'https://aistudio.google.com/apikey',
    keyDocsLabel: 'Google AI Studio',
    defaultModel: 'gemini-2.5-flash',
    modelSuggestions: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    note: 'Google AI Studio の Gemini API と直接通信します（クラウド・無料枠あり）。',
    sendStream: googleSendStream,
  },
};
