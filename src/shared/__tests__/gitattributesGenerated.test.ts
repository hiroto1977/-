import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * `.gitattributes` の `linguist-generated` は PR の diff を折り畳む —— レビューで**見えなくなる**側の属性である
 * (2026-10-28 · threat: T-210)。2026-10-28 までこのファイルは無く、知識保管庫 7,000 本の差分がレビューを埋める一方で、
 * 誰かが `src/**` を生成物と名乗る 1 行を足せば守りの変更が折り畳まれて見えなくなる形も開いていた。
 * 折り畳めるのは**台帳の生成物だけ**で、属性はその 1 つだけ。レビューの要る木を覆う行は落とす。
 */
const ROOT = path.join(__dirname, '../../..');
const req = createRequire(import.meta.url);
const { PROTECTED } = req('../../../scripts/integrity-chain.cjs') as { PROTECTED: readonly string[] };
const pkg = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as { scripts: Record<string, string> };

/** 折り畳んでよい生成物と、それを作る npm script (生成元が消えた日にこの台帳も古びる —— 実在を見る)。 */
const GENERATED: readonly { pattern: string; builtBy: string }[] = [
  { pattern: 'knowledge-vault/**', builtBy: 'vault:build' },
  { pattern: 'knowledge-graph/**', builtBy: 'graph:build' },
  { pattern: 'docs/ONTOLOGY.md', builtBy: 'ontology:md' },
];
/** 折り畳んではいけない木 (守りの本体・門・workflow・台帳・梱包と依存の設定)。 */
const REVIEWED_ROOTS = ['src/', 'scripts/', '.github/', 'security/', 'orchestration/'];
const REVIEWED_FILES = ['package.json', 'package-lock.json', 'electron-builder.json', 'CLAUDE.md', '.gitattributes', 'stryker.config.json'];

const lines = readOriginalSource(path.join(ROOT, '.gitattributes'))
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '' && !l.startsWith('#'));
const rows = lines.map((l) => {
  const [pattern, ...attrs] = l.split(/\s+/);
  return { pattern: pattern!, attrs };
});

/** `dir/**` はその木の全部、それ以外は完全一致 (台帳が使うのはこの 2 形だけ)。 */
const covers = (pattern: string, p: string): boolean =>
  pattern.endsWith('/**') ? p.startsWith(pattern.slice(0, -2)) : pattern === p;

describe('.gitattributes — 折り畳む物は台帳の生成物だけ (threat: T-210)', () => {
  it('★ .gitattributes が折り畳む物は台帳の生成物だけで、レビューの要る木は 1 行も覆わない (threat: T-210)', () => {
    // 両方向: 台帳に無い行は落ち、台帳の行が消えても落ちる。
    expect(rows.map((r) => r.pattern).sort()).toEqual(GENERATED.map((g) => g.pattern).sort());
    for (const r of rows) expect(r.attrs, r.pattern).toEqual(['linguist-generated']);
    // レビューの要る木・保護対象を覆う行は無い。
    const reviewed = [...REVIEWED_FILES, ...PROTECTED, 'src/main/main.ts', 'scripts/integrity-chain.cjs', '.github/workflows/ci.yml'];
    for (const r of rows) {
      for (const root of REVIEWED_ROOTS) expect(r.pattern.startsWith(root), `${r.pattern} は ${root} を覆う`).toBe(false);
      for (const f of reviewed) expect(covers(r.pattern, f), `${r.pattern} は ${f} を覆う`).toBe(false);
    }
  });

  it('台帳の生成物は実在し、生成元の npm script も実在する', () => {
    for (const g of GENERATED) {
      const p = g.pattern.endsWith('/**') ? g.pattern.slice(0, -3) : g.pattern;
      expect(existsSync(path.join(ROOT, p)), p).toBe(true);
      expect(pkg.scripts[g.builtBy], `${g.builtBy} は package.json の scripts に無い`).toBeTruthy();
    }
  });

  it('標本: 針は覆う行に当たる (空の検査にしない)', () => {
    expect(covers('knowledge-vault/**', 'knowledge-vault/academic/a.md')).toBe(true);
    expect(covers('docs/ONTOLOGY.md', 'docs/ONTOLOGY.md')).toBe(true);
    expect(covers('src/**', 'src/main/main.ts')).toBe(true);
    expect(covers('docs/ONTOLOGY.md', 'docs/ONTOLOGY.md.bak')).toBe(false);
    // 生成物と名乗る 1 行が src/ に付いた形は、上の根の検査が落とす。
    expect(REVIEWED_ROOTS.some((root) => 'src/**'.startsWith(root))).toBe(true);
  });
});
