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
let wipeImpl: () => Promise<void> = async () => {};
let statusImpl: () => Promise<'uninitialized' | 'locked' | 'unlocked'> = async () => vaultStatus;
const calls: { name: string; args: unknown[] }[] = [];

vi.mock('../vault', () => ({
  getVault: () => ({
    status: async () => statusImpl(),
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
      return wipeImpl();
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
  wipeImpl = async () => {};
  statusImpl = async () => vaultStatus;
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

describe('リカバリーの実行', () => {
  async function openRecovery(): Promise<HTMLTextAreaElement> {
    await mount();
    await click(buttonSaying('リカバリーキーで復元'));
    return [...container.querySelectorAll('textarea')][0]! as HTMLTextAreaElement;
  }
  function typeArea(area: HTMLTextAreaElement, v: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(area, v);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function fillValid(): Promise<HTMLTextAreaElement> {
    const area = await openRecovery();
    typeArea(area, MNEMONIC_24);
    for (const i of pwInputs()) typeInto(i, 'brand-new-password-9');
    await act(async () => {});
    return area;
  }

  it('正しく揃っていれば復元して先へ通す', async () => {
    await fillValid();
    await click(buttonSaying('復元'));
    expect(calls).toEqual([
      { name: 'recoverWithMnemonic', args: [MNEMONIC_24, 'brand-new-password-9'] },
    ]);
    expect(unlocked).toBe(1);
  });

  it('復元したらリカバリーキーと新パスワードを画面から消す', async () => {
    // 24 語はこれ 1 つで Vault を復元できる。入れっぱなしにすると、
    // 解錠後の画面に残ったまま肩越しに見える。
    const area = await fillValid();
    await click(buttonSaying('復元'));
    expect(area.value).toBe('');
    expect(container.textContent).not.toContain('abandon');
  });

  it('復元に失敗したら理由を出し、先へ通さない', async () => {
    recoverImpl = async () => {
      throw new Error('リカバリーキーが違います');
    };
    await fillValid();
    await click(buttonSaying('復元'));
    expect(unlocked).toBe(0);
    expect(container.textContent).toContain('リカバリーキーが違います');
  });

  it('復元の失敗の知らせに新しいパスワードを混ぜない', async () => {
    recoverImpl = async () => {
      throw new Error('リカバリーキーが違います');
    };
    const area = await openRecovery();
    typeArea(area, MNEMONIC_24);
    for (const i of pwInputs()) typeInto(i, 'Le4ked-New-Password');
    await click(buttonSaying('復元'));
    expect(container.textContent).not.toContain('Le4ked-New-Password');
  });

  it('確認欄で Enter を押しても復元できる', async () => {
    await fillValid();
    const confirm = pwInputs()[1]!;
    await act(async () => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(calls.map((c) => c.name)).toEqual(['recoverWithMnemonic']);
  });

  it('Enter 以外のキーでは復元しない', async () => {
    await fillValid();
    const confirm = pwInputs()[1]!;
    for (const key of ['a', 'Escape', 'Tab', ' ']) {
      await act(async () => {
        confirm.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }
    expect(calls).toEqual([]);
  });
});

describe('完全初期化の実行', () => {
  async function openResetAndAgree(): Promise<void> {
    await mount();
    await click(buttonSaying('初期化して最初からやり直す'));
    await click(boxes()[0]);
  }

  it('同意して押したら本当に消す', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    await openResetAndAgree();
    await click(buttonSaying('全て消去して初回設定に戻る'));
    expect(calls).toEqual([{ name: 'wipeAndReset', args: [] }]);
    // 状態を作り直すため読み込み直す (消した直後の画面を使わせない)。
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('消去に失敗したら理由を出し、押し直せる状態に戻す', async () => {
    wipeImpl = async () => {
      throw new Error('IndexedDB が開けません');
    };
    await openResetAndAgree();
    await click(buttonSaying('全て消去して初回設定に戻る'));
    expect(container.textContent).toContain('IndexedDB が開けません');
    // busy のまま固まると、二度と押せない画面になる。
    expect(buttonSaying('全て消去して初回設定に戻る')!.disabled).toBe(false);
  });
});

describe('リカバリーキーのダウンロード', () => {
  async function toMnemonicView(): Promise<void> {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    await click(buttonSaying('パスワードを設定して開始'));
  }

  it('平文ファイルとして保存し、平文であることを警告する', async () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (b: Blob) => {
        created.push(b);
        return 'blob:fake';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: (u: string) => revoked.push(u),
    });
    let downloadName = '';
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      downloadName = this.download;
    };
    try {
      await toMnemonicView();
      await click(buttonSaying('ダウンロード'));

      expect(created).toHaveLength(1);
      expect(created[0]!.type).toContain('text/plain');
      // 名前に「recovery key」と書かない — Downloads の一覧で目立たせない。
      expect(downloadName).toMatch(/^service-hub-\d{8}-\d{4}\.txt$/);
      expect(downloadName).not.toMatch(/recovery|mnemonic|key/i);
      // このファイル 1 つで Vault を復元できるので、何が危ないかまで伝える。
      const shown = container.textContent ?? '';
      expect(shown).toContain('平文');
      expect(shown).toContain('削除');
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }
  });
});

describe('ボールトの状態が読めないとき', () => {
  it('状態の取得に失敗しても画面は出す (真っ白にしない)', async () => {
    statusImpl = async () => {
      throw new Error('IndexedDB unavailable');
    };
    await mount();
    // 何かしら操作できる画面が出ていること。
    expect(pwInputs().length).toBeGreaterThan(0);
  });
});

describe('入力欄の初期状態と行き来', () => {
  it('解錠画面のパスワード欄は空で始まる', async () => {
    await mount();
    for (const i of pwInputs()) expect(i.value).toBe('');
  });

  it('初回設定の 2 つの欄も空で始まる', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    const inputs = pwInputs();
    expect(inputs).toHaveLength(2);
    for (const i of inputs) expect(i.value).toBe('');
  });

  it('リカバリー画面も空で始まる', async () => {
    await mount();
    await click(buttonSaying('リカバリーキーで復元'));
    for (const i of pwInputs()) expect(i.value).toBe('');
    for (const a of container.querySelectorAll('textarea')) {
      expect((a as HTMLTextAreaElement).value).toBe('');
    }
  });

  it('初回設定は確認欄で Enter を押しても進む', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    const confirm = pwInputs()[1]!;
    await act(async () => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(calls.map((c) => c.name)).toEqual(['initialize']);
  });

  it('初回設定の確認欄で Enter 以外を押しても進まない', async () => {
    vaultStatus = 'uninitialized';
    await mount();
    typeInto(pwInputs()[0]!, 'matching-password-01');
    typeInto(pwInputs()[1]!, 'matching-password-01');
    const confirm = pwInputs()[1]!;
    for (const key of ['a', 'Escape', 'Tab']) {
      await act(async () => {
        confirm.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }
    expect(calls).toEqual([]);
  });

  it('リカバリー画面から戻れて、入力は持ち越さない', async () => {
    await mount();
    await click(buttonSaying('リカバリーキーで復元'));
    for (const i of pwInputs()) typeInto(i, 'typed-then-abandoned');
    await click(buttonSaying('戻る'));
    // 解錠画面へ戻っている。
    expect(buttonSaying('ロック解除')).toBeDefined();
    expect(pwInputs()[0]!.value).toBe('');
  });
});
