import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * `scripts/lib/artifact-freshness.cjs` — 「古い成果物を相手に検査したつもり」
 * を防ぐ判定。2026-08-24 に実際に 2 回踏んだ (防御を外したのに緑が返った。
 * 型検査で build が止まり、前回の HTML が残っていた)。
 *
 * 成果物を相手にする道具は e2e / perf / smoke の 3 つあり、判定はこの
 * 1 モジュールだけが持つ。だからここが壊れると 3 つ同時に空撃ちになる。
 */
const req = createRequire(import.meta.url);
const { newestSourceMtime, staleArtifacts } = req(
  '../../../scripts/lib/artifact-freshness.cjs',
) as {
  newestSourceMtime: (dir: string) => number;
  staleArtifacts: (artifacts: readonly string[], srcDir: string) => { file: string; lagSec: number }[];
};

let tmp: string;
const w = (rel: string, mtimeMs?: number) => {
  const f = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'x');
  if (mtimeMs !== undefined) fs.utimesSync(f, mtimeMs / 1000, mtimeMs / 1000);
  return f;
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('newestSourceMtime — 束に入る物だけ数える', () => {
  it('存在しない場所は 0', () => {
    expect(newestSourceMtime(path.join(tmp, 'nope'))).toBe(0);
  });

  it('.ts / .tsx / .css / .html を見る', () => {
    const t = 1_700_000_000_000;
    w('src/a.ts', t);
    expect(newestSourceMtime(path.join(tmp, 'src'))).toBe(t);
  });

  it('★ __tests__ は数えない (検査だけ直したときに止めないため)', () => {
    const old = 1_700_000_000_000;
    const recent = 1_800_000_000_000;
    w('src/a.ts', old);
    w('src/__tests__/a.test.ts', recent);
    expect(newestSourceMtime(path.join(tmp, 'src'))).toBe(old);
  });

  it('★ 束に入らない拡張子は数えない', () => {
    const old = 1_700_000_000_000;
    const recent = 1_800_000_000_000;
    w('src/a.ts', old);
    w('src/README.md', recent);
    w('src/notes.txt', recent);
    expect(newestSourceMtime(path.join(tmp, 'src'))).toBe(old);
  });

  it('入れ子の一番新しいものを返す', () => {
    w('src/a.ts', 1_700_000_000_000);
    w('src/deep/nest/b.tsx', 1_800_000_000_000);
    expect(newestSourceMtime(path.join(tmp, 'src'))).toBe(1_800_000_000_000);
  });
});

describe('staleArtifacts — 古い成果物を挙げる', () => {
  it('成果物のほうが新しければ何も挙げない', () => {
    w('src/a.ts', 1_700_000_000_000);
    const art = w('dist/app.html', 1_800_000_000_000);
    expect(staleArtifacts([art], path.join(tmp, 'src'))).toEqual([]);
  });

  it('★ ソースのほうが新しければ挙げる (これが本題)', () => {
    w('src/a.ts', 1_800_000_000_000);
    const art = w('dist/app.html', 1_700_000_000_000);
    const out = staleArtifacts([art], path.join(tmp, 'src'));
    expect(out).toHaveLength(1);
    expect(out[0]!.file).toBe(art);
    expect(out[0]!.lagSec).toBe(100_000_000);
  });

  it('複数のうち古いものだけ挙げる', () => {
    w('src/a.ts', 1_750_000_000_000);
    const oldOne = w('dist/old.html', 1_700_000_000_000);
    const newOne = w('dist/new.html', 1_800_000_000_000);
    const out = staleArtifacts([oldOne, newOne], path.join(tmp, 'src'));
    expect(out.map((s) => s.file)).toEqual([oldOne]);
  });

  it('存在しない成果物は無視する (「無い」は各道具が先に扱う)', () => {
    w('src/a.ts', 1_800_000_000_000);
    expect(staleArtifacts([path.join(tmp, 'dist', 'nope.html')], path.join(tmp, 'src'))).toEqual([]);
  });

  it('★ ソースが 1 つも無ければ判定しない (誤って全部を古い扱いしない)', () => {
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    const art = w('dist/app.html', 1_700_000_000_000);
    expect(staleArtifacts([art], path.join(tmp, 'src'))).toEqual([]);
  });

  it('同時刻は古くない (境界)', () => {
    const t = 1_700_000_000_000;
    w('src/a.ts', t);
    const art = w('dist/app.html', t);
    expect(staleArtifacts([art], path.join(tmp, 'src'))).toEqual([]);
  });
});
