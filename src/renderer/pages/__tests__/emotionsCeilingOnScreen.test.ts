/** @vitest-environment jsdom */
/**
 * **切れた文に対する分析が、全文に対する分析として返っていた** (2026-09-12 · パス 168)。
 *
 * ## 実測した欠陥
 *
 * `analyze-text` を呼ぶ画面は 3 つ在る。パス 156 は「切るのはよいが、切ったと言う」を
 * 決め、`packAnalyzeText` / `analyzeBatchNote` を作って **2 つ**に配線した:
 *
 * | 画面 | 本文の出所 | 押す前の断り |
 * | --- | --- | --- |
 * | `GmailPage` | スレッド一覧 (利用者は長さを決められない) | ✅ `analyzeBatchNote` |
 * | `SlackPage` | チャンネル一覧 (同上) | ✅ 同じ |
 * | **`EmotionsPage`** | **利用者が貼る本文** | ❌ 素の `maxLength={5000}` |
 *
 * 残った 1 つは、**唯一「人が貼る」欄**だった。placeholder は
 * 「分析したいテキストを貼り付け — メール本文、自分の日記、誰かのメッセージなど」と
 * 貼り付けを誘っており、メール本文や日記は 5,000 字をふつうに超える。
 * ブラウザは超えた分を黙って落とし、**先頭 5,000 字だけが Anthropic へ送られ**、
 * 返ってきた感情分析が「貼った文の分析」として画面に出る。
 * 結果は正しく見えるので、**利用者には切れたことが分からない**。
 *
 * (パス 66 で直したのと同じ形 ——「3 か所のうち 1 か所を残した」。今回は 2 か所直して
 *  1 か所残っていた側。残っていたのが**最も人が触る欄**だったのが厄介な点。)
 *
 * ## 直したあと
 *
 * - 分析するテキスト: `maxLength` を使わず、**天井を超えているあいだは送らない**
 *   (ボタンを押せなくし、いくら超えているかを述べる)。切った本文を AI に渡さない。
 * - 気分のメモ: 保存される 1 行なので**パス 167 と同じ**扱い (天井まで入れて、
 *   落ちた字数を述べる)。
 * - 文面は `shared/inputCeiling.ts` が 1 つだけ持つ。
 *
 * ## この harness が証明できないこと (実測して分かった)
 *
 * **jsdom は `maxLength` を「プログラムからの `value` 代入」に対して掛けない。**
 * 実測 (2026-09-12): `maxLength = 10` の textarea に素のセッターで 25 文字を入れると
 * **25 文字のまま残る**。仕様どおりで、`maxlength` は*人の編集*を縛る属性であり
 * `value` の IDL setter は縛らない。
 *
 * だから **「ブラウザが黙って切る」ことはこの harness では再現できない** ——
 * 下の検査のうち、その決定 (画面が切り落としをブラウザに委ねていない) を実際に
 * 留めているのは **`hasAttribute('maxlength')` の 1 本だけ**である。実際に対照で
 * 確かめた: 素の `maxLength` を戻すと**その 1 本しか鳴らない**。
 *
 * 残りの検査が測っているのは**この画面が自分で持つ判定** ——
 * 超過の注記・押せなくすること・`invoke` しないこと・気分のメモの切り詰め ——
 * で、そちらは対照で鳴ることを確かめてある (C2/C3/C4)。
 * **実機での切り落ちの証明は e2e の仕事** (`npm run e2e`) であり、ここではできない。
 * 「鳴らない対照は合格ではなく、検査についての報せ」——
 * この節がその報せである。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { MAX_ANALYZE_TEXT_CHARS, MAX_MOOD_NOTE_CHARS } from '../../../shared/emotionsLimits';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';

/** `analyze-text` へ実際に渡された payload (切られていないことを確かめる)。 */
let invoked: { serviceId: string; action: string; payload: unknown }[];

beforeEach(() => {
  invoked = [];
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve(['emotions']),
    // **`keyConfigured: true` を返す** —— 分析ボタンは鍵が無いと押せないので、
    // 天井の判定を見るには鍵が在る状態が要る (同梱スナップショットは false)。
    fetchSnapshot: () =>
      Promise.resolve({ ok: true, data: { moods: [], analyses: [], keyConfigured: true } }),
    invoke: (serviceId: string, action: string, payload: unknown) => {
      invoked.push({ serviceId, action, payload });
      return Promise.resolve({ ok: false, code: 'x', message: 'stub' });
    },
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountEmotions(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'emotions');
  if (!def) throw new Error('emotions service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
}

/** 分析の textarea (この画面で唯一の textarea)。 */
function analyzeBox(): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>('textarea');
  if (!el) throw new Error('分析の textarea が無い');
  return el;
}

/** 気分のメモ欄 (placeholder で引く)。 */
function moodNoteBox(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[placeholder^="メモ (任意)"]');
  if (!el) throw new Error('気分のメモ欄が無い');
  return el;
}

/**
 * 実際の入力として流す。**素の代入では React に届かない** ——
 * React が node ごとに `value` を上書きして最後の値を覚えているため
 * (パス 167 でこれを踏んで 3 件落とした)。
 */
async function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new Error('value setter が無い');
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

/** 「分析」ボタン。 */
function analyzeButton(): HTMLButtonElement {
  const el = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === '分析');
  if (!el) throw new Error('分析ボタンが無い');
  return el as HTMLButtonElement;
}

