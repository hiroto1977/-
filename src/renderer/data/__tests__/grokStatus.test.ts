import { describe, expect, it } from 'vitest';
import { grokStatusLine } from '../grokStatus';
import type { ProviderStatus } from '../assistantProviders';

const grok = (over: Partial<ProviderStatus> = {}): ProviderStatus => ({
  id: 'grok',
  label: 'Grok (xAI)',
  configured: true,
  isDefault: false,
  browserDirect: false,
  needsApiKey: true,
  defaultModel: 'grok-4',
  endpointHost: null,
  ...over,
});

describe('grokStatusLine — 状態の 1 行', () => {
  it('読み込み中は他の状態を名乗らない', () => {
    expect(grokStatusLine(false, false, undefined).kind).toBe('loading');
    expect(grokStatusLine(false, true, grok()).kind).toBe('loading');
  });
  it('★ 読めなかったことを「未設定」と混ぜない', () => {
    const s = grokStatusLine(true, true, undefined);
    expect(s.kind).toBe('unknown');
    expect(s.text).toContain('確認できません');
    expect(s.text).not.toContain('未設定です');
  });
  it('鍵が無い / 一覧に無い → 未設定 (保存先を名指しする)', () => {
    for (const g of [undefined, grok({ configured: false })]) {
      const s = grokStatusLine(true, false, g);
      expect(s.kind).toBe('unconfigured');
      expect(s.text).toContain('エージェント設定');
      expect(s.text).toContain('xai-');
    }
  });
  it('設定済み: 既定かどうか・モデル・ブラウザ版のプロキシ経由を述べる', () => {
    const a = grokStatusLine(true, false, grok({ isDefault: true }));
    expect(a.kind).toBe('connected');
    expect(a.text).toBe('接続済み (既定の提供者) — モデル grok-4 (ブラウザ版では設定したプロキシ経由)');
    const b = grokStatusLine(true, false, grok({ browserDirect: true }));
    expect(b.text).toBe('接続済み — モデル grok-4');
  });
});
