import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readOriginalDir, readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **`--self-test` と書いてあることは、`--self-test` が在ることではない。**
 *
 * このリポジトリは 2026-08-25 に「誰も回さない対照は、対照が無いのと同じ」を
 * 一度学んでいる —— 走査の self-test 13 件が CI の外に在り、`scripts/*.cjs`
 * **28 本**を 1 本ずつ壊して終了コードを測り直した。その census が数えたのは
 * **実装している物**である。
 *
 * 2026-09-12 に起動経路を npm / workflow / **vitest** の 3 つで数え直すと、
 * 実装している 37 本はすべて走っていた (前回の「2 本が孤児」という私の計測は
 * vitest を経路に数えていなかった誤りで、`scan-credential-headers.cjs` は
 * `redactionCoverage.test.ts` から走っている)。**代わりに 1 本見つかった** ——
 * `scripts/public-host-guard.cjs` は冒頭の「使い方」に
 *
 *     node scripts/public-host-guard.cjs --self-test
 *
 * と書いていて、`selfTest` を**実装していなかった**。引数を何にしても黙って
 * exit 0 を返す。書いてあるとおりに叩いた人は「関門は無事」と読む。
 * 実装している物だけを数える census には、名乗るだけのこれは映らなかった。
 *
 * だから数えるのは 2 段にする: **名乗るなら実装している。実装するなら走る。**
 */

const REPO = join(__dirname, '../../..');
const SCRIPTS = join(REPO, 'scripts');

/**
 * **その script が「自分を叩け」と書いているか。**
 *
 * 最初は `/--self-test/` だけを見ていたが、それは**散文にも当たる** ——
 * 他のファイルの欠陥について注記を書いた `integrity-chain.cjs` が
 * 名乗り側として挙がった (実測)。名乗りとは「使い方」に**自分の道**を
 * 書いていることなので、自分の basename ごと見る。
 */
function advertises(file: string, text: string): boolean {
  const esc = file.replace(/\./g, '\\.');
  return new RegExp(`scripts/${esc}[^\\n]*(?:--self-test|\\bself-test)\\b`).test(text);
}

/**
 * **その名乗りが、実際に何かを走らせるか。**
 *
 * 関門の欠陥は「関数が無い」ではなく「叩いても何も起きない」だった ——
 * `public-host-guard.cjs` は関数も CLI の分岐も無く、どの引数でも exit 0。
 * だから見るのは関数の宣言ではなく**引数の受け口**である。
 * 2 形ある: フラグ (`--self-test`) と下位命令 (`self-test`)。
 */
const DISPATCHES = /\w+\.includes\(\s*['"]--self-test['"]\s*\)|===\s*['"]self-test['"]/;

/** `selfTest` / `cmdSelfTest` を実装しているか。 */
const DEFINES = /\b(?:function|const)\s+(?:cmd)?[Ss]elfTest\b/;

function scriptNames(): string[] {
  return readOriginalDir(SCRIPTS).filter((f) => f.endsWith('.cjs'));
}

const PKG = readOriginalSource(join(REPO, 'package.json'));
const WORKFLOWS = readOriginalDir(join(REPO, '.github/workflows'))
  .map((f) => readOriginalSource(join(REPO, '.github/workflows', f)))
  .join('\n');

/** `src/**\/*.test.ts(x)` を集める (vitest から `selfTest()` を呼ぶ経路)。 */
function testFiles(dir = join(REPO, 'src'), out: { path: string; text: string }[] = []): typeof out {
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) testFiles(p, out);
    else if (/\.test\.tsx?$/.test(e.name)) out.push({ path: p, text: readOriginalSource(p) });
  }
  return out;
}
const TESTS = testFiles();

/**
 * その script の self-test を走らせている経路 (無ければ空)。
 *
 * vitest 経路は「名前が出てくる」では数えない —— **`selfTest` を取り出して
 * いる require の場所**を見る。最初に書いたときは名前の出現で数えていて、
 * 散文で名前を挙げているだけのファイル (このファイル自身を含む) が
 * 経路として数えられた。**緩い判定は「走っている」を作ってしまう。**
 */
function invokers(script: string): string[] {
  const esc = script.replace(/\./g, '\\.');
  // 起動の書き方も 2 形 —— `--self-test` (フラグ) と `self-test` (下位命令)。
  const cli = new RegExp(`scripts/${esc}[^"\\n]*(?:--self-test|\\bself-test)\\b`);
  // `const { …, selfTest } = req('…/scripts/<name>')` の形。
  const pulls = new RegExp(`const\\s*\\{([^}]*)\\}\\s*=\\s*\\w+\\(\\s*['"][^'"]*scripts/${esc}['"]`);
  const found: string[] = [];
  if (cli.test(PKG)) found.push('package.json');
  if (cli.test(WORKFLOWS)) found.push('.github/workflows');
  for (const t of TESTS) {
    const m = pulls.exec(t.text);
    const names = m?.[1] ?? '';
    if (/\bselfTest\b/.test(names)) found.push(t.path.slice(REPO.length + 1));
  }
  return found;
}

