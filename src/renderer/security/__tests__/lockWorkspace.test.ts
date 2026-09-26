/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { _resetVaultForTests, getVault } from '../vault';
import {
  LOCK_CHANNEL,
  LOCK_MESSAGE,
  _resetLockSubscribersForTests,
  announceLockToOtherTabs,
  lockEverywhere,
  lockWorkspace,
  startLockRelay,
  subscribeWorkspaceLocked,
} from '../lockWorkspace';

// jsdom doesn't provide crypto.subtle. Pull it in from Node's webcrypto.
if (!('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

/*
 * **施錠の値打ちは鍵を落とすことで、画面を隠すことではない。**
 *
 * 直す前は `App.tsx` の `onLock` に `getVault().lock()` と
 * `setVaultUnlocked(false)` が並べて書いてあり、実測で**前者だけ消しても
 * 10,381 件の検査が全部緑のまま通った** (型検査も通る)。
 * 「画面は施錠、鍵は生きたまま」は施錠の演出で、施錠後に `getToken` を
 * 呼べば資格情報は全部読める。
 *
 * **2026-09-06 追記: 門を作っても、一番目立つ施錠が迂回していた。**
 * 設定ページの「Vault を今すぐロック」は `getVault().lock()` を直に呼び、
 * 見た目は**そのページの局所状態**を立てるだけだった。つまり
 * ロック画面は出ず、他のページへ移れば解錠の見た目に戻り、
 * **他のタブは生きた鍵を持ったまま**残る (文面は「席を離れる前に押すと
 * …即座に遮断します」)。そこで
 *
 *   - 通知を**購読**にして、呼び出し側から見た目の仕事を取り上げた
 *   - 明示的な施錠 (`lockEverywhere`) は**他のタブへ配る**
 *   - 自動施錠 (`lockWorkspace`) は**配らない** (hidden は「同じアプリの
 *     別のタブへ移った」時でもあるので、配ると使用中のタブを施錠する)
 *
 * ここでは振る舞いを留める —— 鍵が実際に使えなくなること、画面への通知より
 * **先に**落ちること、通知が投げても落ちること、**配る / 配らないの別**、
 * 中継が受けたら施錠すること。
 */
function clearIdb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('business-hub-vault');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * BroadcastChannel の配達はタスクなので、待つ。
 *
 * **決まった回数の tick で待たない。** 1 度 `setTimeout(0)` で書いていたら、
 * Stryker の dry run (全 500 ファイル超を 1 プロセスで回す) で
 * 「配る」検査が空配列を見て落ちた —— 配達が遅れただけで、実装は正しい。
 * 検査は**待っている事象そのもの**で待つこと。無ければ上限で諦める。
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 上限つきで条件が真になるのを待つ。ならなければ諦めて戻る (検査側で assert する)。 */
function waitUntil(done: () => boolean, ms = 2000): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = (): void => {
      if (done() || Date.now() - started >= ms) return resolve();
      setTimeout(tick, 5);
    };
    tick();
  });
}

/** 上限つきで「1 件届く」を待つ。届かなければ諦めて戻る (検査側で assert する)。 */
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

