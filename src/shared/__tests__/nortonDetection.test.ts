/**
 * **見た結果と、見られなかったことを分ける** (2026-09-12 · パス 165)。
 *
 * 実測した欠陥 (jsdom でブラウザ版として `SecurityPage` を描いた):
 *
 * ```
 *   [badge warn] Not detected   ·
 * ```
 *
 * 警告色の札が「あなたの端末に Norton は無い」と言い、説明は区切りの「·」だけ。
 * アプリはその端末を 1 度も見ていない。`web-shim` の注記は「これは嘘ではない」と
 * 書いていたが、**警告の札は主張である**。
 */
import { describe, expect, it } from 'vitest';
import {
  NORTON_UNAVAILABLE_DETAILS,
  nortonBadgeLabel,
  nortonBadgeTone,
  nortonDetailsLine,
  type NortonDetection,
} from '../nortonDetection';

const ALL: readonly NortonDetection[] = ['found', 'absent', 'unsupported', 'unavailable'];

describe('nortonBadgeTone', () => {
  it('★ 警告色は「探して無かった」だけ (見ていない端末に警告を出さない)', () => {
    expect(ALL.filter((d) => nortonBadgeTone(d) === 'warn')).toEqual(['absent']);
  });

  it('found は緑・unsupported と unavailable は中立', () => {
    expect(nortonBadgeTone('found')).toBe('ok');
    expect(nortonBadgeTone('unsupported')).toBe('muted');
    expect(nortonBadgeTone('unavailable')).toBe('muted');
  });

  it('4 状態すべてに色が在る (総和 —— 抜けると札が無色になる)', () => {
    for (const d of ALL) expect(['ok', 'warn', 'muted']).toContain(nortonBadgeTone(d));
  });
});

describe('nortonBadgeLabel', () => {
  it('4 状態すべてに文字が在り、すべて違う', () => {
    const labels = ALL.map(nortonBadgeLabel);
    expect(new Set(labels).size).toBe(ALL.length);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
  });

  it('★ 探せないときは「無い」と言わない', () => {
    // 「Not detected」「未検出」「無い」のどれも使わない —— 端末を見ていないので。
    const label = nortonBadgeLabel('unavailable');
    expect(label).toBe('確認できません');
    expect(label).not.toMatch(/detected|検出されません|無い/);
    // 対照: absent は実際に「探して無かった」と言う (規則が空振りしていない)。
    expect(nortonBadgeLabel('absent')).toBe('Not detected');
  });
});

describe('nortonDetailsLine', () => {
  it('★ 説明が空でも「区切りだけの行」を作らない (実測した欠陥そのもの)', () => {
    // ブラウザ版の同梱値: platform と details がどちらも空文字。
    const line = nortonDetailsLine('unavailable', '', '');
    expect(line).not.toBe(' · ');
    expect(line).not.toMatch(/^\s*·/);
    expect(line).toBe(NORTON_UNAVAILABLE_DETAILS);
  });

  it('★ 探せないときの説明は理由と次の手を述べる', () => {
    expect(NORTON_UNAVAILABLE_DETAILS).toContain('確認できません');
    expect(NORTON_UNAVAILABLE_DETAILS).toContain('単一 HTML');
    expect(NORTON_UNAVAILABLE_DETAILS).toContain('デスクトップ版');
  });

  it('platform と details が揃っていれば「·」で繋ぐ (既存の見た目を保つ)', () => {
    expect(nortonDetailsLine('found', 'win32', 'Norton 360 を検出')).toBe('win32 · Norton 360 を検出');
  });

  it('片方だけのときは区切りを出さない', () => {
    expect(nortonDetailsLine('absent', 'darwin', '')).toBe('darwin');
    expect(nortonDetailsLine('absent', '', '見つかりませんでした')).toBe('見つかりませんでした');
  });

  it('★ unavailable でも details が在るならそれを出す (差し替えで上書きしない)', () => {
    // 取得が失敗して同梱値が出ているが、main が理由を入れていた場合。
    expect(nortonDetailsLine('unavailable', 'win32', '取得に失敗しました')).toBe(
      'win32 · 取得に失敗しました',
    );
  });

  it('空白だけの details は無いものとして扱う', () => {
    expect(nortonDetailsLine('absent', '  ', '   ')).toBe('');
  });
});
