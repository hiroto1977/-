import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * `scripts/lib/artifact-freshness.cjs` — 「古い成果物を相手に検査したつもり」
 * を防ぐ判定。2026-08-24 に実際に 2 回踏んだ (防御を外したのに緑が返った。
 * 型検査で build が止まり、前回の HTML が残っていた)。
 *
 * 成果物を相手にする道具は e2e / perf / smoke の 3 つあり、判定はこの
 * 1 モジュールだけが持つ。だからここが壊れると 3 つ同時に空撃ちになる。
 */
const req = createRequire(import.meta.url);
const { newestSourceMtime, staleArtifacts, newestMaterial, bundledJsonOutsideSrc, BUILD_MATERIALS } = req(
  '../../../scripts/lib/artifact-freshness.cjs',
) as {
  newestSourceMtime: (dir: string) => number;
  staleArtifacts: (
    artifacts: readonly string[],
    srcDir: string,
    repoRoot?: string,
  ) => { file: string; lagSec: number; newest: string | null }[];
  newestMaterial: (srcDir: string, repoRoot?: string) => { mtimeMs: number; file: string | null };
  bundledJsonOutsideSrc: (srcDir: string, repoRoot: string) => string[];
  BUILD_MATERIALS: readonly string[];
};
const REPO_ROOT = path.resolve(__dirname, '../../..');

