/** @vitest-environment jsdom */
/**
 * **ライブラリ (書き出したファイルの実体) が読めないとき、「0 件」と言わない。**
 *
 * 業務レコード側は入口 (`useCollection`) で報せるようにした (2026-09-06)。
 * **同じ端末の同じ容量を分け合っている blob ストアは、まだ同じ形のまま**だった:
 *
 *   `refresh()`  … `useEffect(() => { refresh(); }, [])` で投げっぱなし。読めなければ
 *                  `items` は `[]` のままで、見出しは「ライブラリ · 0 件 / 0 B」——
 *                  **書き出した書類が 1 つも無いのと区別が付かない**
 *   `remove` / `clear` … 断られても文言が出ない (「削除しました」は出ないが理由も出ない)
 *   `get`        … 拒否が宙に浮く。押しても何も起きない
 *
 * ここで留めるのは「どの操作が、どの主語で報せるか」と、
 * **「消えている」と「読めない」を混ぜないこと** (打ち手が違う)。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const h = vi.hoisted(() => ({
  /** 失敗させる操作名。テストごとに入れ替える。 */
  failOn: new Set<string>(),
  items: [] as { id: string; serviceId: string; filename: string; mime: string; size: number; createdAt: number }[],
  /** 中身が取り出せない控えの id (パス 193)。 */
  corrupt: new Set<string>(),
}));

vi.mock('../../library/library', () => {
  function boom(op: string): void {
    if (!h.failOn.has(op)) return;
    const e = new Error('device refused');
    e.name = 'QuotaExceededError';
    throw e;
  }
  const lib = {
    async list() {
      boom('list');
      return h.items;
    },
    // `get()` は 2026-09-13 (パス 193) から 3 択を返す。**代役も同じ契約を名乗る** ——
    // ここが古い `null` を返していると、画面の側だけを直しても検査が通る
    // (契約を変えたとき、このファイルは実際に鳴った)。
    async get(id: string) {
      boom('get');
      const meta = h.items.find((i) => i.id === id);
      if (meta === undefined) return { kind: 'missing' as const };
      if (h.corrupt.has(id)) return { kind: 'corrupt' as const, meta };
      return {
        kind: 'found' as const,
        item: { ...meta, blob: new Blob(['x'], { type: meta.mime }) },
      };
    },
    async remove(id: string) {
      boom('remove');
      h.items = h.items.filter((i) => i.id !== id);
    },
    async clear() {
      boom('clear');
      h.items = [];
    },
    async put() {
      boom('put');
      return h.items[0];
    },
    async totalBytes() {
      return h.items.reduce((a, i) => a + i.size, 0);
    },
  };
  return { getLibrary: () => lib };
});

import { LibraryPage } from '../LibraryPage';
import {
  _resetDeviceStoreFailureForTests,
  currentDeviceStoreFailure,
} from '../../data/deviceStoreFailure';

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    openExternal: () => Promise.resolve(),
    listConfigured: () => Promise.resolve([]),
  };
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:x';
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  // 削除は confirm を通る。
  vi.stubGlobal('confirm', () => true);
});

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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(LibraryPage));
  });
  await settle();
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el, 'button missing').toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const buttonWith = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  h.failOn.clear();
  h.corrupt.clear();
  h.items = [
    { id: 'f1', serviceId: 'templates', filename: '提案書.svg', mime: 'image/svg+xml', size: 1024, createdAt: 1 },
  ];
  _resetDeviceStoreFailureForTests();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  container.remove();
  _resetDeviceStoreFailureForTests();
});

describe('ライブラリが読めないとき', () => {
  it('★ 一覧が読めなければ files / read として報せる (0 件と言い切らない)', async () => {
    h.failOn.add('list');
    await mount();
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('files');
    expect(f?.op).toBe('read');
    expect(f?.where).toBe('library');
    expect(f?.message).toContain('この端末に保存したファイルを読めませんでした');
    expect(f?.message).toContain('一覧が 0 件でも、ファイルが消えたとは限りません');
  });

  it('★ 読めなかった回は、前に読めた一覧を空に置き換えない', async () => {
    await mount();
    expect(container.textContent).toContain('提案書.svg');
    h.failOn.add('list');
    await click(buttonWith('更新'));
    // 出ているのは前回読めた一覧。報せは別に出る。
    expect(container.textContent).toContain('提案書.svg');
    expect(currentDeviceStoreFailure()?.op).toBe('read');
  });

  it('★ 1 件が読めないのを「見つかりません」と混ぜない (打ち手が違う)', async () => {
    await mount();
    h.failOn.add('get');
    await click(buttonWith('開く'));
    expect(currentDeviceStoreFailure()?.op).toBe('read');
    expect(container.textContent).not.toContain('ファイルが見つかりません');
  });

  it('対照: 消えている 1 件は「見つかりません」と言い、報せは出さない', async () => {
    await mount();
    h.items = []; // 別のタブで消された
    await click(buttonWith('開く'));
    expect(container.textContent).toContain('ファイルが見つかりません');
    expect(currentDeviceStoreFailure()).toBeNull();
  });
});

