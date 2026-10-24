import { describe, expect, it } from 'vitest';
import { classifyActionResult } from '../actionOutcome';
import type { ActionResult } from '../../../preload/preload';

/**
 * `action:invoke` は失敗しても reject せず `{ ok: false }` を返す。この事実を
 * 3 経路 (パネル / チャット / 音声) が別々に解釈していて、音声は**戻り値を
 * 一切見ていなかった** (2026-08 監査)。分類はここに 1 つだけ置く。
 */
const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const fail = (code: 'action_not_found' | 'not_configured' | 'action_failed', message: string): ActionResult<never> =>
  ({ ok: false, code, message });

describe('classifyActionResult — 失敗', () => {
  it('ok:false は failed になり、理由をそのまま渡す', () => {
    expect(classifyActionResult(fail('not_configured', 'トークン未設定'))).toEqual({
      verdict: 'failed',
      message: 'トークン未設定',
    });
  });

  it('どの失敗コードでも failed (コードで扱いを変えない)', () => {
    for (const code of ['action_not_found', 'not_configured', 'action_failed'] as const) {
      expect(classifyActionResult(fail(code, 'x')).verdict, code).toBe('failed');
    }
  });

  it('空メッセージでも failed のまま (メッセージの有無で判定しない)', () => {
    expect(classifyActionResult(fail('action_failed', '')).verdict).toBe('failed');
  });
});

describe('classifyActionResult — 成功', () => {
  it('persisted:false は accepted-not-saved', () => {
    const r = classifyActionResult(ok({ persisted: false, recordedAt: '2026-08-17T00:00:00.000Z' }));
    expect(r.verdict).toBe('accepted-not-saved');
    expect(r).toEqual({
      verdict: 'accepted-not-saved',
      data: { persisted: false, recordedAt: '2026-08-17T00:00:00.000Z' },
    });
  });

  it('persisted:true は ok', () => {
    expect(classifyActionResult(ok({ persisted: true })).verdict).toBe('ok');
  });

  it('persisted を持たないアクションは ok (勝手な但し書きを付けない)', () => {
    expect(classifyActionResult(ok({ issueUrl: 'https://example.test/1' })).verdict).toBe('ok');
  });

  it('data が返る (呼び出し側が ok を再確認しなくても narrow される)', () => {
    const r = classifyActionResult(ok({ recordedAt: 'now', persisted: false }));
    if (r.verdict === 'failed') throw new Error('unreachable');
    expect(r.data.recordedAt).toBe('now');
  });
});

describe('classifyActionResult — persisted の読み方', () => {
  it('boolean でない persisted は判定に使わない (ok のまま)', () => {
    for (const value of ['false', 0, null, undefined, {}, []]) {
      expect(classifyActionResult(ok({ persisted: value })).verdict, JSON.stringify(value)).toBe('ok');
    }
  });

  it('data がオブジェクトでなければ ok', () => {
    expect(classifyActionResult(ok('done')).verdict).toBe('ok');
    expect(classifyActionResult(ok(42)).verdict).toBe('ok');
    expect(classifyActionResult(ok(null)).verdict).toBe('ok');
    expect(classifyActionResult(ok(undefined)).verdict).toBe('ok');
  });

  it('プロトタイプ由来の persisted を自分の値として読まない', () => {
    const proto = { persisted: false };
    const data = Object.create(proto) as Record<string, unknown>;
    expect(classifyActionResult(ok(data)).verdict).toBe('ok');
  });

  it('配列の persisted も自分の値でなければ読まない', () => {
    expect(classifyActionResult(ok([false])).verdict).toBe('ok');
  });
});
