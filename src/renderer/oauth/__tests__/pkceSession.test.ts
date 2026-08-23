import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPkceSession,
  pkceSessionKeys,
  readPkceSession,
  savePkceSession,
} from '../pkceSession';

/*
 * **PKCE の一時秘密が、使い終わったら消えているか。**
 *
 * `code_verifier` は RFC 7636 の言うとおり秘密である —— 認可コードと組で
 * 握られると、そのままトークン交換を完了できる。ブラウザ版には
 * `sessionStorage` しか置き場所が無いので置くこと自体は正しいが、
 * **消えることが要る**。
 *
 * ## 2026-08-23 まで消えていなかった
 *
 * 4 つの鍵は `SettingsPage.tsx` に直書きされていた:
 *
 * ```
 *   complete() の try の中で 4 つ removeItem   ← 成功したときだけ走る
 *   finally は setBusy(false) だけ
 *   キャンセルボタンは pkce.verifier だけ消す  ← 残り 3 つが残る
 * ```
 *
 * **`state` 不一致 (= CSRF の疑い) で `exchangeGoogleCode` が投げたとき、
 * いちばん消したい verifier が残った。** 交換の 4xx・通信断・`setToken` の
 * 失敗でも同じ。
 *
 * ## 検査の形
 *
 * 「`finally` に書いてあるか」を字面で見るのではなく、
 * **例外を通してから保管庫を覗く**。下の `runLikeComplete` は
 * `SettingsPage.complete()` と同じ制御の流れを持つ最小の再現で、
 * *直した形*と*直す前の形*の両方を持っている —— 前者は消え、後者は残る。
 */

/** jsdom を使わずに sessionStorage を用意する。 */
function installMemoryStorage(): void {
  const map = new Map<string, string>();
  const mock = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('sessionStorage', mock);
}

const SESSION = {
  verifier: 'v-secret-0123456789',
  state: 's-1234',
  clientId: 'cid.apps.googleusercontent.com',
  redirectUri: 'https://localhost/cb',
};

/** 残っている `pkce.*` の鍵を数える。 */
function remaining(): string[] {
  return pkceSessionKeys().filter((k) => sessionStorage.getItem(k) !== null);
}

beforeEach(() => {
  installMemoryStorage();
});

describe('置く / 読む', () => {
  it('4 つ置いて、そのまま読める', () => {
    savePkceSession(SESSION);
    expect(readPkceSession()).toEqual(SESSION);
  });

  it('何も置いていなければ null', () => {
    expect(readPkceSession()).toBeNull();
  });

  /*
   * **1 つでも欠けたら null。** 途中まで残った状態で交換を試させない ——
   * 欠けた鍵だけ「たまたま残っていた古い値」で埋まると、
   * 別のセッションの state で CSRF 検査を通しかねない。
   */
  it.each(pkceSessionKeys())('%s が欠けていれば null', (missing) => {
    savePkceSession(SESSION);
    sessionStorage.removeItem(missing);
    expect(readPkceSession()).toBeNull();
  });

  it('空文字も「欠けている」として扱う', () => {
    savePkceSession(SESSION);
    sessionStorage.setItem('pkce.verifier', '');
    expect(readPkceSession()).toBeNull();
  });
});

describe('消す', () => {
  it('4 つまとめて消える (1 つも残らない)', () => {
    savePkceSession(SESSION);
    expect(remaining()).toHaveLength(4);
    clearPkceSession();
    expect(remaining()).toEqual([]);
  });

  it('何も置いていなくても落ちない', () => {
    expect(() => clearPkceSession()).not.toThrow();
  });

  it('2 回呼んでも落ちない', () => {
    savePkceSession(SESSION);
    clearPkceSession();
    expect(() => clearPkceSession()).not.toThrow();
    expect(remaining()).toEqual([]);
  });
});

/*
 * `SettingsPage.complete()` と同じ制御の流れの最小再現。
 * `cleanupInTry` が **直す前の形** (成功経路にだけ掃除がある)。
 */
async function runLikeComplete(opts: {
  exchange: () => Promise<void>;
  cleanupInTry: boolean;
}): Promise<'ok' | 'error'> {
  const session = readPkceSession();
  if (!session) return 'error';
  try {
    await opts.exchange();
    if (opts.cleanupInTry) clearPkceSession();
    return 'ok';
  } catch {
    return 'error';
  } finally {
    if (!opts.cleanupInTry) clearPkceSession();
  }
}

describe('交換が失敗しても一時秘密が残らない (実測)', () => {
  const ok = () => Promise.resolve();
  const csrf = () => Promise.reject(new Error('state が一致しません — CSRF 攻撃の可能性があります'));
  const http4xx = () => Promise.reject(new Error('token exchange 400: invalid_grant'));
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));

  it.each([
    ['成功', ok],
    ['state 不一致 (CSRF の疑い)', csrf],
    ['トークン端点が 4xx', http4xx],
    ['通信断', offline],
  ])('%s のあと、pkce.* は 1 つも残らない', async (_label, exchange) => {
    savePkceSession(SESSION);
    await runLikeComplete({ exchange, cleanupInTry: false });
    expect(remaining(), '一時秘密が残っている').toEqual([]);
  });

  /*
   * **対照 —— 直す前の形なら残る。** これが落ちるようになったら、
   * 上の検査は「そもそも何も置かれない経路」を見ていることになる。
   */
  it('対照: 掃除が try の中だけだと、失敗時に 4 つとも残る', async () => {
    savePkceSession(SESSION);
    await runLikeComplete({ exchange: csrf, cleanupInTry: true });
    expect(remaining()).toHaveLength(4);
    expect(sessionStorage.getItem('pkce.verifier')).toBe(SESSION.verifier);
  });

  it('対照: 直す前の形でも、成功時には消える (だから気付かれなかった)', async () => {
    savePkceSession(SESSION);
    await runLikeComplete({ exchange: ok, cleanupInTry: true });
    expect(remaining()).toEqual([]);
  });
});

/*
 * **鍵を知っているのはこのファイルだけ。**
 *
 * 「`finally` で消す」を守っても、別の場所が `sessionStorage` を直に触れば
 * また一部だけ消す形が生まれる (キャンセルボタンが実際にそうだった ——
 * `pkce.verifier` だけ消して 3 つ残していた)。扉を 1 つに保つ。
 */
describe('pkce.* を直に触る場所は pkceSession.ts だけ', () => {
  it('renderer の他のファイルに pkce. の直書きが無い', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === '__tests__' || name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        if (full.endsWith('oauth/pkceSession.ts')) continue;
        const text = readFileSync(full, 'utf8');
        const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/['"`]pkce\./.test(code)) hits.push(full);
      }
    };
    walk('src/renderer');
    expect(hits).toEqual([]);
  });

  /*
   * **走査そのものが動いていることを確かめる。** 上が空だったのは
   * 「直書きが無い」からであって「どこも見ていない」からではない ——
   * 必ず在る字面 (`savePkceSession`) を同じ走査で探し、見つかることを見る。
   */
  it('負の対照: 必ず在る字面なら同じ走査で見つかる', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === '__tests__' || name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        if (full.endsWith('oauth/pkceSession.ts')) continue;
        if (/savePkceSession/.test(readFileSync(full, 'utf8'))) hits.push(full);
      }
    };
    walk('src/renderer');
    expect(hits, '走査が 1 ファイルも読めていない').not.toEqual([]);
    expect(hits.some((h) => h.endsWith('SettingsPage.tsx'))).toBe(true);
  });
});
