/**
 * 本物のファイルシステムを 1 度だけ通す検査。
 *
 * `templates.test.ts` の書き出し検査はすべて `ExportDeps` を差し替えて
 * 呼んでいるので、既定値である `fs.mkdir({recursive:true})` /
 * `fs.writeFile` / `new Date()` は 1 度も動いていなかった。レンダラーから
 * 実際に届くのは `ACTIONS['export-template']` のほうなので、そちらを
 * 本物のファイルシステムで通す。
 *
 * 書き出し先は `os.homedir()` の下に決まる。利用者の実ホームには触れたく
 * ないので `node:os` の `homedir` だけ一時ディレクトリへ差し替える。
 * （`process.env.HOME` の書き換えでは足りない — libuv の `uv_os_homedir` は
 *  OS 側の環境を読むため、worker thread では `process.env` への代入が
 *  届かない。Stryker は worker thread で走るので、そこだけ緑になる検査に
 *  なってしまう。実際に一度そう書いて、変異検査の初回実行で落ちた。）
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';

const state = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const homedir = () => state.home;
  return { ...actual, homedir, default: { ...actual, homedir } };
});

const { ACTIONS, defaultExportDir, defaultExportPath } = await import('../templates');
const { tmpdir } = await import('node:os');

describe('ACTIONS["export-template"] — 本物の書き出し', () => {
  beforeAll(async () => {
    state.home = await mkdtemp(path.join(tmpdir(), 'tmpl-export-'));
  });

  afterAll(async () => {
    await rm(state.home, { recursive: true, force: true });
  });

  it('差し替えたホームが書き出し先に反映されている', () => {
    // これが効いていないと、以下の検査は利用者の実ホームを見てしまう。
    expect(defaultExportDir().startsWith(state.home + path.sep)).toBe(true);
  });

  it('階層が 1 段も無くても掘り、UTF-8 で書き、bytes が実ファイルと一致する', async () => {
    // ~/.local/business-hub/data/templates はまだ存在しない。
    // recursive を落とすとここで ENOENT になる。
    await expect(access(defaultExportDir())).rejects.toThrow();

    const before = Date.now();
    const result = (await ACTIONS['export-template']!({
      token: '',
      payload: { templateId: 'certificate', params: { title: '感謝状あ' } },
    })) as { path: string; bytes: number; generatedAt: string };

    expect(result.path).toBe(defaultExportPath('certificate'));

    const written = await readFile(result.path, 'utf8');
    expect(written).toContain('感謝状あ');
    // 多バイト文字を含むので、バイト数と文字数がずれた状態で一致を見る。
    expect(result.bytes).toBe(Buffer.byteLength(written, 'utf8'));
    expect(result.bytes).toBeGreaterThan(written.length);

    // now を差し替えていないので実時計が使われる。
    const stamped = Date.parse(result.generatedAt);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
