/** @vitest-environment jsdom */
/**
 * **背骨: 実物のパネルを描いて、アプリが読む欄を全部打ち、保存して中身を見る**
 * (2026-09-24 · パス 450)。
 *
 * 隣の `data/__tests__/aiCredentialFields.test.ts` は表と母集団を字面で突き合わせる。
 * それだけだと「表に在るが画面が描いていない」形が通る (表を `.map` しない
 * 書き方へ戻した日がそれ)。ここは**実際に打って保存し、保管層へ渡った JSON**を見る
 * ので、読める欄が本当に書けることを面の側から主張する。
 *
 * 直す前は `anthropicModel` / `openaiModel` / `geminiModel` の 3 欄が
 * **出荷コードに書き手 0 件**で、クラウドの 3 プロバイダは `spec.defaultModel`
 * に固定されていた (実測は `data/aiCredentialFields.ts` の docblock)。
 *
 * ★ **錠は構造で取る** —— パネルは畳まれて出るので、開くボタンを押した**後に
 * 現れる入力欄**で待つ (ラベルは開く前から在る · パス 442 / 445 / 449 で踏んだ罠)。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SERVICES } from '../../services';
import { _resetCollectionSubscribersForTests } from '../../data/useCollection';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { waitForElement, waitForText } from '../../__tests__/jsdomWait';
import { AI_CREDENTIAL_FIELDS } from '../../data/aiCredentialFields';
import { AI_CREDENTIAL_STRING_KEYS, parseAiCredentials } from '../../../shared/ai/credentials';
import { AI_PROVIDERS } from '../../../shared/ai/providers';

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
      return Promise.resolve({ ok: true });
    },
    clearToken: () => Promise.resolve({ ok: true }),
    storageProtection: () =>
      Promise.resolve({ mechanism: 'os-keychain', encrypted: true, plainCount: 0, file: '/x' }),
  };
}

let container: HTMLDivElement;
let root: Root | null = null;

const find = (label: string): HTMLInputElement | null =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

/** パネルを開く。**開いた後に現れる入力欄**で待つ (見出しは開く前から在る)。 */
async function openPanel(): Promise<void> {
  const def = SERVICES.find((s) => s.id === 'assistant');
  if (!def) throw new Error('assistant service missing');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(def.page));
  });
  const toggle = await waitForElement<HTMLButtonElement>(
    () =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        b.textContent?.includes('エージェント'),
      ) ?? null,
    '⚙ エージェント のボタン',
  );
  await act(async () => toggle.click());
  await waitForElement(() => find('Anthropic API キー'), '開いた後に現れる入力欄');
}

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('value setter missing');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function saveButton(): HTMLButtonElement {
  const el = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === '保存',
  );
  if (!el) throw new Error('save button missing');
  return el;
}

const screen = (): string => container.textContent ?? '';

beforeEach(async () => {
  // jsdom は `Element.scrollTo` を持たない (環境の穴で、製品の欠陥ではない)。
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  saved.length = 0;
  stubHub();
  await resetRecordStore();
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
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('エージェント設定 —— アプリが読む欄は全部打てる', () => {
  it('★ 全欄を打って保存すると、保管層へ渡る JSON に全部載る', async () => {
    await openPanel();
    for (const f of AI_CREDENTIAL_FIELDS) {
      const el = find(f.aria);
      expect(el, `${f.key} の入力欄が画面に無い`).not.toBeNull();
      type(el!, `v-${f.key}`);
    }
    await act(async () => saveButton().click());
    await waitForText(screen, '暗号化');

    expect(saved).toHaveLength(1);
    const parsed = parseAiCredentials(saved[0]!);
    for (const key of AI_CREDENTIAL_STRING_KEYS) {
      expect(parsed[key], `${key} が保存されなかった`).toBe(`v-${key}`);
    }
  });

  it('★ モデルだけを打っても保存される (パス 450 で開いた 3 欄)', async () => {
    await openPanel();
    type(find('Anthropic API キー')!, 'sk-ant-test');
    type(find('Claude モデル')!, 'claude-opus-5-5');
    type(find('ChatGPT モデル')!, 'gpt-test');
    type(find('Gemini モデル')!, 'gemini-test');
    await act(async () => saveButton().click());
    await waitForText(screen, '暗号化');

    const parsed = parseAiCredentials(saved[0]!);
    expect(parsed.anthropicModel).toBe('claude-opus-5-5');
    expect(parsed.openaiModel).toBe('gpt-test');
    expect(parsed.geminiModel).toBe('gemini-test');
  });

  it('★ 画面は既定モデルを placeholder で見せる (何を上書きするか分かる)', async () => {
    await openPanel();
    for (const [aria, provider] of [
      ['Claude モデル', 'anthropic'],
      ['ChatGPT モデル', 'openai'],
      ['Gemini モデル', 'gemini'],
      ['Ollama モデル', 'ollama'],
    ] as const) {
      const el = find(aria);
      expect(el, `${aria} が無い`).not.toBeNull();
      expect(el!.placeholder).toBe(AI_PROVIDERS[provider].defaultModel);
    }
  });

  it('★ モデル欄は伏せない (打った字が見えないと直せない)', async () => {
    await openPanel();
    for (const f of AI_CREDENTIAL_FIELDS.filter((x) => x.key.endsWith('Model'))) {
      expect(find(f.aria)!.type, f.key).toBe('text');
    }
    // 対照: 鍵は伏せる。
    expect(find('Anthropic API キー')!.type).toBe('password');
  });

  /*
   * **綴りの走査が縮んだ分を、描いた DOM で受け持つ** (2026-09-24 · パス 450)。
   *
   * `__tests__/secretFieldAutocomplete.test.ts` は `type="password"` の**字面**で
   * 母集団を数える。表から組むと枝は 1 つになるので、この画面の寄与は 4 → 1 に縮む
   * (門の床をその分だけ下げた)。縮んだのは**数え方**であって守りではない ——
   * ここが実物の入力欄を 1 つ残らず見る。
   */
  it('★ 秘密の欄は描いた DOM でも伏せ字 + 補完なし', async () => {
    await openPanel();
    const secrets = AI_CREDENTIAL_FIELDS.filter((f) => f.secret);
    expect(secrets.length, '秘密の欄が 0 件なら自明に通る').toBeGreaterThanOrEqual(4);
    for (const f of secrets) {
      const el = find(f.aria);
      expect(el, `${f.key} が無い`).not.toBeNull();
      expect(el!.type, f.key).toBe('password');
      expect(el!.autocomplete, f.key).toBe('off');
    }
  });
});
