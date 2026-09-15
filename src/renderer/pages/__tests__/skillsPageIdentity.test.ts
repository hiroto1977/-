/** @vitest-environment jsdom */
/**
 * **一覧で選んだスキルが、実際に走るスキルであること** (2026-09-12 · パス 179)。
 *
 * `scanSkills` は鍵 (`id`) と題 (`label`) を分けたが、**画面が鍵を送っていなければ
 * 直っていない** —— パス 175 で `maxLength` が両ビルドの断りを 1 度も通していなかった
 * のと同じ形 (直した側と画面の間が切れている)。ここは画面から `invoke` へ渡る
 * payload を掴んで、送っているのが鍵であることを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SkillsPage } from '../SkillsPage';
import { settleUntil } from '../../__tests__/jsdomWait';
import { shadowedSkillIdNote, unsafeSkillIdNote } from '../../../shared/skillIdentity';

interface Item {
  id: string;
  label: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  path: string;
  runnable: boolean;
  unrunnableReason: string;
}

const entry = (over: Partial<Item>): Item => ({
  id: 'my-tool',
  label: 'helper',
  description: 'does things',
  source: 'user',
  path: '/home/u/.claude/skills/my-tool/SKILL.md',
  runnable: true,
  unrunnableReason: '',
  ...over,
});

let items: Item[] = [];
let invoked: { serviceId: string; action: string; payload: Record<string, unknown> }[] = [];
let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  items = [entry({})];
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['skills']),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: { items } }),
    invoke: (serviceId: string, action: string, payload: Record<string, unknown>) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: true, data: { text: 'ANSWER', stopReason: 'end_turn' } });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

function button(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
}

/** 取得した一覧で描く (`fetchSnapshot` が返るのを待つ)。 */
async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(SkillsPage));
  });
  await settleUntil(
    () => container.textContent?.includes(`${items.length} 件のスキル`) === true,
    `一覧が ${items.length} 件になる`,
  );
}

/** 「スキル実行」を開く。 */
async function openForm(): Promise<HTMLSelectElement> {
  await act(async () => {
    button('スキル実行')?.click();
  });
  await settleUntil(() => container.querySelector('select') !== null, '実行フォームが開く');
  return container.querySelector<HTMLSelectElement>('select')!;
}

