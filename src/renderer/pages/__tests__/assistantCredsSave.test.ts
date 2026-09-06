/** @vitest-environment jsdom */
/**
 * **API キーの保存 —— 結果を見ずに「保存しました」と言わない。**
 *
 * アシスタントのキー欄は 2026-09-06 まで `await hub.setToken(...)` の**戻り値を
 * 捨てて**いた。`setToken` は上限超え (`invalid_token`) や保管庫の施錠
 * (`write_failed`) を `{ ok: false }` で返すので、
 *
 *   - 保存できていないのに「保存しました」と出る
 *   - しかも入力欄を空にするので、打った鍵が消える
 *
 * という壊れ方をしていた (`components/StatusBar.tsx` は同じ理由で res を見ており、
 * その注記もある —— 片方だけ直っていた)。
 *
 * 併せて、文面が**無条件に「暗号化ストレージに格納」**と書いていた。デスクトップ版は
 * OS キーチェーンが無い環境で base64 の難読化へ倒れる設計なので、
 * `storageProtection().mechanism` で選ぶ (`data/credentialSaveMessage.ts`)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetRecordStoreForTests } from '../../data/store';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';

type SaveResult = { ok: true } | { ok: false; code: string; message: string };

let saveResult: SaveResult = { ok: true };
let protection: unknown = { mechanism: 'os-keychain', encrypted: true, plainCount: 0, file: '/x' };
let protectionThrows = false;
const saved: string[] = [];

function stubHub(): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: (_id: string, token: string) => {
      saved.push(token);
      return Promise.resolve(saveResult);
    },
    clearToken: () => Promise.resolve({ ok: true }),
    storageProtection: () =>
      protectionThrows ? Promise.reject(new Error('no bridge')) : Promise.resolve(protection),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mountAssistant(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'assistant');
  if (!def) throw new Error('assistant service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  await settle();
  // 資格情報の欄は「⚙ エージェント」で開く (既定は閉じている)。
  const toggle = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes('エージェント'),
  );
  if (!toggle) throw new Error('agents toggle missing');
  await act(async () => toggle.click());
  await settle();
}

const input = (label: string): HTMLInputElement => {
  const el = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!el) throw new Error(`input ${label} missing`);
  return el;
};

/** React の onChange を通す (value setter を直接呼ぶ)。 */
function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 資格情報パネルの「保存」ボタン (パネル内の最初の primary ボタン)。 */
function saveButton(): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
  const el = buttons.find((b) => b.textContent?.trim() === '保存');
  if (!el) throw new Error('save button missing');
  return el;
}

const messages = (): string => container.textContent ?? '';

beforeEach(async () => {
  // jsdom は `Element.scrollTo` を持たない (実ブラウザには在る)。会話の自動スクロールが
  // mount 時に走るので、無い物を足しておく —— これは環境の穴で、製品の欠陥ではない。
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  saveResult = { ok: true };
  protection = { mechanism: 'os-keychain', encrypted: true, plainCount: 0, file: '/x' };
  protectionThrows = false;
  saved.length = 0;
  stubHub();
  _resetRecordStoreForTests();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = null;
  }
  container.remove();
  vi.restoreAllMocks();
});

describe('アシスタントの API キー保存', () => {
  it('★ 保存できなかったら「保存できませんでした」と出し、入力は消さない', async () => {
    saveResult = { ok: false, code: 'write_failed', message: '金庫が施錠されています' };
    await mountAssistant();
    type(input('Anthropic API キー'), 'sk-ant-test-key');
    await act(async () => saveButton().click());
    await settle();

    expect(messages()).toContain('保存できませんでした');
    expect(messages()).toContain('金庫が施錠されています');
    // 打った鍵が消えていない (保存できていないので打ち直しにさせない)
    expect(input('Anthropic API キー').value).toBe('sk-ant-test-key');
    // 「保存しました」とは言っていない
    expect(messages()).not.toContain('保存しました');
  });

  it('★ 保存できたら守り方を名乗り、入力を空にする (OS キーチェーン)', async () => {
    await mountAssistant();
    type(input('Anthropic API キー'), 'sk-ant-test-key');
    await act(async () => saveButton().click());
    await settle();

    expect(messages()).toContain('OS のキーチェーン由来の鍵で暗号化');
    expect(input('Anthropic API キー').value).toBe('');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toContain('sk-ant-test-key');
  });

  it('★ 難読化のみの端末では「暗号化されていません」と出す', async () => {
    protection = { mechanism: 'obfuscated', encrypted: false, plainCount: 1, file: '/x' };
    await mountAssistant();
    type(input('OpenAI API キー'), 'sk-openai');
    await act(async () => saveButton().click());
    await settle();

    expect(messages()).toContain('暗号化されていません');
    expect(messages()).toContain('base64 の難読化のみ');
  });

  it('★ 守り方が分からないときは暗号化を名乗らない', async () => {
    protectionThrows = true;
    await mountAssistant();
    type(input('Google Gemini API キー'), 'AIza-test');
    await act(async () => saveButton().click());
    await settle();

    expect(messages()).toContain('保存しました');
    expect(messages()).toContain('保存の守り方は設定 → セキュリティで確認できます');
    expect(messages()).not.toContain('暗号化ストレージ');
  });

  it('対照: 1 つも入力していなければ保存を呼ばない', async () => {
    await mountAssistant();
    await act(async () => saveButton().click());
    await settle();
    expect(saved).toHaveLength(0);
    expect(messages()).toContain('少なくとも 1 つの API キー');
  });
});
