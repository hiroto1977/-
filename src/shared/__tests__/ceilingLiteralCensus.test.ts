/**
 * **天井の写しは `maxLength` の外にも在る** (2026-09-12 · パス 174)。
 *
 * ## パス 167 の走査が見ていなかった場所
 *
 * パス 167 は「画面が天井の数を写していないか」を `maxLength={<数字>}` の形だけで
 * 数えた。同じ写しは**切る所**にも在る:
 *
 * | 場所 | 直す前 | 台帳の定数 |
 * | --- | --- | --- |
 * | `TeamRadarPage.updateNote` | `text.slice(0, 200)` | `MAX_MEMBER_NOTE_CHARS` (同じファイルが import 済み) |
 * | `teamRadarState.readStoredTeamRadar` | `slice(0, 64)` / `slice(0, 32)` | `MAX_DEPARTMENT_CHARS` / `MAX_EVALUATED_AT_CHARS` (**同じモジュールの中**) |
 * | `main/clients/talent.ts` + `web-shim.ts` | どちらも `slice(0, 64)` | 定数が**無かった** → `MAX_LEADER_CANDIDATE_CHARS` を新設 |
 * | `main/clients/emotions.ts` + `emotionsWeb.ts` | どちらも `slice(0, 80)` | 同上 → `MAX_ANALYSIS_EXCERPT_CHARS` |
 *
 * `teamRadarState` のは**同じモジュールの中で同じ天井を 2 通りに書いていた**のが厄介:
 * 検証 (`validateMembers` ほか) は定数で**断り**、読み出しは literal で**切る**。
 * `MAX_DEPARTMENT_CHARS` を 128 に上げると検証は 128 字を通すのに読み出しが 64 字へ
 * 切るので、**保存した状態が読むたびに短くなる**。
 *
 * ## 規則と、偶然の一致
 *
 * 「`slice(0, N)` の N が、そのファイルが知っている天井の値と同じ」を写しとみなす。
 * ただし**同じ数が別の意味で出る**ことは在るので、偶然は理由つきの台帳に載せる
 * (例: HTTP 応答本文の抜粋 200 字は `MAX_STOCK_ADVISOR_RISK_CHARS` と同じ数だが
 * 別の物)。台帳は双方向 —— 実物から消えた行は鳴る。
 *
 * **コメントと文字列は落としてから数える** (最初の版は散文の中の
 * `watch.slice(0, 25)` という引用を掴んだ。パス 85 の 0 倒し census と同じ罠)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const SRC = path.resolve(__dirname, '../..');

/** 行コメント・ブロックコメント・文字列を落とす (数える前に)。 */
export function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl' = 'code';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; i += 2; continue; }
      if (two === '/*') { mode = 'block'; i += 2; continue; }
      if (src[i] === "'") { mode = 'sq'; i += 1; continue; }
      if (src[i] === '"') { mode = 'dq'; i += 1; continue; }
      if (src[i] === '`') { mode = 'tpl'; i += 1; continue; }
      out += src[i];
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; }
      i += 1;
      continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; i += 2; continue; }
      if (src[i] === '\n') out += '\n';
      i += 1;
      continue;
    }
    // 文字列の中: 改行だけ残して行番号を保つ。エスケープは 1 文字飛ばす。
    if (src[i] === '\\') { i += 2; continue; }
    if ((mode === 'sq' && src[i] === "'") || (mode === 'dq' && src[i] === '"') || (mode === 'tpl' && src[i] === '`')) {
      mode = 'code';
    } else if (src[i] === '\n') {
      out += '\n';
    }
    i += 1;
  }
  return out;
}

