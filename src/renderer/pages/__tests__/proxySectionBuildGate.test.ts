// @vitest-environment jsdom
/**
 * **BYO プロキシの節は、その設定を読まない実行形態では共有秘密を貼らせない**
 * (2026-09-25 · パス 456)。
 *
 * ## 直す前の実測 (jsdom で実物の `ProxySection` を描き、実際に打って押す)
 *
 * | 段 | 実測 (デスクトップ版) |
 * | --- | --- |
 * | 札 (開く前) | 未設定 |
 * | 設定する | 出る |
 * | URL 欄・共有秘密の欄 | 出る |
 * | 保存 | 押せる (`disabled === false`) |
 * | 押した結果 | **プロキシ設定を保存しました** (札も「設定済み」へ) |
 * | 保管層 | **`{"url":"…","sharedSecret":"SUPER-SECRET-…"}`** —— 実際に入る |
 * | デスクトップ版の読み手 | **0 件** |
 *
 * ★ **パス 454 / 455 と同じ家系だが、こちらは静かに成功する。** あちらは保管庫が
 * 施錠されていて断られた。ここは平文の IndexedDB なので書き込みは本当に成功し、
 * 画面は成功したと言い、札まで変わる —— **利用者が誤りに気付く手がかりが 1 つも無い。**
 *
 * ★ **向きが利用者の損である。** プロキシを設定する人は経路を自分の側で押さえる
 * ためにそうするのに、デスクトップ版は各サービスへ直接つなぐ。求めた統制がまるごと
 * 効かず、画面は効いていると言う。
 *
 * ## この検査が持つもの
 *
 * **振る舞い** —— 実物の節を 3 つの実行形態で描き、何が出て何が出ないかを見る。
 * 母集団 (設定画面のどの節がどの実行形態で働くか) は
 * `renderer/__tests__/settingsSectionBuildReachCensus.test.ts` が両方向で持つ。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import { join } from 'node:path';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';
import { proxyUnusedNote } from '../../../shared/buildDestinations';

const ROOT = join(__dirname, '..', '..');
// **原文の道具を通す** —— 変異検査の sandbox では書き換え後のソースが置かれる。
const src = (rel: string) => readOriginalSource(join(ROOT, rel));

/** `ProxySection` の関数スライスだけを読む (同じ綴りがファイルの他所にも在る)。 */
function proxySectionSource(): string {
  const text = src('pages/SettingsPage.tsx');
  const start = text.indexOf('export function ProxySection() {');
  const end = text.indexOf('// --- Phase D2: File System Access', start);
  expect(start, 'ProxySection が見つからない').toBeGreaterThan(0);
  expect(end, 'ProxySection の終端が見つからない').toBeGreaterThan(start);
  return text.slice(start, end);
}

/** 実行形態ごとの橋。`getVersion` を持たないと `isBrowserBuild()` の `catch` が倒す。 */
const DESKTOP = { getVersion: () => Promise.resolve('0.1.0') };
const BROWSER = { getVersion: () => Promise.resolve('0.1.0-web') };

async function mount(bridge: unknown) {
  if (bridge === null) delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  else (window as unknown as { serviceHub: unknown }).serviceHub = bridge;
  const { ProxySection } = await import('../SettingsPage');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ProxySection));
  });
  const text = () => container.textContent ?? '';
  // **錠は構造で取る** —— 「未設定」/「設定済み」の札は保管層を読んだあとに出る。
  await settleUntil(() => /未設定|設定済み/.test(text()), '保管層の読みが届く');
  return { container, text };
}

