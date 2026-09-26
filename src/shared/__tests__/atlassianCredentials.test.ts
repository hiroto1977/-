/**
 * **保存された Atlassian の資格情報を読む規則は 1 つだけ** (2026-09-15 · パス 284)。
 *
 * この検査が守る 2 つのこと:
 *
 * ① **JSON リテラルの `null` で素の TypeError を投げない。** パス 284 まで、
 *    main とブラウザ版の両方が `JSON.parse(raw)` の戻りを記録として読み、
 *    `null` で `Cannot read properties of null (reading 'email')` を投げていた
 *    —— **書くつもりだった断りは 1 度も出ない**。`null` は 4 文字の普通の
 *    文字列なので `checkTokenInput` (パス 244) も通り、利用者がトークン欄に
 *    `null` と打つだけで再現した。
 *
 * ② **両ビルドが同じ入力に同じ文を返す。** 3 段の検査とその文面が両方に
 *    1 つずつ在り、どちらも日本語なのに言い回しが違っていた ——
 *    「言語の非対称」ではなく「同じ条件に文が 2 つ」の一族
 *    (パス 167 / 250 / 252 / 269 / 273 / 282)。
 *
 * ★ **①は両ビルドで同じように壊れていたので、既存のパリティ検査は通っていた。**
 * 「両ビルドが一致している」と「正しい」は別の性質である —— この検査は
 * 両方を別々に見る (下の describe が 2 つに分かれているのはそのため)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ATLASSIAN_CREDS_MESSAGES,
  MAX_ATLASSIAN_EMAIL,
  MAX_ATLASSIAN_SITE,
  MAX_ATLASSIAN_TOKEN,
  readAtlassianCredentials,
  type AtlassianCredsFailure,
} from '../atlassianSite';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));
vi.mock('../../renderer/security/vault', () => ({
  getVault: () => ({ getToken: async () => null, setToken: async () => {}, clearToken: async () => {}, listServices: async () => [], status: async () => 'locked' }),
}));
vi.mock('../../renderer/library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));

const good = JSON.stringify({ email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net' });

describe('readAtlassianCredentials — 記録でない値は欄が無い物として扱う', () => {
  it('★ JSON リテラルの null は断り、投げない (パス 284 の欠陥)', () => {
    expect(readAtlassianCredentials('null')).toEqual({ ok: false, reason: 'fields' });
  });

  it('★ null の兄弟 4 形も同じ断り (`{}` と同じ経路 — 文面は 1 文字も変えていない)', () => {
    for (const raw of ['[]', '42', '"str"', 'true', '{}']) {
      expect(readAtlassianCredentials(raw), raw).toEqual({ ok: false, reason: 'fields' });
    }
  });

  it('JSON として読めなければ not-json', () => {
    expect(readAtlassianCredentials('nope')).toEqual({ ok: false, reason: 'not-json' });
    expect(readAtlassianCredentials('')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('正当な 3 欄は通し、site は素の文字列のまま返す (正規化は呼び手が行う)', () => {
    expect(readAtlassianCredentials(good)).toEqual({
      ok: true, email: 'me@x.com', token: 'apitok', site: 'https://acme.atlassian.net',
    });
  });

  it('欄が欠ける / 空 / 型違いは fields', () => {
    for (const obj of [
      { email: 'a@b', token: 't' },
      { email: '', token: 't', site: 'https://x.atlassian.net' },
      { email: 'a@b', token: '', site: 'https://x.atlassian.net' },
      { email: 'a@b', token: 't', site: '' },
      { email: 7, token: 't', site: 'https://x.atlassian.net' },
      { email: 'a@b', token: {}, site: 'https://x.atlassian.net' },
      { email: 'a@b', token: 't', site: ['https://x.atlassian.net'] },
    ]) {
      expect(readAtlassianCredentials(JSON.stringify(obj)), JSON.stringify(obj)).toEqual({
        ok: false, reason: 'fields',
      });
    }
  });

  it('★ 天井は境界で切り替わる (欄ごとに ±1)', () => {
    const at = (n: number, field: 'email' | 'token' | 'site'): string =>
      JSON.stringify({
        email: field === 'email' ? 'a'.repeat(n) : 'a@b',
        token: field === 'token' ? 'a'.repeat(n) : 't',
        site: field === 'site' ? `https://${'a'.repeat(n - 22)}.atlassian.net` : 'https://x.atlassian.net',
      });
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_EMAIL, 'email')).ok).toBe(true);
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_EMAIL + 1, 'email')).ok).toBe(false);
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_TOKEN, 'token')).ok).toBe(true);
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_TOKEN + 1, 'token')).ok).toBe(false);
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_SITE, 'site')).ok).toBe(true);
    expect(readAtlassianCredentials(at(MAX_ATLASSIAN_SITE + 1, 'site')).ok).toBe(false);
  });

  it('email / token の制御文字は control-char (site は site 側の規則が見る)', () => {
    const cr = String.fromCharCode(13);
    expect(readAtlassianCredentials(JSON.stringify({ email: `a@b${cr}`, token: 't', site: 'https://x.atlassian.net' })))
      .toEqual({ ok: false, reason: 'control-char' });
    expect(readAtlassianCredentials(JSON.stringify({ email: 'a@b', token: `t${cr}`, site: 'https://x.atlassian.net' })))
      .toEqual({ ok: false, reason: 'control-char' });
  });

  it('★ どの理由にも文面が在り、3 つとも違う', () => {
    const reasons: AtlassianCredsFailure[] = ['not-json', 'fields', 'control-char'];
    for (const r of reasons) expect(ATLASSIAN_CREDS_MESSAGES[r].length, r).toBeGreaterThan(10);
    expect(new Set(reasons.map((r) => ATLASSIAN_CREDS_MESSAGES[r])).size).toBe(3);
  });
});

describe('★ 両ビルドは同じ入力に同じ文を返す (文面の写しを持たない)', () => {
  /** main / ブラウザ版の `parseAtlassianToken` を叩き、投げた文だけを取る。 */
  async function both(raw: string): Promise<{ main: string; web: string }> {
    const m = (await import('../../main/clients/atlassian')) as { parseAtlassianToken: (r: string) => unknown };
    const w = (await import('../../renderer/data/saasWriteWeb')) as { parseAtlassianToken: (r: string) => unknown };
    const say = (f: (r: string) => unknown): string => {
      try { f(raw); return 'OK'; } catch (e) { return e instanceof Error ? e.message : String(e); }
    };
    return { main: say(m.parseAtlassianToken), web: say(w.parseAtlassianToken) };
  }

  /*
   * **site の断りは入れない。** あちらの文面は呼び出し側ごとに違ってよい
   * (`atlassianSiteParity.test.ts` が理由つきで留めている —— main は保存 JSON の
   * `token の site`、`shared/api/atlassian.ts` は引数の `baseUrl` と呼ぶ)。
   * ここが見るのは**資格情報の 3 段**だけで、site は共有の述語が判定だけ揃える。
   * パス 284 で私は一度 site の文面まで寄せかけ、その検査に止められた。
   */
  const CASES: readonly string[] = [
    'null', '[]', '42', 'true', '{}', 'nope', '',
    JSON.stringify({ email: 'a@b' }),
    JSON.stringify({ email: `a@b${String.fromCharCode(10)}`, token: 't', site: 'https://x.atlassian.net' }),
    good,
  ];

  it.each(CASES)('同じ文: %s', async (raw) => {
    const { main, web } = await both(raw);
    expect(main).toBe(web);
  });

  it('★ 対照: 通る入力も在り、断る入力も在る (全部 OK / 全部同文で一致していない)', async () => {
    const said = await Promise.all(CASES.map((r) => both(r)));
    const ok = said.filter((s) => s.main === 'OK');
    expect(ok.length, '1 つも通らない').toBe(1);
    /*
     * 床ではなく**集合そのもの**を見る (「N 種類以上」は N を下げれば通ってしまう)。
     * 3 つの理由がすべて実際に出ていること —— どれか 1 つが死んでいれば鳴る。
     */
    expect(new Set(said.map((s) => s.main))).toEqual(
      new Set([
        'OK',
        ATLASSIAN_CREDS_MESSAGES['not-json'],
        ATLASSIAN_CREDS_MESSAGES.fields,
        ATLASSIAN_CREDS_MESSAGES['control-char'],
      ]),
    );
  });

  it('★ `null` はどちらも TypeError ではなく台帳の文で断る', async () => {
    const { main, web } = await both('null');
    expect(main).toBe(ATLASSIAN_CREDS_MESSAGES.fields);
    expect(web).toBe(ATLASSIAN_CREDS_MESSAGES.fields);
    expect(main).not.toContain('Cannot read properties');
  });
});
