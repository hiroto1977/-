/** @vitest-environment jsdom */
/**
 * **保存 / 削除した直後、この行の札は保管層と一致する** (2026-09-23 · パス 427)。
 *
 * ## 直す前の実測 (jsdom · 実物の `GithubPage` を描き、橋の `listConfigured` /
 * `setToken` / `clearToken` を 1 つの配列で繋いだ)
 *
 * | 操作 | 保管層 | この行の札 | パネルの中 |
 * | --- | --- | --- | --- |
 * | 保存 (未登録 → 登録) | `['github']` | **「PAT を設定」のまま** (= 未登録の札) | **「削除」が出ない** |
 * | 削除 (登録 → 未登録) | `[]` | **「トークン更新」のまま** (= 登録済みの札) | —— |
 *
 * 原因は `useServiceData` の依存 —— この判定を出す `useEffect` の依存は
 * `[serviceId, refresh, autoFetch]` で、**保存しても削除してもどれも変わらない**。
 *
 * ★ **同じ行が同じ問いに 2 通り答えていた** —— 保存した直後、札は「PAT を設定」
 * (まだ何も預かっていない) と言い、隣のバッジは「ライブ」(今その資格情報で
 * 取ってきた) と言う。
 *
 * ★ **重いのは保存の側で、逃げ口が閉じる** (法則 `escape-hatch-stays-open`) ——
 * 「削除」は登録済みのときだけ描くので、打ち込んだ直後の利用者はこの画面から
 * 消せない。設定画面の掃除の節は `unusedStoredCredentials`、つまり**読み手の
 * いない**サービスだけを並べるので、使われている資格情報はそこにも出ない
 * (この主張は下の `it` が実物の関数で確かめる —— 写しで言うと古びる)。
 *
 * ## 検査の形
 *
 * 背骨は**振る舞い**: 実物の画面を描き、実際に押して、**札と「削除」ボタンと
 * 保管層を同じ流れの中で突き合わせる**。綴りの走査は置かない —— 見るべきは
 * 「利用者が何を読み、何を押せるか」で、それは描いて押せば直接出る。
 */
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GithubPage } from '../../pages/GithubPage';
import { StatusBar } from '../StatusBar';
import { SNAPSHOT } from '../../data/snapshot';
import { credentialUseOf, unusedStoredCredentials } from '../../../shared/credentialUse';
import { settleUntil, waitForElement } from '../../__tests__/jsdomWait';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 登録済みの札 (親の `isConfigured` が true のときに出る綴り)。 */
const CONFIGURED_LABEL = 'トークン更新';
/** 未登録の札 (`GithubPage` が渡す `tokenSetup.label`)。 */
const UNCONFIGURED_LABEL = 'PAT を設定';

/** 橋 (保管層) と画面を 1 つの配列で繋ぐ。**保管層は本物と同じく書き抜ける。** */
function fakeHub(start: readonly string[], opts: { oauth?: boolean } = {}) {
  let configured = [...start];
  return {
    store: () => configured,
    hub: {
      oauthSupported: () => Promise.resolve(opts.oauth === true),
      listConfigured: () => Promise.resolve(configured),
      fetchSnapshot: () => Promise.resolve({ ok: true, data: SNAPSHOT.github }),
      setToken: (id: string) => {
        configured = [...new Set([...configured, id])];
        return Promise.resolve({ ok: true });
      },
      clearToken: (id: string) => {
        configured = configured.filter((x) => x !== id);
        return Promise.resolve({ ok: true });
      },
      openExternal: () => Promise.resolve({ ok: true }),
    },
  };
}

function mountInto(hub: unknown): { container: HTMLElement; root: Root } {
  (window as unknown as { serviceHub: unknown }).serviceHub = hub;
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

const labels = (c: HTMLElement): string[] =>
  [...c.querySelectorAll('button')].map((b) => b.textContent ?? '');

/**
 * その札のボタンが**出るまで待ってから**押す (法則 `wait-for-condition-not-ticks`)。
 * 固定回数で回すと、負荷の下で「まだ描かれていない」を「無い」と読む。
 */
async function press(c: HTMLElement, label: string): Promise<void> {
  const b = await waitForElement(
    () => [...c.querySelectorAll('button')].find((x) => x.textContent === label),
    `「${label}」ボタン`,
  );
  await act(async () => {
    b.click();
  });
}

/** その札のボタンが出るまで待つ。 */
const waitForLabel = (c: HTMLElement, label: string): Promise<void> =>
  settleUntil(() => labels(c).includes(label), `「${label}」が出る`);

/** 資格情報を打ち込んで保存する (パネルを開く → 打つ → 保存)。 */
async function saveCredential(c: HTMLElement, openWith: string): Promise<void> {
  await press(c, openWith);
  const input = await waitForElement(
    () => c.querySelector('input[type=password]') as HTMLInputElement | null,
    '資格情報の入力欄',
  );
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, `ghp_${'x'.repeat(30)}`);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await press(c, '保存');
}

