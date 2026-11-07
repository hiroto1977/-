/**
 * **配る実行可能ランチャーは、改竄検知の中に在る** (2026-10-13 · パス 516 · T-019)。
 *
 * ## 見つけた物 (実測)
 *
 * `launcher/ServiceHubを開く.bat` は Windows 利用者が**ダブルクリックして**
 * standalone.html を開くために在る (ファイル自身がそう設計されている)。実行可能
 * コードなのに、全コード走査門・整合性チェーン・CODEOWNERS の**どれにも無かった**:
 *
 * - `lint:malware` の `isScannedPath` と `lint:forbidden` の `SCAN_ROOTS` は
 *   トップレベル dir の**固定 allowlist** (`src|scripts|orchestration|build|assets`) で
 *   走査母集団を決めるので、新しいトップレベル dir `launcher/` を構造的に見ない
 *   (T-016 が直下ファイルで直した「固定→git ls-files 動的化」が dir レベルに残っていた)。
 * - `.bat` はどの門の `SCAN_EXTS` / `isWalkedSourceName` にも無い (T-018 の拡張子死角の家系)。
 * - `security/integrity-chain.json` に `launcher` は 0 件・`.github/CODEOWNERS` も覆わない。
 *
 * 実測 (2026-10-13・直す前): この .bat に
 * `powershell … iwr <url> -OutFile … ; Start-Process …` の download-and-exec を 1 行足すと
 * `lint:malware` / `lint:forbidden` / `lint:shell` / `lint:charset` が **4 門すべて exit 0**
 * (復元 md5 一致)。マージされた PR で黙って悪意の行を足せ、利用者が (信頼して) ダブルクリックする。
 *
 * ## なぜ走査門ではなくチェーンか
 *
 * `.bat` は Windows シェルで、`lint:forbidden` (JS の形) も `lint:shell` (bash の形) の
 * 規則も当てはまらない。無理に走査門へ入れても PowerShell の download-and-exec は捕まらない。
 * **正しい機構は「黙った編集を可視化 + 所有者レビュー必須」** —— `assets/sw.js` や配る
 * 単一ファイル maker と同じく整合性チェーンの保護対象にする。CODEOWNERS 被覆は
 * `threatLedger.test.ts` の T-003 検査 (「PROTECTED は全部 CODEOWNERS が覆う」) が自動で要求する。
 *
 * ## 将来のランチャーを機械で強制する
 *
 * この検査は**追跡された Windows シェルのランチャー実行ファイル** (`.bat` / `.cmd` /
 * `.ps1` / `.vbs` / `.command`・**任意の dir**) を `git ls-files` から走査し、どれも
 * チェーン保護対象であることを両方向で要求する。次に別の dir へランチャーが足されても、
 * 保護に入れるまでここが鳴る (T-016/T-018 の走査母集団の死角を launcher の class で閉じる)。
 *
 * **`.sh` は数えない** —— `lint:shell` が `git ls-files` で全 `.sh` を bash の規則で
 * 既に走査している (同じ事実を 2 つの門で見ると、片方を直したときもう片方が鳴って読めなくなる)。
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';

const REPO = join(__dirname, '..', '..', '..');

/** 配る Windows シェルのランチャー実行ファイルの拡張子 (`.sh` は lint:shell の担当なので除く)。 */
const LAUNCHER_EXT = /\.(bat|cmd|ps1|vbs|command)$/i;

/** 追跡された配る実行可能ランチャーを `git ls-files` から導く (任意の dir)。 */
function trackedLaunchers(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => LAUNCHER_EXT.test(f))
    .sort();
}

const chain = readOriginalSource(join(REPO, 'scripts/integrity-chain.cjs'));

/** その道が整合性チェーンの PROTECTED に在るか (字面)。 */
function isProtected(file: string): boolean {
  return chain.includes(`'${file}',`);
}

describe('配る実行可能ランチャーは改竄検知の中に在る (パス 516 · T-019)', () => {
  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(trackedLaunchers(), 'ランチャーを集められていない').toContain(
      'launcher/ServiceHubを開く.bat',
    );
    // 拡張子の針が死んでいない。
    expect(LAUNCHER_EXT.test('x.bat'), '.bat を見ていない').toBe(true);
    expect(LAUNCHER_EXT.test('x.ps1'), '.ps1 を見ていない').toBe(true);
    // `.sh` は lint:shell の担当なのでこの母集団に入れない (二重に見ない)。
    expect(LAUNCHER_EXT.test('x.sh'), '.sh を数えてしまっている').toBe(false);
    expect(LAUNCHER_EXT.test('x.ts'), 'コードでない物を数えている').toBe(false);
  });

  it('★ 追跡された Windows シェルのランチャーはすべてチェーン保護対象 (threat: T-019)', () => {
    const unprotected = trackedLaunchers().filter((f) => !isProtected(f));
    expect(
      unprotected,
      `チェーンの PROTECTED と CODEOWNERS へ足す:\n${unprotected.join('\n')}`,
    ).toEqual([]);
  });

  it('★ 保護の判定は空虚でない (針の標本)', () => {
    // 在る物は true (既知の保護対象でも鳴る)。
    expect(isProtected('launcher/ServiceHubを開く.bat')).toBe(true);
    expect(chain, '針が死んでいる').toContain("'assets/sw.js',");
    // 在らない物は false —— 全部 true を返すだけの空の検査ではない。
    expect(isProtected('launcher/not-in-chain.bat')).toBe(false);
  });
});
