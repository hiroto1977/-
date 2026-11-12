import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../secrets';

/**
 * **保管ファイルの形は、Mamori へ移しても 1 byte も変わらない** (2026-11-12 · MG-069)。
 *
 * `secrets.ts` は Mamori の生成物になり、保管ファイルの中身を素のオブジェクトではなく `Map<string, string>` で持つ
 * (Mamori は計算した鍵の読み書きを持たない)。Map と素のオブジェクトは 2 か所で振る舞いが違うので、そこを留める:
 *
 * 1. **鍵 `__proto__`** —— 素のオブジェクトへの `store['__proto__'] = '文字列'` は原型への代入になり、何も起きない
 *    (読んでも書いても落ちる)。Map では本物の欄になるので、読むとき (`parseStore`) と書くとき (`writeStore`) の両方で落とす。
 * 2. **鍵の並び** —— 素のオブジェクトは整数に見える鍵を先に昇順で並べ、Map は入れた順に並べる。書くときに
 *    `Object.fromEntries` を通すので、保管ファイルの bytes は元と同じ並びになる。
 *
 * 加えて、読みの結果が `undefined` のとき (型の上では起きないが、元は `== null` で受けていた) も「まだ無い」と読む。
 */
let userDataDir = '';
vi.mock('electron', () => ({
  app: { getPath: () => userDataDir },
  safeStorage: {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptStringAsync: async (b: Buffer) => ({ shouldReEncrypt: false, result: b.toString('utf8').replace(/^enc:/, '') }),
  },
}));
vi.mock('../oauth', () => ({ OAUTH_CONFIGS: {}, refresh: async () => ({}) }));

// 読みの結果を差し替える継ぎ目: `override.active` の間だけ `readFileWithBackup` が `override.value` を返す。
const override: { active: boolean; value: unknown } = { active: false, value: undefined };
vi.mock('../atomicWrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../atomicWrite')>();
  return {
    ...actual,
    readFileWithBackup: async (...args: Parameters<typeof actual.readFileWithBackup>) => {
      if (override.active) return override.value as string | null;
      return actual.readFileWithBackup(...args);
    },
  };
});

let currentSecretsModule: Promise<typeof import('../secrets')> | null = null;
const secretsModule = (): Promise<typeof import('../secrets')> =>
  (currentSecretsModule ??= rereadModule<typeof import('../secrets')>(import.meta.url, '../secrets'));

const plain = (v: string): string => `plain:${Buffer.from(v, 'utf8').toString('base64')}`;
const storeFile = (): string => path.join(userDataDir, 'service-hub-secrets.json');
const fileText = (): Promise<string> => fs.readFile(storeFile(), 'utf8');

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-store-shape-'));
  currentSecretsModule = null;
  override.active = false;
  override.value = undefined;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(userDataDir, { recursive: true, force: true });
});

describe('secrets — 保管ファイルの形 (鍵 `__proto__`・鍵の並び・読みの結果が undefined)', () => {
  it('★ 保管ファイルに鍵 `__proto__` が在っても、一覧にも読みにも出ず、次の書き込みで消える', async () => {
    const m = await secretsModule();
    // JSON.parse は `__proto__` を自分の欄として作る (原型は変わらない) —— 標本がその形であることを先に確かめる
    const seeded = `{"github":"${plain('gh-token')}","__proto__":"${plain('smuggled')}"}`;
    expect(Object.hasOwn(JSON.parse(seeded) as object, '__proto__')).toBe(true);
    await fs.writeFile(storeFile(), seeded);

    expect(await m.listConfiguredServices()).toEqual(['github']);
    expect(await m.readStoredToken('__proto__')).toEqual({ ok: false, reason: 'absent' });
    expect(await m.getToken('github')).toBe('gh-token');

    await m.setToken('slack', 'slack-token');
    const text = await fileText();
    expect(text).not.toContain('__proto__');
    // 針が的に当たること: 書き込む前の標本は同じ針に当たっていた
    expect(seeded).toContain('__proto__');
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(['github', 'slack']);
  });

  it('★ 鍵 `__proto__` へ保存しても欄は生えない (保存は成功を返し、読むと「無い」)', async () => {
    const m = await secretsModule();
    await m.setToken('github', 'gh-token');
    await expect(m.setToken('__proto__', 'smuggled')).resolves.toBeUndefined();
    const parsed = JSON.parse(await fileText()) as object;
    expect(Object.hasOwn(parsed, '__proto__')).toBe(false);
    expect(Object.keys(parsed)).toEqual(['github']);
    expect(await m.readStoredToken('__proto__')).toEqual({ ok: false, reason: 'absent' });
    expect(await m.listConfiguredServices()).toEqual(['github']);
    // 消す側も何も壊さない
    await expect(m.clearToken('__proto__')).resolves.toBeUndefined();
    expect(await m.getToken('github')).toBe('gh-token');
  });

  it('★ 原型に在る名前 (constructor / toString) は普通の鍵として往復する (落とすのは `__proto__` だけ)', async () => {
    const m = await secretsModule();
    await m.setToken('constructor', 'c-token');
    await m.setToken('toString', 't-token');
    expect(await m.getToken('constructor')).toBe('c-token');
    expect(await m.getToken('toString')).toBe('t-token');
    expect((await m.listConfiguredServices()).sort()).toEqual(['constructor', 'toString']);
    expect(await m.readStoredToken('hasOwnProperty')).toEqual({ ok: false, reason: 'absent' });
  });

  it('★ 保管ファイルの鍵の並びは素のオブジェクトの並び (整数に見える鍵が先・昇順) のまま', async () => {
    const m = await secretsModule();
    await m.setToken('slack', 's');
    await m.setToken('10', 'ten');
    await m.setToken('2', 'two');
    await m.setToken('github', 'g');
    const text = await fileText();
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['2', '10', 'slack', 'github']);
    // 字面でも: 入れた順 (slack → 10 → 2 → github) ではない
    expect(text.indexOf('"2":')).toBeLessThan(text.indexOf('"10":'));
    expect(text.indexOf('"10":')).toBeLessThan(text.indexOf('"slack":'));
    // 控えも同じ bytes
    expect(await fs.readFile(`${storeFile()}.prev`, 'utf8')).toBe(text);
  });

  it('★ 読みの結果が undefined でも「まだ無い」と読む (読めない保管ファイルとは言わない)', async () => {
    const m = await secretsModule();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    override.active = true;
    override.value = undefined;
    expect(await m.listConfiguredServices()).toEqual([]);
    expect(await m.readStoredToken('github')).toEqual({ ok: false, reason: 'absent' });
    expect(logged).not.toHaveBeenCalled();
    // 対照: 同じ継ぎ目で JSON でない文字列を返すと「読めない」と断る (継ぎ目が効いている)
    override.value = '{not json';
    await expect(m.listConfiguredServices()).rejects.toThrow('保管ファイルを読めませんでした (JSON として読めず、使える控えも無い)。');
    expect(logged).toHaveBeenCalled();
  });

  it('★ 読みの結果が null (ファイルがまだ無い) なら空の保管として書ける', async () => {
    const m = await secretsModule();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await m.listConfiguredServices()).toEqual([]);
    await m.setToken('github', 'first');
    expect(await m.getToken('github')).toBe('first');
    expect(logged).not.toHaveBeenCalled();
  });
});
