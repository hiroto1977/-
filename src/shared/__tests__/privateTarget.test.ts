/**
 * privateTarget — 「内側を向いた送り先か」の判定が **1 つ**であることの検査。
 *
 * 判定の中身 (loopback / RFC 1918 / link-local / 内部 TLD / v6 の変換形 …) は
 * `renderer/security/__tests__/proxy.test.ts` (56 件超) と
 * `renderer/network/__tests__/proxyWorkerParity.test.ts` (Worker / CI との
 * 突き合わせ) が既に持っており、ここでは**書き直さない**。
 *
 * ここが留めるのは 2026-09-17 (パス 300) の移動そのもの:
 *
 *   1. `proxy.ts` が export する物は shared の**同じ関数オブジェクト**である
 *      (写しではない)。写しになった瞬間、`proxyWorkerParity` が数える
 *      三つ子は四つ子になり、しかも 4 人目は誰とも突き合わされない。
 *   2. `proxy.ts` の原文に遮断表 (関数本体・内部 TLD の一覧・helper) が
 *      **残っていない**。残っていれば「shared を直しても proxy は古い表のまま」
 *      になりうる —— 不在の主張なので、同じ針が shared 側の原文には当たることを
 *      標本として並べる。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { isPrivateOrReservedTarget as fromShared } from '../privateTarget';
import { isPrivateOrReservedTarget as fromProxy } from '../../renderer/network/proxy';
import { readOriginalSource } from './originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const { stripComments } = createRequire(__filename)(
  path.join(REPO_ROOT, 'scripts/shared-judgement-census.cjs'),
) as { stripComments: (s: string) => string };

const SHARED = stripComments(readOriginalSource(path.join(REPO_ROOT, 'src/shared/privateTarget.ts')));
const PROXY = stripComments(readOriginalSource(path.join(REPO_ROOT, 'src/renderer/network/proxy.ts')));

describe('privateTarget — 判定は 1 つ (パス 300)', () => {
  it('★ proxy.ts が export する物は shared と同じ関数オブジェクト (写しではない)', () => {
    expect(fromProxy).toBe(fromShared);
  });

  /** 遮断表を構成する綴り。shared に**在り**、proxy に**無い**。 */
  const TABLE_MARKS: [string, RegExp][] = [
    ['関数本体', /function isPrivateOrReservedTarget\(/],
    ['内部 TLD の一覧', /\bINTERNAL_TLDS\b/],
    ['loopback 名の一覧', /\bLOOPBACK_NAMES\b/],
    ['v4-mapped v6 の展開', /function extractMappedV4\(/],
    ['NAT64 / 6to4 の展開', /function extractEmbeddedV4FromTransitionPrefix\(/],
  ];

  it.each(TABLE_MARKS)('★ %s は shared の原文に在る (針の標本)', (_label, re) => {
    expect(SHARED).toMatch(re);
  });

  it.each(TABLE_MARKS)('★ %s は proxy.ts の原文に残っていない', (_label, re) => {
    expect(PROXY).not.toMatch(re);
  });

  it('★ proxy.ts は shared から読んでいる (肯定形)', () => {
    expect(PROXY).toMatch(/from '\.\.\/\.\.\/shared\/privateTarget'/);
  });

  it('移動で中身が変わっていない — 代表的な標本で両側が同じ答え', () => {
    for (const [url, inward] of [
      ['http://127.0.0.1/', true],
      ['http://169.254.169.254/', true],
      ['http://printer.local/', true],
      ['http://[::ffff:7f00:1]/', true],
      ['https://api.github.com/', false],
      ['https://avatars.githubusercontent.com/u/1', false],
    ] as const) {
      expect(fromShared(new URL(url)), url).toBe(inward);
      expect(fromProxy(new URL(url)), url).toBe(inward);
    }
  });
});