describe('lockWorkspace', () => {
  const PASSWORD = 'correct-horse-battery-staple';
  const opened: BroadcastChannel[] = [];
  const stops: (() => void)[] = [];

  /** 線の上を直接見る受け手。テスト終了時に閉じる。 */
  function wireTap(): string[] {
    const seen: string[] = [];
    const channel = new BroadcastChannel(LOCK_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      seen.push(String(event.data));
    };
    opened.push(channel);
    return seen;
  }

  beforeEach(async () => {
    _resetVaultForTests();
    _resetLockSubscribersForTests();
    await clearIdb();
    localStorage.clear();
  });

  afterEach(() => {
    for (const c of opened.splice(0)) c.close();
    for (const stop of stops.splice(0)) stop();
    _resetLockSubscribersForTests();
  });

  async function unlockedVault() {
    const vault = getVault();
    await vault.initialize(PASSWORD);
    await vault.setToken('github', 'ghp_secret_token');
    expect(await vault.getToken('github')).toBe('ghp_secret_token');
    return vault;
  }

  it('線の名前と合図を留める — 版が違うタブどうしも同じ道で話す', async () => {
    // 別のタブは**別の版**かもしれない。名前が変われば古いタブは聞こえない
    // ので、これは実際の約束事。定数を 1 つにしたまま、値そのものを留める。
    //
    // **読み直してから見る。** モジュール直下の初期化式は「静的変異体」で、
    // 変異体が有効になるより先にモジュールが読まれてしまうと、上の
    // `import` 越しに見た値はいつまでも元のまま = どんな検査を書いても
    // 殺せない生存になる (`stryker.config.json` の `_commentIgnoreStatic`、
    // および `oauth.test.ts` の freshConfigs と同じ扱い)。
    vi.resetModules();
    const fresh = await import('../lockWorkspace');
    expect(fresh.LOCK_CHANNEL).toBe('servicehub.lock');
    expect(fresh.LOCK_MESSAGE).toBe('lock');
  });

  it('★ 道は 1 本だけ作る — 施錠のたびに受け口を溜めない', async () => {
    const real = globalThis.BroadcastChannel;
    const madeFor: string[] = [];
    class Spy extends real {
      constructor(name: string) {
        super(name);
        madeFor.push(name);
      }
    }
    globalThis.BroadcastChannel = Spy as unknown as typeof BroadcastChannel;
    try {
      // 送信も受信も同じ 1 本を使う。**閉じない**代わりに増やさない ——
      // 送信ごとに作ると、このタブの中継が自分の合図を拾って自分を施錠する
      // (2026-09-07 に実測で踏んだ形)。
      stops.push(startLockRelay());
      lockEverywhere();
      lockEverywhere();
      announceLockToOtherTabs();
      await flush();
      expect(madeFor).toEqual([LOCK_CHANNEL]);
    } finally {
      globalThis.BroadcastChannel = real;
    }
  });

  it('後片付けは道を閉じてから捨てる — 次の検査へ受け口を持ち越さない', () => {
    const real = globalThis.BroadcastChannel;
    let closed = 0;
    class Spy extends real {
      override close(): void {
        closed += 1;
        super.close();
      }
    }
    globalThis.BroadcastChannel = Spy as unknown as typeof BroadcastChannel;
    try {
      announceLockToOtherTabs(); // 道を 1 本作る
      expect(closed).toBe(0); // 標本: まだ閉じていない
      _resetLockSubscribersForTests();
      expect(closed).toBe(1);
      // 2 度目は掴んでいる物が無いので閉じない (捨て損ないの検査でもある)。
      _resetLockSubscribersForTests();
      expect(closed).toBe(1);
    } finally {
      globalThis.BroadcastChannel = real;
    }
  });

  it('★ 自分が配った合図で自分を施錠しない (中継が居ても)', async () => {
    const vault = await unlockedVault();
    stops.push(startLockRelay());
    announceLockToOtherTabs();
    await flush();
    await flush();
    // 配るだけ。押したタブを施錠すると、結果を報せる画面が消える。
    expect(vault.isUnlocked()).toBe(true);

    // 標本: 他のタブ (別の channel) からの合図なら施錠される。
    const other = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(other);
    other.postMessage(LOCK_MESSAGE);
    await waitUntil(() => !vault.isUnlocked());
    expect(vault.isUnlocked()).toBe(false);
  });

  it('鍵を落とす — 施錠後はトークンを読めない', async () => {
    const vault = await unlockedVault();
    lockWorkspace();
    // ★ ここが本体。画面状態ではなく、鍵が使えないことを見る。
    expect(await vault.status()).toBe('locked');
    await expect(vault.getToken('github')).rejects.toThrow();
  });

  it('画面へ知らせる前に鍵を落とす', async () => {
    const vault = await unlockedVault();
    let unlockedWhenNotified: boolean | null = null;
    subscribeWorkspaceLocked(() => {
      // 通知の時点で既に施錠済みでなければならない。逆順だと、画面更新が
      // 投げた場合に「施錠表示なのに鍵は生きている」状態が残る。
      unlockedWhenNotified = vault.isUnlocked();
    });
    lockWorkspace();
    expect(unlockedWhenNotified).toBe(false);
    expect(await vault.status()).toBe('locked');
  });

  it('画面への通知が投げても鍵は落ちている', async () => {
    const vault = await unlockedVault();
    subscribeWorkspaceLocked(() => {
      throw new Error('画面更新に失敗');
    });
    expect(() => lockWorkspace()).toThrow('画面更新に失敗');
    // 通知の失敗で鍵が残る方が危ない。
    expect(await vault.status()).toBe('locked');
    await expect(vault.getToken('github')).rejects.toThrow();
  });

  it('購読を解除したら知らせない (登録し直しでも二重に呼ばない)', async () => {
    await unlockedVault();
    let calls = 0;
    const unsubscribe = subscribeWorkspaceLocked(() => {
      calls += 1;
    });
    lockWorkspace();
    expect(calls).toBe(1); // 標本: 登録中は呼ばれる
    unsubscribe();
    lockWorkspace();
    expect(calls).toBe(1);
  });

  it('★ 明示的な施錠は他のタブへ配る', async () => {
    await unlockedVault();
    const seen = wireTap();
    lockEverywhere();
    await waitFor(seen);
    expect(seen).toEqual([LOCK_MESSAGE]);
  });

  it('★ 自動施錠は配らない — 使用中の別タブを施錠しない (同じ受け手で標本つき)', async () => {
    await unlockedVault();
    const seen = wireTap();
    lockWorkspace();
    await flush();
    // 「何も来ない」だけでは、受け手が壊れていても通る。同じ受け手に
    // 明示的な施錠を流して**鳴ること**を見る。
    expect(seen).toEqual([]);
    lockEverywhere();
    await waitFor(seen);
    expect(seen).toEqual([LOCK_MESSAGE]);
  });

  it('★ 中継: 線から合図が来たらこの文脈を施錠して画面へ知らせる', async () => {
    const vault = await unlockedVault();
    let notified = 0;
    subscribeWorkspaceLocked(() => {
      notified += 1;
    });
    stops.push(startLockRelay());

    const sender = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(sender);
    sender.postMessage(LOCK_MESSAGE);
    await waitUntil(() => notified > 0);

    expect(notified).toBe(1);
    expect(await vault.status()).toBe('locked');
    await expect(vault.getToken('github')).rejects.toThrow();
  });

  it('★ 中継は関係のない合図で施錠しない', async () => {
    const vault = await unlockedVault();
    stops.push(startLockRelay());

    const sender = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(sender);
    sender.postMessage('こんにちは');
    await flush();
    await flush();
    expect(vault.isUnlocked()).toBe(true);

    // 標本: 正しい合図なら同じ道で施錠される (受け手が生きている証拠)。
    sender.postMessage(LOCK_MESSAGE);
    await waitUntil(() => !vault.isUnlocked());
    expect(vault.isUnlocked()).toBe(false);
  });

  it('★ 中継は配り直さない — 受けた側が配ると輪になる', async () => {
    await unlockedVault();
    stops.push(startLockRelay());
    const seen = wireTap();

    const sender = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(sender);
    sender.postMessage(LOCK_MESSAGE);
    await waitFor(seen);
    // 配り直しが在れば 2 件目が来る余地を与えてから数える。
    await flush();
    await flush();

    // 受け手が居るのに流れたのは送った 1 件だけ (中継が足していない)。
    expect(seen).toEqual([LOCK_MESSAGE]);
  });

  it('中継を止めたら受けない', async () => {
    const vault = await unlockedVault();
    const stop = startLockRelay();
    stop();

    const sender = new BroadcastChannel(LOCK_CHANNEL);
    opened.push(sender);
    sender.postMessage(LOCK_MESSAGE);
    await flush();
    await flush();
    expect(vault.isUnlocked()).toBe(true);

    // 標本: 止めていなければ施錠される。
    stops.push(startLockRelay());
    sender.postMessage(LOCK_MESSAGE);
    await waitUntil(() => !vault.isUnlocked());
    expect(vault.isUnlocked()).toBe(false);
  });

  it('BroadcastChannel が無い環境でも施錠は成立する', async () => {
    const vault = await unlockedVault();
    const real = globalThis.BroadcastChannel;
    // @ts-expect-error 無い環境の再現 (古いブラウザ / 制限付き文脈)
    delete globalThis.BroadcastChannel;
    try {
      expect(() => lockEverywhere()).not.toThrow();
      expect(await vault.status()).toBe('locked');
      // 受け手も投げずに「何もしない解除」を返す。
      expect(() => startLockRelay()()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = real;
    }
  });
});
