/** @vitest-environment jsdom */
/**
 * **付箋コメントは天井を台帳から読み、落とした分を言う** (2026-09-12 · パス 174)。
 *
 * ## 実測した欠陥
 *
 * `updateNote` は `text.slice(0, 200)` と**数を写して**いた —— 同じファイルが
 * `MAX_MEMBER_NOTE_CHARS` を import して `maxLength` と placeholder に使っているのに。
 * さらに `maxLength` が付いていたので、**貼り付けはブラウザが先に切る** ——
 * 切れたことが React に届かないので、画面は何も言えなかった。
 *
 * パス 167 が業務メモで決めた形 (天井まで入れて、落ちた字数を述べる) をここへ当てる。
 * jsdom は `maxLength` を値の代入に当てないので、**この検査が測るのは
 * 「画面が落とした分を述べるか」**であって「ブラウザが切るか」ではない
 * (後者は実機の仕事。パス 172 の `writeCeiling` suite と同じ切り分け)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import {
  MAX_MEMBER_NOTE_CHARS,
  buildTeamRadarSnapshot,
  type StoredTeamRadar,
} from '../../../shared/teamRadarState';

const stored: StoredTeamRadar = { kind: 'none' };

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data: buildTeamRadarSnapshot(stored) }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountPage(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'teamradar');
  if (!def) throw new Error('teamradar service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 付箋コメントの欄 (placeholder が台帳の数を刷る)。1 人目の 1 軸目。 */
function noteField(): HTMLInputElement {
  const all = [...container.querySelectorAll<HTMLInputElement>('input[type="text"]')];
  const hit = all.filter((e) => (e.getAttribute('placeholder') ?? '').startsWith('特徴・課題を'));
  if (hit.length === 0) throw new Error('付箋コメントの欄が無い (details を開いたか)');
  return hit[0]!;
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** 付箋コメントの `<details>` を開く (既定は閉じている)。 */
async function openNotes(): Promise<void> {
  const d = [...container.querySelectorAll('details')].find((x) =>
    (x.querySelector('summary')?.textContent ?? '').includes('付箋コメント'),
  );
  if (!d) throw new Error('付箋コメントの節が無い');
  await act(async () => {
    d.open = true;
  });
  await settle();
}

beforeEach(() => {
  localStorage.clear();
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

describe('付箋コメントの天井 (パス 174)', () => {
  it('★ 標本: 欄の案内が台帳の数を刷る (数を写していない)', async () => {
    await mountPage();
    await openNotes();
    expect(noteField().getAttribute('placeholder')).toBe(`特徴・課題を ${MAX_MEMBER_NOTE_CHARS} 字以内`);
    // `maxLength` は外した —— 付いているとブラウザが先に切り、落とした分を言えない。
    expect(noteField().getAttribute('maxlength'), 'maxLength が戻っている').toBeNull();
  });

  it('★ 天井の内なら何も言わない', async () => {
    await mountPage();
    await openNotes();
    await type(noteField(), 'あ'.repeat(MAX_MEMBER_NOTE_CHARS));
    expect(container.querySelector('[data-note-clamped]'), '天井ちょうどで警告が出ている').toBeNull();
    expect(noteField().value.length).toBe(MAX_MEMBER_NOTE_CHARS);
  });

  it('★ 天井を超えたら、落ちた字数を言う (欄の値は天井まで)', async () => {
    await mountPage();
    await openNotes();
    await type(noteField(), 'い'.repeat(MAX_MEMBER_NOTE_CHARS + 7));
    const note = container.querySelector('[data-note-clamped]');
    expect(note, '落とした分の警告が出ていない').not.toBeNull();
    expect(note!.textContent).toContain(`${MAX_MEMBER_NOTE_CHARS} 字までです`);
    expect(note!.textContent).toContain('7 字超えていた');
    expect(note!.textContent).toContain('超えた分は入っていません');
    // **state は天井まで** (保存の検証が同じ天井で断るので、超えたまま持たない)。
    expect(noteField().value.length, '天井を超えた値を持っている').toBe(MAX_MEMBER_NOTE_CHARS);
  });

  it('★ 短くし直すと警告が消える (古い数が残らない)', async () => {
    await mountPage();
    await openNotes();
    await type(noteField(), 'う'.repeat(MAX_MEMBER_NOTE_CHARS + 3));
    expect(container.querySelector('[data-note-clamped]')).not.toBeNull();
    await type(noteField(), 'う'.repeat(10));
    expect(container.querySelector('[data-note-clamped]'), '短くしたのに警告が残っている').toBeNull();
  });

  it('★ 警告は打った欄にだけ出る (別の軸の欄には出ない)', async () => {
    await mountPage();
    await openNotes();
    const all = [...container.querySelectorAll<HTMLInputElement>('input[type="text"]')].filter((e) =>
      (e.getAttribute('placeholder') ?? '').startsWith('特徴・課題を'),
    );
    expect(all.length, '軸ごとの欄が 2 つ以上無い').toBeGreaterThanOrEqual(2);
    await type(all[1]!, 'え'.repeat(MAX_MEMBER_NOTE_CHARS + 1));
    const notes = container.querySelectorAll('[data-note-clamped]');
    expect(notes, '警告が複数の欄に出ている').toHaveLength(1);
    // 2 つ目の欄の隣に在る (親が同じ行)。
    expect(all[1]!.parentElement!.contains(notes[0]!), '別の行に出ている').toBe(true);
  });
});
