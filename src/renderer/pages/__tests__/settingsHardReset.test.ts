/** @vitest-environment jsdom */
/**
 * **「復旧不可な形で消去されます」は、消えなくても同じ顔をしていた** (2026-09-07 実測)。
 *
 * `vault.wipeAndReset` は `onsuccess` / `onerror` / **`onblocked`** のどれでも
 * 解決する (UI をハングさせないため —— その判断は正しい)。ところが呼ぶ側は
 * 解決だけを見て**無条件に** `location.reload()` していた。他のタブが
 * IndexedDB の接続を掴んでいると削除できないので、
 *
 *   - **データは残ったまま**「復旧不可な形で消去されます」と同じ画面になる
 *   - 「最初のセットアップ画面に戻ります」と書いてあるのに、戻るのは
 *     **ロック解除の画面** (保管庫はまだ初期化済みなので)
 *   - 唯一の報せは `console.warn` で、利用者には見えない。しかも 500ms 後の
 *     後追い確認は直後の reload で**タイマーごと消えていた**
 *
 * ここは実物の札を描いて、結果ごとの振る舞いを留める。**対照は成功の場面**
 * ——「消えたときは再読込する・警告は出さない」が同じ検査群の中に在るので、
 * 「警告が出ない」が空の検査にならない。
 *
 * **2026-09-09 (パス 136)**: 消すのは保管庫だけではなくなった (`eraseEverything` —— 台帳の全行)。
 * ここでは手順を差し替え、**媒体ごとの結果**で画面の振る舞いを留める: 保管庫が消えても
 * 業務レコードが残れば再読込しない・残った物を名指しする・説明は在庫を刷る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LOCK_CHANNEL, LOCK_MESSAGE } from '../../security/lockWorkspace';
import type { EraseOutcome, EraseReport } from '../../security/eraseAll';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 媒体ごとの結果から報告を組む (allDeleted は実装と同じ規則: deleted か unavailable だけが「消えた」)。 */
function reportWith(vault: EraseOutcome, data: EraseOutcome = 'deleted'): EraseReport {
  const indexeddb: Record<string, EraseOutcome> = {
    'business-hub-data': data,
    'business-hub-library': 'deleted',
    'business-hub-preferences': 'deleted',
    'business-hub-vault': vault,
  };
  const gone = (o: EraseOutcome): boolean => o === 'deleted' || o === 'unavailable';
  return {
    indexeddb,
    localStorage: 'deleted',
    sessionStorage: 'deleted',
    cacheStorage: 'unavailable',
    allDeleted: Object.values(indexeddb).every(gone),
  };
}
let eraseImpl: () => Promise<EraseReport> = async () => reportWith('deleted');
const calls: string[] = [];


vi.mock('../../security/vault', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../security/vault')>();
  return {
    // 文面と最小長は**本物を読み直す** (写経すると、画面と実物がずれていないかを
    // 見ている当の検査が嘘をつく)。
    MIN_PASSWORD_LENGTH: real.MIN_PASSWORD_LENGTH,
    // 天井も本物を読む (パス 167 —— 画面の `maxLength` がこれを読むようになった)。
    MAX_TOKEN_CHARS: real.MAX_TOKEN_CHARS,
    describeWipeOutcome: real.describeWipeOutcome,
    getVault: () => ({
      isUnlocked: () => true,
      lock: () => {
        calls.push('lock');
      },
      changePassword: async () => {},
    }),
  };
});

let container: HTMLDivElement;
let root: Root | null = null;
let reload: ReturnType<typeof vi.fn>;

const text = (): string => container.textContent ?? '';

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function buttonSaying(label: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? '').includes(label));
}

async function click(el: Element | undefined): Promise<void> {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 上限つきで「1 件届く」を待つ (BroadcastChannel の配達はタスク)。 */
function waitFor(seen: string[], ms = 2000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      if (seen.length > 0 || Date.now() - started >= ms) return resolve();
      setTimeout(tick, 5);
    };
    tick();
  });
}

/** ハードリセットを「確定して削除」まで進める。 */
async function runHardReset(): Promise<void> {
  const { VaultControls } = await import('../SettingsPage');
  await act(async () => {
    root!.render(createElement(VaultControls));
  });
  await click(buttonSaying('すべてのデータを削除…'));
  const confirmBox = Array.from(container.querySelectorAll('input[type="text"]')).at(-1);
  await act(async () => {
    typeInto(confirmBox as HTMLInputElement, 'DELETE');
  });
  await click(buttonSaying('確定して削除'));
}

