/** @vitest-environment jsdom */
/**
 * **要望リストにも消す手を置く** (2026-09-27 · パス 492)。
 *
 * コンシェルジュが受け付けた機能要望は `chatbot-requests` (localStorage) に積まれ、台帳は中身を
 * `sensitive` (会話の中身) と名乗る。ところが部品には**書き出す口 (「📥 要望」) しか無く**、消す道は
 * 設定の「すべてのデータを削除」だけだった —— 会話履歴 (パス 489 の「🗑 履歴」) と同じ欠落の 2 件目
 * (法則 `escape-hatch-stays-open`)。
 *
 * 直し: 書き出した直後に、会話の中で「この端末からも消すか」を訊く (見出しに 4 つ目のボタンを置くと
 * 列の見出しが 2 段に折れる)。**消すのは書き出した行だけ** —— 問いを出してから押すまでに記録された
 * 要望 (この会話・別のタブ) を巻き込まない。消す直前に読み直す (パス 433 の「古い一覧で消す」を作らない)。
 *
 * 待ちは条件で取る (法則 `wait-for-condition-not-ticks`) —— このファイルは固定回数の待ちを持たない。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ChatbotWidget,
  clearExportedRequests,
  requestsClearOffer,
  requestsClearedMessage,
  REQUESTS_CLEAR_FAILED,
} from '../ChatbotWidget';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';

const REQUESTS_KEY = 'chatbot-requests';
const A = { text: '経費精算の機能を作ってほしい', at: '2026-09-27T01:00:00.000Z' };
const B = { text: '請求書の一括送付がほしい', at: '2026-09-27T02:00:00.000Z' };
const C = { text: '書き出した後に記録した要望', at: '2026-09-27T03:00:00.000Z' };

let createObjectUrl: ReturnType<typeof vi.fn>;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  for (const name of ['scrollTo', 'scrollIntoView'] as const) {
    if (typeof (Element.prototype as unknown as Record<string, unknown>)[name] !== 'function') {
      Object.defineProperty(Element.prototype, name, { value: () => undefined, configurable: true, writable: true });
    }
  }
});

let container: HTMLDivElement;
let root: Root | null = null;

function seed(rows: readonly { text: string; at: string }[]): void {
  localStorage.setItem(REQUESTS_KEY, JSON.stringify(rows));
}

function stored(): unknown {
  const raw = localStorage.getItem(REQUESTS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

async function openWidget(): Promise<HTMLElement> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(ChatbotWidget));
  });
  const launcher = await waitForElement(
    () => container.querySelector<HTMLButtonElement>('button[aria-label="AI コンシェルジュを開く"]'),
    '🤖 の入口',
  );
  await act(async () => {
    launcher.click();
  });
  return waitForElement(() => container.querySelector<HTMLElement>('[role="dialog"]'), 'コンシェルジュの窓');
}

async function exportRequests(dialog: HTMLElement): Promise<void> {
  const btn = dialog.querySelector<HTMLButtonElement>('button[aria-label="要望リストをエクスポート"]');
  if (!btn) throw new Error('「📥 要望」が無い');
  await act(async () => {
    btn.click();
  });
}

const offerOf = (dialog: HTMLElement) => dialog.querySelector<HTMLElement>('[data-requests-clear-offer]');

async function press(el: HTMLElement, text: string): Promise<void> {
  const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!btn) throw new Error(`「${text}」が無い`);
  await act(async () => {
    btn.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  createObjectUrl = vi.fn(() => 'blob:probe');
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true, writable: true });
  // jsdom は <a download>.click() で「navigation は未実装」を刷るので、クリックそのものを黙らせる
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
    root = null;
  }
  container.remove();
});

describe('コンシェルジュの要望リスト —— 書き出した直後に消せる', () => {
  it('★ 書き出すと、数と「元に戻せない」「ファイルは残る」を名乗って訊き、消すと保存値が無くなる', async () => {
    seed([A, B]);
    const dialog = await openWidget();
    await exportRequests(dialog);
    const offer = await waitForElement(() => offerOf(dialog), '「端末からも消すか」の問い');
    expect(offer.textContent).toContain(requestsClearOffer(2));
    expect(offer.textContent).toContain('書き出した要望 2 件');
    expect(offer.textContent).toContain('元に戻せません');
    expect(offer.textContent).toContain('chatbot-requests.md) は残ります');
    await press(offer, 'この端末から消す');
    expect(stored()).toBeNull();
    await waitForText(() => dialog.textContent ?? '', requestsClearedMessage(2, 0));
    expect(offerOf(dialog), '押したら問いは閉じる').toBeNull();
  });

  it('「残す」を押せば 1 件も消さない', async () => {
    seed([A, B]);
    const dialog = await openWidget();
    await exportRequests(dialog);
    const offer = await waitForElement(() => offerOf(dialog), '「端末からも消すか」の問い');
    await press(offer, '残す');
    expect(stored()).toEqual([A, B]);
    expect(offerOf(dialog)).toBeNull();
  });

  it('要望が 0 件なら訊かない (書き出しそのものは走っている)', async () => {
    const dialog = await openWidget();
    await exportRequests(dialog);
    expect(createObjectUrl, '書き出しは走った (問いが出ないのは押していないからではない)').toHaveBeenCalledTimes(1);
    expect(offerOf(dialog)).toBeNull();
  });

  it('★ 問いを出してから押すまでに記録された要望は消さない (消す直前に読み直す)', async () => {
    seed([A, B]);
    const dialog = await openWidget();
    await exportRequests(dialog);
    const offer = await waitForElement(() => offerOf(dialog), '「端末からも消すか」の問い');
    // 別のタブ (かこの会話) が、書き出した後に 1 件記録した
    seed([A, B, C]);
    await press(offer, 'この端末から消す');
    expect(stored(), '書き出していない要望まで消えた').toEqual([C]);
    await waitForText(() => dialog.textContent ?? '', requestsClearedMessage(2, 1));
  });

  it('★ 消せなかったら「消しました」と言わない —— 残っていると言う', async () => {
    seed([A, B]);
    const dialog = await openWidget();
    await exportRequests(dialog);
    const offer = await waitForElement(() => offerOf(dialog), '「端末からも消すか」の問い');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { name: 'SecurityError' });
    });
    await press(offer, 'この端末から消す');
    await waitForText(() => dialog.textContent ?? '', REQUESTS_CLEAR_FAILED);
    expect(dialog.textContent).not.toContain(requestsClearedMessage(2, 0));
    expect(stored()).toEqual([A, B]);
  });
});

describe('clearExportedRequests —— 書き出した行だけを、同じ数だけ消す', () => {
  it('同じ要望が 3 件あり 2 件を書き出したなら、1 件は残す (多重集合で数える)', () => {
    seed([A, A, A]);
    expect(clearExportedRequests([A, A])).toEqual({ removed: 2, kept: 1 });
    expect(stored()).toEqual([A]);
  });

  it('書き出した物が既に無ければ 0 件を消し、「消しました」とは言わない', () => {
    seed([C]);
    expect(clearExportedRequests([A, B])).toEqual({ removed: 0, kept: 1 });
    expect(stored()).toEqual([C]);
    expect(requestsClearedMessage(0, 1)).not.toContain('消しました');
    expect(requestsClearedMessage(0, 1)).toContain('既に残っていませんでした');
    expect(requestsClearedMessage(2, 0), '標本: 消したときは「消しました」と言う').toContain('消しました');
  });

  it('残す物があって書けなければ null (消したと言わない)', () => {
    seed([A, C]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    });
    expect(clearExportedRequests([A])).toBeNull();
  });

  it('本文だけ同じで受付日時が違う要望は別の物として残す', () => {
    const sameText = { ...A, at: '2026-09-28T00:00:00.000Z' };
    seed([A, sameText]);
    expect(clearExportedRequests([A])).toEqual({ removed: 1, kept: 1 });
    expect(stored()).toEqual([sameText]);
  });
});

describe('要望の読み —— 検めた欄だけで組み直す (パス 489 #6)', () => {
  it('保存値の余分な欄は読みで落ち、書き戻しにも残らない', () => {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify([{ ...A, extra: { z: 1 } }, B]));
    expect(clearExportedRequests([B])).toEqual({ removed: 1, kept: 1 });
    expect(stored(), '余分な欄を持ち回っていない').toEqual([A]);
    expect(JSON.stringify(stored())).not.toContain('extra');
    expect(JSON.stringify([{ ...A, extra: { z: 1 } }]), '標本: 組み直さなければ余分な欄は残る').toContain('extra');
  });
});