/** `export const MAX_… = <数字>;` を台帳として集める。 */
function namedCeilings(): { name: string; value: number; module: string }[] {
  const out: { name: string; value: number; module: string }[] = [];
  const walk = (dir: string): void => {
    for (const e of readOriginalDirEntries(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const src = readOriginalSource(full);
      for (const m of src.matchAll(/export const (MAX_[A-Z0-9_]+)\s*(?::\s*number\s*)?=\s*([0-9_]+)\s*;/g)) {
        out.push({ name: m[1]!, value: Number(m[2]!.replace(/_/g, '')), module: path.relative(SRC, full) });
      }
    }
  };
  walk(path.join(SRC, 'shared'));
  return out;
}

/** `slice(0, <数字>)` を、コメント・文字列を落とした本文から拾う。 */
function literalSlices(src: string): { value: number; line: number }[] {
  const code = stripNonCode(src);
  const out: { value: number; line: number }[] = [];
  for (const m of code.matchAll(/\.slice\(\s*0\s*,\s*([0-9]+)\s*\)/g)) {
    out.push({ value: Number(m[1]!), line: code.slice(0, m.index).split('\n').length });
  }
  return out;
}

/** `<file>:<value>` → 偶然である理由。 */
const COINCIDENCE: Readonly<Record<string, string>> = {
  'renderer/pages/TeamRadarPage.tsx:32':
    'メンバー id の slug の長さ (名前から作る英数のキー)。MAX_EVALUATED_AT_CHARS と同じ数だが、評価日の天井とは無関係',
};

describe('天井の写し — 切る所も数える (パス 174)', () => {
  const ceilings = namedCeilings();
  const byValue = new Map<number, { name: string; module: string }[]>();
  for (const c of ceilings) {
    const list = byValue.get(c.value) ?? [];
    list.push({ name: c.name, module: c.module });
    byValue.set(c.value, list);
  }

  /** 走査対象: src 配下の実装 (検査は除く)。 */
  function sourceFiles(dir: string = SRC): string[] {
    const out: string[] = [];
    for (const e of readOriginalDirEntries(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') out.push(...sourceFiles(full)); continue; }
      if (/\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
  }

  const copies: { key: string; where: string; constants: string }[] = [];
  for (const file of sourceFiles()) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const src = readOriginalSource(file);
    for (const s of literalSlices(src)) {
      const named = byValue.get(s.value);
      if (named === undefined) continue;
      // そのファイルが台帳を知っているか (import しているか、台帳そのものか)。
      const known = named.filter(
        (c) =>
          new RegExp(`from '[^']*${c.module.replace(/^shared\//, '').replace(/\.ts$/, '')}'`).test(src)
          || c.module === rel,
      );
      if (known.length === 0) continue;
      copies.push({ key: `${rel}:${s.value}`, where: `${rel}:${s.line}`, constants: known.map((c) => c.name).join(' / ') });
    }
  }

  it('★ 走査が実物に当たる (台帳と literal の切る所が見つかる)', () => {
    expect(ceilings.length, '天井の定数が見つからない').toBeGreaterThanOrEqual(40);
    /*
     * **床は「写しの件数」ではなく「走査そのもの」に置く。** 写しは直せば 0 に
     * 近づくので、件数を床にすると直すたびに関門が壊れる (パス 172 で
     * 「数えた」と「効く」を分けたのと同じ話)。ここは literal の `slice(0, N)` が
     * 実装に何十件も在ることを見る —— 0 件なら走査かコメント落としが死んでいる。
     */
    const all = sourceFiles().reduce((n, f) => n + literalSlices(readOriginalSource(f)).length, 0);
    expect(all, 'literal の slice が 1 つも見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(20);
  });

  it('★ 天井の数を切る所へ写していない (偶然は理由つきの台帳のみ)', () => {
    const bad = copies.filter((c) => !(c.key in COINCIDENCE)).map((c) => `${c.where} == ${c.constants}`);
    expect(bad, '天井の数を写している — 定数を読むか、偶然なら理由を台帳に書く').toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (直った行が残っていない)', () => {
    const keys = new Set(copies.map((c) => c.key));
    expect(Object.keys(COINCIDENCE).filter((k) => !keys.has(k)), '台帳の古い行').toEqual([]);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const [k, why] of Object.entries(COINCIDENCE)) {
      expect(why.length, `${k}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 両ビルドが写していた 2 つの天井は、いま共有の定数を読む', () => {
    const pairs: readonly (readonly [string, string, string])[] = [
      ['MAX_LEADER_CANDIDATE_CHARS', 'main/clients/talent.ts', 'renderer/web-shim.ts'],
      ['MAX_ANALYSIS_EXCERPT_CHARS', 'main/clients/emotions.ts', 'renderer/data/emotionsWeb.ts'],
    ];
    for (const [name, a, b] of pairs) {
      expect(ceilings.map((c) => c.name), `${name} が台帳に無い`).toContain(name);
      for (const f of [a, b]) {
        expect(readOriginalSource(path.join(SRC, f)), `${f} が ${name} を読んでいない`).toContain(name);
      }
    }
  });

  it('★ 対照: コメントと文字列の中の数は数えない', () => {
    const sample = [
      '// watch.slice(0, 25) と書いてあった',
      '/* text.slice(0, 200) は昔の形 */',
      "const s = 'x.slice(0, 64)';",
      'const real = text.slice(0, 80);',
    ].join('\n');
    expect(literalSlices(sample).map((s) => s.value), 'コメント / 文字列の中を数えている').toEqual([80]);
    // 行番号が保たれている (コメントを落としても行がずれない)。
    expect(literalSlices(sample)[0]!.line).toBe(4);
  });

  it('★ 対照: 定数を読む形は写しと見ない', () => {
    expect(literalSlices('const v = text.slice(0, MAX_MEMBER_NOTE_CHARS);')).toEqual([]);
  });
});