beforeEach(() => {
  calls.length = 0;
  eraseImpl = async () => reportWith('deleted');
  // パス 137: 画面は橋 (`window.serviceHub.eraseAll`) を呼ぶ。ブラウザ版の橋 (web-shim) は eraseEverything を写す。
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: async () => '0.1.0-web',
    eraseAll: async () => {
      calls.push('eraseAll');
      return { kind: 'browser', ...(await eraseImpl()) };
    },
  };
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
    root = null;
  }
  document.body.removeChild(container);
});

describe('設定画面のハードリセット — 消えた時だけ再読込する', () => {
  it('対照: 消えたら再読込し、警告は出さない', async () => {
    const wire = new BroadcastChannel(LOCK_CHANNEL);
    const announced: string[] = [];
    wire.onmessage = (e: MessageEvent) => announced.push(String(e.data));
    try {
      await runHardReset();
      expect(calls).toEqual(['eraseAll']);
      // 他のタブへは施錠を配る (消えた後に作った保管庫へ古い鍵で書かせない)。
      await waitFor(announced);
      expect(announced).toEqual([LOCK_MESSAGE]);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(text()).not.toContain('データは残っています');
    } finally {
      wire.close();
    }
  });

  it('★ このタブは施錠しない — 施錠すると画面が差し替わって結果を報せられない', async () => {
    eraseImpl = async () => reportWith('blocked');
    await runHardReset();
    // `lockEverywhere()` を使っていたら `App` の購読がロック画面へ差し替え、
    // この画面は unmount して**消せなかった理由が誰にも届かない**。
    expect(calls.includes('lock')).toBe(false);
    // 標本: だから文言はちゃんと出ている。
    expect(text()).toContain('他のタブをすべて閉じて');
  });

  it('★ 他のタブが掴んでいて消せなかったら、理由を出して再読込しない', async () => {
    eraseImpl = async () => reportWith('blocked');
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    // **「他のタブ」だけでは足りない** —— すぐ上の施錠の札にも「他のタブも施錠します」
    // と書いてあるので、文言が 1 つも出ていなくても通ってしまう (最初こう書いて、
    // 下の `failed` の対照に落とされた)。この文面**だけ**が持つ句で見る。
    expect(text()).toContain('他のタブをすべて閉じて');
    expect(text()).toContain('データは残っています');
  });

  it('★ 消せなかったら、押し直せる状態に戻す (確認欄が残る)', async () => {
    eraseImpl = async () => reportWith('blocked');
    await runHardReset();
    // 「削除中…」のまま固まると、もう一度実行できない画面になる。
    expect(buttonSaying('確定して削除')).toBeDefined();
    expect(text()).not.toContain('削除中');
  });

  it('★ ブラウザに拒まれたときも、理由を出して再読込しない (原因ごとに打ち手が違う)', async () => {
    eraseImpl = async () => reportWith('failed');
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    expect(text()).toContain('ブラウザに拒否されました');
    // 原因が違えば打ち手も違う —— 「他のタブを閉じて」は出さない。
    expect(text()).not.toContain('他のタブをすべて閉じて');
  });

  it('投げた場合は今までどおり message を出す (結果を返す道と別に残す)', async () => {
    eraseImpl = async () => {
      throw new Error('IndexedDB が開けません');
    };
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    expect(text()).toContain('IndexedDB が開けません');
  });

  it('★ 保管庫が消えても業務レコードが残れば再読込しない —— 残った物を名指しする (パス 136)', async () => {
    eraseImpl = async () => reportWith('deleted', 'blocked');
    await runHardReset();
    expect(reload).not.toHaveBeenCalled();
    expect(text()).toContain('業務レコード (他のタブが使用中)');
    expect(text()).toContain('データは残っています');
    expect(buttonSaying('確定して削除')).toBeDefined();
  });

  it('★ 説明は消す物の在庫と消えない物を言う —— 保管庫だけの話にしない (パス 136)', async () => {
    const { VaultControls } = await import('../SettingsPage');
    await act(async () => {
      root!.render(createElement(VaultControls));
    });
    expect(text()).toContain('業務レコード');
    expect(text()).toContain('気分の記録');
    expect(text()).toContain('消えない物');
    // 標本つきの不在: 消すのが保管庫だけだった頃の文は消えている。
    expect(text()).not.toContain('保管中の全トークン・暗号化メタデータ・現在のリカバリーキーが');
    expect(text()).toContain('復旧不可');
  });
});
