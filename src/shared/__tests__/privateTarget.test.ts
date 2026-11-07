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
import { safeRemoteImageSrc } from '../imageUrlGate';
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

/**
 * **RFC 2765 (SIIT) の変換形 `::ffff:0:a.b.c.d` を内側と判定する** (threat: T-030 · パス 518)。
 *
 * URL は `[::ffff:0:127.0.0.1]` を `[::ffff:0:7f00:1]` へ正規化して残す。二組の
 * IPv4-mapped の綴りだけを見ていた判定はこの形を外側と判定し、ループバックと
 * クラウドのメタデータ (169.254.169.254) へ届く道を通していた (実測 2026-10-14)。
 */
describe('privateTarget — SIIT の変換形は内側 (threat: T-030)', () => {
  it.each([
    ['http://[::ffff:0:127.0.0.1]/', 'loopback'],
    ['http://[::ffff:0:7f00:1]/', 'loopback (正規化後)'],
    ['http://[::ffff:0:169.254.169.254]/', 'IMDS'],
    ['http://[::ffff:0:a9fe:a9fe]/', 'IMDS (正規化後)'],
    ['http://[::ffff:0:10.0.0.5]/', 'RFC 1918'],
  ])('★ %s (%s) は遮断する (threat: T-030)', (url) => {
    expect(fromShared(new URL(url)), url).toBe(true);
    expect(fromProxy(new URL(url)), url).toBe(true);
  });

  it('★ 対照: 公開の SIIT 形は通す (遮断が広すぎない)', () => {
    expect(fromShared(new URL('http://[::ffff:0:8.8.8.8]/')), '8.8.8.8').toBe(false);
  });
});

/**
 * **ラベルが 1 つだけの名前は、内部 TLD に載っていなくても内側** (threat: T-033 · パス 519)。
 *
 * 2026-10-14 まで遮断していたのは `INTERNAL_TLDS` の 7 語だけで、`printer` / `nas` /
 * `router` は公開と判定されていた。生きた消費者は `safeRemoteImageSrc` —— 第三者 API の
 * 応答 (`avatar_url` / `thumbnail`) が `http://printer/` を指すと、利用者のブラウザが
 * LAN の名前へ GET を飛ばし、load / error で在否が漏れる (パス 300 が閉じたつもりの経路)。
 * BYO プロキシの側は Worker の完全一致の許可リストが先に断るので今日は届かない。
 */
describe('privateTarget — 単一ラベルの名前は内側 (threat: T-033)', () => {
  it.each([
    ['http://printer/', 'LAN のプリンタ'],
    ['http://nas/', 'LAN の NAS'],
    ['http://router/', '家庭用ルータ'],
    ['http://example/', '内部 TLD に無い単一ラベル'],
    ['http://xn--wgv71a119e/', 'IDN の単一ラベル'],
  ])('★ %s (%s) は 2 つの入口とも遮断する (threat: T-033)', (url) => {
    expect(fromShared(new URL(url)), url).toBe(true);
    expect(fromProxy(new URL(url)), url).toBe(true);
  });

  it('★ 生きた消費者: 第三者の画像 URL が単一ラベルを指せば取りに行かない (threat: T-033)', () => {
    expect(safeRemoteImageSrc('http://printer/avatar.png')).toBeUndefined();
    // 対照: 公開のホストはそのまま通る (関門が画像を全部落としているのではない)
    expect(safeRemoteImageSrc('https://cdn.example.com/avatar.png')).toBe('https://cdn.example.com/avatar.png');
  });

  it('★ 対照: 2 ラベル以上の公開名と公開の IPv6 リテラルは過遮断しない', () => {
    for (const url of ['https://example.com/', 'https://api.github.com/', 'http://[2606:4700::1111]/', 'http://1.0.0.1/']) {
      expect(fromShared(new URL(url)), url).toBe(false);
    }
  });
});
