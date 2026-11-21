/** @vitest-environment jsdom */
/**
 * **書き込みの結果も、画面に載る前に天井を通る。** (2026-09-22 · パス 414)
 *
 * パス 411 は**読み取り**の一覧について閉じた。同じ形が**書き込みの結果**にも在り、
 * そちらは利用者がボタンを押した直後に読む所である。
 *
 * 実測 (2026-09-22 ・ 直す前・実物の handler に 200,000 字を 1 欄ぶん食わせ、
 * 画面のボタンを実際に押す):
 *
 * | 画面 | 操作 | 直す前 | 直した後 |
 * | --- | --- | ---: | ---: |
 * | **Canva** | フォルダ作成 | **400,451** | **965** |
 * | **GitHub** | Issue を作成 | **200,338** | **595** |
 *
 * 背骨は**振る舞い**で、欄ごとの台帳は `shared/api/__tests__/createdResponseFields.test.ts`
 * が持つ (法則 `mention-vs-declaration`: 天井の定数が在ることは、その欄が通ることではない)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CanvaPage } from '../CanvaPage';
import { GithubPage } from '../GithubPage';
import { ACTIONS as CANVA_ACTIONS } from '../../../main/clients/canva';
import { ACTIONS as GITHUB_ACTIONS } from '../../../main/clients/github';
import { SNAPSHOT } from '../../data/snapshot';

const BIG = 'x'.repeat(200_000);

/** 1 回の操作で画面がこの範囲に収まる (直す前は 200,338 / 400,451 字だった)。 */
const SCREEN_BOUND = 20_000;

function replying(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

function setInput(el: HTMLInputElement, v: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

async function press(text: string): Promise<void> {
  const b = [...container.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === text);
  if (!b) {
    const all = [...container.querySelectorAll('button')].map((x) => x.textContent).join(' | ');
    throw new Error(`ボタン "${text}" が無い (在るのは: ${all})`);
  }
  await act(async () => {
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** 実物の handler が返した data を `invoke` に据えて、画面のボタンを押す。 */
async function drive(
  serviceId: string,
  Page: ComponentType,
  snapshot: unknown,
  data: unknown,
  open: string,
  fill: (c: HTMLElement) => void,
  submit: string,
): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([serviceId]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: snapshot }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await press(open);
  await act(async () => {
    fill(container);
  });
  await press(submit);
  await act(async () => {});
  return container.textContent ?? '';
}

const byPlaceholder = (c: HTMLElement, p: string): HTMLInputElement =>
  c.querySelector<HTMLInputElement>(`input[placeholder="${p}"]`)!;

describe('書き込みの結果が画面に載るとき (パス 414)', () => {
  it('★ Canva: 応答の name / id が 200,000 字でも画面は膨らまない', async () => {
    const data = await CANVA_ACTIONS['create-folder']!({
      token: 't',
      payload: { name: 'n' },
      fetch: replying({ folder: { id: BIG, name: BIG } }),
    } as never);
    const t = await drive('canva', CanvaPage, SNAPSHOT.canva, data, 'フォルダ作成', (c) => {
      setInput(byPlaceholder(c, 'フォルダ名'), 'n');
    }, '作成');
    expect(t).toContain('作成:');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
  });

  it('★ GitHub: 応答の title が 200,000 字でも画面は膨らまない', async () => {
    const data = await GITHUB_ACTIONS['create-issue']!({
      token: 't',
      payload: { owner: 'o', repo: 'r', title: 'x' },
      fetch: replying({ number: 1, html_url: 'https://github.com/o/r/issues/1', title: BIG }),
    } as never);
    const t = await drive('github', GithubPage, SNAPSHOT.github, data, 'Issue を作成', (c) => {
      setInput(byPlaceholder(c, 'owner (e.g. octocat)'), 'o');
      setInput(byPlaceholder(c, 'repo'), 'r');
      setInput(byPlaceholder(c, 'Issue title'), 't');
    }, '作成');
    expect(t).toContain('作成成功');
    expect(t.length).toBeLessThan(SCREEN_BOUND);
  });

  it('★ 切ったことを述べる (黙って短くしない)', async () => {
    const data = await CANVA_ACTIONS['create-folder']!({
      token: 't',
      payload: { name: 'n' },
      fetch: replying({ folder: { id: 'i', name: BIG } }),
    } as never);
    expect((data as { name: string }).name.endsWith('…')).toBe(true);
  });

  it('★ 対照: 天井が無ければこの検査は鳴る (標本で示す)', () => {
    // 直す前の形 —— 応答をそのまま画面の文へ入れると 400,000 字を超える。
    const before = `作成: ${BIG} (${BIG})`;
    expect(before.length).toBeGreaterThan(SCREEN_BOUND);
  });
});
