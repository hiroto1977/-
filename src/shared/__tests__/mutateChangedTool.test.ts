/**
 * **`mutate` に載っているファイルを触ったら、そのファイルを測る。** (2026-09-26 · パス 479)
 *
 * ## 何が起きていたか
 *
 * `stryker.config.json` の `mutate` は 298 ファイルで `thresholds.break = 99.8` が掛かる。
 * その測定は**週次だけ** (`mutation.yml`) で、per-PR の CI には入っていない
 * (1 ファイル 6 分半・全件は数時間なので無料枠では毎 PR に載せられない)。
 *
 * パス 478 は `src/renderer/data/sourceVerification.ts` (`mutate` の 1 つ) に
 * `normalizeSourceUrl` を足した。実測 (2026-09-26):
 *
 * | | |
 * | --- | --- |
 * | パス 478 の push 時点 | **98.92% / 未到達 1** —— `break = 99.8` を割る |
 * | 未到達だった 1 件 | `String(url ?? '')` の `?? ''` (欠けた欄へ到達する検査が無かった) |
 * | 検査を 2 件足した後 | **100.00% (Killed 93 / 生存 0 / 未到達 0)** |
 *
 * **週次 CI はこれを 6 日後に赤くし、しかも次に push した人の変更に見える。**
 *
 * ## per-PR の網がこれを見なかった理由も測った
 *
 * - `npm run test:cov` の母集団は **`src/main/**` だけ** —— `mutate` 298 件のうち
 *   **247 件がその外**に居る (税の計算 60 本以上・保管庫・プロキシ・コーパスの確証器・76 画面)。
 * - **被覆の閾値はどこにも宣言されていない** (`vitest.config.ts` に `thresholds` は 0 件・
 *   CLI も渡さない)。実測 98.76% / 分岐 96.68% を**刷るだけ**で、下がっても鳴らない。
 * - ★ **閾値を足してもこの欠陥は捕まらない** —— 分岐は 1,903 本なので **1 本 = 0.05%**。
 *   1 点の床でも 19 本落ちるまで鳴らない。**だから直しは「床を足す」ではなく
 *   「触ったファイルを測る」である** (`npm run audit:mutate-changed`)。
 *
 * ここで見るのは 3 つ: ① 母集団の導き方 (変更 ∩ `mutate`・完全一致) ② 道具が
 * `verify:all` / CI に入っていないこと (`audit:*` の仲間) ③ 手で回す道具は
 * CLAUDE.md の命令の一覧に在ること (書いていない道具は誰も回さない)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(__filename);

const tool = req(path.join(REPO, 'scripts/audit-mutate-changed.cjs')) as {
  changedInScope: (changed: readonly string[], scope: readonly string[]) => string[];
  mutateScope: () => string[];
};

const pkg = JSON.parse(readOriginalSource(path.join(REPO, 'package.json'))) as {
  scripts: Record<string, string>;
};

/** CI で走らせない `audit:*` の例外 (走らせる workflow を名指しする)。 */
const CI_DRIVEN_AUDITS: readonly { readonly name: string; readonly workflow: string }[] = [
  { name: 'audit:report', workflow: '.github/workflows/dependency-audit.yml' },
];

