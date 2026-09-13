/** @vitest-environment jsdom */
/**
 * **効かない操作をボタンとして出さない** (2026-09-12 · パス 158)。
 *
 * `SettingsPage` の `LicenseSection` は 2026-09-12 の計測で**行カバレッジ 0%**。
 * 読むと、押しても何も起きないボタンを出していた:
 *
 *   `SELF_PRODUCT_ALL_ACCESS = true` なので `hasInternalLicense()` は**常に true**。
 *   「解除」は `deactivateInternalLicense()` (保存を消す) のあと
 *   `setInternalUnlocked(false)` を呼び、**同じ tick で** `servicehub:license-changed`
 *   を投げる。その listener が `hasInternalLicense()` で **true に戻す**。
 *   React は 1 回の描画に畳むので、**画面は何も変わらない。**
 *
 * **論理は既に固定されていた** —— `usePlan.test.ts` に
 * 「revokeInvite 後も SELF_PRODUCT_ALL_ACCESS で internalUnlocked=true のまま」
 * という検査が在る。分かっていたのは論理だけで、**画面はそれを知らなかった**
 * (「解除」ボタンと「Free に戻す」という説明を出し続けていた)。
 *
 * ここは画面が理由 (`licenseSource`) を読んで、`build` のときに
 *
 *   解除ボタンを出さず、なぜ解除できないかを言う / 「入力すると使えます」も言わない
 *
 * ことを留める。
 *
 * **有償配布側 (`SELF_PRODUCT_ALL_ACCESS = false`) の画面は、ここでは押せない。**
 * `vi.doMock` で export を差し替えても `allAccessSource` が読むのはモジュール内の
 * 束縛なので変わらない —— 実際に試して 3 本落ちた。代わりに
 * `plan/__tests__/allAccessSource.test.ts` が**同じ関数を引数つきで**呼んで
 * `invite` / `none` の枝を実物の論理で測る (画面がその値で分岐することは、
 * 下の「build のときだけ帯が出る」対照が押さえている)。
 * **測っていない物を測ったことにはしない。**
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

let container: HTMLDivElement;
let root: Root | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function mount(): Promise<void> {
  const { LicenseSection } = await import('../SettingsPage');
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(LicenseSection));
  });
  await settle();
}

function text(): string {
  return container.textContent ?? '';
}

function revokeButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === '解除',
  ) as HTMLButtonElement | undefined;
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

describe('社内ライセンスのパネル — ビルドが開放している側 (カバレッジ 0% だった · パス 158)', () => {
  it('★ 解除ボタンを出さない (押しても何も起きない操作をボタンにしない)', async () => {
    await mount();
    expect(revokeButton()).toBeUndefined();
    const why = container.querySelector('[data-license-cannot-revoke]');
    expect(why).not.toBeNull();
    expect(why!.textContent).toContain('このビルドでは解除できません');
    expect(why!.textContent).toContain('Free には戻りません');
  });

  it('★ 「入力すると使えます」と言わない (入力を求めずに開いている)', async () => {
    await mount();
    expect(text()).toContain('このビルドは招待コードを必要としません');
    expect(text()).not.toContain('招待コードを入力すると');
  });

  it('有効であることは言う (開いている事実は隠さない)', async () => {
    await mount();
    expect(text()).toContain('社内ライセンス有効');
  });

  it('★ オーナー向けの節は「配っても見え方は変わらない」と付け足す', async () => {
    await mount();
    expect(text()).toContain('受け取った人の見え方は変わりません');
    // コード自体は出す (有償配布へ切り替えたときに効くので消さない)。
    expect(text()).toMatch(/SVCHUB-[0-9A-Z]{8}/);
  });

  it('招待コードの入力欄は出ない (開いているので入れる意味が無い)', async () => {
    await mount();
    expect(container.querySelector('input[placeholder="SVCHUB-XXXXXXXX"]')).toBeNull();
  });
});
