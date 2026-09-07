/**
 * `originalSource` の検査 —— **標本と対照つき**。
 *
 * 守っているのは「原文の綴りに当てる検査が、変異検査の中で空にならないこと」なので、
 * 標本は**実際に Stryker が書き出す形**を使う (2026-09-07 に sandbox から採った実物)。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  insideInstrumentedSandbox,
  isInstrumented,
  originalSourcePath,
  readOriginalDir,
  readOriginalSource,
} from './originalSource';

/** sandbox から採った実物 1 行 (書き換わった `export const`)。 */
const INSTRUMENTED_LINE =
  'export const BALANCE_SHEET_COLLECTION = stryMutAct_9fa48("7644") ? "" : (stryCov_9fa48("7644"), \'balance-sheet\')';
/** 直す前の実物 1 行。 */
const ORIGINAL_LINE = "export const BALANCE_SHEET_COLLECTION = 'balance-sheet';";

describe('isInstrumented', () => {
  it('★ 標本: sandbox の実物を「書き換えられている」と判定する', () => {
    expect(isInstrumented(INSTRUMENTED_LINE)).toBe(true);
  });

  it('★ 対照: 素の原文は「書き換えられていない」', () => {
    expect(isInstrumented(ORIGINAL_LINE)).toBe(false);
  });

  it('対照: 走査の的が実在する — 台帳の走査に使う正規表現は原文にだけ当たる', () => {
    const re = /^export const [A-Z_]*COLLECTION[A-Z_]* = '([a-z0-9-]+)'/m;
    // これが検査の要点: 同じ規則が原文には当たり、書き換わった行には当たらない。
    expect(re.test(ORIGINAL_LINE)).toBe(true);
    expect(re.test(INSTRUMENTED_LINE)).toBe(false);
  });
});

describe('originalSourcePath', () => {
  it('★ sandbox の 2 段を抜いて repo の道に戻す', () => {
    expect(originalSourcePath('/home/user/-/.stryker-tmp/sandbox-NLWJo3/src/renderer/data/x.ts'))
      .toBe('/home/user/-/src/renderer/data/x.ts');
  });

  it('sandbox の名前は毎回変わるので、名前を当てにしない', () => {
    for (const name of ['sandbox-a', 'sandbox-ZZZ999', 'sandbox-0']) {
      expect(originalSourcePath(`/r/.stryker-tmp/${name}/src/a.ts`)).toBe('/r/src/a.ts');
    }
  });

  it('★ 対照: sandbox の外の道は 1 文字も変えない', () => {
    const p = '/home/user/-/src/renderer/data/x.ts';
    expect(originalSourcePath(p)).toBe(p);
    expect(insideInstrumentedSandbox(p)).toBe(false);
  });

  it('sandbox の中なら中だと言う', () => {
    expect(insideInstrumentedSandbox('/r/.stryker-tmp/sandbox-q/src/a.ts')).toBe(true);
  });

  it('似た名前のディレクトリを sandbox と間違えない', () => {
    // `.stryker-tmp` でも `sandbox-` で始まらない段は抜かない。
    const p = '/r/.stryker-tmp/reports/src/a.ts';
    expect(originalSourcePath(p)).toBe(p);
    // `stryker-tmp` (先頭の点なし) も別物。
    const q = '/r/stryker-tmp/sandbox-q/src/a.ts';
    expect(originalSourcePath(q)).toBe(q);
  });
});

describe('readOriginalSource / readOriginalDir', () => {
  // 読む的は**印について書いていない**実在のファイルにする。このモジュールと
  // この検査は説明のために印を書いているので、的に選ぶと話がこじれる。
  const TARGET = path.resolve(__dirname, '..', 'balanceSheetFreshness.ts');

  it('実在するファイルを読める', () => {
    expect(readOriginalSource(TARGET)).toContain('export function balanceSheetFreshness');
  });

  it('★ sandbox の道を渡しても repo の本物を読む', () => {
    // 実際に走らせている場所が sandbox でなくても、道の形を作って同じ結果になることを見る。
    const faked = TARGET.replace('/src/', '/.stryker-tmp/sandbox-XYZ/src/');
    expect(readOriginalSource(faked)).toBe(readOriginalSource(TARGET));
  });

  it('印について書いた文書を「書き換えられている」と誤らない (このモジュール自身)', () => {
    // 2026-09-07 にここで落ちた: 接頭辞だけを見ていたので自分の説明文に当たっていた。
    expect(readOriginalSource(path.join(__dirname, 'originalSource.ts')))
      .toContain('export function originalSourcePath');
  });

  it('ディレクトリの一覧も repo の本物から取る', () => {
    const real = __dirname;
    const faked = real.replace('/src/', '/.stryker-tmp/sandbox-XYZ/src/');
    expect(readOriginalDir(faked)).toEqual(readOriginalDir(real));
    expect(readOriginalDir(real)).toContain('originalSource.ts');
  });
});