let tmp: string;
const w = (rel: string, mtimeMs?: number, content = 'x') => {
  const f = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
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

/*
 * ## 材料は src/ だけではなかった (2026-09-17 · パス 302)
 *
 * 実測: `scripts/inline-html.cjs` と `orchestration/registry.json` を dist より
 * 新しくして `npm run perf` を回すと exit 0 で緑だった。判定が `src/` の
 * ts / tsx / css / html しか見ていなかったため。材料の台帳 (`BUILD_MATERIALS`) と
 * 束に入る JSON の実物の走査を足し、**一番新しい材料を名指し**するようにした。
 */
describe('newestMaterial / staleArtifacts — src/ の外の材料も見る (パス 302)', () => {
  const OLD = 1_700_000_000_000;
  const NEW = 1_800_000_000_000;

  it.each(['scripts/inline-html.cjs', 'vite.config.ts', 'tsconfig.app.json', 'package-lock.json'])(
    '★ %s が成果物より新しければ古いと言い、その名を挙げる',
    (rel) => {
      w('src/a.ts', OLD);
      w(rel, NEW);
      const art = w('dist/app.html', OLD + 1);
      const out = staleArtifacts([art], path.join(tmp, 'src'), tmp);
      expect(out).toHaveLength(1);
      expect(out[0]!.newest).toBe(rel);
    },
  );

  it('★ src/ の外の JSON でも、src/ が import していれば材料', () => {
    w('src/a.ts', OLD, "import { org } from '../orchestration/registry.json';\n");
    w('orchestration/registry.json', NEW, '{}');
    const art = w('dist/app.html', OLD + 1);
    expect(bundledJsonOutsideSrc(path.join(tmp, 'src'), tmp)).toEqual(['orchestration/registry.json']);
    const out = staleArtifacts([art], path.join(tmp, 'src'), tmp);
    expect(out.map((o) => o.newest)).toEqual(['orchestration/registry.json']);
  });

  it('★ src/ の中の .json も材料 (拡張子の網に json を足した)', () => {
    w('src/data/x.json', NEW, '{}');
    const art = w('dist/app.html', OLD);
    expect(newestSourceMtime(path.join(tmp, 'src'))).toBe(NEW);
    expect(staleArtifacts([art], path.join(tmp, 'src'), tmp)[0]!.newest).toBe('src/data/x.json');
  });

  it('対照 — docs / README / import されない JSON は材料ではない (文書だけ直しても止めない)', () => {
    w('src/a.ts', OLD);
    w('docs/x.md', NEW);
    w('README.md', NEW);
    w('orchestration/unused.json', NEW, '{}');
    const art = w('dist/app.html', OLD + 1);
    expect(staleArtifacts([art], path.join(tmp, 'src'), tmp)).toEqual([]);
  });

  it('対照 — 成果物のほうが材料全部より新しければ何も挙げない', () => {
    w('src/a.ts', OLD);
    w('scripts/inline-html.cjs', OLD);
    w('vite.config.ts', OLD);
    const art = w('dist/app.html', NEW);
    expect(staleArtifacts([art], path.join(tmp, 'src'), tmp)).toEqual([]);
    expect(newestMaterial(path.join(tmp, 'src'), tmp).mtimeMs).toBe(OLD);
  });

  it('repoRoot を渡さなければ旧来どおり src/ だけを見る (呼び出し側の互換)', () => {
    w('src/a.ts', OLD);
    w('scripts/inline-html.cjs', NEW);
    const art = w('dist/app.html', OLD + 1);
    expect(staleArtifacts([art], path.join(tmp, 'src'))).toEqual([]);
  });
});

/*
 * ## 台帳は実物と突き合わせる (パス 302)
 *
 * 「材料の一覧」を手で書くと、増えたときに黙る。package.json のビルド連鎖・
 * 根の tsconfig・vite の設定・束に入る JSON の実物から数え直して、台帳と
 * 両方向に一致させる。
 */
describe('BUILD_MATERIALS — 台帳と実物 (パス 302)', () => {
  // 原文の道具で読む (`originalSourcePolicy.test.ts` の規則: 生の readFileSync は台帳制)。
  const pkg = JSON.parse(readOriginalSource(path.join(REPO_ROOT, 'package.json'))) as {
    scripts: Record<string, string>;
  };

  it('台帳の物はすべて実在する (死んだ項目を残さない)', () => {
    for (const rel of BUILD_MATERIALS) {
      expect(fs.existsSync(path.join(REPO_ROOT, rel)), rel).toBe(true);
    }
  });

  it('★ ビルド連鎖が走らせる scripts/ は全部台帳に在る', () => {
    const chain = ['build', 'build:renderer', 'build:web', 'build:web:lite'].map((k) => pkg.scripts[k] ?? '').join(' && ');
    const ran = [...chain.matchAll(/node (scripts\/[\w./-]+\.cjs)/g)].map((m) => m[1]!);
    expect(ran.length, '走査が空 (ビルド連鎖に scripts/ が無いはずがない)').toBeGreaterThanOrEqual(1);
    for (const rel of ran) expect(BUILD_MATERIALS, rel).toContain(rel);
  });

  it('★ 根の tsconfig*.json と vite.config.ts は全部台帳に在る', () => {
    // 原文の道具で列挙する (生の readdirSync は `originalSourcePolicy.test.ts` の台帳制)。
    const tsconfigs = readOriginalDirEntries(REPO_ROOT)
      .filter((e) => e.isFile() && /^tsconfig.*\.json$/.test(e.name))
      .map((e) => e.name);
    expect(tsconfigs.length).toBeGreaterThanOrEqual(2);
    for (const n of tsconfigs) expect(BUILD_MATERIALS, n).toContain(n);
    expect(BUILD_MATERIALS).toContain('vite.config.ts');
    expect(BUILD_MATERIALS).toContain('package.json');
    expect(BUILD_MATERIALS).toContain('package-lock.json');
  });

  it('★ 実物: src/ の外の束に入る JSON は 1 件以上在り、どれも src/ の下ではない (標本 orchestration/registry.json)', () => {
    const outside = bundledJsonOutsideSrc(path.join(REPO_ROOT, 'src'), REPO_ROOT);
    expect(outside).toContain('orchestration/registry.json');
    for (const rel of outside) expect(rel.startsWith('src/'), rel).toBe(false);
  });

  /**
   * **言及ではなく、渡している形を見る。** 最初の版は `\brepoRoot\b` で、対照
   * (e2e の `repoRoot,` をコメントアウト) が**鳴らなかった** —— コメントの中の
   * 語と `path.join(repoRoot, 'src')` の引数で満たされていた (パス 297・298 と
   * 同じ罠を 3 度目)。コメントを落とし、options の**プロパティの形**
   * (`{` か `,` の後に `repoRoot` が来て `,` `:` `}` が続く) だけを数える。
   */
  const PASSES_REPO_ROOT = /[{,]\s*repoRoot\s*[,:}]/;
  const { stripComments } = req(path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs')) as {
    stripComments: (s: string) => string;
  };

  it('針の標本 — プロパティの形には当たり、引数の言及とコメントには当たらない', () => {
    expect('{ srcDir: x, repoRoot, tool: "perf" }').toMatch(PASSES_REPO_ROOT);
    expect('{\n  srcDir: x,\n  repoRoot: ROOT,\n}').toMatch(PASSES_REPO_ROOT);
    expect("{ srcDir: path.join(repoRoot, 'src'), tool: 'E2E' }").not.toMatch(PASSES_REPO_ROOT);
    expect(stripComments("{ srcDir: x,\n  // repoRoot,\n  tool: 'E2E' }")).not.toMatch(PASSES_REPO_ROOT);
  });

  /**
   * 母集団は package.json から導く —— `e2e*` / `perf*` / `smoke*` / `exp*` が起動する `scripts/` の本。
   * パス 304 まではここに 3 本を**手で並べて**いて、`e2e:ollama` と `smoke:app` が鮮度を
   * 見ていないことに誰も気づかなかった (手で並べた一覧は、足した道具を黙って外に置く)。
   */
  function artifactTools(): string[] {
    const pkg = JSON.parse(readOriginalSource(path.join(REPO_ROOT, 'package.json'))) as {
      scripts: Record<string, string>;
    };
    const out = new Set<string>();
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (!/^(e2e|perf|smoke|exp)(:|$)/.test(name)) continue;
      for (const m of cmd.matchAll(/\bscripts\/[\w/.-]+\.cjs\b/g)) out.add(m[0]);
    }
    return [...out].sort();
  }

  it('★ 母集団は 8 本で、台帳と一致する (両方向 —— 道具が増えても減っても鳴る)', () => {
    // パス 305: exp:* 3 本 (横はみ出し / 実行時の不変条件 / 耐久) も dist を読むのに鮮度を見ていなかった
    expect(artifactTools()).toEqual([
      'scripts/e2e/core.cjs',
      'scripts/e2e/ollama.cjs',
      'scripts/overflow-check.cjs',
      'scripts/perf/startup.cjs',
      'scripts/runtime-security-exp.cjs',
      'scripts/screenshot.cjs',
      'scripts/smoke-app.cjs',
      'scripts/soak-test.cjs',
    ]);
  });

  it('★ 成果物を相手にする道具は全部 鮮度検査を呼び、repoRoot を渡している (渡さないと src/ しか見ない)', () => {
    for (const rel of artifactTools()) {
      const text = stripComments(readOriginalSource(path.join(REPO_ROOT, rel)));
      const call = /assertFreshArtifacts\(([\s\S]*?)\);/.exec(text);
      expect(call, `${rel} は鮮度検査を呼ぶ`).not.toBeNull();
      expect(call![1], `${rel} は repoRoot を options のプロパティとして渡す`).toMatch(PASSES_REPO_ROOT);
    }
  });
});
