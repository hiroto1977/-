/** @vitest-environment jsdom */
/**
 * `useLatestForm` —— 最新の 1 件を採用する設定の欄 (2026-09-28 · パス 500)。
 *
 * 約束は 4 つ (実測と理由は `data/useLatestForm.ts` の docblock):
 *  1. 保管層が答えるまで欄を出さない (`ready`)。答えたら保存値から開く。
 *  2. 触っていない欄は最新に付いていく / 触った欄は付いていかない。
 *  3. 保存は欄の元がまだ最新のときだけ。違えば書かずに断り、入力を残し、元を今の最新へ移す。
 *  4. 保存されている内容から始め直せる (`loadSaved`)。
 *
 * 「別のタブ」は保管層へ直接書いて作る (知らせは同じタブに届くので、付いていく側はそれで測れる)。
 * 付いていかない側 (触った欄) と断る側は、知らせが届いても欄を開き直さないことを見る。
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getRecordStore } from '../store';
import { _resetCollectionSubscribersForTests } from '../useCollection';
import { useLatestForm, type LatestForm } from '../useLatestForm';
import { resetRecordStore } from '../../__tests__/recordStoreHarness';
import { settleUntil } from '../../__tests__/jsdomWait';
import { latestRecord } from '../latestRecord';

const C = 'highlight-settings';
type Saved = { declineWarnStreak: number; laborShareWarnPct: number };
type Form = { warn: string; labor: string };
const toForm = (s: Saved | null): Form => ({ warn: String(s?.declineWarnStreak ?? 2), labor: String(s?.laborShareWarnPct ?? 60) });

let container: HTMLDivElement;
let root: Root | null = null;
const ref: { current: LatestForm<Saved, Form> } = { current: null as unknown as LatestForm<Saved, Form> };
const releases: (() => void)[] = [];

function Harness() {
  ref.current = useLatestForm<Saved, Form>(C, toForm);
  return null;
}

beforeEach(async () => {
  await resetRecordStore();
  _resetCollectionSubscribersForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  for (const r of releases.splice(0)) r();
  vi.restoreAllMocks();
  if (root) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

/** 最初の `list` だけを門の後ろで待たせる (一覧が届く前の窓を、時刻ではなく門で作る)。 */
function holdFirstList(): void {
  const store = getRecordStore();
  const original = store.list.bind(store);
  let held = false;
  let open: () => void = () => {};
  const gate = new Promise<void>((r) => {
    open = r;
  });
  releases.push(() => open());
  vi.spyOn(store, 'list').mockImplementation((async (c: string) => {
    if (c === C && !held) {
      held = true;
      await gate;
    }
    return original(c);
  }) as typeof store.list);
}

async function mount(): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Harness));
  });
}

async function latestNow(): Promise<Saved | undefined> {
  return latestRecord(await getRecordStore().list<Saved>(C))?.data;
}

describe('useLatestForm —— 保管層が答えるまで欄を出さない', () => {
  it('★ 答える前は ready でなく、答えたら保存値から開く (既定値では開かない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    holdFirstList();
    await mount();
    expect(ref.current.ready, '保管層が答える前に欄を出している').toBe(false);
    for (const r of releases.splice(0)) r();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    expect(ref.current.form).toEqual({ warn: '5', labor: '70' });
    expect(ref.current.dirty).toBe(false);
    expect(ref.current.changed).toBe(false);
    expect(ref.current.base?.data).toEqual({ declineWarnStreak: 5, laborShareWarnPct: 70 });
  });

  /*
   * 答える前の器は何も主張しない —— `dirty` と `changed` は画面が断り (「開いた後に保存し直されて
   * いました」) を出すかを決めるのに読む値で、答える前に `changed` が立っていれば、何も保存していない
   * 利用者に断りを見せる。答えた時の合わせが両方を倒すので**答えた後**の検査では見えない (変異検査の
   * 生存 2 件 —— 初期値を反転しても 15 件すべて緑だった · パス 500)。
   */
  it('★ 答える前の器は、触った印も断った印も立っていない (答える前に断りを出させない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    holdFirstList();
    await mount();
    expect(ref.current.ready).toBe(false);
    expect(ref.current.dirty, '答える前から「触った」ことになっている').toBe(false);
    expect(ref.current.changed, '答える前から「保存し直されていた」と断ることになっている').toBe(false);
    expect(ref.current.base).toBeNull();
    expect(ref.current.latest).toBeNull();
  });

  it('何も保存されていなければ、答えた時点で既定値から開き、元は null', async () => {
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    expect(ref.current.form).toEqual({ warn: '2', labor: '60' });
    expect(ref.current.base).toBeNull();
  });
});

