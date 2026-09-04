import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PKG = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  overrides?: Record<string, string>;
};
const LOCK = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8')) as {
  packages?: Record<string, { version?: string }>;
};

/*
 * **`overrides` は「上流が直るまで自分で押さえている脆弱性」の記録である。**
 *
 * `package.json` の 1 行なので、依存を整理するときに黙って消える。消えても
 * 型検査も単体テストも通る —— 気付くのは `npm audit` を**誰かが手で走らせた
 * とき**だけで、CI にその手順は無い (dependabot も無い)。
 *
 * 実際にこの repo は 2026-08-17 に `qs` の DoS を override で押さえている。
 * 上流 (`@stryker-mutator/core` → `typed-rest-client` → `qs`) は
 * 指定が無ければ脆弱な版へ落ちる。
 *
 * ここでは**ネットワークに出ずに**確かめられることだけを見る:
 *
 *   - 押さえている物の一覧が、理由つきの台帳と一致する (双方向)
 *   - lockfile の解決版が、その指定を満たしている
 *
 * `npm audit` の件数そのものは新しいアドバイザリで日々変わるので、
 * ここでは数えない (`docs/REMAINING_WORK.md` に「数える前に実行すること」と
 * 書いてある)。**変わらないのは「自分で押さえたことを忘れない」の方**。
 */

/** 押さえている理由の台帳。**増えても減っても落ちる。** */
const OVERRIDE_REASONS: Readonly<Record<string, string>> = {
  qs:
    '2026-08-17: qs の DoS。@stryker-mutator/core → typed-rest-client → qs@6.15.1 が'
    + ' 脆弱で、上流のリリースを待たずに patch 版を強制した。'
    + ' typed-rest-client の API は変わらないので Stryker の実行に影響しない。',
};

describe('依存の override は、理由つきで台帳に載っている', () => {
  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(PKG.overrides, 'package.json に overrides が無い').toBeTruthy();
    expect(Object.keys(LOCK.packages ?? {}).length, 'lockfile を読めていない').toBeGreaterThan(100);
  });

  it('台帳と package.json の overrides が一致する (増減で落ちる)', () => {
    expect(Object.keys(PKG.overrides ?? {}).sort(), '理由の無い override があります').toEqual(
      Object.keys(OVERRIDE_REASONS).sort(),
    );
  });

  it('理由が空の項目が無い', () => {
    const blank = Object.entries(OVERRIDE_REASONS).filter(([, why]) => why.trim().length === 0);
    expect(blank.map(([k]) => k)).toEqual([]);
  });

  /*
   * **指定が在っても、解決版が満たしていなければ意味が無い。**
   * `npm install` を別の順序で回すと lockfile が古い版のまま残ることがある。
   */
  it('lockfile の qs は、押さえた下限を満たしている', () => {
    const entry = (LOCK.packages ?? {})['node_modules/qs'];
    expect(entry?.version, 'lockfile に qs が無い').toBeTruthy();
    const [major, minor, patch] = (entry!.version ?? '0.0.0').split('.').map(Number);
    // 押さえた下限は 6.15.2。
    const atLeast =
      major! > 6 || (major === 6 && (minor! > 15 || (minor === 15 && patch! >= 2)));
    expect(atLeast, `qs が ${entry?.version} まで落ちています (下限 6.15.2)`).toBe(true);
  });

  it('override の指定そのものが下限を下げていない', () => {
    expect(PKG.overrides?.['qs'], 'qs の指定が緩んでいます').toMatch(/\^?6\.(1[5-9]|[2-9]\d)\./);
  });
});
