import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * セキュリティ回帰テスト — レンダラ向けブリッジの表面 (attack surface) を固定する。
 *
 * 実機相当のブラウザモード稼働実験 (Electron で standalone.html を駆動) で確認した
 * セキュリティ不変条件をユニットテストに落とし込み、再発を防ぐ:
 *   - レンダラ (`window.serviceHub`) は生トークンを読み戻せない (getToken を露出しない)。
 *     トークンは setToken で封緘し、利用は main / web-shim 内部に限定する。
 *   - 書込み系 (setToken/clearToken) と一覧 (listConfigured) のみ公開。
 *
 * これはソースレベルの構造検査 (実行時の WebCrypto 動作は vault.test.ts /
 * dataCrypto*.test.ts が担保)。ブリッジ表面が将来うっかり広がるのを検知する。
 */

const ROOT = resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('security: renderer bridge surface', () => {
  it('the browser shim exposes setToken / clearToken / listConfigured', () => {
    const shim = read('src/renderer/web-shim.ts');
    expect(shim).toMatch(/setToken:/);
    expect(shim).toMatch(/clearToken:/);
    expect(shim).toMatch(/listConfigured:/);
  });

  it('the browser shim does NOT expose getToken (renderer cannot read raw secrets)', () => {
    const shim = read('src/renderer/web-shim.ts');
    // No property named getToken on the shim object surface.
    expect(shim).not.toMatch(/^\s*getToken\s*:/m);
  });

  it('the typed bridge contract derives from the preload (single source of truth)', () => {
    // bridge.d.ts intentionally has no inline method list — it re-exports the
    // preload-inferred ServiceHubBridge type, so the preload IS the contract.
    const bridge = read('src/shared/bridge.d.ts');
    expect(bridge).toMatch(/ServiceHubBridge/);
    expect(bridge).toMatch(/preload\/preload/);
  });

  it('the Electron preload bridge also withholds getToken from the renderer', () => {
    const preload = read('src/preload/preload.ts');
    expect(preload).not.toMatch(/^\s*getToken\s*:/m);
    expect(preload).toMatch(/setToken/);
  });
});