describe('変更 ∩ mutate の母集団 (パス 479)', () => {
  const SCOPE = ['src/a.ts', 'src/b.ts', 'src/renderer/data/sourceVerification.ts'];

  it('★ mutate に在る物だけを返し、並びは決定的', () => {
    expect(tool.changedInScope(['src/b.ts', 'docs/x.md', 'src/a.ts'], SCOPE)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(tool.changedInScope(['docs/x.md'], SCOPE)).toEqual([]);
    expect(tool.changedInScope([], SCOPE)).toEqual([]);
  });

  it('★ 照合は道の完全一致 (同名の別ディレクトリを拾わない)', () => {
    /*
     * `mutate` は名指しの一覧で、同じ basename のファイルは別の場所にも在りうる
     * (`data/` と `shared/` に同名が並ぶのはこのリポジトリで普通である)。
     * `path.basename` で比べると**測る対象を取り違える** —— 測っていないファイルを
     * 「測った」と報告する向きなので静かな誤りである。
     *
     * ★ **対照を回して分かったこと**: 最初はここを「接頭辞で拾わない」と書き、標本を
     * `…/sourceVerificationHelper.ts` にしていた。**それは鳴らなかった** ——
     * `mutate` の項は拡張子まで含むので `sourceVerification.ts` は
     * `sourceVerificationHelper.ts` の接頭辞ではない (`.ts` が途中に来る)。
     * **鳴らない対照は合格ではなく、その検査についての報せ**なので、
     * 実際に起こりうる誤り (basename) を撃つ標本へ当て直した。
     */
    expect(tool.changedInScope(['src/other/sourceVerification.ts'], SCOPE)).toEqual([]);
    expect(tool.changedInScope(['src/renderer/data/sourceVerification.ts'], SCOPE))
      .toEqual(['src/renderer/data/sourceVerification.ts']);
  });

  it('★ 実物の mutate が読めて空でない (走査の故障を「対象なし」と読まない)', () => {
    const scope = tool.mutateScope();
    expect(scope.length).toBeGreaterThanOrEqual(200);
    for (const s of scope) expect(s, s).toMatch(/^src\//);
  });
});

describe('per-PR の被覆測定の射程 (実測を記録する)', () => {
  it('★ test:cov の母集団は src/main だけで、mutate の大半はその外に居る', () => {
    const cov = pkg.scripts['test:cov'] ?? '';
    // 宣言が変わったら、上の docblock の実測ごと引き直す (この行が合図)。
    expect(cov).toContain('--coverage.include=src/main/**');
    const outside = tool.mutateScope().filter((f) => !f.startsWith('src/main/'));
    // 0 件になったら「per-PR の死角は無くなった」なので、記録を書き直す側が鳴る。
    expect(outside.length).toBeGreaterThan(100);
  });

  it('★ 週次だけに頼らない道具が在る (package.json に載っている)', () => {
    expect(pkg.scripts['audit:mutate-changed']).toContain('scripts/audit-mutate-changed.cjs');
    expect(pkg.scripts['audit:mutate-changed']).toContain('--self-test');
  });
});

describe('定期点検の道具の規律 (両方向)', () => {
  const audits = Object.keys(pkg.scripts).filter((k) => k.startsWith('audit:')).sort();

  it('走査が生きている (audit:* が 10 件以上)', () => {
    expect(audits.length).toBeGreaterThanOrEqual(10);
  });

  it('★ 手で回す audit:* は CLAUDE.md の命令の一覧に在る (書いていない道具は誰も回さない)', () => {
    const md = readOriginalSource(path.join(REPO, 'CLAUDE.md'));
    const driven = new Set(CI_DRIVEN_AUDITS.map((c) => c.name));
    const missing = audits.filter((n) => !driven.has(n) && !md.includes(`npm run ${n}`));
    expect(missing).toEqual([]);
  });

  it('★ CI で走らせる audit:* は、その workflow が実際に呼んでいる (逆向き)', () => {
    for (const c of CI_DRIVEN_AUDITS) {
      expect(audits, `${c.name} が package.json に無い`).toContain(c.name);
      const wf = readOriginalSource(path.join(REPO, c.workflow));
      expect(wf, `${c.workflow} が ${c.name} を呼んでいない`).toContain(`npm run ${c.name}`);
    }
  });

  it('★ audit:* は verify:all にも ci.yml にも入っていない (定期点検の道具である)', () => {
    const verifyAll = pkg.scripts['verify:all'] ?? '';
    const ci = readOriginalSource(path.join(REPO, '.github/workflows/ci.yml'));
    for (const n of audits) {
      expect(verifyAll, `${n} が verify:all に入っている`).not.toContain(n);
      expect(ci, `${n} が ci.yml に入っている`).not.toContain(`npm run ${n}`);
    }
  });

  it('★ 道具は測ったあと必ず後片付けする (古い incremental は偽の生存を作る)', () => {
    const src = readOriginalSource(path.join(REPO, 'scripts/audit-mutate-changed.cjs'));
    // 後片付けは `finally` で行う —— Stryker が非 0 で終わっても残さない。
    expect(src).toContain('} finally {\n    cleanup();');
    const cfg = JSON.parse(readOriginalSource(path.join(REPO, 'stryker.config.json'))) as {
      incrementalFile: string;
    };
    expect(src).toContain(cfg.incrementalFile);
  });
});
