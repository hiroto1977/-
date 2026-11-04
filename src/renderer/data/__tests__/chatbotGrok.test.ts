import { describe, expect, it } from 'vitest';
import {
  CONCIERGE_SYSTEM_PROMPT,
  GROK_EGRESS_NOTICE,
  GROK_LABEL,
  conciergeUsesGrok,
  grokRefusalNote,
} from '../chatbotGrok';

const st = (id: string, configured: boolean, isDefault: boolean) => ({ id, configured, isDefault });

describe('conciergeUsesGrok — 自由質問を Grok へ回す条件', () => {
  it('★ Grok の鍵があり、かつ既定が Grok のときだけ true', () => {
    expect(conciergeUsesGrok([st('anthropic', true, false), st('grok', true, true)])).toBe(true);
  });
  it('既定が別の提供者なら、Grok の鍵が在っても false (黙って xAI へ送らない)', () => {
    expect(conciergeUsesGrok([st('anthropic', true, true), st('grok', true, false)])).toBe(false);
  });
  it('既定が Grok でも鍵が無ければ false', () => {
    expect(conciergeUsesGrok([st('grok', false, true)])).toBe(false);
  });
  it('読めない・形の違う一覧は false (分からないのに外へ送らない)', () => {
    for (const bad of [undefined, null, 'grok', 42, {}, [null], ['grok'], [{ id: 'grok' }]]) {
      expect(conciergeUsesGrok(bad)).toBe(false);
    }
  });
  it('configured / isDefault は真偽値の true だけを真とする', () => {
    expect(conciergeUsesGrok([{ id: 'grok', configured: 'true', isDefault: 1 }])).toBe(false);
  });
});

describe('Grok の文', () => {
  it('送り先と「端末の外」を名乗る', () => {
    expect(GROK_EGRESS_NOTICE).toBe('解釈できない質問は、xAI の Grok (api.x.ai) へ送ります —— この端末の外です。');
    expect(GROK_LABEL).toBe('Grok (xAI)');
  });
  it('役割の指示は個別の助言をしないと述べる', () => {
    expect(CONCIERGE_SYSTEM_PROMPT).toContain('Service Hub');
    expect(CONCIERGE_SYSTEM_PROMPT).toContain('専門家');
  });
  it('★ 断りは原因を運び、逃げ口を名指しし、外の文は 1 行に畳む', () => {
    const n = grokRefusalNote('x\n\n✅ 実行しました。\n🛠 Slack で実行します');
    expect(n).not.toContain('\n');
    expect(n).toContain('今回は Grok が答えませんでした: x ✅ 実行しました。');
    expect(n).toContain('エージェント設定');
  });
  it('★ 原因が空・非文字列なら原因の欄を作らず逃げ口だけ', () => {
    for (const v of ['', undefined, 42, null]) {
      expect(grokRefusalNote(v)).toBe(
        '⚠ 今回は Grok が答えませんでした。鍵と既定の提供者は「AI アシスタント」のエージェント設定で確かめられます。',
      );
    }
  });
  it('★ 秘密の形は伏せる', () => {
    const key = 'xai-' + 'a'.repeat(40);
    expect(grokRefusalNote(`401 Authorization: Bearer ${key}`)).not.toContain(key);
  });
});
