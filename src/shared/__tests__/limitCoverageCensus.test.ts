import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readOriginalDir, readOriginalSource } from './originalSource';

/*
 * **安全上限 (MAX_* / MIN_*) は、名前で検査から参照されている** (2026-09-19 · パス 321)。
 *
 * オントロジーの法則 `safety-limits-not-parameters` は「上限は台帳 (`parameters.ts`) に
 * 載せず、コードの定数として置く」と言う。置いた定数が**効いているか**は検査だけが
 * 言える —— そして 2026-09-19 に数えたら、114 の上限のうち **2 つ**
 * (`MAX_RENDER_ERROR_CHARS` / `MAX_STOCK_ADVISOR_RATIONALE_CHARS`) はどの検査からも
 * 名前で参照されていなかった (数字の 160 / 400 は検査に在ったが、定数を動かしても
 * 検査は動かない —— 「数を 2 か所に書く」形)。この census は母集団を実装から導き、
 * 名前で参照されていない上限を理由つきの台帳に載せる (双方向)。
 *
 * **これは「上限に検査が在る」を保証しない** —— 名前が検査に現れることまでしか見ない。
 * 検査が実際に境界を踏むかは、その検査自身が対照で示す。
 */

const REPO_SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[]): void {
  for (const name of readOriginalDir(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(name)) out.push(full);
  }
}

const LIMIT_EXPORT = /^export const ((?:MAX|MIN)_[A-Z0-9_]+)\b/gm;

/** 名前で参照されていない上限と、その理由 (空が正常。増えたら理由を書く・消えたら行を消す)。 */
const UNREFERENCED: Readonly<Record<string, string>> = {};

describe('安全上限の census', () => {
  const files: string[] = [];
  walk(REPO_SRC, files);
  const sources = files.filter((f) => !f.includes('__tests__'));
  // この census 自身は母集団から外す (docblock と標本に名前を書いているので、数えると自分で満たしてしまう)。
  const tests = files.filter((f) => f.includes('__tests__') && !f.endsWith('limitCoverageCensus.test.ts'));
  const testText = tests.map((f) => readOriginalSource(f)).join('\n');

  const limits = new Map<string, string>();
  for (const f of sources) {
    for (const m of readOriginalSource(f).matchAll(LIMIT_EXPORT)) {
      limits.set(m[1]!, relative(REPO_SRC, f));
    }
  }

  it('母集団が実物に届いている (空撃ちでない)', () => {
    expect(limits.size).toBeGreaterThanOrEqual(100);
    expect(limits.has('MAX_HTTP_RESPONSE_BYTES')).toBe(true);
    expect(tests.length).toBeGreaterThanOrEqual(300);
  });

  it('★ 名前で参照されていない上限は台帳の分だけ (双方向)', () => {
    const missing = [...limits.keys()].filter((n) => !new RegExp(`\\b${n}\\b`).test(testText)).sort();
    const ledgered = Object.keys(UNREFERENCED).sort();
    expect(missing.filter((n) => !(n in UNREFERENCED)), '検査から名前で参照されていない上限 (理由を書いて台帳に載せるか、検査を書く)').toEqual([]);
    expect(ledgered.filter((n) => !missing.includes(n)), '台帳に在るが、もう参照されている (行を消す)').toEqual([]);
    expect(ledgered.filter((n) => !limits.has(n)), '台帳に在るが、実在しない上限').toEqual([]);
  });

  it('★ 標本: 2026-09-19 まで参照されていなかった 2 つは、今は名前で参照されている', () => {
    for (const n of ['MAX_RENDER_ERROR_CHARS', 'MAX_STOCK_ADVISOR_RATIONALE_CHARS']) {
      expect(limits.has(n), n).toBe(true);
      expect(new RegExp(`\\b${n}\\b`).test(testText), n).toBe(true);
    }
  });

  it('対照: 実在しない名前は参照されていない (針は本当に名前を見ている)', () => {
    const needle = ['MAX', 'NOT', 'A', 'REAL', 'LIMIT', 'XYZ'].join('_');
    expect(new RegExp(`\\b${needle}\\b`).test(testText)).toBe(false);
    expect(new RegExp(`\\b${needle}\\b`).test(`${testText}\n${needle}`)).toBe(true);
  });
});