describe('useLatestForm —— 触っていない欄は最新に付いていく', () => {
  it('★ 別の画面の保存が届くと、触っていない欄は開き直す', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 6, laborShareWarnPct: 71 });
    });
    await settleUntil(() => ref.current.form.warn === '6', '触っていない欄が最新に付いていく');
    expect(ref.current.form).toEqual({ warn: '6', labor: '71' });
  });

  it('★ 触った欄は、別の画面の保存が届いても開き直さない (打ち込んだ値を捨てない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 6, laborShareWarnPct: 71 });
    });
    await settleUntil(() => ref.current.latest?.data.declineWarnStreak === 6, '別の画面の保存が届く');
    expect(ref.current.form, '触った欄を開き直した').toEqual({ warn: '5', labor: '75' });
    expect(ref.current.dirty).toBe(true);
  });
});

describe('useLatestForm —— 付いていく先は「最新の行の版」', () => {
  it('★ 何も保存されていないまま開いた欄は、別の画面の最初の保存に付いていく', async () => {
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    expect(ref.current.base).toBeNull();
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 4, laborShareWarnPct: 64 });
    });
    await settleUntil(() => ref.current.form.warn === '4', '最初の保存に付いていく');
    expect(ref.current.base?.data).toEqual({ declineWarnStreak: 4, laborShareWarnPct: 64 });
  });

  it('★ 同じ行が書き換えられた (id は同じ・updatedAt が違う) ときも付いていく', async () => {
    const rec = await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      await getRecordStore().update(rec.id, { laborShareWarnPct: 88 });
    });
    await settleUntil(() => ref.current.form.labor === '88', '書き換えに付いていく');
    expect(ref.current.base?.id).toBe(rec.id);
  });
});

describe('useLatestForm —— 保存は欄の元がまだ最新のときだけ', () => {
  it('★ 元のままなら書き、書いた行が新しい元になる (触った印は落ちる)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    let ok = false;
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    });
    expect(ok).toBe(true);
    expect(await latestNow()).toEqual({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    expect(ref.current.dirty).toBe(false);
    expect(ref.current.base?.data).toEqual({ declineWarnStreak: 5, laborShareWarnPct: 75 });
  });

  it('★ 欄を開いた後に別の画面が保存していたら、書かずに断り、入力を残し、元を今の最新へ移す', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 9, laborShareWarnPct: 71 }); // 別のタブ
    });
    let ok = true;
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    });
    expect(ok).toBe(false);
    expect(await latestNow(), '別の画面の保存を古い欄で覆った').toEqual({ declineWarnStreak: 9, laborShareWarnPct: 71 });
    expect(ref.current.changed).toBe(true);
    expect(ref.current.form, '断ったのに入力を捨てた').toEqual({ warn: '5', labor: '75' });
    expect(ref.current.base?.data).toEqual({ declineWarnStreak: 9, laborShareWarnPct: 71 });
    // もう一度押す —— 知ったうえで上書きする。
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    });
    expect(ok).toBe(true);
    expect(await latestNow()).toEqual({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    expect(ref.current.changed).toBe(false);
  });

  it('★ 断った後は、触っていなかった欄でも開き直さない (押した人は見ている値を保存すると決めている)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    // 購読を外して「知らせが届いていない別のタブ」を作る。
    _resetCollectionSubscribersForTests();
    await getRecordStore().insert(C, { declineWarnStreak: 9, laborShareWarnPct: 71 });
    let ok = true;
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 70 });
    });
    expect(ok).toBe(false);
    expect(ref.current.dirty).toBe(true);
    expect(ref.current.form).toEqual({ warn: '5', labor: '70' });
  });

  /*
   * 押した時点で欄は見ている値に決まる (`useLatestForm.ts` の docblock の 3)。対照を回すまで、この約束を
   * 留める検査は無かった —— 押した時の `dirty: true` を外しても 28 件すべて緑だった (パス 500)。上の検査は
   * 知らせが届かない形で作るので、保存の**間に**知らせが届く形を別に置く。保存は門で止め、`act` の外で
   * 走らせる (`act` の中で待つと、届いた最新の描画が保存の答えの後ろへ回り、開き直しが起きる窓が消える)。
   */
  it('★ 保存を押した後は、触っていない欄でも、保存の間に届いた最新へ開き直さない (断っても入力が入れ替わらない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    const store = getRecordStore();
    const original = store.insertIfLatest.bind(store);
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => {
      open = r;
    });
    releases.push(() => open());
    vi.spyOn(store, 'insertIfLatest').mockImplementation((async (...args: Parameters<typeof store.insertIfLatest>) => {
      await gate;
      return original(...args);
    }) as typeof store.insertIfLatest);
    let pending: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      pending = ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 70 });
    });
    // 保存の間に別の画面が保存し、知らせが届く。
    await act(async () => {
      await store.insert(C, { declineWarnStreak: 9, laborShareWarnPct: 71 });
    });
    await settleUntil(() => ref.current.latest?.data.declineWarnStreak === 9, '別の画面の保存が届く');
    expect(ref.current.form, '保存を押した後に、届いた最新へ欄を開き直した').toEqual({ warn: '5', labor: '70' });
    open();
    let ok = true;
    await act(async () => {
      ok = await pending;
    });
    expect(ok).toBe(false);
    expect(ref.current.changed).toBe(true);
    expect(ref.current.form, '「保存していません」と言いながら入力が別の値へ入れ替わった').toEqual({ warn: '5', labor: '70' });
    expect(await latestNow(), '別の画面の保存を覆った').toEqual({ declineWarnStreak: 9, laborShareWarnPct: 71 });
  });

  it('★ 保存を待つ間に打ち込まれた値は、触ったままにする (付いていく開き直しで消さない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    const store = getRecordStore();
    const original = store.insertIfLatest.bind(store);
    vi.spyOn(store, 'insertIfLatest').mockImplementation((async (...args: Parameters<typeof store.insertIfLatest>) => {
      await act(async () => {
        ref.current.update((f) => ({ ...f, warn: '8' }));
      });
      return original(...args);
    }) as typeof store.insertIfLatest);
    await act(async () => {
      await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 70 });
    });
    expect(ref.current.dirty, '保存の後に打った値が「触っていない」扱いになった').toBe(true);
    expect(ref.current.form.warn).toBe('8');
  });
});

