// @vitest-environment jsdom
/**
 * 事業継続のパネル (`components/CloudContinuityPanel.tsx` · 2026-11-11)。
 *
 * 実物のパネルを描いて、橋が答えた資格情報から「いま依っているクラウド」が出ることを見る。
 * 判断は台帳 (`shared/cloudContinuity.ts`) が持つので、ここは配線 —— 台帳の文が画面に届くこと、
 * 読めなかったときに「預けていない」と言わないこと、責任の断りが必ず出ること。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitForElement } from '../../__tests__/jsdomWait';
import {
  CLOUD_PROVIDERS,
  continuityTotals,
  LIABILITY_NOTE,
  RESPONSIBILITY_STAYS,
} from '../../../shared/cloudContinuity';
import { CloudContinuityPanel } from '../CloudContinuityPanel';

const INFRA = CLOUD_PROVIDERS.filter((p) => p.kind === 'infrastructure').map((p) => p.id);

async function mount(hub: unknown, ready: string) {
  (window as unknown as { serviceHub?: unknown }).serviceHub = hub;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(CloudContinuityPanel));
  });
  await waitForElement(() => container.querySelector(ready), `パネルの印 ${ready}`);
  const rows = () => [...container.querySelectorAll('[data-cloud-provider]')].map((el) => el.getAttribute('data-cloud-provider'));
  return { container, rows, text: () => container.textContent ?? '' };
}

describe('事業継続のパネル', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('★ 橋が答えた資格情報の提供者だけを、台帳の文つきで並べる', async () => {
    const { container, rows, text } = await mount(
      { listConfigured: () => Promise.resolve(['gmail', 'github', 'assistant']) },
      '[data-cloud-provider="github"]',
    );
    expect(rows()).toEqual(['github', 'google', 'ai', ...INFRA]);
    const github = CLOUD_PROVIDERS.find((p) => p.id === 'github');
    const row = container.querySelector('[data-cloud-provider="github"]')?.textContent ?? '';
    expect(row).toContain(github?.entrusted ?? 'x');
    expect(row).toContain(github?.whenDown ?? 'x');
    expect(row).toContain(github?.meanwhile ?? 'x');
    expect(row).toContain('資格情報を預けている画面: GitHub');
    expect(text()).not.toContain('資格情報を預けているクラウドはありません');
    expect(container.querySelector('[data-continuity-unreadable]')).toBeNull();
  });

  it('預けていなければ、そう言う (画面に結び付かない依存先は並べたまま)', async () => {
    const { container, rows } = await mount({ listConfigured: () => Promise.resolve([]) }, '[data-continuity-none]');
    expect(rows()).toEqual(INFRA);
    expect(container.querySelector('[data-continuity-none]')?.textContent).toContain('資格情報を預けているクラウドはありません');
  });

  it('★ 読めなかったときは「預けていない」と言わず、確かめられないと言う', async () => {
    const { container, rows } = await mount(
      { listConfigured: () => Promise.reject(new Error('Vault がロックされています')) },
      '[data-continuity-unreadable]',
    );
    expect(container.querySelector('[data-continuity-none]')).toBeNull();
    expect(container.querySelector('[data-continuity-unreadable]')?.getAttribute('role')).toBe('alert');
    expect(container.querySelector('[data-continuity-unreadable]')?.textContent).toContain('確かめられません');
    // 例外の文面は画面へ流さない。
    expect(container.textContent).not.toContain('Vault がロックされています');
    expect(rows()).toEqual(INFRA);
  });

  it('橋が無いときも、預けていないとは言わない', async () => {
    const { container } = await mount(undefined, '[data-continuity-unreadable]');
    expect(container.querySelector('[data-continuity-none]')).toBeNull();
  });

  it('ブラウザ版の AI の鍵のスロット (anthropic) だけでも、AI の提供者の行が出る', async () => {
    const { rows } = await mount({ listConfigured: () => Promise.resolve(['anthropic']) }, '[data-cloud-provider="ai"]');
    expect(rows()).toEqual(['ai', ...INFRA]);
  });

  it('★ 責任の断りと、自社に残る物の一覧は、どの状態でも出る', async () => {
    for (const hub of [{ listConfigured: () => Promise.resolve(['github']) }, { listConfigured: () => Promise.resolve([]) }, undefined]) {
      document.body.innerHTML = '';
      const { container, text } = await mount(hub, '[data-liability-note]');
      expect(container.querySelector('[data-liability-note]')?.textContent).toBe(LIABILITY_NOTE);
      for (const line of RESPONSIBILITY_STAYS) expect(text()).toContain(line);
    }
  });

  it('内訳の数は台帳から導いた数で、端末に記録が在ることと控えの取り方を述べる', async () => {
    const { container, text } = await mount({ listConfigured: () => Promise.resolve([]) }, '[data-continuity-totals]');
    const t = continuityTotals();
    const line = container.querySelector('[data-continuity-totals]')?.textContent ?? '';
    expect(line).toContain(`全 ${t.total} サービス`);
    expect(line).toContain(`この端末だけで動く: ${t.local}`);
    expect(line).toContain(`クラウドが預かるデータを見る: ${t.cloudData}`);
    expect(text()).toContain('事業の記録 (売上・KPI・貸借対照表・書類ほか) はこの端末に保存します');
    expect(text()).toContain('「バックアップ / 復元」');
  });
});