function buttons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')];
}

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('BYO プロキシ: 読まない実行形態では貼らせない (パス 456)', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    const { setProxyConfig } = await import('../../network/proxy');
    await setProxyConfig(null);
  });

  it('★ デスクトップ版: 断りが出て、設定する も欄も出ない (保管層は空のまま)', async () => {
    const { container, text } = await mount(DESKTOP);
    const note = container.querySelector('[data-proxy-unused]');
    expect(note, 'デスクトップ版で断りが描かれていない').not.toBeNull();
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent ?? '').toContain(proxyUnusedNote('desktop')!);

    expect(buttons(container).map((b) => b.textContent)).not.toContain('設定する');
    expect(buttons(container).map((b) => b.textContent)).not.toContain('変更');
    expect(container.querySelector('input'), '打てる欄が出ている').toBeNull();
    expect(text()).toContain('未設定');

    const { getProxyConfig } = await import('../../network/proxy');
    expect(await getProxyConfig(), '描いただけで保管層が動いた').toBeNull();
  });

  it('★ デスクトップ版の断りは、働く実行形態を名指しする', async () => {
    const note = proxyUnusedNote('desktop');
    expect(note).not.toBeNull();
    // **名指しするのは実行形態そのもの** —— デスクトップ版に経路を変える設定は
    // 1 つも無いので、別の画面を指すことができない (指せば消す物が無い所へ送る)。
    expect(note!).toContain('ブラウザ版');
    expect(note!).toContain('読みません');
  });

  it('★ ブラウザ版の答えは 1 文字も変わらない (断りなし・打てて・入る)', async () => {
    const { container, text } = await mount(BROWSER);
    expect(container.querySelector('[data-proxy-unused]'), 'ブラウザ版で断っている').toBeNull();
    expect(proxyUnusedNote('browser')).toBeNull();

    const open = buttons(container).find((b) => b.textContent === '設定する');
    expect(open, 'ブラウザ版で「設定する」が出ていない').not.toBeUndefined();
    await act(async () => {
      open!.click();
    });
    const urlIn = await waitForElement<HTMLInputElement>(
      () => container.querySelector<HTMLInputElement>('input[type="text"]'),
      'URL 欄',
    );
    const secIn = await waitForElement<HTMLInputElement>(
      () => container.querySelector<HTMLInputElement>('input[type="password"]'),
      '共有秘密の欄',
    );
    // **打つのは act の外** —— 中で包むと React が制御された値を戻し、state が動かない。
    typeInto(urlIn, 'https://my-worker.example.com/proxy');
    typeInto(secIn, 'SUPER-SECRET-0123456789');
    const save = buttons(container).find((b) => b.textContent === '保存');
    expect(save?.disabled).toBe(false);
    await act(async () => {
      save!.click();
    });
    await settleUntil(() => /保存しました/.test(text()), '保存の結果');

    const { getProxyConfig } = await import('../../network/proxy');
    expect(await getProxyConfig()).toEqual({
      url: 'https://my-worker.example.com/proxy',
      sharedSecret: 'SUPER-SECRET-0123456789',
    });
  });

  it('★ 分からないあいだ (橋が無い) は断らない', async () => {
    const sec = proxySectionSource();
    expect(sec, '分からないときの扱いが原文に無い').toContain(
      'const unused = buildKind === null ? null : proxyUnusedNote(buildKind);',
    );
  });

  it('★ 削除は実行形態で隠さない —— 条件は「値が在るか」だけ', async () => {
    const { setProxyConfig } = await import('../../network/proxy');
    await setProxyConfig({ url: 'https://old-worker.example.com/proxy', sharedSecret: 'LEFTOVER-0123456789' });
    const { container, text } = await mount(DESKTOP);
    expect(text()).toContain('設定済み');
    const del = buttons(container).find((b) => b.textContent === '削除');
    expect(del, 'デスクトップ版で「削除」が消えている (逃げ口が閉じる)').not.toBeUndefined();
    // 断りは出たままでよい —— 消す口だけが生きている。
    expect(container.querySelector('[data-proxy-unused]')).not.toBeNull();
  });

  it('★ save() にも床が在る (2 つ目の呼び手が生えた日のため)', () => {
    const sec = proxySectionSource();
    const save = sec.slice(sec.indexOf('async function save()'));
    expect(save.slice(0, save.indexOf('try {')), 'save() の床が無い').toContain('if (unused !== null)');
  });
});
