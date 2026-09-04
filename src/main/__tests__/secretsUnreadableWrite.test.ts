import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let userDataDir = '';
vi.mock('electron', () => ({
  app: {
    getPath: (n: string) => (n === 'userData' ? userDataDir : path.join(userDataDir, `WRONG-${n}`)),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(`enc:${v}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  },
}));
vi.mock('../oauth', () => ({ OAUTH_CONFIGS: {}, refresh: async () => ({}) }));

/*
 * **読めなかった保管ファイルの上に書くと、読めなかっただけの中身が消える。**
 *
 * `readStore` は読めないとき `{}` を返す。読み出しとしては正しい —— 落ちる
 * より空の方がまし。だが `setToken` / `clearToken` はその `{}` を**土台に
 * して書く**ので、消えるのは「読めなかった中身」全部になる。
 *
 * 直す前の実測:
 *
 *   保存前 listConfiguredServices() → ["github","slack"]
 *   ファイルが 1 MB 超へ成長 (原因は問わない)
 *   setToken('notion', …)            → **成功を返す**
 *   保存後のファイル                  → { notion } だけ
 *
 * github と slack は復旧不能。膨らませていた中身ごと消えるので手掛かりも
 * 残らない。**読み出しの安全側 (`{}`) と書き込みの安全側 (触らない) は
 * 逆向き**である。
 */

const FILE_NAME = 'service-hub-secrets.json';
const storePath = (): string => path.join(userDataDir, FILE_NAME);

beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sh-secrets-unreadable-'));
  vi.resetModules();
});

/** 原因を問わず「読めない大きさ」にする。 */
async function growBeyondLimit(): Promise<void> {
  const raw = JSON.parse(await fs.readFile(storePath(), 'utf8')) as Record<string, string>;
  raw['padding'] = 'x'.repeat(1024 * 1024 + 10);
  await fs.writeFile(storePath(), JSON.stringify(raw), 'utf8');
}

describe('読めなかった保管ファイルの上には書かない', () => {
  it('大きすぎて読めないとき、保存は既存を消さずに断る', async () => {
    const { setToken, listConfiguredServices } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await setToken('slack', 'xoxb_real');
    expect(await listConfiguredServices()).toEqual(['github', 'slack']);

    await growBeyondLimit();
    const sizeBefore = (await fs.stat(storePath())).size;

    await expect(setToken('notion', 'secret_notion')).rejects.toThrow(/保存を中止/);

    // **ファイルに触っていない** = 中身は復旧できる。
    expect((await fs.stat(storePath())).size, 'ファイルを書き換えている').toBe(sizeBefore);
    const raw = JSON.parse(await fs.readFile(storePath(), 'utf8')) as Record<string, string>;
    expect(Object.keys(raw).sort(), '既存の資格情報が消えている').toEqual(
      ['github', 'padding', 'slack'].sort(),
    );
  });

  it('解除 (clearToken) も同じく断る', async () => {
    const { setToken, clearToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await setToken('slack', 'xoxb_real');
    await growBeyondLimit();
    await expect(clearToken('github')).rejects.toThrow(/保存を中止/);
    const raw = JSON.parse(await fs.readFile(storePath(), 'utf8')) as Record<string, string>;
    expect(Object.keys(raw), 'slack まで消えている').toContain('slack');
  });

  it('壊れた JSON で控えも無いとき、保存は断る', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await fs.writeFile(storePath(), '{ this is not json', 'utf8');
    await fs.rm(`${storePath()}.prev`, { force: true });
    await expect(setToken('notion', 'secret_notion')).rejects.toThrow(/保存を中止/);
  });

  it('まだ 1 件も無いときは普通に保存できる (空と「読めない」を混同しない)', async () => {
    const { setToken, listConfiguredServices } = await import('../secrets');
    await expect(setToken('github', 'ghp_first')).resolves.toBeUndefined();
    expect(await listConfiguredServices()).toEqual(['github']);
  });

  it('読める状態に戻せば、また保存できる (行き止まりにしない)', async () => {
    const { setToken, listConfiguredServices } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await growBeyondLimit();
    await expect(setToken('notion', 'x')).rejects.toThrow();

    // 利用者が膨らんだ分を取り除いた状態を模す。
    const raw = JSON.parse(await fs.readFile(storePath(), 'utf8')) as Record<string, string>;
    delete raw['padding'];
    await fs.writeFile(storePath(), JSON.stringify(raw), 'utf8');

    await expect(setToken('notion', 'secret_notion')).resolves.toBeUndefined();
    expect((await listConfiguredServices()).sort()).toEqual(['github', 'notion']);
  });

  it('読み出しは今までどおり空を返す (画面を止めない)', async () => {
    const { setToken, listConfiguredServices, getToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await growBeyondLimit();
    expect(await listConfiguredServices(), '読み出しまで投げている').toEqual([]);
    expect(await getToken('github')).toBeNull();
  });
});

/**
 * **断った理由を、原因ごとに見分ける。**
 *
 * 上の検査群は `rejects.toThrow(/保存を中止/)` を使っている。これは文面の
 * **固定の後半**に当たるので、断ること自体は見えるが、**なぜ断ったのか
 * (大きすぎる / JSON が壊れている) を運ぶ前半は誰も見ていなかった** ——
 * 変異検査で 4 件生存 (2026-08-30 実測)。
 *
 * 理由が空文字に潰れると、画面には「保存を中止しました」だけが出る。
 * 利用者は**何を直せばいいか分からない**まま、資格情報を保存できない状態に
 * 置かれる。ここは行き止まりを作らないための文面である。
 *
 * 本 PR で 3 度目の同じ形 (`vault.ts` の接頭辞共有、`exportPaths.ts` の
 * 2 つの門、ここ)。**「投げること」ではなく「どこで・なぜ投げたか」を当てる。**
 */
describe('断った理由を運ぶ', () => {
  it('★ 大きすぎるときは、実寸と上限を添える', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await growBeyondLimit();
    await expect(setToken('notion', 'secret_notion')).rejects.toThrow(
      /バイト \/ 上限 \d+ バイト/,
    );
  });

  it('★ JSON が壊れているときは、そう言う', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await fs.writeFile(storePath(), '{ this is not json', 'utf8');
    await fs.rm(`${storePath()}.prev`, { force: true });
    await expect(setToken('notion', 'secret_notion')).rejects.toThrow(
      /JSON として読めず、使える控えも無い/,
    );
  });

  it('★ 文面の前半 (何が起きたか) も落ちていない', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await growBeyondLimit();
    await expect(setToken('notion', 'secret_notion')).rejects.toThrow(
      /保管ファイルを読めませんでした \(/,
    );
  });

  /*
   * 例外の `name` は記録と切り分けに使う。既定の `Error` に戻っても
   * 文面は変わらないので、**名前そのものを当てないと気付けない**。
   */
  it('★ 例外の name で種別が分かる', async () => {
    const { setToken } = await import('../secrets');
    await setToken('github', 'ghp_real');
    await growBeyondLimit();
    const err = await setToken('notion', 'x').then(
      () => null,
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe('SecretsUnreadableError');
  });
});
