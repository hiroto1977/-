import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

/*
 * **`await` を書かずに reject しうる IPC handler を、台帳に載せて理由を言わせる** (2026-10-19 · パス 537 ·
 * threat: T-126 · MAIN-3)。`lint:ipc-handlers` の `await` の規則は綴りしか見ず、式本体・try 外の
 * `return <呼び出し>`・インラインでない handler には黙っていた (植えて実測)。実物では reject しうるのは
 * `secrets:list` / `secrets:protection` の 2 つで、それは**設計**だった (読めなかった保管ファイルを
 * 「空」と混ぜないため投げる · T-061)。動作は変えず、**載せて理由を言わせる**。
 *
 * ここで留めるのは実物 (`src/main/main.ts`) に対する形 —— 台帳との双方向の一致・植えた形が鳴ること。
 * 判定そのものの分岐は門の `--self-test` が持つ。
 */
const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);
const gate = req(path.join(REPO, 'scripts/lint-ipc-handlers.cjs')) as {
  handlerBodies: (src: string) => { channel: string; body: string; exact: string | null }[];
  unawaitedProblems: (h: unknown[], ledger?: Record<string, unknown>) => string[];
  UNAWAITED: Record<string, { kind: string; why: string }>;
};
const main = readOriginalSource(path.join(REPO, 'src/main/main.ts'));

describe('await を書かずに reject しうる handler の台帳 (threat: T-126)', () => {
  it('★ 実物の main.ts は、台帳と双方向に一致する (載っていない形も、形の無い台帳も無い)', () => {
    const handlers = gate.handlerBodies(main);
    expect(handlers.length).toBeGreaterThanOrEqual(15);
    expect(handlers.every((h) => h.exact !== null)).toBe(true);
    expect(gate.unawaitedProblems(handlers)).toEqual([]);
  });

  it('★ 台帳の種類は 2 つだけで、理由は書いてある (保留の決まり文句を置かない)', () => {
    for (const [key, e] of Object.entries(gate.UNAWAITED)) {
      expect(['cannot-reject', 'rejects-by-design'], key).toContain(e.kind);
      expect(e.why.length, key).toBeGreaterThanOrEqual(15);
      expect(e.why, key).not.toMatch(/^(同上|TBD|あとで|未定)/);
    }
    // 針が的に当たること: 禁じたい文面を標本にして鳴らす
    expect('同上').toMatch(/^(同上|TBD|あとで|未定)/);
  });

  it('★ reject が設計の 2 つは、保管の読めなさを投げる collaborator に支えられている', () => {
    const by = Object.entries(gate.UNAWAITED).filter(([, e]) => e.kind === 'rejects-by-design').map(([k]) => k).sort();
    expect(by).toEqual(['secrets:list', 'secrets:protection']);
    const secrets = readOriginalSource(path.join(REPO, 'src/main/secrets.ts'));
    // readStore は ENOENT 以外の stat の失敗を握り潰さず投げる (secretsWrite.test.ts が留める)
    expect(secrets).toMatch(/if \(\(err as NodeJS\.ErrnoException\)\.code !== 'ENOENT'\) throw err;/);
  });

  it('★ 実物に新しい式本体の handler を足すと鳴る (台帳に無い形)', () => {
    const planted = `${main}\nipcMain.handle('zzz:planted', () => riskySync());\n`;
    const problems = gate.unawaitedProblems(gate.handlerBodies(planted));
    expect(problems.some((p) => p.startsWith('zzz:planted') && p.includes('式本体'))).toBe(true);
  });

  it('★ 実物に await を書かずに Promise を返す handler を足すと鳴る (旧規則は黙っていた形)', () => {
    const planted = `${main}\nipcMain.handle('zzz:ret', async (_e, u) => { return launcher.open(u); });\n`;
    const problems = gate.unawaitedProblems(gate.handlerBodies(planted));
    expect(problems.some((p) => p.startsWith('zzz:ret :: launcher.open'))).toBe(true);
  });

  it('★ 台帳の行の形を実物から消すと鳴る (直したのに台帳が残る)', () => {
    const removed = main.replace("ipcMain.handle('app:getVersion', () => app.getVersion());", '');
    expect(removed).not.toBe(main);
    const problems = gate.unawaitedProblems(gate.handlerBodies(removed));
    expect(problems.some((p) => p.startsWith('app:getVersion'))).toBe(true);
  });

  it('★ 門の main() が、この規則を結果ごと使っている (呼ぶだけで捨てない)', () => {
    const src = readOriginalSource(path.join(REPO, 'scripts/lint-ipc-handlers.cjs'));
    expect(src).toMatch(/const problems = \[[^\]]*\.\.\.unawaitedProblems\(handlers\)/);
    expect(src).toMatch(/if \(problems\.length > 0\)/);
  });
});
