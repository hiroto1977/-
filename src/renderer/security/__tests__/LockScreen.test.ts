/** @vitest-environment jsdom */
/**
 * LockScreen — ボールトの解錠画面。
 *
 * 2026-08-22 の点検で見つけた形: このファイルは**完全性チェーンの保護対象**
 * なのに、検査が一本もありませんでした (保護対象 11 ファイル中、唯一)。
 * `secrets.ts` と `shellOpenGate.ts` で見つけたのと同じ「守りは書いてあるが、
 * 守れているかを誰も見ていない」形です。
 *
 * ここで押さえるのは、画面がマスターパスワードとリカバリーキーをどう扱うか:
 *   - 平文で見せない / ブラウザに拾わせる形を間違えない
 *   - 解錠できていないのに先へ通さない
 *   - 失敗の知らせに入力そのものを混ぜない
 *   - 取り消せない操作 (完全初期化) は、同意なしに走らない
 *   - 一度きりのリカバリーキーは、記録を確認するまで消えない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Vault のモック --------------------------------------------------------
const MNEMONIC_24 =
  'abandon ability able about above absent absorb abstract absurd abuse access accident ' +
  'account accuse achieve acid acoustic acquire across act action actor actress actual';

let vaultStatus: 'uninitialized' | 'locked' | 'unlocked' = 'locked';
let unlockImpl: (pw: string) => Promise<void> = async () => {};
let initializeImpl: (pw: string) => Promise<{ mnemonic: string }> = async () => ({
  mnemonic: MNEMONIC_24,
});
let recoverImpl: (m: string, pw: string) => Promise<void> = async () => {};
const calls: { name: string; args: unknown[] }[] = [];

vi.mock('../vault', () => ({
  getVault: () => ({
    status: async () => vaultStatus,
    unlock: async (pw: string) => {
      calls.push({ name: 'unlock', args: [pw] });
      return unlockImpl(pw);
    },
    initialize: async (pw: string) => {
      calls.push({ name: 'initialize', args: [pw] });
      return initializeImpl(pw);
    },
    recoverWithMnemonic: async (m: string, pw: string) => {
      calls.push({ name: 'recoverWithMnemonic', args: [m, pw] });
      return recoverImpl(m, pw);
    },
    wipeAndReset: async () => {
      calls.push({ name: 'wipeAndReset', args: [] });
    },
  }),
}));

// --- レンダリングの足回り --------------------------------------------------
let container: HTMLDivElement;
let root: Root;
let unlocked: number;

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(): Promise<void> {
  const { LockScreen } = await import('../LockScreen');
  await act(async () => {
    root.render(createElement(LockScreen, { onUnlocked: () => (unlocked += 1) }));
  });
}

const pwInputs = (): HTMLInputElement[] =>
  [...container.querySelectorAll('input[type="password"]')] as HTMLInputElement[];
const boxes = (): HTMLInputElement[] =>
  [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
const buttons = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];
const buttonSaying = (text: string): HTMLButtonElement | undefined =>
  buttons().find((b) => (b.textContent ?? '').includes(text));
const click = async (el: Element | undefined): Promise<void> => {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  unlocked = 0;
  calls.length = 0;
  vaultStatus = 'locked';
  unlockImpl = async () => {};
  initializeImpl = async () => ({ mnemonic: MNEMONIC_24 });
  recoverImpl = async () => {};
  vi.resetModules();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('マスターパスワードの入力欄', () => {
  it('平文で見せない (type=password)', async () => {
    await mount();
    const inputs = pwInputs();
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(i.type).toBe('password');
    // 解錠時は 1 つだけ (確認欄は初回設定のときだけ出す)。
    expect(inputs).toHaveLength(1);
  });

  it('ブラウザ / パスワード管理に「既存の」パスワードとして伝える', async () => {
    await mount();
    expect(pwInputs()[0]!.getAttribute('autocomplete')).toBe('current-password');
  });

  it('初回設定では確認欄を出し、両方とも「新しい」パスワードとして伝える', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    const inputs = pwInputs();
    expect(inputs).toHaveLength(2);
    expect(inputs[0]!.getAttribute('autocomplete')).toBe('current-password');
    expect(inputs[1]!.getAttribute('autocomplete')).toBe('new-password');
  });

  it('空のままでは解錠ボタンを押せない', async () => {
    await mount();
    expect(buttonSaying('ロック解除')!.disabled).toBe(true);
    typeInto(pwInputs()[0]!, 'a');
    await act(async () => {});
    expect(buttonSaying('ロック解除')!.disabled).toBe(false);
  });
});

describe('解錠', () => {
  it('正しければ先へ通し、入力欄からパスワードを消す', async () => {
    await mount();
    typeInto(pwInputs()[0]!, 'correct horse battery staple');
    await click(buttonSaying('ロック解除'));
    expect(unlocked).toBe(1);
    expect(calls).toEqual([{ name: 'unlock', args: ['correct horse battery staple'] }]);
  });

  it('間違っていれば先へ通さない', async () => {
    unlockImpl = async () => {
      throw new Error('パスワードが違います');
    };
    await mount();
    typeInto(pwInputs()[0]!, 'wrong-password-value');
    await click(buttonSaying('ロック解除'));
    expect(unlocked).toBe(0);
    expect(container.textContent).toContain('パスワードが違います');
  });

  it('失敗の知らせに入力そのものを混ぜない', async () => {
    // 失敗の理由をそのまま画面へ出す作りなので、Vault 側が入力を含む文言を
    // 投げた瞬間に、肩越しに見える場所へパスワードが出る。ここで固定しておく。
    unlockImpl = async () => {
      throw new Error('パスワードが違います');
    };
    await mount();
    typeInto(pwInputs()[0]!, 'S3cret-Master-Pass');
    await click(buttonSaying('ロック解除'));
    // 画面に**文字として**出ていないことを見る。入力欄の `value` に残るのは
    // 正しい (打ち間違いを直せる必要があり、`type=password` で伏せてある)。
    // 見てはいけないのは、伏せられていない場所へ出ることのほう。
    expect(container.textContent).not.toContain('S3cret-Master-Pass');
    const shown = [...container.querySelectorAll('div')].map((d) => d.textContent ?? '');
    for (const t of shown) expect(t).not.toContain('S3cret-Master-Pass');
  });

  it('Enter でも解錠できる', async () => {
    await mount();
    const input = pwInputs()[0]!;
    typeInto(input, 'pw-via-enter-key');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(calls.map((c) => c.name)).toEqual(['unlock']);
  });
});

describe('初回設定', () => {
  it('確認欄と一致しなければ初期化しない', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'first-password-value');
    typeInto(pwInputs()[1]!, 'different-value-here');
    await click(buttonSaying('パスワードを設定して開始'));
    expect(calls).toEqual([]);
    expect(unlocked).toBe(0);
    expect(container.textContent).toContain('パスワードが一致しません');
  });

  it('一致すれば初期化し、リカバリーキーを見せる (まだ先へ通さない)', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    await click(buttonSaying('パスワードを設定して開始'));
    expect(calls).toEqual([{ name: 'initialize', args: ['matching-password-01'] }]);
    // 記録する前に先へ通すと、二度と見られない鍵を取り逃がす。
    expect(unlocked).toBe(0);
    expect(container.textContent).toContain('abandon');
  });

  it('記録を確認するまで開始ボタンは押せない', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    await click(buttonSaying('パスワードを設定して開始'));

    const start = buttonSaying('記録完了')!;
    expect(start.disabled).toBe(true);
    await click(boxes()[0]);
    expect(buttonSaying('記録完了')!.disabled).toBe(false);
  });

  it('記録を確認したらリカバリーキーを画面から消して先へ通す', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    await click(buttonSaying('パスワードを設定して開始'));
    await click(boxes()[0]);
    await click(buttonSaying('記録完了'));

    expect(unlocked).toBe(1);
    expect(container.textContent).not.toContain('abandon');
  });
});

describe('完全初期化 — 取り消せない操作', () => {
  async function openReset(): Promise<void> {
    await mount();
    await click(buttonSaying('初期化して最初からやり直す'));
  }

  it('同意していなければ実行できない', async () => {
    await openReset();
    const go = buttonSaying('全て消去して初回設定に戻る')!;
    expect(go.disabled).toBe(true);
    await click(go);
    expect(calls).toEqual([]);
  });

  it('同意して初めて実行できる', async () => {
    await openReset();
    await click(boxes()[0]);
    expect(buttonSaying('全て消去して初回設定に戻る')!.disabled).toBe(false);
  });

  it('画面を離れると同意は外れる (戻ってきて誤爆しない)', async () => {
    await openReset();
    await click(boxes()[0]);
    expect(boxes()[0]!.checked).toBe(true);
    await click(buttonSaying('戻る（初期化しない）'));
    await click(buttonSaying('初期化して最初からやり直す'));
    expect(boxes()[0]!.checked).toBe(false);
  });
});

describe('リカバリー — パスワードを忘れた場合', () => {
  async function openRecovery(): Promise<void> {
    await mount();
    await click(buttonSaying('リカバリーキーで復元'));
  }

  it('24 語になっていないリカバリーキーでは Vault を触らない', async () => {
    await openRecovery();
    const areas = [...container.querySelectorAll('textarea')] as HTMLTextAreaElement[];
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(areas[0]!, 'abandon ability able');
    areas[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    for (const i of pwInputs()) typeInto(i, 'new-password-value-1');
    await click(buttonSaying('復元'));
    expect(calls).toEqual([]);
    expect(container.textContent).toContain('24 個の英単語');
  });

  it('新しいパスワードが一致しなければ Vault を触らない', async () => {
    await openRecovery();
    const areas = [...container.querySelectorAll('textarea')] as HTMLTextAreaElement[];
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(areas[0]!, MNEMONIC_24);
    areas[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    const inputs = pwInputs();
    typeInto(inputs[0]!, 'new-password-value-1');
    typeInto(inputs[1]!, 'new-password-value-2');
    await click(buttonSaying('復元'));
    expect(calls).toEqual([]);
    expect(container.textContent).toContain('一致しません');
  });

  it('リカバリー画面のパスワード欄も平文で見せない', async () => {
    await openRecovery();
    const inputs = pwInputs();
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i.type).toBe('password');
      expect(i.getAttribute('autocomplete')).toBe('new-password');
    }
  });
});

describe('リカバリーキーのクリップボード — 置きっぱなしにしない', () => {
  /** 初回設定を通してリカバリーキー表示まで進める。 */
  async function toMnemonicView(): Promise<void> {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    await click(buttonSaying('パスワードを設定して開始'));
  }

  /** jsdom には navigator.clipboard が無いので差し替える。 */
  function stubClipboard(initial = '') {
    let text = initial;
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (v: string) => {
          text = v;
          writes.push(v);
        },
        readText: async () => text,
      },
    });
    return { writes, get: () => text, set: (v: string) => (text = v) };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('コピーするとリカバリーキーが載り、30 秒後に消える', async () => {
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    expect(clip.get()).toBe(MNEMONIC_24);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {});
    expect(clip.get()).toBe('');
  });

  it('30 秒より前には消さない', async () => {
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    await act(async () => {
      vi.advanceTimersByTime(29_999);
    });
    await act(async () => {});
    expect(clip.get()).toBe(MNEMONIC_24);
  });

  it('利用者が別のものをコピーしていたら、それを消さない', async () => {
    // 自動消去が「今の中身が何であれ空にする」だと、30 秒のあいだに利用者が
    // コピーした別の内容 (別のパスワード等) を巻き添えで消す。
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    clip.set('ユーザーが後からコピーした別の何か');

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {});
    expect(clip.get()).toBe('ユーザーが後からコピーした別の何か');
  });

  it('もう一度コピーしたら 30 秒を数え直す (先の予約で早く消えない)', async () => {
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await click(buttonSaying('コピー'));
    // 1 回目の予約が生きていると、ここ (通算 30 秒) で消えてしまう。
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await act(async () => {});
    expect(clip.get()).toBe(MNEMONIC_24);
  });

  it('画面を離れたあとも、約束どおり 30 秒で消える', async () => {
    // 画面には「30 秒後にクリップボードを自動消去」と出る。ところが利用者は
    // コピーしたらすぐ「記録完了」を押して先へ進む — つまり **ほぼ必ず**
    // 30 秒を待たずにこの画面を離れる。離れた時点で予約を取り消していると、
    // 24 語のリカバリーキーがクリップボードに残り続ける。
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    await act(async () => root.unmount());

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    await act(async () => {});
    expect(clip.get()).toBe('');
    root = createRoot(container);
  });

  it('画面を離れたあとでも、利用者が別のものをコピーしていれば消さない', async () => {
    const clip = stubClipboard();
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    await act(async () => root.unmount());
    clip.set('別の内容');

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {});
    expect(clip.get()).toBe('別の内容');
    root = createRoot(container);
  });

  it('コピーに失敗しても落ちず、手で写すよう案内する', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('permission denied');
        },
        readText: async () => '',
      },
    });
    await toMnemonicView();
    await click(buttonSaying('コピー'));
    expect(container.textContent).toContain('手動で選択');
  });
});
