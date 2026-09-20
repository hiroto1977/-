/**
 * **変異検査の「生存」は、そのままでは欠陥の一覧ではない** (2026-09-20 · パス 356)。
 *
 * ## 実測した誤り —— 私が 2 つのパスで書いた解釈が偽だった
 *
 * パス 353 / 355 は `npx stryker run --mutate <file>` の報告を根拠に
 * 「生存 N 件」と書き、その 1 つを **「`recoverable: false` を `true` へ
 * 反転しても誰も鳴らない」**と説明した。**これは偽である。**
 * 同じ書き換えを手で当てて検査を走らせると落ちる ——
 * しかも**その実測は同じパスの本文に書いてあった**のに、
 * 見出しは反対のことを言っていた。
 *
 * 実測 (2026-09-20・報告の「生存」を 1 件ずつ当て直した):
 *
 * ```
 *   src/shared/apiResponse.ts:124      ConditionalExpression → false   実は殺されている (5 件落ちる)
 *   src/shared/securityResponse.ts:43  StringLiteral → ""              実は殺されている
 *   src/shared/securityResponse.ts:66  StringLiteral → ""              実は殺されている
 *   src/renderer/oauth/callbackPaste.ts LOOPBACK_REDIRECT_URI → ""     実は殺されている (2 件落ちる)
 *   src/shared/storageDurability.ts     recoverable: false → true      実は殺されている (2 件落ちる)
 * ```
 *
 * ## なぜそうなるのか —— リポジトリは既に書いていた
 *
 * `stryker.config.json` の `_commentIgnoreStatic`:
 *
 * > 覆われているものは実行され、**モジュールが変異体の有効化より前に
 * > 読み込まれている**ために『生存』と報告される
 *
 * つまり**モジュール直下の値の「生存」は「当てられなかった」を意味する**。
 * 検査が鳴らないことは意味しない。**私はこの注記を読んでから、
 * それでも反対の解釈を publish した** (`measure-before-claim`)。
 *
 * ## 本当に生存していた物も在る
 *
 * `callbackPaste.ts` の `[...].join('')` **3 件は本物**だった ——
 * 断片ごとの `toContain` は通るので、繋ぎ目を跨ぐ文字列でしか落ちない
 * (パス 355 で足した検査だけが鳴る・実測)。**だから読み直しの作業そのものは
 * 無駄ではない** (score が実物を映すようになり、本物の 3 件も出た)。
 * 偽だったのは**生存の解釈**である。
 *
 * ## この検査が留めるもの
 *
 * `npm run audit:survivors` (= `scripts/verify-survivors.cjs`) は報告の
 * 「殺されていない」変異体を 1 つずつ**原文へ当てて** `vitest related` を走らせ、
 * 「本当に生存」と「実は殺されている」を分ける。ここではその道具の
 * **純粋な部分** (位置の当て方・報告の読み分け) を標本と対照で留める。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readOriginalSource } from './originalSource';

const req = createRequire(import.meta.url);
const tool = req('../../../scripts/verify-survivors.cjs') as {
  applyReplacement: (
    source: string,
    location: { start: { line: number; column: number }; end: { line: number; column: number } },
    replacement: string,
  ) => string;
  notKilled: (report: unknown, file: string) => { id: string }[] | null;
};

const REPO = join(__dirname, '..', '..', '..');
const SRC = ['const a = 1;', 'if (x > 0) {', '  y();', '}', ''].join('\n');

describe('verify-survivors —— 位置の当て方 (パス 356)', () => {
  it('1 行の中を置き換える', () => {
    const out = tool.applyReplacement(
      SRC,
      { start: { line: 2, column: 4 }, end: { line: 2, column: 9 } },
      'false',
    );
    expect(out.split('\n')[1]).toBe('if (false) {');
  });

  it('★ 行を跨ぐ範囲を置き換える (ブロック文の除去は複数行に及ぶ)', () => {
    const out = tool.applyReplacement(
      SRC,
      { start: { line: 2, column: 11 }, end: { line: 4, column: 1 } },
      '{}',
    );
    expect(out).toContain('if (x > 0) {}');
    expect(out).not.toContain('y();');
  });

  it('原文を書き換えない (呼び出し側が退避に頼れる)', () => {
    tool.applyReplacement(SRC, { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } }, 'X');
    expect(SRC.split('\n')[0]).toBe('const a = 1;');
  });

  it('★ 原文の外の位置は投げる (黙って別の行を壊さない)', () => {
    expect(() =>
      tool.applyReplacement(SRC, { start: { line: 99, column: 0 }, end: { line: 99, column: 1 } }, 'x'),
    ).toThrow(/location が原文の外/);
  });
});

describe('verify-survivors —— 報告の読み分け (パス 356)', () => {
  const report = {
    files: {
      'a.ts': {
        mutants: [
          { id: '1', status: 'Killed' },
          { id: '2', status: 'Survived' },
          { id: '3', status: 'NoCoverage' },
          { id: '4', status: 'Ignored' },
        ],
      },
    },
  };

  it('★ Survived と NoCoverage だけを当て直す対象にする', () => {
    expect(tool.notKilled(report, 'a.ts')?.map((m) => m.id)).toEqual(['2', '3']);
  });

  it('Killed と Ignored は対象にしない (当て直す意味が無い)', () => {
    const picked = tool.notKilled(report, 'a.ts')?.map((m) => m.id) ?? [];
    expect(picked).not.toContain('1');
    expect(picked).not.toContain('4');
  });

  it('知らないファイルは null (空配列と混ぜない)', () => {
    expect(tool.notKilled(report, 'b.ts')).toBeNull();
  });
});

describe('verify-survivors —— 道具が名乗りどおりの形を持つ (パス 356)', () => {
  const src = readOriginalSource(join(REPO, 'scripts/verify-survivors.cjs'));

  it('★ 原文へ戻すのは finally で、戻したことを内容で確かめる', () => {
    expect(src).toContain('} finally {');
    expect(src).toContain("fs.readFileSync(abs, 'utf8') !== original");
    // 標本: この針は「戻さない」書き方には当たらない。
    expect('fs.writeFileSync(abs, original);').not.toContain('!== original');
  });

  it('★ `vitest related` で走らせる (全部を回さずに、その本を読む検査だけ)', () => {
    expect(src).toContain("'vitest', 'related'");
  });

  it('自己テストを持ち、package.json から呼べる', () => {
    expect(src).toContain('--self-test');
    const pkg = JSON.parse(readOriginalSource(join(REPO, 'package.json'))) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['audit:survivors']).toContain('verify-survivors.cjs');
    // CI では走らせない (定期点検の道具)。
    expect(readOriginalSource(join(REPO, '.github/workflows/ci.yml'))).not.toContain('audit:survivors');
    // 標本: 針が実在する綴りに当たる (ci.yml は他のゲートを確かに含む)。
    expect(readOriginalSource(join(REPO, '.github/workflows/ci.yml'))).toContain('npm run verify:arch');
  });
});
