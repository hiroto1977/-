import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * **自分で押さえた「これより下へ落とさない」版 (セキュリティの床) を忘れないための検査。**
 *
 * 2026-08-17 に `qs` の DoS を `overrides` で押さえたとき、ここに理由の台帳を作った。
 * 散文はこう書いてあった —— 「`overrides` は**上流が直るまで自分で押さえている脆弱性**の
 * 記録である」。**ところが走査していたのは `package.json` の `overrides` の鍵だけ**で、
 * この repo が床を作る道は 3 本あった:
 *
 *   1. `overrides`            推移的依存を強制的に上げる
 *   2. `devDependencies` の範囲  直接依存の下限を上げる
 *   3. lockfile だけ           どこにも宣言が無く、解決結果としてだけ存在する
 *
 * 2026-09-10 に 2 と 3 を実際に踏んだ。`vitest` の**パストラバーサル / 任意ファイル
 * 読み出し** (GHSA-82fw-gwwq-j7x9) を `^4.1.11` で塞ぎ、`js-yaml` の DoS (high) は
 * `electron-builder` の範囲の内側だったので `npm update` だけで上がった —— どちらも
 * 「なぜその数字なのか」がどこにも残らない形だった。
 *
 * **同じ日に、既にあった 1 本の床も古びていた。** `^6.15.2` は据えた 24 日後に
 * 低すぎになっていた (後から出た GHSA-x5fp-wj9c-mxmx / GHSA-4mjr-xmp4-gh2g が
 * 6.15.2 と 6.15.3 を覆った)。lockfile がたまたま 6.16.0 に解決されていたので
 * `npm audit` は緑のままで、**古い検査は「綴りが緩んでいないか」しか見ていなかった**
 * (`toMatch(/\^?6\.(1[5-9]|[2-9]\d)\./)` は `^6.15.2` を永遠に通す)。
 *
 * 台帳は `scripts/lint-dependencies.cjs` の `SECURITY_FLOORS` に 1 つだけ置き
 * (`verify:all` / CI の `lint:deps` が毎回当てる)、ここでは**その台帳が実物に
 * 効いていること**と、**壊すと鳴ること** (対照) を留める。
 * 床がまだ十分に高いかは勧告データベースが要るので `npm run audit:floors`。
 */

const req = createRequire(import.meta.url);
const gate = req('../../../scripts/lint-dependencies.cjs') as {
  SECURITY_FLOORS: readonly {
    package: string;
    atLeast: string;
    mechanism: 'overrides' | 'devDependency';
    advisories: readonly string[];
    checkedOn: string;
    why: string;
  }[];
  checkSecurityFloors: (
    input: { lock: unknown; pkg: unknown },
    floors?: readonly unknown[],
  ) => string[];
  staleFloors: (floors?: readonly unknown[], now?: Date, withinDays?: number) => unknown[];
  rangeFloor: (range: string) => number[] | null;
};

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (f: string) => JSON.parse(readFileSync(path.join(REPO_ROOT, f), 'utf8')) as Record<string, unknown>;
const PKG = read('package.json');
const LOCK = read('package-lock.json');
const overrides = (PKG.overrides ?? {}) as Record<string, string>;
const devDeps = (PKG.devDependencies ?? {}) as Record<string, string>;

