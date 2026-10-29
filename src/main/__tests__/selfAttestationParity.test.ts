/**
 * **検算表の書き手 (`scripts/build-integrity-manifest.cjs`) と読み手 (`src/main/selfAttestation.ts`) は
 * 同じ算法を 2 か所に持つ。同じ標本で 1 字も違わないこと。** (2026-10-29 · パス 553 · T-218)
 *
 * `.cjs` は `.ts` を require できないので写しは避けられない (法則 `copy-pinned-by-parity`)。
 * 割れたら、ビルドが書いた表を梱包版が「形が違う」と読んで**正しい出荷物が起動しなくなる**か、
 * 逆に書き手が歩かない場所を読み手も歩かず**改竄が映らない**か、のどちらかである。
 */
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildManifest, listShippedFiles, MANIFEST_FILE, serializeManifest, verifyShippedFiles } from '../selfAttestation';

const require = createRequire(import.meta.url);
const cjs = require('../../../scripts/build-integrity-manifest.cjs') as {
  MANIFEST_FILE: string;
  listShippedFiles(root: string): string[];
  buildManifest(root: string): { files: Record<string, string>; root: string };
  serializeManifest(m: unknown): string;
  writeManifest(root: string): number;
};
// `.cjs` の陰性対照 (`--self-test` の 8 件) はここから走らせる —— npm script の `smoke*` に置くと
// 鮮度検査の母集団に入り (`artifactFreshness.test.ts`)、検算表の書き手は成果物を相手にする道具ではない。
const { selfTest } = require('../../../scripts/build-integrity-manifest.cjs') as { selfTest: () => number };

let root = '';
beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'self-attestation-parity-'));
  await fsp.mkdir(path.join(root, 'dist', 'assets', 'deep'), { recursive: true });
  await fsp.mkdir(path.join(root, 'dist-electron'), { recursive: true });
  await fsp.mkdir(path.join(root, 'build'), { recursive: true });
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'dist', 'index.html'), '<html>日本語</html>');
  await fsp.writeFile(path.join(root, 'dist', 'assets', 'deep', 'z.css'), 'a{}');
  await fsp.writeFile(path.join(root, 'dist', 'assets', 'index-abc.js'), 'console.log(1)');
  await fsp.writeFile(path.join(root, 'dist-electron', 'main.js'), 'main');
  await fsp.writeFile(path.join(root, 'package.json'), '{"name":"x"}');
  await fsp.writeFile(path.join(root, 'build', 'icon.png'), Buffer.from([0, 1, 2]));
  await fsp.writeFile(path.join(root, 'src', 'not-shipped.ts'), 'x');
});
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('書き手 (.cjs) と読み手 (.ts) のパリティ', () => {
  it('表の置き場は同じ 1 つ', () => {
    expect(cjs.MANIFEST_FILE).toBe(MANIFEST_FILE);
  });

  it('.cjs の自己検査 8 件が全部通る (陰性対照はここから走る)', () => {
    expect(selfTest()).toBe(0);
  });

  it('同じ木を歩いて同じ一覧 (根の外の src は入らない・manifest 自身は入らない)', async () => {
    cjs.writeManifest(root);
    expect(cjs.listShippedFiles(root)).toEqual(await listShippedFiles(root, fsp));
    expect(cjs.listShippedFiles(root)).not.toContain('src/not-shipped.ts');
    expect(cjs.listShippedFiles(root)).not.toContain(MANIFEST_FILE);
  });

  it('★ 同じ木から組んだ表は 1 字も違わない', async () => {
    const fromTs = serializeManifest(await buildManifest(root, fsp));
    expect(cjs.serializeManifest(cjs.buildManifest(root))).toBe(fromTs);
  });

  it('★ .cjs が書いた表を .ts の検算が通す (容器の根は出荷物だけ)', async () => {
    await fsp.rm(path.join(root, 'src'), { recursive: true });
    cjs.writeManifest(root);
    expect(await verifyShippedFiles(root, fsp)).toMatchObject({ ok: true, checked: 5 });
  });

  it('.cjs が書いた表の下で 1 ファイルを変えると .ts の検算が鳴る', async () => {
    await fsp.rm(path.join(root, 'src'), { recursive: true });
    cjs.writeManifest(root);
    await fsp.writeFile(path.join(root, 'dist', 'assets', 'deep', 'z.css'), 'b{}');
    expect(await verifyShippedFiles(root, fsp)).toEqual({ ok: false, reason: 'hash-mismatch', detail: 'dist/assets/deep/z.css' });
  });
});
