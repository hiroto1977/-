/**
 * **ディスクから読む所は、読む前に大きさで断る** (2026-09-19 · パス 326)。
 *
 * 法則 `size-gate-before-parse` (`shared/ontology/laws.ts`) は パス 308 / 313 で学ばれているが、
 * 執行者は `stateFile.test.ts` と `secretsProtection.test.ts` の 2 つ =**直した個所の検査**だけで、
 * **母集団を数える機械が無かった** (パス 325 で法則 `checked-equals-used` に見つけたのと同じ形)。
 * 数えたら `readFile` / `readFileSync` は 5 か所で、**2 経路に門が無かった**:
 *
 * - `main/secrets.ts` は**本体にだけ** `fs.stat` の門を掛けており、`readFileWithBackup` が
 *   倒れる `<path>.prev` は上限なしで読まれていた。本体が ENOENT のとき門は素通りするので、
 *   **本体を消して巨大な控えを置けば、主プロセスがそれを丸ごと読んで `JSON.parse` する**。
 *   門を `readFileWithBackup` の**中**へ移した (控えへ倒れる枝は呼び出し側から見えないので、
 *   呼び出し側に置くと必ず片方しか掛からない)。
 * - `main/clients/devEnv.ts` は 7 つの読み (`package.json` / `.nvmrc` / `go.mod` /
 *   `.python-version` / `.tool-versions` / `.git/HEAD` / `.git` の ref) すべてが門なしで、
 *   しかも `readFileSync` —— **Electron の主スレッドを止める**。アプリが書いていない
 *   ファイルなので大きさの保証は無い。
 *
 * 門の形は 3 つとも同じ (`stat` → 上限 → 読む) だが、置き場所は経路ごとに違う
 * (3 状態を返す `readStateFile` / 控えへ倒れる `readFileWithBackup` の中 / 同期の `readFileOrNull`)。
 * **ここでは「読む所には必ず門が在る」を母集団で留める** —— 上限の値そのものは用途ごとに違ってよい。
 */
import { describe, expect, it } from 'vitest';
import { join, relative } from 'node:path';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const READ_CALL = /\breadFile(Sync)?\s*\(/;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

interface Row {
  readonly file: string;
  readonly needle: string;
  /** その読みの直前で大きさを見ている物 (同じ関数の中に在ること)。 */
  readonly gate: string;
  /** 上限の名前。呼び出し側が渡す物は `null` (その配線は別の検査が留める)。 */
  readonly cap: string | null;
  readonly why: string;
}

const LEDGER: readonly Row[] = [
  {
    file: 'src/main/atomicWrite.ts',
    needle: "fs.readFile(path, 'utf8')",
    gate: 'fs.stat(path)',
    cap: null, // 呼び出し側が渡す maxBytes —— secrets が MAX_STORE_SIZE を渡すことは下の検査が留める
    why: '本体と控え (.prev) の両方がこの 1 つの関数を通る (パス 326 で門を中へ移した)',
  },
  {
    file: 'src/main/clients/devEnv.ts',
    needle: "fs.readFileSync(p, 'utf8')",
    gate: 'fs.statSync(p)',
    cap: 'MAX_DEV_ENV_FILE_BYTES',
    why: 'アプリが書いていない 7 ファイル。同期の読みなので主スレッドが止まる (パス 326)',
  },
  {
    file: 'src/main/clients/skills.ts',
    needle: "content = await fs.readFile(realFile, 'utf8')",
    gate: 'st.size > MAX_SKILL_FILE_BYTES',
    cap: 'MAX_SKILL_FILE_BYTES',
    why: '一覧: 大きすぎるスキルは runnable: false + 理由で載せる (パス 308)',
  },
  {
    file: 'src/main/clients/skills.ts',
    needle: "body = await fs.readFile(real, 'utf8')",
    gate: 'st.size > MAX_SKILL_FILE_BYTES',
    cap: 'MAX_SKILL_FILE_BYTES',
    why: '本文: system として有料 API へ送る前に断る (パス 308)',
  },
  {
    file: 'src/main/stateFile.ts',
    needle: "fs.readFile(p, 'utf8')",
    gate: 'st.size > MAX_STATE_FILE_BYTES',
    cap: 'MAX_STATE_FILE_BYTES',
    why: '状態ファイル 4 つの入口。前門 (stat) + 後門 (byte) の 3 状態 (パス 313)',
  },
];

function shippedSources(): string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx'], {
    cwd: REPO,
    absolute: true,
    ignore: ['**/__tests__/**', '**/*.d.ts'],
  });
}

