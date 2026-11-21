import { describe, expect, it } from 'vitest';
import {
  BOOT_CHECK_GUIDES,
  BOOT_HABITS,
  BOOT_PROTECTION_LIMITS,
  bootBadgeLabel,
  bootBadgeTone,
  bootDetailsLine,
  bootProtectionOf,
  secureBootFromEfiVar,
  type BootProtection,
} from '../bootProtection';

const ALL: readonly BootProtection[] = ['enabled', 'disabled', 'not-exposed', 'unknown', 'manual', 'unavailable'];

describe('起動の守りの点検 —— 状態と文面', () => {
  it('★ 警告色は「読んで無効だった」ときだけ・緑は「読んで有効だった」ときだけ', () => {
    expect(ALL.map((d) => [d, bootBadgeTone(d)])).toEqual([
      ['enabled', 'ok'],
      ['disabled', 'warn'],
      ['not-exposed', 'muted'],
      ['unknown', 'muted'],
      ['manual', 'muted'],
      ['unavailable', 'muted'],
    ]);
  });

  it('札の文字は状態ごとに決まる', () => {
    expect(ALL.map((d) => bootBadgeLabel(d))).toEqual([
      'セキュアブート 有効',
      'セキュアブート 無効',
      '確認できません',
      '読み取れません',
      '手動で確認',
      '確認できません',
    ]);
  });

  it('★ 見ていない端末について「無効」と言わない (説明は状態ごとに別の文)', () => {
    const lines = ALL.map((d) => bootDetailsLine(d));
    expect(new Set(lines).size).toBe(ALL.length);
    for (const d of ['not-exposed', 'unknown', 'manual', 'unavailable'] as const) {
      expect(bootDetailsLine(d)).not.toContain('確かめていません');
      expect(bootDetailsLine(d)).toContain('下の手順');
    }
    // 針が当たる標本: 無効のときだけその文が出る。
    expect(bootDetailsLine('disabled')).toContain('確かめていません');
    expect(bootDetailsLine('enabled')).toBe('この端末は、起動のたびに起動用プログラムの署名を確かめています。');
    expect(bootDetailsLine('unavailable')).toContain('ブラウザ版');
  });
});

describe('bootProtectionOf —— 取得した値から状態を読む', () => {
  it('知っている 6 状態はそのまま通す', () => {
    for (const d of ALL) expect(bootProtectionOf({ detection: d })).toBe(d);
  });

  it('★ 欠けた値・知らない値を「有効」とも「無効」とも言わない', () => {
    for (const bad of [undefined, null, 'enabled', 42, [], {}, { detection: 'ENABLED' }, { detection: 1 }, { detection: null }, { detection: ['enabled'] }]) {
      expect(bootProtectionOf(bad)).toBe('unavailable');
    }
  });
});

describe('secureBootFromEfiVar —— efivarfs の 5 byte を読む', () => {
  const bytes = (...b: number[]): Uint8Array => Uint8Array.from(b);

  it('5 byte 目が 1 なら有効・0 なら無効 (先頭 4 byte は属性)', () => {
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0, 1))).toBe('enabled');
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0, 0))).toBe('disabled');
    // 属性の byte が 1 でも、値は 5 byte 目だけで決まる。
    expect(secureBootFromEfiVar(bytes(1, 1, 1, 1, 0))).toBe('disabled');
    expect(secureBootFromEfiVar(bytes(0, 0, 0, 0, 1))).toBe('enabled');
  });

  it('★ 読めない物を「無効」と言わない (短い・想定外の値は unknown)', () => {
    expect(secureBootFromEfiVar(bytes())).toBe('unknown');
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0))).toBe('unknown');
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0, 2))).toBe('unknown');
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0, 255))).toBe('unknown');
  });

  it('5 byte より長くても 5 byte 目で決まる', () => {
    expect(secureBootFromEfiVar(bytes(6, 0, 0, 0, 1, 0, 0))).toBe('enabled');
  });
});

describe('確かめ方と限界の文', () => {
  it('★ 限界を述べる: 取り除けない・守るのは端末の確認つき起動', () => {
    expect(BOOT_PROTECTION_LIMITS).toBe(
      'このアプリは OS が起動した後に動くので、起動より前に動くウイルス（ブートセクタ型）を取り除くことはできません。'
        + 'それを防ぐのは端末の「確認つき起動」です。ここでは、その守りが有効かの点検と確かめ方だけを示します。',
    );
  });

  it('端末 4 種の手順が在り、どれも空でない', () => {
    expect(BOOT_CHECK_GUIDES.map((g) => g.device)).toEqual([
      'Android のスマホ・タブレット',
      'Windows のパソコン',
      'Mac',
      'Linux のパソコン',
    ]);
    for (const g of BOOT_CHECK_GUIDES) {
      expect(g.steps.length).toBeGreaterThanOrEqual(2);
      for (const s of g.steps) expect(s.trim().length).toBeGreaterThan(10);
    }
  });

  it('心がけは 3 つで、偽の警告に電話しないことを含む', () => {
    expect(BOOT_HABITS).toHaveLength(3);
    expect(BOOT_HABITS.some((h) => h.includes('偽の警告') && h.includes('電話をかけず'))).toBe(true);
  });

  it('★ 手順と心がけは生きたリンクを持たない (読む人を外へ送らない)', () => {
    const all = [...BOOT_CHECK_GUIDES.flatMap((g) => [g.device, ...g.steps]), ...BOOT_HABITS, BOOT_PROTECTION_LIMITS];
    const LIVE = /:\/\/|\bwww\./i;
    for (const t of all) expect(LIVE.test(t)).toBe(false);
    // 針が当たる標本。
    expect(LIVE.test('https://a.example/x')).toBe(true);
    expect(LIVE.test('www.a.example')).toBe(true);
  });
});