describe('セキュリティの床は、道を問わず理由つきで台帳に載っている', () => {
  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(gate.SECURITY_FLOORS.length, '床の台帳が空').toBeGreaterThan(0);
    expect(Object.keys(overrides).length, 'overrides が無い').toBeGreaterThan(0);
    expect(Object.keys(LOCK.packages ?? {}).length, 'lockfile を読めていない').toBeGreaterThan(100);
  });

  it('★ 実物の package.json / package-lock.json が床をすべて満たす', () => {
    expect(gate.checkSecurityFloors({ lock: LOCK, pkg: PKG })).toEqual([]);
  });

  it('overrides の鍵と、台帳の overrides 行が一致する (双方向・増減で落ちる)', () => {
    const ledger = gate.SECURITY_FLOORS.filter((f) => f.mechanism === 'overrides').map((f) => f.package);
    expect(Object.keys(overrides).sort(), '理由の無い override があります').toEqual(ledger.sort());
  });

  it('devDependency の道の床は、実際に devDependencies で宣言されている', () => {
    for (const f of gate.SECURITY_FLOORS.filter((x) => x.mechanism === 'devDependency')) {
      expect(devDeps[f.package], `${f.package} の宣言が無い`).toBeTruthy();
    }
  });

  it('どの行にも理由・勧告 ID・突き合わせた日がある', () => {
    for (const f of gate.SECURITY_FLOORS) {
      expect(f.why.trim().length, `${f.package} の理由が空`).toBeGreaterThan(0);
      expect(f.advisories.length, `${f.package} の勧告 ID が無い`).toBeGreaterThan(0);
      for (const a of f.advisories) expect(a, `${f.package} の勧告 ID の形`).toMatch(/^GHSA-[\w-]+$/);
      expect(f.checkedOn, `${f.package} の checkedOn`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /*
   * **対照。** 守っている物を実際に壊し、狙った項目が落ちることを見る。
   * 鳴らない対照は「合格」ではなく、その検査についての報せ (CLAUDE.md)。
   * 実物の package.json / lockfile の写しを壊して当てる —— 合成だけだと
   * 「実物には当たっていない規則」が緑のまま残る。
   */
  describe('対照 — 実物を壊すと鳴る', () => {
    const clone = () => ({ lock: read('package-lock.json'), pkg: read('package.json') });
    const rings = (mutate: (i: ReturnType<typeof clone>) => void) => {
      const input = clone();
      mutate(input);
      return gate.checkSecurityFloors(input);
    };
    const first = gate.SECURITY_FLOORS.find((f) => f.mechanism === 'overrides')!;
    const dev = gate.SECURITY_FLOORS.find((f) => f.mechanism === 'devDependency')!;

    it('override の 1 行が消えると鳴る (依存整理で黙って消える形)', () => {
      expect(rings((i) => { delete (i.pkg.overrides as Record<string, string>)[first.package]; })).not.toEqual([]);
    });

    it('devDependency の宣言が消えると鳴る (2 本目の道)', () => {
      expect(rings((i) => { delete (i.pkg.devDependencies as Record<string, string>)[dev.package]; })).not.toEqual([]);
    });

    it('★ 指定を major だけに揃えると鳴る — 古い検査が見逃していた形', () => {
      const loosened = `^${first.atLeast.split('.')[0]}`;
      // 緩めた指定が**本当に**床より下を許すことを先に確かめる (空の対照にしない)。
      expect(gate.rangeFloor(loosened)!).not.toEqual(gate.rangeFloor(first.atLeast)!);
      expect(rings((i) => { (i.pkg.overrides as Record<string, string>)[first.package] = loosened; })).not.toEqual([]);
    });

    it('★ patch を落としただけでも鳴る (床の patch が 0 でない行)', () => {
      const withPatch = gate.SECURITY_FLOORS.find((f) => Number(f.atLeast.split('.')[2]) > 0);
      expect(withPatch, 'patch を持つ床が台帳に無い — この対照は空です').toBeTruthy();
      const target = withPatch!;
      const loosened = `^${target.atLeast.split('.').slice(0, 2).join('.')}`;
      expect(gate.rangeFloor(loosened)!).not.toEqual(gate.rangeFloor(target.atLeast)!);
      const where = target.mechanism === 'overrides' ? 'overrides' : 'devDependencies';
      expect(
        rings((i) => { (i.pkg[where] as Record<string, string>)[target.package] = loosened; }),
      ).not.toEqual([]);
    });

    it('lockfile の解決版が床を下回ると鳴る', () => {
      const [maj, min, pat] = first.atLeast.split('.').map(Number);
      const below = pat! > 0 ? `${maj}.${min}.${pat! - 1}` : `${maj}.${min! - 1}.0`;
      expect(
        rings((i) => {
          const packages = i.lock.packages as Record<string, { version: string }>;
          packages[`node_modules/${first.package}`] = { version: below };
        }),
      ).not.toEqual([]);
    });

    it('入れ子の複製だけが古くても鳴る', () => {
      expect(
        rings((i) => {
          (i.lock.packages as Record<string, { version: string }>)[
            `node_modules/deep/node_modules/${dev.package}`
          ] = { version: '0.0.1' };
        }),
      ).not.toEqual([]);
    });

    it('台帳に無い override を足すと鳴る (双方向)', () => {
      expect(rings((i) => { (i.pkg.overrides as Record<string, string>)['tar-fs'] = '^3.0.0'; })).not.toEqual([]);
    });

    it('無改変では鳴らない (対照の対照)', () => {
      expect(gate.checkSecurityFloors(clone())).toEqual([]);
    });
  });

  /*
   * **床は据えた日の勧告に対してしか正しくない。** ここは網に出ないので
   * 「低すぎるか」は測れず、測れるのは「いつ測ったか」だけ。
   */
  it('床を勧告データベースと突き合わせてから 180 日以内 (超えると lint:deps が警告する)', () => {
    expect(gate.staleFloors(gate.SECURITY_FLOORS, new Date())).toEqual([]);
  });

  it('対照: 1 年放置した床は古びとして拾われる', () => {
    const old = [{ package: 'x', checkedOn: '2020-01-01' }];
    expect(gate.staleFloors(old, new Date('2026-09-10T00:00:00Z'))).toHaveLength(1);
  });
});
