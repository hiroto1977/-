/**
 * 送り先の変更に持ち主の確認が要るかの判定と、その文 (2026-10-29 · パス 554 · threat: T-219)。
 */
import { describe, expect, it } from 'vitest';
import {
  STEP_UP_APPLY_LABEL,
  STEP_UP_CANCELLED,
  STEP_UP_PASSWORD_LABEL,
  STEP_UP_WRONG_PASSWORD,
  destinationHost,
  ollamaEndpointNeedsStepUp,
  proxyChangeNeedsStepUp,
  stepUpReason,
} from '../egressStepUp';

describe('ollamaEndpointNeedsStepUp', () => {
  it('同じ端末 (ポート番号だけ・127.0.0.1・localhost) には要らない —— 本文は端末を出ない', () => {
    expect(ollamaEndpointNeedsStepUp('', 'localhost')).toBe(false);
    expect(ollamaEndpointNeedsStepUp('11434', 'localhost')).toBe(false);
    expect(ollamaEndpointNeedsStepUp('127.0.0.1:11434', 'localhost')).toBe(false);
    expect(ollamaEndpointNeedsStepUp('http://localhost:11434', 'localhost')).toBe(false);
  });

  it('★ https のトンネルと、このページと同じ別ホストへの http には要る (threat: T-219)', () => {
    expect(ollamaEndpointNeedsStepUp('https://abc.trycloudflare.com', 'localhost')).toBe(true);
    expect(ollamaEndpointNeedsStepUp('192.168.1.10:11434', '192.168.1.10')).toBe(true);
  });

  it('許されない接続先 (平文 http の別ホスト・壊れた URL) は別の門が断るので false', () => {
    expect(ollamaEndpointNeedsStepUp('192.168.1.10:11434', 'localhost')).toBe(false);
    expect(ollamaEndpointNeedsStepUp('http://[::1', 'localhost')).toBe(false);
  });
});

describe('proxyChangeNeedsStepUp', () => {
  it('保存は常に要り、削除 (null) には要らない (削除は送り先を増やさない)', () => {
    expect(proxyChangeNeedsStepUp({ url: 'https://w.example.com/proxy' })).toBe(true);
    expect(proxyChangeNeedsStepUp(null)).toBe(false);
  });
});

describe('文面', () => {
  it('★ ホストだけを名乗り、path / query / 共有秘密は映さない (threat: T-219)', () => {
    const secretish = 'https://w.example.com/proxy?token=SUPER-SECRET-123#frag';
    const text = stepUpReason('proxy', secretish);
    expect(text).toContain('w.example.com');
    expect(text).not.toContain('SUPER-SECRET');
    expect(text).not.toContain('/proxy');
    expect(text).not.toContain('token=');
    // 標本: 針が的に当たる (生の URL には在る)。
    expect(secretish).toContain('SUPER-SECRET');
  });

  it('何が変わるかを設定ごとに言い分け、確認の理由と「変えるまで送らない」を言う', () => {
    const proxy = stepUpReason('proxy', 'https://w.example.com/p');
    const ollama = stepUpReason('ollama', 'https://abc.trycloudflare.com');
    expect(proxy).toContain('Authorization');
    expect(ollama).toContain('会話の本文');
    for (const t of [proxy, ollama]) {
      expect(t).toContain('保管庫のパスワード');
      expect(t).toContain('変えるまで何も送りません');
    }
    expect(proxy).not.toBe(ollama);
  });

  it('読めない URL は生の文字列ではなく「(読めない URL)」と言う', () => {
    expect(destinationHost('not a url')).toBe('(読めない URL)');
    expect(stepUpReason('proxy', 'javascript:alert(1)')).toContain('(読めない URL)');
    expect(stepUpReason('proxy', 'javascript:alert(1)')).not.toContain('alert');
  });

  it('断りの文は「変えていない」ことを言う', () => {
    expect(STEP_UP_WRONG_PASSWORD).toContain('変えていません');
    expect(STEP_UP_CANCELLED).toContain('変えていません');
    expect(STEP_UP_PASSWORD_LABEL).toContain('保管庫のパスワード');
    expect(STEP_UP_APPLY_LABEL.length).toBeGreaterThan(0);
  });
});