const overNote = (): HTMLElement | null =>
  container.querySelector('[data-ceiling-notice="分析するテキスト"]');
const moodNote = (): HTMLElement | null => container.querySelector('[data-mood-note-overflow]');

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
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

describe('分析するテキスト — 切らずに断る (パス 168)', () => {
  it('★ `maxLength` に任せていない (任せるとブラウザが黙って落とす)', async () => {
    await mountEmotions();
    expect(analyzeBox().hasAttribute('maxlength'), 'maxLength が戻っている').toBe(false);
  });

  it('★ 天井を超えた本文は欄に残る (黙って切らない)', async () => {
    await mountEmotions();
    const long = 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS + 1200);
    await typeInto(analyzeBox(), long);
    // 全文がそのまま残っている —— 切ったら利用者は何を削るか決められない。
    expect(analyzeBox().value).toHaveLength(MAX_ANALYZE_TEXT_CHARS + 1200);
  });

  it('★ 超えているあいだは送らない (押せない + 何も invoke しない)', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS + 1));
    expect(analyzeButton().disabled, '超えているのに押せる').toBe(true);
    await act(async () => {
      analyzeButton().click();
    });
    await settle();
    expect(invoked.filter((c) => c.action === 'analyze-text'), '切れた本文を送っている').toEqual([]);
  });

  it('★ いくら超えているかを述べる (どれだけ削れば送れるかが読める)', async () => {
    await mountEmotions();
    const length = MAX_ANALYZE_TEXT_CHARS + 2300;
    await typeInto(analyzeBox(), 'あ'.repeat(length));
    const note = overNote();
    expect(note, '超えているのに何も言っていない').not.toBeNull();
    // 節は共有の `CeilingNotice` (パス 175 で寄せた)。欄の名前が属性に載る。
    expect(note!.getAttribute('data-ceiling-notice')).toBe('分析するテキスト');
    expect(note!.textContent).toContain(String(MAX_ANALYZE_TEXT_CHARS));
    expect(note!.textContent).toContain(String(length));
    expect(note!.textContent).toContain('2300');
    expect(note!.getAttribute('role')).toBe('alert');
  });

  it('★ 天井ちょうどは送れる (境界を締めすぎていない)', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS));
    expect(overNote(), '天井ちょうどで警告が出ている').toBeNull();
    expect(analyzeButton().disabled, '天井ちょうどで押せない').toBe(false);
    await act(async () => {
      analyzeButton().click();
    });
    await settle();
    const sent = invoked.find((c) => c.action === 'analyze-text');
    expect(sent, '天井ちょうどが送られていない').toBeDefined();
    // **切られていない全文が渡る**。
    expect((sent!.payload as { text: string }).text).toHaveLength(MAX_ANALYZE_TEXT_CHARS);
  });

  it('★ 短くし直せば送れるようになる (警告も消える)', async () => {
    await mountEmotions();
    await typeInto(analyzeBox(), 'あ'.repeat(MAX_ANALYZE_TEXT_CHARS + 1));
    expect(analyzeButton().disabled).toBe(true);
    await typeInto(analyzeBox(), '今日は落ち着いていた');
    expect(overNote(), '短くしたのに警告が残っている').toBeNull();
    expect(analyzeButton().disabled, '短くしたのに押せない').toBe(false);
  });
});

describe('気分のメモ — 切ったことを述べる (パス 167 と同じ扱い)', () => {
  it('★ `maxLength` に任せず、落ちた字数を述べる', async () => {
    await mountEmotions();
    expect(moodNoteBox().hasAttribute('maxlength'), 'maxLength が戻っている').toBe(false);
    await typeInto(moodNoteBox(), 'あ'.repeat(MAX_MOOD_NOTE_CHARS + 37));
    expect(moodNoteBox().value).toHaveLength(MAX_MOOD_NOTE_CHARS);
    const note = moodNote();
    expect(note, '落ちたのに何も言っていない').not.toBeNull();
    expect(note!.getAttribute('data-mood-note-overflow')).toBe('37');
    expect(note!.textContent).toContain('37');
    expect(note!.textContent).toContain(String(MAX_MOOD_NOTE_CHARS));
  });

  it('天井ちょうどでは警告を出さない', async () => {
    await mountEmotions();
    await typeInto(moodNoteBox(), 'あ'.repeat(MAX_MOOD_NOTE_CHARS));
    expect(moodNote()).toBeNull();
  });

  it('対照: 画面は既定で描けている (探し方が空振りしていない)', async () => {
    await mountEmotions();
    expect((container.textContent ?? '')).toContain('今日の気分');
  });
});