describe('資格情報の札と逃げ口は、保管層と同じことを言う', () => {
  it('★ 保存した直後、札は「登録済み」に変わる (直す前は未登録の札のままだった)', async () => {
    const { store, hub } = fakeHub([]);
    const { container, root } = mountInto(hub);
    await act(async () => {
      root.render(createElement(GithubPage));
    });
    await waitForLabel(container, UNCONFIGURED_LABEL);

    await saveCredential(container, UNCONFIGURED_LABEL);
    await waitForLabel(container, CONFIGURED_LABEL);

    expect(store()).toEqual(['github']); // 保管層には入った
    expect(labels(container)).not.toContain(UNCONFIGURED_LABEL);
    root.unmount();
    container.remove();
  });

  it('★ 保存した直後、その画面から消せる (逃げ口が閉じない)', async () => {
    const { hub } = fakeHub([]);
    const { container, root } = mountInto(hub);
    await act(async () => {
      root.render(createElement(GithubPage));
    });
    await waitForLabel(container, UNCONFIGURED_LABEL);
    await saveCredential(container, UNCONFIGURED_LABEL);

    // 打ち込んだ直後に「やっぱり消したい」人が、この画面で消せること。
    await press(container, CONFIGURED_LABEL);
    await waitForLabel(container, '削除');
    root.unmount();
    container.remove();
  });

  it('★ 削除した直後、札は「未登録」に戻る (直す前は登録済みの札のままだった)', async () => {
    const { store, hub } = fakeHub(['github']);
    const { container, root } = mountInto(hub);
    await act(async () => {
      root.render(createElement(GithubPage));
    });
    await waitForLabel(container, CONFIGURED_LABEL);

    await press(container, CONFIGURED_LABEL);
    await press(container, '削除');
    await waitForLabel(container, UNCONFIGURED_LABEL);

    expect(store()).toEqual([]); // 保管層から消えた
    expect(labels(container)).not.toContain(CONFIGURED_LABEL);
    root.unmount();
    container.remove();
  });

  it('★ ブラウザ認証のボタンも同じ判定を読む (保存すると「再認証」に変わる)', async () => {
    const { hub } = fakeHub([], { oauth: true });
    const { container, root } = mountInto(hub);
    await act(async () => {
      root.render(createElement(GithubPage));
    });
    await waitForLabel(container, 'ブラウザで認証');

    await saveCredential(container, UNCONFIGURED_LABEL);
    await waitForLabel(container, '再認証 (ブラウザ)');
    expect(labels(container)).not.toContain('ブラウザで認証');
    root.unmount();
    container.remove();
  });

  it('★ 覚えはサービスを跨がない (別の画面へ移ったら親の判定に戻る)', async () => {
    const { hub } = fakeHub([]);
    const { container, root } = mountInto(hub);
    const setup = { label: UNCONFIGURED_LABEL } as const;
    await act(async () => {
      root.render(
        createElement(StatusBar, { who: 'GitHub', serviceId: 'github', tokenSetup: setup, isConfigured: false }),
      );
    });
    await waitForLabel(container, UNCONFIGURED_LABEL);
    await saveCredential(container, UNCONFIGURED_LABEL);
    await waitForLabel(container, CONFIGURED_LABEL);

    // 同じ器で別のサービスを描く (サイドバーで移ったときの姿)。
    await act(async () => {
      root.render(
        createElement(StatusBar, { who: 'Slack', serviceId: 'slack', tokenSetup: setup, isConfigured: false }),
      );
    });
    await waitForLabel(container, UNCONFIGURED_LABEL);
    expect(labels(container)).not.toContain(CONFIGURED_LABEL);
    root.unmount();
    container.remove();
  });

  it('★ この画面の「削除」が唯一の逃げ口である (設定画面の掃除の節は出さない)', () => {
    // 掃除の節が並べるのは**読み手のいない**資格情報だけ。github は読み手が
    // 居る (`fetch`) ので、そこには 1 度も出ない —— だから上の 2 件目が要る。
    expect(credentialUseOf('github')).not.toBe('none');
    expect(unusedStoredCredentials(['github'])).toEqual([]);
    // 針が的に当たることの標本: 読み手のいないサービスなら掃除の節に出る。
    const orphan = (['asana', 'discord', 'dropbox', 'line'] as const).find(
      (id) => credentialUseOf(id) === 'none',
    );
    expect(orphan, '読み手のいないサービスが 1 つも無い (走査が空虚)').toBeTruthy();
    expect(unusedStoredCredentials([orphan!])).toEqual([orphan]);
  });
});