describe('useLatestForm —— 保存されている内容から始め直す', () => {
  it('★ loadSaved は入力を捨て、今の最新から開き直す (断りも消える)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 9, laborShareWarnPct: 71 });
    });
    await act(async () => {
      await ref.current.save({ declineWarnStreak: 5, laborShareWarnPct: 75 });
    });
    expect(ref.current.changed).toBe(true);
    await act(async () => {
      ref.current.loadSaved();
    });
    expect(ref.current.form).toEqual({ warn: '9', labor: '71' });
    expect(ref.current.changed).toBe(false);
    expect(ref.current.dirty).toBe(false);
  });
});

describe('useLatestForm —— 欄とは別の書き込み (applyToLatest)', () => {
  it('change が null を返したら何も書かず declined (元も欄も動かない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    const before = ref.current.base;
    let status = '';
    await act(async () => {
      status = (await ref.current.applyToLatest(() => null)).status;
    });
    expect(status).toBe('declined');
    expect(await getRecordStore().count(C)).toBe(1);
    expect(ref.current.base).toBe(before);
  });

  it('★ 欄の元に当てて足したら、元を足した行へ進める (同じ画面の自分の書き込みで次の保存を断らない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    await act(async () => {
      await ref.current.applyToLatest((cur) => ({ ...(cur?.data as Saved), declineWarnStreak: 3 }));
    });
    let ok = false;
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 3, laborShareWarnPct: 75 });
    });
    expect(ok, '同じ画面の書き込みを別の画面の保存として断った').toBe(true);
  });

  it('★ 欄の元が既に古ければ、元は進めない (別の画面の保存を知らないまま上書きしない)', async () => {
    await getRecordStore().insert(C, { declineWarnStreak: 5, laborShareWarnPct: 70 });
    await mount();
    await settleUntil(() => ref.current.ready, '保管層が答える');
    await act(async () => {
      ref.current.update((f) => ({ ...f, labor: '75' }));
    });
    await act(async () => {
      await getRecordStore().insert(C, { declineWarnStreak: 9, laborShareWarnPct: 71 }); // 別のタブ
    });
    await act(async () => {
      await ref.current.applyToLatest((cur) => ({ ...(cur?.data as Saved), declineWarnStreak: 3 }));
    });
    let ok = true;
    await act(async () => {
      ok = await ref.current.save({ declineWarnStreak: 3, laborShareWarnPct: 75 });
    });
    expect(ok, '別の画面の保存 (人件費 71) を古い欄で覆った').toBe(false);
  });
});
