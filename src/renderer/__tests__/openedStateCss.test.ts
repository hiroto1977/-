/**
 * **開いた窓とスマホ幅の CSS の規則** (2026-10-07 · パス 506) —— 実機で測って直した 2 つの規則が戻らないこと。
 *
 * 1. **スマホ幅の `.main` は地 (`--panel`) を残す** —— 2026-10-07 まで `@media (max-width: 768px)` の `.main` が
 *    `background: transparent` で、本文の字が殻の光輪 (`--glow-*`) の上に直に載っていた。実測 (390×844):
 *    かわいい × ライトで **30 画面 212 要素**が 3.84〜4.48:1、かわいい × ダークで 10 画面 16 要素。字の台帳
 *    (`themeContrast.test.ts`) が測る地は `--panel` までなので、光輪だけの地はどの台帳も測っていなかった。
 * 2. **コンシェルジュの提案チップは 24px 以上** (WCAG 2.5.8) —— 字の高さのままだと 23px で、6px の間隔では
 *    間隔の例外も満たさない (4 配色すべてで実測)。
 *
 * 描画済みの色と大きさは実機の suite `opened` が測る。ここは**規則の綴り**を留める (直した日に落ちる門にしない ——
 * 値を写さず、規則の有無と下限だけを見る)。
 */
import { describe, expect, it } from 'vitest';
import { declOf, rules } from './themeCss';

const PHONE = '@media (max-width: 768px)';
const CHIP = '.concierge-chips button';

describe('スマホ幅の .main と提案チップの規則 (パス 506)', () => {
  it('★ スマホ幅の .main は background を上書きしない (地は --panel のまま)', () => {
    const phoneMain = rules().filter((r) => r.selector === '.main' && r.context === PHONE);
    expect(phoneMain.length, 'スマホ幅の .main の規則は 1 つ').toBe(1);
    expect(declOf(phoneMain[0]!, 'background'), '`transparent` にすると本文の字が光輪の上に載る (実測 30 画面)').toBeUndefined();
    expect(declOf(phoneMain[0]!, 'background-color')).toBeUndefined();
    const desktopMain = rules().find((r) => r.selector === '.main' && r.context === '');
    expect(declOf(desktopMain!, 'background'), '基本の .main は地のトークンを宣言する').toContain('var(--panel)');
  });

  it('★ 提案チップは min-height 24px 以上', () => {
    const chip = rules().find((r) => r.selector === CHIP);
    expect(chip, `${CHIP} の規則が在る`).toBeDefined();
    const v = declOf(chip!, 'min-height');
    expect(v, 'min-height を持つ').toBeDefined();
    expect(/px$/.test(v!), `px で書く (${v})`).toBe(true);
    expect(parseFloat(v!)).toBeGreaterThanOrEqual(24);
  });

  it('標本: 針は直す前の形 (transparent の上書き・23px) を落とす', () => {
    const before = [
      '.main { background: var(--panel); }',
      '@media (max-width: 768px) { .main { margin: 0; background: transparent; } }',
      '.concierge-chips button { font-size: 11.5px; padding: 3px 10px; }',
    ].join('\n');
    const phoneMain = rules(before).filter((r) => r.selector === '.main' && r.context === PHONE);
    expect(phoneMain.length).toBe(1);
    expect(declOf(phoneMain[0]!, 'background')).toBe('transparent');
    const chip = rules(before).find((r) => r.selector === CHIP);
    expect(declOf(chip!, 'min-height')).toBeUndefined();
  });
});