export function readSites(files: readonly string[]): Site[] {
  const out: Site[] = [];
  for (const abs of files) {
    const file = relative(REPO, abs).split('\\').join('/');
    readOriginalSource(abs).split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
      if (READ_CALL.test(line)) out.push({ file, line: i + 1, text: line });
    });
  }
  return out;
}

const SITES = readSites(shippedSources());

describe('ディスクから読む所の母集団 (パス 326)', () => {
  it('走査が生きている (床: 3 か所以上)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(3);
  });

  it('★ 母集団と台帳は両方向に一致する', () => {
    const unlisted = SITES.filter((s) => !LEDGER.some((r) => r.file === s.file && s.text.includes(r.needle)));
    expect(unlisted.map((s) => `${s.file}:${s.line} ${s.text.trim()}`)).toEqual([]);
    const stale = LEDGER.filter((r) => !SITES.some((s) => s.file === r.file && s.text.includes(r.needle)));
    expect(stale.map((r) => `${r.file} ${r.needle}`)).toEqual([]);
  });

  it('★ どの読みも、同じファイルの中に大きさを見る門と上限の名前を持つ', () => {
    for (const r of LEDGER) {
      const src = readOriginalSource(join(REPO, r.file));
      expect(src, `${r.file} の門 ${r.gate}`).toContain(r.gate);
      if (r.cap !== null) expect(src, `${r.file} の上限 ${r.cap}`).toContain(r.cap);
      expect(r.why.length).toBeGreaterThan(10);
    }
  });

  it('標本: 走査は読みの行に当たり、コメント行と書き込みには当たらない', () => {
    expect(READ_CALL.test("    content = await fs.readFile(realFile, 'utf8');")).toBe(true);
    expect(READ_CALL.test("    return fs.readFileSync(p, 'utf8');")).toBe(true);
    expect(READ_CALL.test("  await fs.writeFile(target, text);")).toBe(false);
    // 括弧を伴わない散文の言及には当たらない (走査はコメント行も落とすが、針自体も狭い)
    expect(READ_CALL.test("   * readFile の前に stat で断る")).toBe(false);
    // ただし `readFile(` と書かれたコメント行は針に当たるので、走査側が落とす
    expect(READ_CALL.test("   * `fs.readFile(p)` を呼ぶ前に")).toBe(true);
    expect(readSites([]).length).toBe(0);
  });

  /*
   * **控えへ倒れる枝は呼び出し側から見えない。** だから門は読む関数の中に在る必要がある ——
   * `secrets.ts` は本体にだけ `stat` を掛けており、本体が ENOENT のとき門は素通りして
   * 控えを丸ごと読んでいた (パス 326 で見つけた形)。原文でその配置を留める。
   */
  it('★ 控えへ倒れる読みは、門を関数の中に持つ (呼び出し側ではない)', () => {
    const src = readOriginalSource(join(REPO, 'src/main/atomicWrite.ts'));
    expect(src).toContain('async function readIfWithinCap(path: string, maxBytes: number)');
    expect(src).toContain('if (st === null || st.size > maxBytes) return null;');
    // 本体と控えの両方が同じ関数を通る
    expect(src).toContain('readIfWithinCap(target, maxBytes)');
    expect(src).toContain('readIfWithinCap(`${target}.prev`, maxBytes)');
    // 標本: 直す前は上限を取らない形だった (不在の主張に綴りを添える)
    expect(src).not.toContain('export async function readFileWithBackup(target: string): Promise');
    expect('export async function readFileWithBackup(target: string): Promise<string | null> {').toContain(
      'export async function readFileWithBackup(target: string): Promise',
    );
  });

  it('★ secrets は本体と控えの両方に同じ上限を渡す', () => {
    const src = readOriginalSource(join(REPO, 'src/main/secrets.ts'));
    const calls = src.split('\n').filter((l) => l.includes('readFileWithBackup(') && !l.trim().startsWith('//') && !l.includes('import'));
    expect(calls).toHaveLength(2);
    for (const c of calls) expect(c).toContain('MAX_STORE_SIZE');
  });
});
