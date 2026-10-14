import { existsSync } from 'node:fs';
import { readOriginalSource } from './originalSource';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **門の本体は `scripts/` (所有者レビュー必須) に在り、`package.json` はそこを指すだけ**
 * (threat: T-040 · パス 520)。
 *
 * `lint:docs` は「`verify:all` の各門が `ci.yml` で走る」を見るが、**門が何を走らせるか**は
 * 見ていなかった。`package.json` は CODEOWNERS にも整合性チェーンにも無い (全履歴で動きすぎる
 * ので安定資産の基準を満たさない · パス 371) ので、マージされた PR が
 * `"lint:forbidden": "echo ok"` と書き換えても、`ci.yml` には `npm run lint:forbidden` の行が
 * 残り**全ゲートが緑のまま門だけが消える**。`scripts/` の木は CODEOWNERS が覆う (T-003 の延長)
 * ので、門の本体がそこを指している限り、骨抜きには所有者のレビューが要る。
 *
 * 規則: `verify:all` が並べる各門の script は、`node scripts/<実在する .cjs>` の連なり
 * (引数は `--self-test` など) か、名指しの 3 つ (typecheck / lint / test) の固定の綴り。
 */
const ROOT = path.resolve(__dirname, '../../..');
const pkg = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as { scripts: Record<string, string> };
const scripts = pkg.scripts;

/** 綴りを固定する 3 つ (外部ツールを直接呼ぶ門)。 */
const FIXED: Readonly<Record<string, RegExp>> = {
  typecheck: /^tsc -b --noEmit --force$/,
  lint: /^eslint \. --max-warnings 0$/,
  test: /^vitest run$/,
};

/** `node scripts/x.cjs [args] && node scripts/y.cjs [args] …` の各段から script の道を取る。 */
function scriptPaths(command: string): string[] | null {
  const out: string[] = [];
  for (const seg of command.split('&&').map((s) => s.trim())) {
    const m = /^node (scripts\/[\w./-]+\.cjs)(?: [^&]*)?$/.exec(seg);
    if (m === null) return null;
    out.push(m[1]!);
  }
  return out;
}

const gates = scripts['verify:all']!.split('&&').map((s) => s.trim().replace(/^npm run /, ''));

describe('verify:all の門の本体は scripts/ を指す (threat: T-040)', () => {
  it('走査が空虚でない (門は 30 以上・test も見る)', () => {
    expect(gates.length).toBeGreaterThan(30);
    expect(scripts['test']).toBeDefined();
  });

  it.each([...gates, 'test'])('★ %s の本体は scripts/ の実在する .cjs か、固定の綴り (threat: T-040)', (gate) => {
    const command = scripts[gate];
    expect(command, `${gate} が package.json に無い`).toBeDefined();
    const fixed = FIXED[gate];
    if (fixed !== undefined) {
      expect(command).toMatch(fixed);
      return;
    }
    const paths = scriptPaths(command!);
    expect(paths, `${gate} = "${command}" は node scripts/<file>.cjs の連なりではない`).not.toBeNull();
    expect(paths!.length).toBeGreaterThan(0);
    for (const p of paths!) expect(existsSync(path.join(ROOT, p)), `${gate}: ${p} が無い`).toBe(true);
  });

  it('対照: 門の本体を echo に替えた綴りは通らない (針が実物の形に当たる)', () => {
    expect(scriptPaths('echo ok')).toBeNull();
    expect(scriptPaths('node scripts/lint-forbidden-patterns.cjs && true')).toBeNull();
    expect(scriptPaths('node /tmp/evil.cjs')).toBeNull();
    expect(scriptPaths('node scripts/lint-forbidden-patterns.cjs && node scripts/lint-forbidden-patterns.cjs --self-test')).toEqual([
      'scripts/lint-forbidden-patterns.cjs',
      'scripts/lint-forbidden-patterns.cjs',
    ]);
    expect('tsc -b --noEmit').not.toMatch(FIXED['typecheck']!);
    expect('vitest run --passWithNoTests').not.toMatch(FIXED['test']!);
  });

  it('scripts/ の木は CODEOWNERS が覆う (門の本体の書き換えには所有者のレビューが要る)', () => {
    const owners = readOriginalSource(path.join(ROOT, '.github/CODEOWNERS'));
    expect(owners).toMatch(/^\/scripts\/ @[\w-]+$/m);
  });
});
