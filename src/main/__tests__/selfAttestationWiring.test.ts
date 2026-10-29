/**
 * **自己検算が起動の道に配線されていること**を原文で留める (2026-10-29 · パス 553 · T-218)。
 * 関数が在ることと、窓を作る前に呼ばれることは別 (法則 `mention-vs-declaration`)。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../../shared/__tests__/stripNonCode';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string): string => readOriginalSource(path.join(REPO, rel));

describe('起動時の自己検算の配線', () => {
  const main = stripComments(read('src/main/main.ts'));

  it('★ main は whenReady の中で、配色を読む前・窓を作る前に検算する (梱包版だけ)', () => {
    const start = main.indexOf('app.whenReady().then(async () => {');
    expect(start).toBeGreaterThan(0);
    const body = main.slice(start);
    const attest = body.indexOf('verifyShippedFiles(path.join(__dirname');
    const prefs = body.indexOf('await readWindowPrefs()');
    const window = body.indexOf('createWindow()');
    expect(attest).toBeGreaterThan(0);
    expect(attest).toBeLessThan(prefs);
    expect(prefs).toBeLessThan(window);
    // 梱包版だけ (開発中は dist が変わるたびに表が古びる)
    expect(body.slice(0, attest)).toContain('if (app.isPackaged) {');
  });

  it('★ 通らなければ理由を stderr に刷り、ダイアログを出して app.exit(1) で止まる (窓は作らない)', () => {
    const start = main.indexOf('verifyShippedFiles(path.join(__dirname');
    const block = main.slice(start, main.indexOf('createWindow()', start));
    expect(block).toContain('if (!verdict.ok) {');
    expect(block).toContain("console.error(`[self-attestation] ${verdict.reason}: ${verdict.detail}`)");
    expect(block).toContain('dialog.showErrorBox(');
    expect(block).toContain('attestationMessage(verdict)');
    expect(block).toContain('app.exit(1);');
    expect(block).toContain('return;');
  });

  it('npm run build は vite build の後・electron-builder の前に表を書く', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const build = pkg.scripts.build ?? '';
    const vite = build.indexOf('vite build');
    const manifest = build.indexOf('node scripts/build-integrity-manifest.cjs');
    const packer = build.indexOf('electron-builder');
    expect(manifest).toBeGreaterThan(vite);
    expect(manifest).toBeLessThan(packer);
  });

  it('smoke:packaged も梱包の前に表を書き、改竄した asar が起動を断ることを見る', () => {
    const smoke = read('scripts/smoke-packaged.cjs');
    const manifest = smoke.indexOf("'build-integrity-manifest.cjs'");
    const packer = smoke.indexOf("'node_modules/electron-builder/cli.js'");
    expect(manifest).toBeGreaterThan(0);
    expect(manifest).toBeLessThan(packer);
    expect(smoke).toContain('[self-attestation] hash-mismatch');
  });

  /**
   * fuse `enableEmbeddedAsarIntegrityValidation` は**意図して未設定のまま** (T-166 の判断: electron-builder は
   * mac / win だけ asar のハッシュを実行ファイルへ埋め、署名と対で効く。この環境では効きも壊れ方も測れない ——
   * 実測 (2026-10-29) で Linux では true にしても何も照合しなかった)。だから Linux の検算は `selfAttestation.ts`
   * だけが持ち、ここで留めるのは「app.asar の外のコードを読まない」側 (onlyLoadAppFromAsar · T-166) である。
   */
  it('出荷設定の fuse は onlyLoadAppFromAsar を持ち、asar integrity の fuse は T-166 の判断どおり未設定', () => {
    const cfg = JSON.parse(read('electron-builder.json')) as { electronFuses: Record<string, boolean> };
    expect(cfg.electronFuses.onlyLoadAppFromAsar).toBe(true);
    expect(cfg.electronFuses).not.toHaveProperty('enableEmbeddedAsarIntegrityValidation');
  });

  it('梱包版の主プロセスは node_modules を 1 つも require しない (検算の範囲の外に走る物が無い)', () => {
    const bundle = read('dist-electron/main.js');
    const requires = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(requires.length).toBeGreaterThan(0);
    for (const r of requires) expect(r === 'electron' || r.startsWith('node:'), r).toBe(true);
  });
});
