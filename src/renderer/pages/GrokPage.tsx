/**
 * Grok (xAI) の画面 (2026-11-04)。
 *
 * この画面は **AI 提供者としての Grok を 1 か所で見て・直接質問する窓**で、鍵は持たない:
 * xAI の API キーと既定の提供者は、他の提供者と同じく「AI アシスタント」のエージェント設定
 * (`assistant` スロット) に保存する。ここで別のスロットへ鍵を持つと、鍵が 2 か所に分かれて
 * どちらが効くのか分からなくなる (そして `assistant` 側の包みを上書きして他の提供者の鍵を
 * 消す書き込みも作れてしまう) —— だから**状態を読む・質問を送る**だけにした。
 *
 * - 状態: `assistant/providers` から Grok の設定済み / 既定 / 既定モデルを読む。読めなければ
 *   「確認できません」と言い、未設定とは混ぜない (`readProviderStatuses`)
 * - 質問: `assistant/chat` を `provider: 'grok'` で呼ぶ。本文の検査 (秘密・個人データの形) は
 *   その漏斗が掛ける。送る前に送り先を名乗る (`AiEgressNotice`)
 * - 危機・他害の文は送らず窓口を出す (`CrisisHeldNotice`)。返答は素のテキストで描く
 *   (Markdown を解かない = 外から来た文が画面の構造を作らない)
 */
import { useEffect, useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { CrisisHeldNotice, shouldHoldFromExternalModel } from '../components/CrisisHeldNotice';
import { CeilingNotice } from '../components/CeilingNotice';
import { useBuildKind } from '../hooks/useBuildKind';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { assistantEgressRecipients, readProviderStatuses, type ProviderStatus } from '../data/assistantProviders';
import { externalTextOnOneLine } from '../data/assistantMarkdown';
import { grokStatusLine } from '../data/grokStatus';
import { CONCIERGE_SYSTEM_PROMPT } from '../data/chatbotGrok';
import { displayField } from '../../shared/apiResponse';
import { MAX_ASSISTANT_CONTENT_CHARS } from '../../shared/assistantLimits';
import { charsOverCeiling, refusedCeilingNote } from '../../shared/inputCeiling';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import type { ActionData } from '../../shared/actionData';

/** Grok の画面で Grok に渡す役割の指示。コンシェルジュと同じ土台に、画面の目的を足す。 */
const GROK_PAGE_SYSTEM = `${CONCIERGE_SYSTEM_PROMPT}\nこの画面では、利用者が自由に質問します。`;

export function GrokPage() {
  const buildKind = useBuildKind();
  const submit = useSubmitGuard();
  const [providers, setProviders] = useState<readonly ProviderStatus[]>([]);
  const [providersUnknown, setProvidersUnknown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [crisisHeld, setCrisisHeld] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<{ text: string; model: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void readProviderStatuses().then((read) => {
      if (!alive) return;
      setProviders(read.providers);
      setProvidersUnknown(read.unknown);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const grok = providers.find((p) => p.id === 'grok');
  const status = grokStatusLine(loaded, providersUnknown, grok);
  const recipients = useMemo(
    () =>
      assistantEgressRecipients({
        providers,
        providersUnknown,
        selected: 'grok',
        browser: buildKind === null ? null : buildKind === 'browser',
        pageHostname: typeof location !== 'undefined' ? location.hostname : '',
      }),
    [providers, providersUnknown, buildKind],
  );

  async function onAsk(): Promise<void> {
    const q = question.trim();
    if (q === '') {
      setError('質問を入力してください');
      return;
    }
    // 危機・他害の文は外部のモデルへ送らず、窓口を出す (コンシェルジュ・村・専属カウンセラーと同じ網)。
    if (shouldHoldFromExternalModel(q)) {
      setCrisisHeld(q);
      setError(null);
      setReply(null);
      return;
    }
    setCrisisHeld(null);
    if (charsOverCeiling(q, MAX_ASSISTANT_CONTENT_CHARS) > 0) {
      setError(refusedCeilingNote('質問', q, MAX_ASSISTANT_CONTENT_CHARS));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await window.serviceHub.invoke<ActionData<'assistant/chat'>>('assistant', 'chat', {
        provider: 'grok',
        system: GROK_PAGE_SYSTEM,
        messages: [{ role: 'user', content: q }],
      });
      if (r.ok) setReply({ text: r.data.text, model: r.data.model });
      else setError(externalTextOnOneLine(r.message));
    } catch (e) {
      setError(
        e instanceof Error ? externalTextOnOneLine(redactForMessage(e.message, ERROR_MESSAGE_MAX_CHARS)) : 'Grok に送れませんでした',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Section title="Grok (xAI)">
        <p data-grok-status={status.kind} style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
          {status.text}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0 }}>
          xAI の API キーと既定の提供者は「AI アシスタント」のエージェント設定で保存します。既定の提供者を Grok にすると、
          AI コンシェルジュと「AIの村」の返答も Grok が担当します。
        </p>
      </Section>

      <Section title="Grok に質問する">
        <AiEgressNotice subject={{ what: 'この画面で入力した質問', recipients }} />
        <textarea
          aria-label="Grok への質問"
          data-grok-question
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="例: 来月の資金繰りで先に確認しておくことは？"
          style={{ width: '100%', border: '1px solid var(--control-border)', borderRadius: 6, padding: 8 }}
        />
        <CeilingNotice label="質問" value={question} max={MAX_ASSISTANT_CONTENT_CHARS} />
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            data-grok-ask
            disabled={busy || submit.busy || grok?.configured !== true}
            onClick={() => fireReported(submit.run(onAsk))}
          >
            {busy ? '考え中…' : 'Grok に送る'}
          </button>
        </div>
        {crisisHeld !== null && <CrisisHeldNotice text={crisisHeld} />}
        {error && (
          <p role="alert" data-grok-error style={{ fontSize: 13, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        {reply && (
          <div data-grok-reply style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{reply.text}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
              via Grok ({displayField(reply.model)})
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
