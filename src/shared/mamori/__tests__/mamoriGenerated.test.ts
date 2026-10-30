import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readOriginalSource } from '../../__tests__/originalSource';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **生成物は .mamori から組み直した物と 1 byte も違わない** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 守りの層は Mamori で書いてあり、`.ts` は生成物である。生成物を手で直すと、Mamori の規則
 * (印は gate で作る・危ない口は sink で呼ぶ) を通らない変更が出荷される —— だから生成物と元の一致を
 * 毎回の npm test で見る (CLI `npm run mamori:check` と同じ判定)。母集団は CLI と同じ走査で導く。
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const req = createRequire(__filename);
const { sources } = req(join(ROOT, 'scripts', 'mamori.cjs')) as { sources: () => string[] };

/** Mamori で書いた守りの層。増やすのは正しい向き (減ったら鳴る)。 */
const EXPECTED = [
  'src/main/clients/exportSink.mamori',
  'src/main/osSinks.mamori',
  'src/main/shellOpenGate.mamori',
  'src/renderer/vettedSinks.mamori',
  'src/shared/externalUrlGate.mamori',
  'src/shared/imageUrlGate.mamori',
  'src/shared/proxyEndpoint.mamori',
  'src/shared/controlChars.mamori',
  'src/shared/vetted.mamori',
];

describe('Mamori の生成物 (threat: T-221)', () => {
  const files = sources().map((p) => ({ path: p, source: readOriginalSource(join(ROOT, p)) }));

  it('★ 守りの層は Mamori で書いてある (母集団の床・黙って TypeScript へ戻らない)', () => {
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(EXPECTED));
  });

  it('★ どの .mamori もコンパイルでき、生成した .ts は commit した物と 1 byte も違わない', () => {
    const r = compileProject(files);
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    for (const [out, text] of r.outputs) {
      const abs = join(ROOT, out);
      expect(existsSync(abs), `${out} が無い (npm run mamori:build)`).toBe(true);
      expect(readOriginalSource(abs), `${out} が .mamori と食い違う —— 生成物を手で直さず npm run mamori:build`).toBe(text);
    }
  });

  it('生成物は自分が生成物であることと元の道を名乗る', () => {
    for (const f of files) {
      const ts = readOriginalSource(join(ROOT, f.path.replace(/\.mamori$/, '.ts')));
      expect(ts.startsWith(`// 生成物 —— ${f.path} から Mamori のコンパイラが組んだ。`)).toBe(true);
    }
  });
});
