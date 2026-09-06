import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
  const source = (): string =>
    readFileSync('src/renderer/pages/SettingsPage.tsx', 'utf8');

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

  /*
   * 2026-09-06 に**掃除の呼び名が 1 つ増えた**。`clearPkceSession()` は消せなかった
   * 鍵を返すようになり、画面はそれを出す必要があるので、画面側は `sweep()` を
   * 通すようになった (`setLeftover(clearPkceSession())` の 1 行)。
   * 検査もその形で書く —— **元の懸念 (成功時しか走らない形へ戻らないこと・
   * 別の関数へ流れ込まないこと) はそのまま残す。**
   *
   * 文字列で見る検査は**散文にも当たる**ので、呼び名 (`sweep()`) で見て、
   * `clearPkceSession()` の側は「呼ぶ場所が 1 つだけ」を数で留める
   * (実際にこのパスで、`finally` の中に書いた注記の中の
   * `clearPkceSession()` が下 2 本の検査を通してしまった)。
   */
  it('complete() の finally に後片付けが在る', () => {
    const body = bodyOf(source(), 'complete');
    const fin = body.slice(body.lastIndexOf('} finally {'));
    expect(fin, 'finally 節が見つからない').toContain('finally');
    expect(fin, '掃除が finally に無い —— 失敗時に一時秘密が残る').toContain('sweep()');
  });

  it('掃除は try の中だけに置かれていない (成功時しか走らない形に戻っていない)', () => {
    const body = bodyOf(source(), 'complete');
    const finallyAt = body.lastIndexOf('} finally {');
    const firstClear = body.indexOf('sweep()');
    expect(firstClear, '掃除が 1 つも無い').toBeGreaterThan(-1);
    expect(firstClear, '掃除が finally より前 = try の中にしか無い').toBeGreaterThan(finallyAt);
  });

  it('★ 消し残りが画面へ回っている (捨てていない)', () => {
    // `sweep()` が結果を状態へ入れ、その状態が札の条件になっていること。
    expect(source()).toContain('setLeftover(clearPkceSession())');
    expect(source()).toContain('leftover.length > 0');
  });

  it('★ clearPkceSession() を呼ぶ場所は 1 か所だけ (入口を増やさない)', () => {
    const calls = [...source().matchAll(/clearPkceSession\(\)/g)];
    expect(calls, '呼び出しは sweep() の中の 1 か所だけ').toHaveLength(1);
  });

  /*
   * **置換が別の関数へ流れ込んでいないか。** 実際にそうなった ——
   * 資格情報の保存関数の `finally` へ入り、資格情報を 1 つ保存するたびに
   * 進行中の PKCE を壊す形になっていた。
   */
  it('PKCE と無関係な関数が掃除を呼んでいない', () => {
    const text = source();
    const sectionStart = text.indexOf('function GoogleOAuthSection() {');
    expect(sectionStart, 'GoogleOAuthSection() が見つからない').toBeGreaterThan(-1);
    // 節の終わりは次のトップレベル関数の宣言。
    const sectionEnd = text.indexOf('\nfunction btn(', sectionStart);
    expect(sectionEnd, '節の終わりが見つからない').toBeGreaterThan(sectionStart);
    for (const m of text.matchAll(/\bsweep\(\)/g)) {
      expect(
        m.index,
        `掃除が GoogleOAuthSection() の外 (位置 ${m.index}) に在る`,
      ).toBeGreaterThan(sectionStart);
      expect(m.index).toBeLessThan(sectionEnd);
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


/*
 * ## 保存領域そのものを断られる端末 (2026-09-06)
 *
 * `sessionStorage` は**触れることが投げる** —— サイトデータをブロックした
 * オリジンで Chrome は `SecurityError: Access is denied for this document.`
 * を返し、プライベートモードでも同じ形になる。3 つの関数はどれも素で
 * 呼んでいたので、この端末では:
 *
 *   `clearPkceSession` … 4 連の 2 つ目で投げると**残り 2 つが残る**。
 *                        このファイルの冒頭が「作れなくする」と書いている
 *                        「3 つ消して 1 つ残る」形そのもので、残るのは verifier。
 *   `savePkceSession`  … `onClick={start}` の中で投げ、拒否が宙に浮いて
 *                        **画面には何も出ない** (押しても認可 URL が出ないだけ)。
 *   `readPkceSession`  … 「切れました」ではなく生の例外。
 */

/** 特定の操作だけを断る `sessionStorage`。`failOn` は鍵の**接尾辞**で指定する。 */
function installRefusingStorage(opts: {
  readonly op: 'getItem' | 'setItem' | 'removeItem';
  readonly failOn: readonly string[];
  readonly name?: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  const boom = (k: string): never => {
    const e = new Error(`Access is denied for this document. (${k})`);
    e.name = opts.name ?? 'SecurityError';
    throw e;
  };
  const hit = (k: string): boolean => opts.failOn.some((suffix) => k.endsWith(suffix));
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (opts.op === 'getItem' && hit(k) ? boom(k) : map.get(k) ?? null),
    setItem: (k: string, v: string) => (opts.op === 'setItem' && hit(k) ? boom(k) : void map.set(k, String(v))),
    removeItem: (k: string) => (opts.op === 'removeItem' && hit(k) ? boom(k) : void map.delete(k)),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  });
  return map;
}

/*
 * **鍵の名前そのものを留める。**
 *
 * `remaining()` も `it.each` も `pkceSessionKeys()` を通して比べていたので、
 * 接頭辞や組み立て方を変えても**全部が一緒に変わって通っていた** (変異検査が
 * `KEY_PREFIX` と `storageKey` の生存として鳴らした。2026-09-06)。名前は
 * `SettingsPage` が触らない約束の対象でもあるので、字面で書いておく。
 */
describe('鍵の名前', () => {
  /*
   * `KEY_PREFIX` と `storageKey` は**読み込み時に決まる** (モジュール直下)。静的な
   * ままだと、変異体が有効になる前にモジュールが読まれてしまうので、字面を突き
   * 合わせる検査を書いても届かない —— 実測で `static: true` の生存 2 件として残り、
   * しかも**この検査ファイルではなく無関係な検査**が覆っている扱いになっていた。
   * `stryker.config.json` の注記どおり `vi.resetModules()` + 動的 `import()` で
   * **検査の中で**評価させる (`main/oauth.ts` の定数表と同じ形)。
   */
  async function fresh(): Promise<typeof import('../pkceSession')> {
    vi.resetModules();
    return import('../pkceSession');
  }

  it('★ 4 つの鍵は pkce. 接頭辞つきの決まった名前である', async () => {
    const m = await fresh();
    expect(m.pkceSessionKeys()).toEqual([
      'pkce.verifier',
      'pkce.state',
      'pkce.clientId',
      'pkce.redirectUri',
    ]);
  });

  it('★ 置いた値はその名前で読み出せる (組み立てが読みと書きで一致している)', async () => {
    const m = await fresh();
    m.savePkceSession(SESSION);
    expect(sessionStorage.getItem('pkce.verifier')).toBe(SESSION.verifier);
    expect(sessionStorage.getItem('pkce.redirectUri')).toBe(SESSION.redirectUri);
  });
});

describe('保存領域を断られる端末', () => {
  it('★ 消す側は 1 つ投げても残りを消す (「3 つ消して 1 つ残る」を作らない)', () => {
    const map = installRefusingStorage({ op: 'removeItem', failOn: ['state'] });
    for (const k of pkceSessionKeys()) map.set(k, 'x');
    clearPkceSession();
    // 断られた 1 つだけが残る。**verifier は消えている**のが肝。
    expect([...map.keys()]).toEqual(['pkce.state']);
  });

  it('★ 消す側は投げない (`finally` から呼ばれるので、本当の失敗を投げ替えない)', () => {
    const map = installRefusingStorage({ op: 'removeItem', failOn: ['verifier', 'state'] });
    for (const k of pkceSessionKeys()) map.set(k, 'x');
    expect(() => clearPkceSession()).not.toThrow();
  });

  it('★ 消せなかった鍵の名前を返す (画面が「タブを閉じて」と言える)', () => {
    const map = installRefusingStorage({ op: 'removeItem', failOn: ['verifier', 'clientId'] });
    for (const k of pkceSessionKeys()) map.set(k, 'x');
    expect(clearPkceSession()).toEqual(['verifier', 'clientId']);
  });

  it('対照: 触れる端末では消せなかった鍵は 0 件', () => {
    savePkceSession(SESSION);
    expect(clearPkceSession()).toEqual([]);
    expect(remaining()).toEqual([]);
  });

  it('★ `finally` の後片付けが、本当の失敗 (CSRF の疑い) を投げ替えない', async () => {
    const map = installRefusingStorage({ op: 'removeItem', failOn: ['state'] });
    for (const k of pkceSessionKeys()) map.set(k, 'x');
    let cleanedUp = false;
    // `SettingsPage.complete()` と同じ形 —— catch で理由を掴み、finally で掃除。
    const outcome = await (async (): Promise<string> => {
      try {
        throw new Error('state が一致しません — CSRF 攻撃の可能性があります');
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      } finally {
        clearPkceSession();
        cleanedUp = true; // 投げていた頃はここへ到達しなかった (= setBusy(false) も飛んだ)
      }
    })();
    expect(outcome).toContain('CSRF');
    expect(cleanedUp).toBe(true);
  });

  it('★ 保存が断られたら、置けた分を消してから投げる (半端に残さない)', () => {
    // 3 つ目 (clientId) で断られる端末。
    const map = installRefusingStorage({ op: 'setItem', failOn: ['clientId'] });
    expect(() => savePkceSession(SESSION)).toThrow(/保存できませんでした/);
    expect([...map.keys()]).toEqual([]);
  });

  it('★ 保存の文面は直せる原因を名指しする (押しても何も出ない状態にしない)', () => {
    installRefusingStorage({ op: 'setItem', failOn: ['verifier'] });
    expect(() => savePkceSession(SESSION)).toThrow(/プライベートウィンドウ/);
  });

  it('★ 読みが断られたら null (生の例外を呼び出し側へ出さない)', () => {
    const map = installRefusingStorage({ op: 'getItem', failOn: ['clientId'] });
    for (const k of pkceSessionKeys()) map.set(k, 'x');
    expect(readPkceSession()).toBeNull();
  });

  it('対照: 触れる端末では 4 つ揃って読める', () => {
    savePkceSession(SESSION);
    expect(readPkceSession()).toEqual(SESSION);
  });
});
