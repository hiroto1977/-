/**
 * 本物のファイルシステムを 1 度だけ通す検査 (teamradar)。
 *
 * `teamradar.test.ts` の保存・書き出しはすべて `StateDeps` / `ExportSvgDeps`
 * を差し替えて呼んでいるので、既定値である `fs.mkdir({recursive:true})` /
 * `fs.writeFile` / `fs.rename` / `new Date()` は 1 度も動いていなかった。
 * 保存は **tmp へ書いてから rename する** 形なので、その段取り自体が
 * 未検査だった (途中で落ちても本体が壊れない、という性質)。
 *
 * 置き場所は `os.homedir()` の下に決まる。利用者の実ホームには触れたく
 * ないので `node:os` の `homedir` だけ一時ディレクトリへ差し替える
 * (`process.env.HOME` では worker thread に届かない — 罠として
 *  templates.realfs.test.ts に記録済み)。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';

const state = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  const homedir = () => state.home;
  return { ...actual, homedir, default: { ...actual, homedir } };
});

const {
  ACTIONS,
  defaultStatePath,
  defaultSvgExportPath,
  loadTeamRadarState,
  saveTeamRadarState,
} = await import('../teamradar');
const { tmpdir } = await import('node:os');

describe('teamradar — 本物のファイルシステム', () => {
  beforeAll(async () => {
    state.home = await mkdtemp(path.join(tmpdir(), 'teamradar-'));
  });
  afterAll(async () => {
    await rm(state.home, { recursive: true, force: true });
  });

  it('差し替えたホームが置き場所に反映されている', () => {
    // これが効いていないと、以下の検査は利用者の実ホームを見てしまう。
    expect(defaultStatePath().startsWith(state.home + path.sep)).toBe(true);
    expect(defaultSvgExportPath().startsWith(state.home + path.sep)).toBe(true);
  });

  it('階層が無くても掘り、tmp へ書いてから本体へ差し替える', async () => {
    const target = defaultStatePath();
    await expect(access(target)).rejects.toThrow(); // まだ無い

    await saveTeamRadarState({
      department: '開発部',
      evaluatedAt: '2026-05-01',
      members: [{ id: 'm1', name: '田中', scores: [3, 3, 3, 3, 3] }],
    });

    const written = JSON.parse(await readFile(target, 'utf8'));
    expect(written).toMatchObject({ department: '開発部', evaluatedAt: '2026-05-01' });
    expect(written.members).toHaveLength(1);

    // 途中の tmp が残っていない = rename まで通っている
    const files = await readdir(path.dirname(target));
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('書いた内容をそのまま読み戻せる', async () => {
    const back = await loadTeamRadarState();
    expect(back.department).toBe('開発部');
    expect(back.members[0]).toMatchObject({ id: 'm1', name: '田中' });
  });

  it('SVG の書き出しも階層を掘り、bytes が実ファイルと一致する', async () => {
    const before = Date.now();
    const result = (await ACTIONS['export-svg']!({
      token: '',
      payload: { title: 'チーム状況' },
    })) as { path: string; bytes: number; generatedAt: string };

    expect(result.path).toBe(defaultSvgExportPath());
    const svg = await readFile(result.path, 'utf8');
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('チーム状況');
    // 多バイト文字を含むので、バイト数と文字数がずれた状態で一致を見る。
    expect(result.bytes).toBe(Buffer.byteLength(svg, 'utf8'));
    expect(result.bytes).toBeGreaterThan(svg.length);

    // now を差し替えていないので実時計が使われる
    const stamped = Date.parse(result.generatedAt);
    expect(Number.isNaN(stamped)).toBe(false);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('保存の action も本物の経路を通る', async () => {
    const saved = (await ACTIONS['save-state']!({
      token: '',
      payload: { department: '品質保証部', evaluatedAt: '2026-06-01', members: [] },
    })) as { department: string };
    expect(saved.department).toBe('品質保証部');
    expect((await loadTeamRadarState()).department).toBe('品質保証部');
  });
});
