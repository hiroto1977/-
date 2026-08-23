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
 * **本物の `complete()` が掃除しているか。**
 *
 * 上の `runLikeComplete` は制御の流れの*再現*であって、**実物ではない**。
 * だから「実物が直っていない」ことは検出できない ——
 * 2026-08-23 に実際にそうなった:
 *
 *   置換が `finally { setBusy(false); }` の**最初の一致**に当たり、
 *   掃除が `complete()` ではなく**資格情報の保存関数**へ入った。
 *   `complete()` からは元の掃除も消えていたので、**成功時も含めて
 *   一切消えない**状態になっていた。検査は全部緑だった。
 *
 * > **対象の*再現*を検査しても、対象が変わっていないことは分からない。**
 *
 * 本物を叩けるのが一番だが、`complete()` は React コンポーネントの中の
 * クロージャで、このリポジトリにはページを描画する検査の土台が無い。
 * そこで**主張の単位で実物の字面を見る** —— 「`complete()` の `finally` に
 * `clearPkceSession()` が在る」という主張そのものを確かめる。
 */
describe('本物の SettingsPage.complete() が finally で掃除している', () => {
  const source = (): string => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync('src/renderer/pages/SettingsPage.tsx', 'utf8');
  };

  /** 名前で関数の本文を切り出す (次の同インデントの `}` まで)。 */
  const bodyOf = (text: string, name: string): string => {
    const start = text.indexOf(`  async function ${name}() {`);
    expect(start, `${name}() が見つからない`).toBeGreaterThan(-1);
    const end = text.indexOf('\n  }\n', start);
    expect(end, `${name}() の終わりが見つからない`).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it('complete() は PKCE の交換をしている (別の関数を見ていない)', () => {
    expect(bodyOf(source(), 'complete')).toContain('exchangeGoogleCode');
  });

  it('complete() の finally に clearPkceSession() が在る', () => {
    const body = bodyOf(source(), 'complete');
    const fin = body.slice(body.lastIndexOf('} finally {'));
    expect(fin, 'finally 節が見つからない').toContain('finally');
    expect(fin, '掃除が finally に無い —— 失敗時に一時秘密が残る').toContain('clearPkceSession()');
  });

  it('掃除は try の中だけに置かれていない (成功時しか走らない形に戻っていない)', () => {
    const body = bodyOf(source(), 'complete');
    const finallyAt = body.lastIndexOf('} finally {');
    const firstClear = body.indexOf('clearPkceSession()');
    expect(firstClear, '掃除が 1 つも無い').toBeGreaterThan(-1);
    expect(firstClear, '掃除が finally より前 = try の中にしか無い').toBeGreaterThan(finallyAt);
  });

  /*
   * **置換が別の関数へ流れ込んでいないか。** 実際にそうなった ——
   * 資格情報の保存関数の `finally` へ入り、資格情報を 1 つ保存するたびに
   * 進行中の PKCE を壊す形になっていた。
   */
  it('PKCE と無関係な関数が clearPkceSession() を呼んでいない', () => {
    const text = source();
    const completeStart = text.indexOf('  async function complete() {');
    for (const m of text.matchAll(/clearPkceSession\(\)/g)) {
      expect(
        m.index,
        `clearPkceSession() が complete() の外 (位置 ${m.index}) に在る`,
      ).toBeGreaterThan(completeStart);
    }
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
