/**
 * Grok の画面の状態の 1 行 (2026-11-04)。**未設定と「確認できません」を混ぜない** ——
 * `assistant/providers` が読めなかった (保管庫が施錠されている等) のに「未設定」と言うと、
 * 保存済みの鍵がある人に「鍵が無い」と告げる (`assistantProviders.ts` の注記と同じ規律)。
 */
import type { ProviderStatus } from './assistantProviders';

export type GrokStatusKind = 'loading' | 'unknown' | 'unconfigured' | 'connected';

export interface GrokStatusLine {
  readonly kind: GrokStatusKind;
  readonly text: string;
}

export function grokStatusLine(
  loaded: boolean,
  providersUnknown: boolean,
  grok: ProviderStatus | undefined,
): GrokStatusLine {
  if (!loaded) return { kind: 'loading', text: '読み込み中…' };
  if (providersUnknown) {
    return {
      kind: 'unknown',
      text: '設定状況を確認できません (保管庫が施錠されているか、読み込みに失敗しました)。未設定とは限りません。',
    };
  }
  if (!grok || !grok.configured) {
    return {
      kind: 'unconfigured',
      text: '未設定です。「AI アシスタント」のエージェント設定に xAI API キー (xai-…) を保存すると使えます。',
    };
  }
  const via = grok.browserDirect ? '' : ' (ブラウザ版では設定したプロキシ経由)';
  return {
    kind: 'connected',
    text: `接続済み${grok.isDefault ? ' (既定の提供者)' : ''} — モデル ${grok.defaultModel}${via}`,
  };
}
