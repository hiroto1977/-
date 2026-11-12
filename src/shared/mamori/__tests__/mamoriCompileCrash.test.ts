import { describe, expect, it, vi } from 'vitest';
import { compileProject } from '../compile';

/*
 * **構文の段の想定外の失敗は、M0 の誤りに化けさせずに投げ直す** (2026-10-30 · パス 560 続き · threat: T-221)。
 *
 * `compileProject` は字句・構文の誤り (`MamoriError`) だけを M0 の診断として集める。それ以外の例外は
 * コンパイラ自身の故障なので、「元のプログラムに構文の誤りが在る」と言い換えてはいけない (利用者は
 * 自分の書いた物を直しに行き、故障は見えないまま残る)。
 */
vi.mock('../parser', async (orig) => {
  const real = await orig<typeof import('../parser')>();
  return {
    ...real,
    parse: (file: string, source: string) => {
      if (source.includes('CRASH')) throw new TypeError('構文木の組み立てで想定外の故障');
      return real.parse(file, source);
    },
  };
});

describe('compileProject は構文の段の故障を投げ直す', () => {
  it('★ MamoriError でない例外は診断にせず投げる', () => {
    expect(() => compileProject([{ path: 'src/x/m0.mamori', source: '// CRASH\n' }])).toThrow(new TypeError('構文木の組み立てで想定外の故障'));
  });

  it('対照: 構文の誤り (MamoriError) は M0 として集める', () => {
    const r = compileProject([{ path: 'src/x/m0.mamori', source: 'export fn f( -> void {}\n' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics.map((d) => d.rule)).toEqual(['M0']);
  });
});