async function choose(select: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function typePrompt(text: string): Promise<void> {
  const box = container.querySelector<HTMLTextAreaElement>('textarea')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('SkillsPage — 選んだスキルが走る (パス 179)', () => {
  it('★ 選択肢の value は鍵 (`id`)・見えるのは題 (`label`)', async () => {
    await mount();
    const select = await openForm();
    const options = [...select.querySelectorAll('option')].filter((o) => o.value !== '');
    expect(options).toHaveLength(1);
    expect(options[0]!.value, 'value が題なら実行時に別の物を指す (元の欠陥)').toBe('my-tool');
    expect(options[0]!.textContent).toBe('helper');
  });

  it('★ 実行で送るのは鍵 (`{ id }`) —— 題は送らない', async () => {
    await mount();
    const select = await openForm();
    await choose(select, 'my-tool');
    await typePrompt('やって');
    await act(async () => {
      button('実行')?.click();
    });
    await settleUntil(() => invoked.length > 0, 'invoke が呼ばれる');
    const call = invoked.find((c) => c.action === 'run-skill');
    expect(call?.serviceId).toBe('skills');
    expect(call?.payload).toEqual({ id: 'my-tool', prompt: 'やって' });
    expect(call?.payload).not.toHaveProperty('name');
  });

  it('★ 題が鍵と違うときは一覧に実行名も出す (何を直せばよいか読める)', async () => {
    await mount();
    expect(container.textContent).toContain('helper');
    expect(container.textContent, '鍵が画面に出ていない').toContain('my-tool');
  });

  it('★ 題と鍵が同じときは実行名を重ねて出さない', async () => {
    items = [entry({ id: 'same', label: 'same', path: '/p/same.md' })];
    await mount();
    expect(container.textContent).not.toContain('実行名:');
  });

  it('★ 鍵に使えない字の項目は選択肢に出さず、理由を行に出す', async () => {
    items = [
      entry({ id: '請求書', label: '請求書', path: '/p/請求書/SKILL.md', runnable: false,
        unrunnableReason: unsafeSkillIdNote('請求書') }),
      entry({}),
    ];
    await mount();
    const select = await openForm();
    const values = [...select.querySelectorAll('option')].map((o) => o.value);
    expect(values, '押しても動かない物を選ばせている').toEqual(['', 'my-tool']);
    const note = container.querySelector('[data-skill-unrunnable="請求書"]');
    expect(note?.textContent).toContain(unsafeSkillIdNote('請求書'));
    expect(note?.textContent).toContain('フォルダ名を英数字に変えると実行できます');
  });

  it('★ 同じ鍵で負けた側も選択肢に出さず、勝つ側のパスを言う', async () => {
    const winner = '/home/u/.claude/skills/dup/SKILL.md';
    items = [
      entry({ id: 'dup', label: 'フォルダ側', path: winner }),
      entry({ id: 'dup', label: 'ファイル側', path: '/home/u/.claude/skills/dup.md',
        runnable: false, unrunnableReason: shadowedSkillIdNote('dup', winner) }),
    ];
    await mount();
    const select = await openForm();
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'スキルを選択…',
      'フォルダ側',
    ]);
    expect(container.querySelector('[data-skill-unrunnable="dup"]')?.textContent).toContain(winner);
  });

  it('★ 実行できない物の件数を見出しの横で言う', async () => {
    items = [
      entry({}),
      entry({ id: 'x y', label: 'だめ 1', path: '/p/x y/SKILL.md', runnable: false, unrunnableReason: unsafeSkillIdNote('x y') }),
      entry({ id: 'z w', label: 'だめ 2', path: '/p/z w/SKILL.md', runnable: false, unrunnableReason: unsafeSkillIdNote('z w') }),
    ];
    await mount();
    expect(container.querySelector('[data-skills-unrunnable-note]')?.textContent).toContain(
      'このうち 2 件は実行できません',
    );
  });

  it('★ 全部言わない: 実行できる物だけなら件数の注記は出ない', async () => {
    await mount();
    expect(container.querySelector('[data-skills-unrunnable-note]')).toBeNull();
  });

  it('★ 実行できる物が 1 つも無ければ「スキル実行」を押せない (開いても選べないので)', async () => {
    items = [
      entry({ id: '請求書', label: '請求書', path: '/p/請求書/SKILL.md', runnable: false,
        unrunnableReason: unsafeSkillIdNote('請求書') }),
    ];
    await mount();
    expect(button('スキル実行')?.disabled, '開いても選択肢が空の口を開けている').toBe(true);
    // それでも理由は読める (一覧には出ている)。
    expect(container.querySelector('[data-skill-unrunnable="請求書"]')).not.toBeNull();
  });

  it('★ 題が重なっていれば選択肢に鍵を添える (どちらを選んだか読める)', async () => {
    items = [
      entry({ id: 'alpha', label: 'レビュー', path: '/p/alpha/SKILL.md' }),
      entry({ id: 'gamma', label: 'レビュー', path: '/p/gamma/SKILL.md' }),
    ];
    await mount();
    const select = await openForm();
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'スキルを選択…',
      'レビュー (alpha)',
      'レビュー (gamma)',
    ]);
    // 選んだ値は鍵のまま (添えた文字が value に混ざらない)。
    await choose(select, 'gamma');
    await typePrompt('p');
    await act(async () => {
      button('実行')?.click();
    });
    await settleUntil(() => invoked.length > 0, 'invoke が呼ばれる');
    expect(invoked.find((c) => c.action === 'run-skill')?.payload).toEqual({ id: 'gamma', prompt: 'p' });
  });
});
