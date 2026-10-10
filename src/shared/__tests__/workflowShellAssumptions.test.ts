import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Windows で走るジョブの `run:` が、bash 前提のまま書かれていないこと。**
 *
 * GitHub Actions の既定 shell は windows-latest だけ `pwsh` になる。
 * `release.yml` は 3 OS の matrix を回すのに `run:` が最初から bash 前提で
 * 書かれており、実測すると:
 *
 *   - `ls -la` は Get-ChildItem に束縛され `-la` を解決できない
 *   - pwsh は **native コマンドの引数を glob 展開しない**ので
 *     `node scripts/lint-sample-data.cjs --artifact dist/assets/*.js` は
 *     リテラルの `dist/assets/*.js` を渡し、スクリプトは
 *     「成果物が見つかりません」で exit 1
 *
 * `fail-fast: false` なので Linux/macOS は公開まで進み、**Windows
 * インストーラだけ欠けたリリース**が出る —— `verify-release-artifacts.cjs`
 * が防ぐために書かれた当の失敗である。リリースはタグでしか走らないので
 * 未発火のまま残っていた (2026-08-28 のレビューで検出)。
 *
 * ここで見るのは字面ではなく**約束**である: Windows を含むジョブが
 * bash 前提の `run:` を持つなら、`defaults.run.shell` が bash であること。
 */

const WORKFLOW_DIR = join(__dirname, '..', '..', '..', '.github', 'workflows');

/** bash でしか通らない書き方。綴りを増やすより、実際に踏んだ 3 つを押さえる。 */
const BASH_ONLY = [
  { re: /^\s*if\s+\[\s/m, why: 'POSIX の test ([ ... ]) は pwsh に無い' },
  { re: /^\s*ls\s+-[a-zA-Z]/m, why: 'pwsh の ls は Get-ChildItem の別名で短縮フラグを取らない' },
  { re: /\$\{[A-Za-z_][A-Za-z0-9_]*:-/, why: '${VAR:-default} は POSIX 展開' },
  { re: /^\s*(?:node|npx|python3?)\s+[^\n]*\*[^\n]*$/m, why: 'pwsh は native コマンドの引数を glob 展開しない' },
];

interface Parsed {
  readonly name: string;
  readonly text: string;
}

function workflows(): Parsed[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, text: readFileSync(join(WORKFLOW_DIR, f), 'utf8') }));
}

/** その workflow が Windows ランナーを使うか。 */
const usesWindows = (text: string): boolean => /windows-(?:latest|\d)/.test(text);

/** ジョブ既定で bash を宣言しているか。 */
const declaresBash = (text: string): boolean =>
  /defaults:\s*\n\s*run:\s*\n\s*shell:\s*bash/.test(text);

/**
 * `run:` ブロックに bash 前提の書き方があるか (理由つきで返す)。
 *
 * `run: cmd` の**一行形**を、`run: |` の複数行形と同じ土俵へ載せてから見る。
 * 最初これを忘れていて `run: ls -la` を拾えず、標本が 0 件を返した ——
 * **標本ではなく規則の側が足りていなかった** (対照でそれが分かった)。
 */
function bashOnlyHits(text: string): string[] {
  const normalized = text.replace(/^([ \t]*)run:[ \t]+(?!\|)/gm, '$1');
  const hits: string[] = [];
  for (const { re, why } of BASH_ONLY) {
    if (re.test(normalized)) hits.push(why);
  }
  return hits;
}

describe('Windows で走る run: が bash 前提のまま置かれていないこと', () => {
  it('★ 実物: Windows を含む workflow は、bash 前提なら shell: bash を宣言している', () => {
    const offenders: string[] = [];
    for (const w of workflows()) {
      if (!usesWindows(w.text)) continue;
      const hits = bashOnlyHits(w.text);
      if (hits.length > 0 && !declaresBash(w.text)) {
        offenders.push(`${w.name}: ${hits.join(' / ')}`);
      }
    }
    expect(offenders, 'shell: bash の宣言が要る').toEqual([]);
  });

  /*
   * **標本を添える。** 上の検査は「該当なし」でも通るので、規則が実際に
   * 当たることを、同じ検査の中で確かめる (CLAUDE.md の規律)。
   */
  it('★ 規則が実際に当たる — bash 前提を検出できる', () => {
    // `if [` と `${VAR:-}` は別々の規則。両方入った標本で 2 件になる
    // (最初 `"$X"` で書いて 1 件しか出ず、**期待のほうが誤っていた**)。
    expect(bashOnlyHits('        run: |\n          if [ -n "${X:-}" ]; then echo a; fi\n')).toHaveLength(2);
    expect(bashOnlyHits('        run: |\n          if [ -n "$X" ]; then echo a; fi\n')).toHaveLength(1);
    expect(bashOnlyHits('        run: ls -la dist/\n')).toHaveLength(1);
    expect(bashOnlyHits('        run: node s.cjs --artifact dist/assets/*.js\n')).toHaveLength(1);
    // pwsh でも通る書き方は拾わない (誤検出しないこと)
    expect(bashOnlyHits('        run: npm ci\n')).toEqual([]);
    expect(bashOnlyHits('        run: node scripts/verify-release-artifacts.cjs\n')).toEqual([]);
  });

  it('★ 判定の両輪がどちらも効いている', () => {
    expect(usesWindows('    - os: windows-latest\n')).toBe(true);
    expect(usesWindows('    - os: ubuntu-latest\n')).toBe(false);
    expect(declaresBash('    defaults:\n      run:\n        shell: bash\n')).toBe(true);
    expect(declaresBash('    steps:\n')).toBe(false);
  });

  it('release.yml が実際に Windows を回し、bash を宣言している (経路の確認)', () => {
    const rel = readFileSync(join(WORKFLOW_DIR, 'release.yml'), 'utf8');
    expect(usesWindows(rel), 'release.yml は windows を回すはず').toBe(true);
    expect(bashOnlyHits(rel).length, 'bash 前提の run: が実在するはず').toBeGreaterThan(0);
    expect(declaresBash(rel)).toBe(true);
  });
});
