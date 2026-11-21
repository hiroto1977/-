/**
 * **資格情報を読む LOCAL サービスの集合は、`ctx.token` の読み手と一致する** (threat: T-118)
 *
 * 主プロセスの入口は、`TOKEN_CONSUMING_LOCAL` に居ない LOCAL サービスでは保管ファイルを読まない
 * (読めない保管ファイルが資格情報を要らない機能まで止めないため)。集合が実物の読み手より小さいと、
 * 読むサービスに空の token が黙って渡る。大きいと、巻き込みが残る。両方向で留める。
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { LOCAL_SERVICES, TOKEN_CONSUMING_LOCAL, readsSavedToken } from '../index';
import { SERVICE_IDS } from '../../../shared/serviceId';
import { stripComments } from '../../../shared/__tests__/stripNonCode';
import { readOriginalSource } from '../../../shared/__tests__/originalSource';

const dir = resolve(__dirname, '..');
const readsToken = (id: string): boolean => {
  const f = resolve(dir, `${id}.ts`);
  return existsSync(f) && /\bctx\.token\b/.test(stripComments(readOriginalSource(f)));
};

describe('資格情報を読む LOCAL サービス (threat: T-118)', () => {
  const readers = [...LOCAL_SERVICES].filter(readsToken).sort();

  it('集合は LOCAL_SERVICES の部分集合で、実物の ctx.token の読み手と一致する (両方向)', () => {
    expect([...TOKEN_CONSUMING_LOCAL].every((id) => LOCAL_SERVICES.has(id))).toBe(true);
    expect([...TOKEN_CONSUMING_LOCAL].sort()).toEqual(readers);
  });

  it('床: 読み手は 7 件 (走査が空にならない)', () => {
    expect(readers.length).toBeGreaterThanOrEqual(7);
  });

  it('読む判定: LOCAL でないサービスと読む 7 件は true、読まない LOCAL は false', () => {
    for (const id of SERVICE_IDS) {
      const expected = !LOCAL_SERVICES.has(id) || TOKEN_CONSUMING_LOCAL.has(id);
      expect(readsSavedToken(id), id).toBe(expected);
    }
    expect(readsSavedToken('kpi')).toBe(false);
    expect(readsSavedToken('skills')).toBe(true);
    expect(readsSavedToken('github')).toBe(true);
  });

  it('標本: 注記の中の ctx.token は読み手に数えない (針が的に当たる)', () => {
    expect(/\bctx\.token\b/.test(stripComments('// ctx.token は Shopify のもの\n'))).toBe(false);
    expect(/\bctx\.token\b/.test(stripComments('const t = ctx.token;\n'))).toBe(true);
  });
});
