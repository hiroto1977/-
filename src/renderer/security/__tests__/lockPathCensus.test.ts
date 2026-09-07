import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/*
 * **施錠の門を作っても、名簿を測らなければ迂回される。** (2026-09-06 実測)
 *
 * 2026-08-23 に `lockWorkspace()` を作った理由は
 * 「鍵を落とす行と画面を施錠表示にする行が並んでいると、前者だけ消えても
 * 全検査が緑のまま通る」から。ところが **production で `getVault().lock()` を
 * 呼ぶ場所は、その門の外にもう 1 か所あった** —— 設定ページの
 * 「Vault を今すぐロック」、つまり**利用者が実際に押す施錠**。
 * 門は在るのに一番目立つ経路が通っておらず、誰も
 * 「全ての施錠経路が門を通ること」を測っていなかった。
 *
 * 型では止められない (`lock()` は `Vault` の公開メソッドで、誰でも呼べる)。
 * そこで**名簿を測る**: production の `src/` で鍵を落とせるのは
 * `src/renderer/security/lockWorkspace.ts` だけ。
 *
 * 走査が死んでいれば (綴りを変えた・歩く場所を間違えた) 空集合は「合格」に
 * 見えてしまうので、**下限**と**標本**を置く ——
 * 許可外のファイルに同じ行が有れば必ず鳴ることを、同じ検査の中で見る。
 */

const ROOT = new URL('../../../..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

/** 鍵を落とす呼び出し。`navigator.locks.request` (別物) には当たらない。 */
const DROP_KEY = /\.lock\(\s*\)/;

/**
 * 鍵を落として良い唯一の場所。
 *
 * ここを増やすときは、なぜその場所が「施錠の意味を 1 つにする」責務を
 * 分け持つのか書くこと。単に検査を黙らせるために増やす行ではない。
 */
const ALLOWED = new Set(['src/renderer/security/lockWorkspace.ts']);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      // 検査は施錠を自由に呼ぶ (鍵が落ちたことを見るため)。
      if (entry.name !== '__tests__') sourceFiles(p, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

/** 走査が本当に木を歩いたことの下限 (実測 300 超)。 */
const MIN_FILES = 250;

describe('施錠経路の名簿 — 鍵を落とすのは lockWorkspace だけ', () => {
  const files = sourceFiles(SRC);

  it(`走査が生きている (production の .ts/.tsx を ${MIN_FILES} 件以上見ている)`, () => {
    expect(files.length).toBeGreaterThanOrEqual(MIN_FILES);
  });

  it('★ 規則は実際に当たる (標本 — 許可外のファイルに同じ行が有れば鳴る)', () => {
    const sample = '  function lockNow() {\n    getVault().lock();\n    onLocked();\n  }\n';
    expect(DROP_KEY.test(sample)).toBe(true);
    expect(ALLOWED.has('src/renderer/pages/SettingsPage.tsx')).toBe(false);
  });

  it('★ production で鍵を落とすのは許可された 1 か所だけ', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (ALLOWED.has(rel)) continue;
      const body = readFileSync(file, 'utf8');
      for (const [i, line] of body.split('\n').entries()) {
        // 注記の中で経緯を説明している行は本体ではない。
        const code = line.replace(/^\s*(\*|\/\/).*$/, '');
        if (DROP_KEY.test(code)) offenders.push(`${rel}:${i + 1} ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('許可した場所は実在し、実際に鍵を落としている (台帳が古くなったら鳴る)', () => {
    for (const rel of ALLOWED) {
      const body = readFileSync(join(ROOT, rel), 'utf8');
      expect(DROP_KEY.test(body), rel).toBe(true);
    }
  });

  it('★ 明示的な施錠は門を通る — 設定ページに鍵を落とす行が無く、門を呼んでいる', () => {
    const settings = readFileSync(join(SRC, 'renderer/pages/SettingsPage.tsx'), 'utf8');
    const code = settings
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n');
    expect(DROP_KEY.test(code)).toBe(false);
    expect(code).toContain('lockEverywhere()');
  });
});