describe('ゲートの陰性対照は、名乗ったなら在り、在るなら走る', () => {
  it('走査の的が空でない (scripts/*.cjs が在る)', () => {
    expect(scriptNames().length).toBeGreaterThan(30);
  });

  it('★ 「自分を叩け」と書いてある script は、叩くと実際に走る', () => {
    const liars: string[] = [];
    for (const f of scriptNames()) {
      const text = readOriginalSource(join(SCRIPTS, f));
      if (!advertises(f, text)) continue;
      if (!DEFINES.test(text)) liars.push(`${f} (selfTest の実装が無い)`);
      else if (!DISPATCHES.test(text)) liars.push(`${f} (実装は在るが CLI が呼んでいない)`);
    }
    expect(
      liars,
      '「使い方」に自分を --self-test で叩けと書いてあるのに、叩いても何も走りません。' +
        '黙って exit 0 を返すので、読んだ人は「無事」と受け取ります',
    ).toEqual([]);
  });

  it('★ `selfTest` を実装している script は、すべてどこかから走っている', () => {
    const orphans: string[] = [];
    for (const f of scriptNames()) {
      const text = readOriginalSource(join(SCRIPTS, f));
      if (!DEFINES.test(text)) continue;
      if (invokers(f).length === 0) orphans.push(f);
    }
    expect(
      orphans,
      'selfTest が在るのに npm / workflow / vitest のどこからも走っていません。' +
        '誰も回さない対照は、対照が無いのと同じです',
    ).toEqual([]);
  });

  /*
   * **不在を主張する検査には、標本を添える。** 上の 2 件は `[]` を求める形なので、
   * 綴りが 1 つ違えば黙る。規則が本当に当たることを同じ検査の中で確かめる。
   */
  it('★ 規則が実際の書き方に当たる (鳴らない検査でないこと)', () => {
    // 名乗り —— 自分の道が書かれているときだけ。
    expect(advertises('x.cjs', ' *   node scripts/x.cjs --self-test')).toBe(true);
    expect(advertises('x.cjs', ' *   node scripts/x.cjs --links=400')).toBe(false);
    // **他のファイルについて --self-test と書いた注記では当たらない。**
    // 最初の版はここで当たってしまい、integrity-chain.cjs を名乗り側にした。
    expect(advertises('integrity-chain.cjs', '// y.cjs は --self-test を名乗る')).toBe(false);
    // 実装の 2 形 (フラグ / 下位命令)。
    expect(DEFINES.test('function selfTest() {')).toBe(true);
    expect(DEFINES.test('async function selfTest() {')).toBe(true);
    expect(DEFINES.test('const selfTest = () => 0;')).toBe(true);
    expect(DEFINES.test('function cmdSelfTest() {')).toBe(true);
    expect(DEFINES.test('// selfTest はまだ書いていない')).toBe(false);
    // 受け口の 2 形。
    expect(DISPATCHES.test("if (argv.includes('--self-test')) return selfTest();")).toBe(true);
    // **受け口の変数名は決め打ちにしない** —— `args` で書いている script が在る
    // (`zero-fold-census.cjs`)。名前で数えると、正しい物を欠陥として挙げてしまう。
    expect(DISPATCHES.test("if (args.includes('--self-test')) {")).toBe(true);
    expect(DISPATCHES.test("else if (cmd === 'self-test') cmdSelfTest();")).toBe(true);
    // 2026-09-12 に見つかった形 —— 名乗るだけで受け口が無い。
    expect(DISPATCHES.test("if (argv.includes('--links')) return links();")).toBe(false);
  });

  it('★ 起動経路の判定が、実物の 3 経路に当たる', () => {
    // npm (大多数), workflow (mutate-changed.cjs), vitest (scan-credential-headers.cjs)
    expect(invokers('lint-forbidden-patterns.cjs')).toContain('package.json');
    // 下位命令の形 (`node scripts/integrity-chain.cjs self-test`)。
    expect(invokers('integrity-chain.cjs')).toContain('package.json');
    expect(invokers('mutate-changed.cjs').some((i) => i.startsWith('.github/workflows'))).toBe(true);
    expect(invokers('scan-credential-headers.cjs')).toContain(
      'src/shared/__tests__/redactionCoverage.test.ts',
    );
    // 存在しない script には何も当たらない (常に何かを返す判定でないこと)。
    expect(invokers('no-such-script.cjs')).toEqual([]);
    // **散文で名前を挙げているだけでは経路に数えない。**
    // proxyWorkerParity.test.ts は public-host-guard.cjs を注記で挙げ、
    // `isPrivateOrReservedHost` だけを取り出している (selfTest は呼ばない)。
    expect(invokers('public-host-guard.cjs')).not.toContain(
      'src/renderer/network/__tests__/proxyWorkerParity.test.ts',
    );
    expect(invokers('public-host-guard.cjs')).toContain('src/shared/__tests__/gateSelfTests.test.ts');
  });
});

/*
 * **そして、その self-test を実際に走らせる。**
 *
 * `scan-credential-headers.cjs` を `redactionCoverage.test.ts` から呼ぶのと
 * 同じ形。`public-host-guard.cjs` は CI の出典リンク検査が第三者の
 * `302 Location:` で内部アドレスへ向けられる経路を塞ぐ関門で、実測では
 * **126 文のうち 18 文が一度も実行されていなかった** —— 資格情報つき URL の
 * 拒否、NAT64 / 6to4 / IPv4-compatible に埋め込んだ IPv4 (IMDS への迂回路)、
 * `resolvesToPublicHost` の早期 return 全部。振る舞いはどれも正しかったが、
 * 留めておく物が無かった。
 */
describe('CI の SSRF 関門の self-test (scripts/public-host-guard.cjs)', () => {
  const req = createRequire(import.meta.url);
  const { selfTest } = req('../../../scripts/public-host-guard.cjs') as {
    selfTest: () => Promise<number>;
  };

  it('★ 関門の self-test が全件一致する', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    const err = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    let code: number;
    try {
      code = await selfTest();
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
    expect(code, `関門の self-test が落ちました:\n${lines.join('\n')}`).toBe(0);
    // 走査が死んで 0 件になったのを「違反なし」と読まない —— 実際に回ったこと。
    expect(lines.filter((l) => l.includes('✓')).length).toBeGreaterThanOrEqual(50);
  });
});
