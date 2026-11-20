/** @vitest-environment jsdom */
/**
 * **資格情報が無い連携先の画面は、押す前にそう言う (赤い失敗にしない)。**
 *
 * 連携先 22 画面はどれも取得に資格情報を使う (`shared/fetchNeedsCredential.ts`)。無いまま「更新」を押すと橋は必ず断る。
 * 2026-11-19 実測 (実 chromium · LITE): 読める 8 画面 (Stripe ほか) で押すと、赤い「エラー」+
 * 「表示中の数字は同梱のサンプルです」+「資格情報が未登録です。登録すると実データに切り替わります。」が出た。
 *
 * 直した後の状態バー:
 *   - 連携先 × 登録の欄が在る × 未登録: 「更新」を出さず、灰色の案内を 1 つ出す。登録の欄は出る
 *   - 登録するとその場で「更新」が出て、取得が走る
 *   - 登録済みなのに取得が断られた (期限切れ・保管庫の施錠ほか): 赤い文は今までどおり出す。灰色の案内は重ねない
 *   - 登録の欄が無い画面・端末内の画面: 今までどおり
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StatusBar } from '../StatusBar';
import { FETCH_NEEDS_CREDENTIAL_NOTE } from '../../../shared/fetchNeedsCredential';
import { BROWSER_FETCH_UNSUPPORTED_NOTE } from '../../../shared/browserFetchReach';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

type Props = Parameters<typeof StatusBar>[0];

let saved: Array<[string, string]> = [];
let cleared: string[] = [];
let versionAsked = 0;

function setHub(version: string): void {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => {
      versionAsked += 1;
      return Promise.resolve(version);
    },
    listConfigured: () => Promise.resolve([]),
    oauthSupported: () => Promise.resolve(false),
    setToken: (id: string, value: string) => {
      saved.push([id, value]);
      return Promise.resolve({ ok: true });
    },
    clearToken: (id: string) => {
      cleared.push(id);
      return Promise.resolve({ ok: true });
    },
  };
}
const BROWSER = '0.1.0-web';
const DESKTOP = '0.1.0';
const SLOT = { label: '制限付きキー (読み取り専用)', placeholder: 'rk_live_…' };

let container: HTMLDivElement;
let root: Root | null = null;
let refreshed = 0;
beforeEach(() => {
  saved = [];
  cleared = [];
  versionAsked = 0;
  refreshed = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container.remove();
});

async function render(props: Partial<Props>): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(StatusBar, {
        who: 'someone',
        onRefresh: () => {
          refreshed += 1;
        },
        ...props,
      } as Props),
    );
  });
  // 実行形態の問い合わせが済んでから見る (済む前と後で「更新」の出方が変わる画面が在る)。
  await settleUntil(() => versionAsked >= 1, '実行形態を訊き終える');
  await act(async () => {
    await Promise.resolve();
  });
}

const badge = (): string => (container.querySelector('.status-bar .badge')?.textContent ?? '').trim();
const needNotes = (): string[] =>
  Array.from(container.querySelectorAll('[data-fetch-needs-credential]')).map((n) => (n.textContent ?? '').trim());
const labels = (): string[] =>
  Array.from(container.querySelectorAll('.status-bar button')).map((b) => (b.textContent ?? '').trim());
const button = (label: string): HTMLButtonElement | null =>
  (Array.from(container.querySelectorAll('.status-bar button')).find((b) => (b.textContent ?? '').trim() === label) as
    | HTMLButtonElement
    | undefined) ?? null;

function typeInto(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

for (const [name, version] of [
  ['ブラウザ版', BROWSER],
  ['デスクトップ版', DESKTOP],
] as const) {
  describe(`${name} × 連携先 (Stripe) × 未登録`, () => {
    it('★ 押す前から案内を 1 つ出し、「更新」を出さない。札は「サンプル（未連携）」・登録の欄は出る', async () => {
      setHub(version);
      await render({ serviceId: 'stripe', tokenSetup: SLOT, isConfigured: false });
      expect(needNotes()).toEqual([FETCH_NEEDS_CREDENTIAL_NOTE]);
      expect(labels()).not.toContain('更新');
      expect(labels()).toContain(SLOT.label);
      expect(badge()).toBe('サンプル（未連携）');
      expect(container.querySelector('.badge.warn')).toBeNull();
      expect(container.querySelector('[data-fetch-error]')).toBeNull();
      expect(container.querySelector('[data-stale-note]')).toBeNull();
    });

    it('★ 登録すると、その場で案内が消えて「更新」が出る。取得も 1 度走る', async () => {
      setHub(version);
      await render({ serviceId: 'stripe', tokenSetup: SLOT, isConfigured: false });
      await act(async () => {
        button(SLOT.label)!.click();
      });
      const input = await waitForElement(
        () => container.querySelector<HTMLInputElement>('.status-bar input[type="password"]'),
        '登録の欄が開く',
      );
      typeInto(input, 'sample-not-a-real-key');
      await settleUntil(() => button('保存')?.disabled === false, '「保存」が押せる');
      await act(async () => {
        button('保存')!.click();
      });
      await settleUntil(() => button('更新') !== null, '登録の後に「更新」が出る');
      expect(saved).toEqual([['stripe', 'sample-not-a-real-key']]);
      expect(needNotes()).toEqual([]);
      expect(refreshed).toBe(1);
    });

    it('登録済みなら、「更新」が在り、案内は出ない', async () => {
      setHub(version);
      await render({ serviceId: 'stripe', tokenSetup: SLOT, isConfigured: true });
      expect(button('更新')).not.toBeNull();
      expect(needNotes()).toEqual([]);
    });

    it('★ 登録を消すと、「更新」が消えて案内が出る', async () => {
      setHub(version);
      await render({ serviceId: 'stripe', tokenSetup: SLOT, isConfigured: true });
      await act(async () => {
        button('トークン更新')!.click();
      });
      await settleUntil(() => button('削除') !== null, '「削除」が出る');
      await act(async () => {
        button('削除')!.click();
      });
      await settleUntil(() => needNotes().length === 1, '消した後に案内が出る');
      expect(cleared).toEqual(['stripe']);
      expect(button('更新')).toBeNull();
    });
  });
}

describe('失敗の文が出ている間は、灰色の案内を重ねない', () => {
  it('★ 登録済みだったのに取得が断られた (期限切れほか): 赤い文は出す・灰色の案内は出さない・「更新」は出さない', async () => {
    setHub(DESKTOP);
    await render({
      serviceId: 'stripe',
      tokenSetup: SLOT,
      isConfigured: false,
      status: 'error',
      errorMessage: 'stripe の資格情報は期限切れのため消しました。もう一度登録してください。',
    });
    expect(needNotes()).toEqual([]);
    expect(container.querySelector('[data-fetch-error]')?.textContent).toContain('期限切れ');
    expect(button('更新')).toBeNull();
    expect(labels()).toContain(SLOT.label);
  });

  it('対照: 登録済みで取得が失敗した (網の不調ほか) ときは「更新」が残る (もう一度試せる)', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'stripe', tokenSetup: SLOT, isConfigured: true, status: 'error', errorMessage: 'HTTP 503' });
    expect(button('更新')).not.toBeNull();
    expect(container.querySelector('[data-fetch-error]')?.textContent).toContain('503');
    expect(needNotes()).toEqual([]);
  });
});

describe('対照 —— 対象でない所では今までどおり', () => {
  it('登録の欄を渡さない画面: 未登録でも「更新」が在り、案内は出ない', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'stripe', isConfigured: false });
    expect(button('更新')).not.toBeNull();
    expect(needNotes()).toEqual([]);
  });

  it('端末内の画面 (株式 —— AI の鍵は任意): 未登録でも「更新」が在り、案内は出ない', async () => {
    setHub(DESKTOP);
    await render({ serviceId: 'stocks', tokenSetup: { label: 'Anthropic API キー' }, isConfigured: false });
    expect(button('更新')).not.toBeNull();
    expect(needNotes()).toEqual([]);
  });

  it('ブラウザ版で実データを読めない連携先 (GitHub): 出るのは「この版では取得できない」の案内 1 つだけ', async () => {
    setHub(BROWSER);
    await render({ serviceId: 'github', tokenSetup: { label: 'PAT を設定' }, isConfigured: false });
    await settleUntil(
      () => container.querySelectorAll('[data-fetch-unsupported]').length === 1,
      '「この版では取得できない」の案内が出る',
    );
    expect(container.querySelector('[data-fetch-unsupported]')?.textContent).toBe(BROWSER_FETCH_UNSUPPORTED_NOTE);
    expect(needNotes()).toEqual([]);
    expect(button('更新')).toBeNull();
  });

  it('serviceId を渡さない汎用の帯: 「更新」が在り、案内は出ない', async () => {
    setHub(DESKTOP);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(StatusBar, { who: 'someone', onRefresh: () => {} } as Props));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(button('更新')).not.toBeNull();
    expect(needNotes()).toEqual([]);
  });
});
