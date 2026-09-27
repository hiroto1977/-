// @vitest-environment jsdom
/**
 * **接続ハブは橋を読む —— 保管庫を直に読まない** (2026-09-25 · パス 456)。
 *
 * ## 直す前の実測 (jsdom · 橋が github / slack を「設定済み」と答える端末)
 *
 * | 見るもの | 直す前 (デスクトップ版) |
 * | --- | --- |
 * | 見出しの行 | **0 / 74 サービスが接続済み** |
 * | ⚪ 未接続 | **74 件** |
 * | ✅ 接続済みの節 | **出ない** |
 * | 保管庫の `listConfigured()` | `[]` |
 *
 * **設定した本人に、1 件も設定していないと告げていた** —— しかも
 * 「クリックで開いて接続」と 74 件ぜんぶをやり直しに誘う。
 *
 * ★ **パス 454 / 455 / 456 の家系の、読み側の鏡である。** あちらは
 * 「この実行形態が読まない保管先へ書く」で、ここは
 * **「この実行形態が書かない保管先から読む」**。どちらも同じ根
 * (保管庫はブラウザ版だけの物で、橋がその振り分けを持つ) から出る。
 *
 * ★ **同じ画面が同じ問いに 2 通り答えていた** —— 隣の
 * `UnusedCredentialSection` は最初から橋を読んでいる。
 *
 * 母集団は `renderer/__tests__/settingsSectionBuildReachCensus.test.ts`。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { settleUntil } from '../../__tests__/jsdomWait';
import { SERVICES } from '../../services';

async function mount(listConfigured: () => Promise<string[]>) {
  (window as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0'),
    listConfigured,
  };
  const { ConnectionHub } = await import('../SettingsPage');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ConnectionHub, { refreshKey: 0 }));
  });
  const text = () => container.textContent ?? '';
  await settleUntil(() => /サービスが接続済み/.test(text()), '接続ハブの見出し');
  return { container, text };
}

describe('接続ハブ: 読むのは橋 (パス 456)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('★ 橋が答えた件数がそのまま出る (デスクトップ版で 0 と言わない)', async () => {
    const { text } = await mount(() => Promise.resolve(['github', 'slack']));
    // **件数は写さない** —— 母集団は `SERVICES` なので、そこから導く。
    expect(text()).toContain(`2 / ${SERVICES.length} サービスが接続済み`);
    expect(text()).toContain('✅ 接続済み');
    expect(text()).toContain(`⚪ 未接続 (${SERVICES.length - 2})`);
  });

  it('★ 保管庫が空でも、橋が答えれば接続済みとして出る (直す前はここが 0 だった)', async () => {
    const { getVault } = await import('../../security/vault');
    expect(await getVault().listConfigured(), '前提: 保管庫は空').toEqual([]);
    const { text } = await mount(() => Promise.resolve(['github']));
    expect(text()).toContain(`1 / ${SERVICES.length} サービスが接続済み`);
  });

  it('★ 本当に 0 件なら 0 件と言う (逆向き)', async () => {
    const { text } = await mount(() => Promise.resolve([]));
    expect(text()).toContain(`0 / ${SERVICES.length} サービスが接続済み`);
    expect(text()).not.toContain('✅ 接続済み');
  });

  it('★ 読めなかったときは 0 件として描き、報せは別の面が持つ', async () => {
    const { text } = await mount(() => Promise.reject(new Error('QQUNREADABLEQQ')));
    expect(text()).toContain(`0 / ${SERVICES.length} サービスが接続済み`);
    // **例外の文面をこの節へ流さない** (上端の報せが持つ · `deviceStoreFailure`)。
    expect(text()).not.toContain('QQUNREADABLEQQ');
  });
});
