import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/**
 * 梱包物に焼き込まれた fuse は、署名して公開する前に梱包物そのものから読んで照合する (2026-10-28 · threat: T-209)。
 * それまで release.yml の build は `--check-bundle` と `verify-release-artifacts` しか通さず、fuse を読んでいたのは
 * 手動・ラベル実行の `smoke:packaged` だけだった。手元の linux-unpacked で `RunAsNode` を on に書き換えても、
 * 設定 JSON を読む検査は緑のままである (焼き込まれた値は梱包物にしか無い)。
 */
const ROOT = path.join(__dirname, '../../..');
const req = createRequire(import.meta.url);
const gate = req('../../../scripts/verify-packaged-fuses.cjs') as {
  locatePackagedApps: (dir: string, o: { platform: string; productName: string; packageName: string }) => string[];
  verifyFuses: (apps: string[], cfg: Record<string, boolean>, read: (app: string) => string | null) => string[];
};
const builder = JSON.parse(readOriginalSource(path.join(ROOT, 'electron-builder.json'))) as { productName: string; electronFuses: Record<string, boolean> };
const pkg = JSON.parse(readOriginalSource(path.join(ROOT, 'package.json'))) as { name: string };
const yml = readOriginalSource(path.join(ROOT, '.github/workflows/release.yml'));
const code = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/** 焼き込まれた値を、設定どおりの形で `@electron/fuses read` の出力に組む。 */
const reportOf = (fuses: Record<string, boolean>): string =>
  Object.entries(fuses).map(([k, v]) => `  ${k[0]!.toUpperCase()}${k.slice(1)} is ${v ? 'Enabled' : 'Disabled'}`).join('\n');

describe('release.yml — 梱包物の fuse を公開前に照合する (threat: T-209)', () => {
  it('★ release.yml の build は、署名して公開する前に梱包物の fuse を electron-builder.json と照合する (threat: T-209)', () => {
    const buildAt = code.indexOf('npm run build -- --publish never');
    const fuseAt = code.indexOf('npm run verify:packaged-fuses');
    const publishAt = code.indexOf('uses: softprops/action-gh-release');
    expect(buildAt).toBeGreaterThan(-1);
    expect(fuseAt, 'fuse を照合する step が無い').toBeGreaterThan(buildAt);
    expect(publishAt).toBeGreaterThan(fuseAt);
  });

  it('★ 梱包した app が 1 つも無ければ落ちる (読む物が無かったことを「食い違いが無かった」と混ぜない)', () => {
    expect(gate.verifyFuses([], builder.electronFuses, () => reportOf(builder.electronFuses))).toHaveLength(1);
  });

  it('★ 焼き込みが設定と食い違えば app 名つきで落ち、一致すれば通る', () => {
    const ok = gate.verifyFuses(['/x/app'], builder.electronFuses, () => reportOf(builder.electronFuses));
    expect(ok).toEqual([]);
    const flipped = { ...builder.electronFuses, runAsNode: !builder.electronFuses.runAsNode };
    const bad = gate.verifyFuses(['/x/app'], builder.electronFuses, () => reportOf(flipped));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatch(/^\/x\/app: RunAsNode/);
    expect(gate.verifyFuses(['/x/app'], builder.electronFuses, () => null)).toHaveLength(1);
  });

  it('3 OS の unpacked の置き場所を、実物の productName / package name で見つける', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pfg-'));
    try {
      const put = (...p: string[]) => {
        mkdirSync(path.join(tmp, ...p.slice(0, -1)), { recursive: true });
        writeFileSync(path.join(tmp, ...p), '');
      };
      put('linux-unpacked', pkg.name);
      put('win-unpacked', `${builder.productName}.exe`);
      put('mac', `${builder.productName}.app`, 'Contents', 'Info.plist');
      put('mac-arm64', `${builder.productName}.app`, 'Contents', 'Info.plist');
      const names = { productName: builder.productName, packageName: pkg.name };
      expect(gate.locatePackagedApps(tmp, { platform: 'linux', ...names })).toHaveLength(1);
      expect(gate.locatePackagedApps(tmp, { platform: 'win32', ...names })).toHaveLength(1);
      expect(gate.locatePackagedApps(tmp, { platform: 'darwin', ...names })).toHaveLength(2);
      // 対照: 名前が違えば拾わない (別の binary を fuse の読み取りに回さない)。
      expect(gate.locatePackagedApps(tmp, { platform: 'linux', productName: 'X', packageName: 'nope' })).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('crown-jewels の detect 層は、この門を名指しする', () => {
    const jewels = JSON.parse(readOriginalSource(path.join(ROOT, 'security/crown-jewels.json'))) as { jewels: { id: string; layers: { kind: string; enforcedBy: string[] }[] }[] };
    const j = jewels.jewels.find((x) => x.id === 'main-process-execution')!;
    const detect = j.layers.find((l) => l.kind === 'detect')!;
    expect(detect.enforcedBy).toContain('scripts/verify-packaged-fuses.cjs');
  });
});
