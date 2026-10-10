import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * `lint:imports` の**外側の証人**。
 *
 * このゲートは main / preload / renderer の**信頼境界**そのものを守る。
 * 2026-08-26 の実測: `main()` の冒頭へ「常に成功」を差し込み、
 * `src/renderer/pages/A8netPage.tsx` に `import { ipcRenderer } from 'electron'` と
 * `import { readFileSync } from 'node:fs'` を足したところ、
 * **lint:imports ・ self-test ・ lint:forbidden ・ chain:verify ・ eslint が
 * すべて緑**になった。証人がゲート自身の中にしか無かったからである。
 *
 * 標本は「禁じたい書き方」で選ぶ。正規表現を写すと、表を書き換えたときに
 * 検査も一緒に動いて何も留めない。
 */
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/check-import-boundaries.cjs') as {
  boundaryViolations: (rel: string, text: string) => { file: string; spec: string; reason: string }[];
  detectZone: (rel: string) => string | null | undefined;
};

const check = (rel: string, text: string) => gate.boundaryViolations(rel, text);

describe('lint:imports — 外側の証人 (信頼境界)', () => {
  it.each([
    ['renderer が electron を読む', 'src/renderer/pages/X.tsx', "import { ipcRenderer } from 'electron';\n"],
    ['renderer が node 組み込みを読む', 'src/renderer/pages/X.tsx', "import { readFileSync } from 'node:fs';\n"],
    ['renderer が接頭辞なしの node 組み込みを読む', 'src/renderer/pages/X.tsx', "import fs from 'fs';\n"],
    ['preload が node 組み込みを読む', 'src/preload/index.ts', "import { readFileSync } from 'node:fs';\n"],
    ['renderer が main を読む', 'src/renderer/pages/X.tsx', "import { fetchRepos } from '../../main/clients/github';\n"],
    ['main が renderer を読む', 'src/main/main.ts', "import { App } from '../renderer/App';\n"],
    ['src の中で実行時 require を使う', 'src/main/clients/index.ts', "const { SERVICE_IDS } = require('../../shared/serviceId');\n"],
    // shared は renderer が読む唯一の区画なので、禁止は推移的でなければ意味がない。
    // 2026-08-26 まで shared には制限が無く、node:fs を置いて renderer から読むと
    // build:web まで通って出荷物が出来た (実測)。
    ['shared が node 組み込みを読む (renderer へ持ち込まれる)', 'src/shared/x.ts', "import { readFileSync } from 'node:fs';\n"],
    ['shared が electron を読む', 'src/shared/x.ts', "import { app } from 'electron';\n"],
  ])('★ %s は違反として報告される', (_n, rel, text) => {
    expect(check(rel, text).length).toBeGreaterThan(0);
  });

  it.each([
    ['renderer が shared を読む', 'src/renderer/pages/X.tsx', "import { redact } from '../../shared/redact';\n"],
    ['renderer が npm を読む', 'src/renderer/pages/X.tsx', "import { useState } from 'react';\n"],
    ['main が electron を読む (当然よい)', 'src/main/main.ts', "import { app } from 'electron';\n"],
    ['main が node 組み込みを読む (当然よい)', 'src/main/main.ts', "import { readFileSync } from 'node:fs';\n"],
    ['型だけの import は実行時の結合を作らない', 'src/renderer/pages/X.tsx', "import type { BrowserWindow } from 'electron';\n"],
    ['注釈の中の require は数えない', 'src/main/x.ts', "// const a = require('../shared/x');\n"],
    ['絶対指定の require はバンドラが解決する', 'src/main/x.ts', "const p = require('node:path');\n"],
  ])('陰性: %s は報告されない', (_n, rel, text) => {
    expect(check(rel, text)).toHaveLength(0);
  });

  it('★ 違反には理由がつく (「何の規則で鳴ったか」が読める)', () => {
    const v = check('src/renderer/pages/X.tsx', "import { ipcRenderer } from 'electron';\n");
    expect(v[0]?.reason).toMatch(/electron/);
    expect(v[0]?.file).toBe('src/renderer/pages/X.tsx');
    expect(v[0]?.spec).toBe('electron');
  });

  /*
   * **区画の判定が生きていること。** `detectZone` が常に null を返すように
   * されると、上の陽性標本は 1 つも鳴らない —— 走査が空撃ちになる形である。
   */
  it('★ 3 つの区画をそれぞれ認識する', () => {
    expect(gate.detectZone('src/main/main.ts')).toBe('main');
    expect(gate.detectZone('src/preload/index.ts')).toBe('preload');
    expect(gate.detectZone('src/renderer/App.tsx')).toBe('renderer');
  });

  it('shared も区画である (renderer と同じ禁止が掛かる)', () => {
    expect(gate.detectZone('src/shared/redact.ts')).toBe('shared');
  });

  it.each([
    ['shared が shared を読む', 'src/shared/x.ts', "import { y } from './y';\n"],
    ['shared が npm を読む', 'src/shared/x.ts', "import { z } from 'zod';\n"],
    ['shared の型だけの node import は消える', 'src/shared/x.ts', "import type { Stats } from 'node:fs';\n"],
  ])('陰性: %s は報告されない', (_n, rel, text) => {
    expect(check(rel, text)).toHaveLength(0);
  });
});