describe('ライブラリから消せないとき', () => {
  it('★ 1 件の削除が断られたら files / delete として報せ、「削除しました」と言わない', async () => {
    await mount();
    h.failOn.add('remove');
    await click(buttonWith('削除'));
    const f = currentDeviceStoreFailure();
    expect(f?.store).toBe('files');
    expect(f?.op).toBe('delete');
    expect(f?.message).toContain('この端末からファイルを削除できませんでした');
    expect(f?.message).toContain('一覧はそのままです');
    expect(container.textContent).not.toContain('削除しました');
    // 消えていないので行は残る。
    expect(container.textContent).toContain('提案書.svg');
  });

  it('★ 全件削除が断られても同じ (files / delete)', async () => {
    await mount();
    h.failOn.add('clear');
    await click(buttonWith('全て削除'));
    expect(currentDeviceStoreFailure()?.op).toBe('delete');
    expect(container.textContent).not.toContain('全て削除しました');
  });

  it('対照: 消せる端末では「削除しました」が出て行が消え、報せは出ない', async () => {
    await mount();
    await click(buttonWith('削除'));
    expect(container.textContent).toContain('削除しました');
    expect(container.textContent).not.toContain('提案書.svg');
    expect(currentDeviceStoreFailure()).toBeNull();
  });
});

/*
 * **「ダウンロード」は、どちらのハーネスでも 1 度も押されていなかった** (2026-09-13 ・ パス 193)。
 *
 * e2e は「開く」を実ブラウザで押して data: URL の `<img>` まで見ていたが、
 * 隣の「ダウンロード」は jsdom でも実ブラウザでも押されていなかった。
 * そしてその関数には**失敗の道が 1 本も無かった** —— `preview` は全段を
 * `.catch` で受けて文を出すのに、`download` は投げっぱなしで、async の
 * onClick から呼ばれるので**拒否は未処理のまま消え、画面は何も変わらない**。
 *
 * このファイルは `URL.createObjectURL` を差し替えているので、**成功の道と
 * ブラウザが断った道の両方をここで押せる**。
 */
describe('ライブラリ — ダウンロードを押す', () => {
  it('★ 読める控えならダウンロードが始まる (リンクを組んで押す)', async () => {
    const created: string[] = [];
    const clicked: { href: string; download: string }[] = [];
    const origCreate = (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
      created.push('blob:dl');
      return 'blob:dl';
    };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    };
    try {
      await mount();
      await click(buttonWith('ダウンロード'));
    } finally {
      (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    expect(created, 'blob の URL を作っていない').toHaveLength(1);
    expect(clicked, '★ ダウンロードのリンクを押していません').toHaveLength(1);
    // 保存名は控えの名前 (ブラウザが付ける乱数の名ではない)。
    expect(clicked[0]!.download).toBe('提案書.svg');
    expect(currentDeviceStoreFailure(), '成功したのに報せが出ている').toBeNull();
    // 残留しない: 押せた後に断りの文が出ていない。
    expect(container.textContent).not.toContain('ダウンロードを開始できません');
  });

  it('★ ブラウザが断ったらそう言う (無反応で終わらない)', async () => {
    const origCreate = (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
      throw new TypeError('refused');
    };
    try {
      await mount();
      await click(buttonWith('ダウンロード'));
    } finally {
      (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = origCreate;
    }
    expect(
      container.textContent,
      '★ ブラウザが断っても画面は何も言いませんでした',
    ).toContain('ダウンロードを開始できません');
  });

  it('★ 中身が取り出せない控えは、名指して削除を促す', async () => {
    h.corrupt.add('f1');
    await mount();
    await click(buttonWith('ダウンロード'));
    const t = container.textContent ?? '';
    expect(t).toContain('中身が取り出せません');
    expect(t).toContain('提案書.svg');
    expect(t).toContain('削除');
    // 「無い」とは言わない (打ち手が違う)。
    expect(t).not.toContain('ファイルが見つかりません');
    // 保管層の失敗ではないので、端末の報せは出ない。
    expect(currentDeviceStoreFailure()).toBeNull();
  });
});
