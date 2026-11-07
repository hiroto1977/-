/**
 * 版と身元を名乗る所の母集団 (2026-09-25 · パス 460)。
 *
 * ## なぜ生の原文を走るのか (実測して決めた)
 *
 * このリポジトリの走査はふつう `stripNonCode` を通すが、**ここでは通せない** ——
 * あの道具は**文字列リテラルの中身を落とす** (パス 453 / 459 で実測した非対称)。
 * 探している物そのものが文字列リテラルなので、通すと母集団が空になり、
 * どの入力でも通る検査になる。
 *
 * 代わりに**生の原文**を走る。その結果、**注記の中で版を引用しても鳴る** ——
 * それは正しい: 走査は綴りしか見ないので、注記に例外を作るとそこが穴になる
 * (`lint:forbidden` が同じ理由で注記の中でも鳴る。パス 347 / 370 と同じ判断で、
 * このパスも自分の docblock を 6 か所**言い換えた**)。
 *
 * ## 留める物
 *
 * ① **ブラウザ版は版を 1 回しか名乗らない** —— `web-shim.ts` の引用符つきの
 *    素の版リテラルはちょうど 1 つ (`WEB_BUILD_VERSION`)。直す前は 2 つで、
 *    `package.json` を上げた日に `checkUpdate` だけが古い版と比べる形だった。
 * ② **身元の接尾辞も 1 回しか綴られない** —— 出荷コードの引用符つきの接尾辞
 *    リテラルはちょうど 1 つ (`WEB_BUILD_SUFFIX` の宣言) で、読み手は import する。
 * ③ **版と接尾辞をくっつけた形は出荷コードに 1 つも無い** ——
 *    それが在ると、版を上げる編集が実行形態を動かす (パス 460 の欠陥そのもの)。
 * ④ 読み手の台帳を**両方向**で持つ。
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';
import { WEB_BUILD_SUFFIX } from '../../shared/buildDestinations';

const ROOT = process.cwd();

/** 引用符つきの「素の版」リテラル (`'1.2.3'`)。 */
const PLAIN_VERSION = /(['"])\d+\.\d+\.\d+\1/g;
/** 引用符つきの「版 + 接尾辞」リテラル —— 直す前の形。 */
const VERSIONED_SUFFIX = /(['"])v?\d+\.\d+\.\d+[^'"]*-web\1/g;
/** 引用符つきの接尾辞そのもの。 */
const BARE_SUFFIX = /(['"])-web\1/g;

/** 出荷される `.ts` / `.tsx` (検査と型宣言は除く)。 */
function shippedSources(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      if (e.name === '__tests__' || e.name === '__audits__') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
    }
  };
  walk(join(ROOT, rel));
  return out;
}

function countIn(src: string, re: RegExp): number {
  return src.match(new RegExp(re.source, 'g'))?.length ?? 0;
}

const SHIPPED = [...shippedSources('src/renderer'), ...shippedSources('src/shared')];

/**
 * 接尾辞と判定の読み手。**両方向**で持つ ——
 * 母集団に入ったのに台帳に無ければ落ち、台帳に在るのに読まなくなっても落ちる。
 */
const READERS: readonly { file: string; why: string }[] = [
  {
    file: 'src/renderer/web-shim.ts',
    why: 'ブラウザ版の橋が版に接尾辞を足して名乗る (作る側)。',
  },
  {
    file: 'src/renderer/runtimeMode.ts',
    why: '橋が名乗った版の接尾辞で実行形態を決める (比べる側)。',
  },
];

describe('版と身元の綴り', () => {
  it('床: 走査が実物に当たっている (出荷される .ts/.tsx が 300 本以上)', () => {
    expect(SHIPPED.length).toBeGreaterThanOrEqual(300);
  });

  it('★ ブラウザ版は版を 1 回しか名乗らない (web-shim の素の版リテラルは 1 つ)', () => {
    const src = readOriginalSource(join(ROOT, 'src/renderer/web-shim.ts'));
    expect(countIn(src, PLAIN_VERSION)).toBe(1);
    // 針が的に当たることを標本で (走査と同じ生の文字列に当てる · パス 459 の規約)。
    expect(countIn(`const v = '9.9.9';`, PLAIN_VERSION)).toBe(1);
    expect(countIn('const v = `9.9.9`;', PLAIN_VERSION)).toBe(0);
  });

  it('★ 身元の接尾辞は出荷コード全体で 1 回しか綴られない', () => {
    const hits = SHIPPED.filter((f) => countIn(readOriginalSource(f), BARE_SUFFIX) > 0);
    expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual(['src/shared/buildDestinations.ts']);
    const decl = readOriginalSource(join(ROOT, 'src/shared/buildDestinations.ts'));
    expect(countIn(decl, BARE_SUFFIX)).toBe(1);
    expect(decl).toContain(`export const WEB_BUILD_SUFFIX = '${WEB_BUILD_SUFFIX}'`);
  });

  it('★ 「版 + 接尾辞」をくっつけた形は出荷コードに 1 つも無い (直す前の形)', () => {
    const hits: string[] = [];
    for (const f of SHIPPED) {
      const n = countIn(readOriginalSource(f), VERSIONED_SUFFIX);
      if (n > 0) hits.push(`${f.slice(ROOT.length + 1)} (${n})`);
    }
    expect(hits).toEqual([]);
    // 針が的に当たることを標本で —— 直す前の綴りそのもの。
    expect(countIn(`getVersion() === '0.1.0-web'`, VERSIONED_SUFFIX)).toBe(1);
    expect(countIn(`resolve('0.2.0-web')`, VERSIONED_SUFFIX)).toBe(1);
    // 関係のない `-web` で終わる id は拾わない (実測: snapshot / 学術コーパス / scanTarget に在る)。
    expect(countIn(`const id = 'service-hub-web';`, VERSIONED_SUFFIX)).toBe(0);
    expect(countIn(`const k = 'not-web';`, VERSIONED_SUFFIX)).toBe(0);
  });

  it('★ 接尾辞と判定の読み手が台帳と一致する (両方向)', () => {
    const found = SHIPPED.filter((f) => {
      const src = readOriginalSource(f);
      return /\b(WEB_BUILD_SUFFIX|isWebBuildVersion)\b/.test(src) && !f.endsWith('buildDestinations.ts');
    }).map((f) => f.slice(ROOT.length + 1));
    expect(found.slice().sort()).toEqual(READERS.map((r) => r.file).slice().sort());
  });

  it('台帳の理由が空でない', () => {
    for (const r of READERS) expect(r.why.length, r.file).toBeGreaterThanOrEqual(15);
  });
});
