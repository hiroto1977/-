/**
 * safeStorage の同期 API (`isEncryptionAvailable` / `encryptString` / `decryptString`) は
 * Electron 45 で非推奨・46 で削除される。製品コードは非同期版
 * (`isAsyncEncryptionAvailable` / `encryptStringAsync` / `decryptStringAsync`) だけを呼ぶ。
 * 同期版へ戻ると、Electron 45 への更新が静かに壊れる (削除後は TypeError) ので、
 * 製品コードに同期版の呼び出しが 0 件であることを留める。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../../shared/__tests__/stripNonCode';

const ROOT = join(__dirname, '..'); // src/main (renderer の encryptString は自前の WebCrypto 関数で別物)
const SYNC_CALL = /\b(?:isEncryptionAvailable|encryptString|decryptString)\s*\(/;

function productFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === '__audits__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) productFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

describe('safeStorage は非同期 API だけを呼ぶ (Electron 45 で同期版が非推奨)', () => {
  const files = productFiles(ROOT);

  it('走査が空虚でない (製品コードを読んでいる)', () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith('keychainBackend.ts'))).toBe(true);
  });

  it('★ 製品コードに同期版 (isEncryptionAvailable / encryptString / decryptString) の呼び出しが 0 件', () => {
    const hits = files.filter((f) => SYNC_CALL.test(stripComments(readFileSync(f, 'utf8'))));
    expect(hits).toEqual([]);
  });

  it('針は同期版に当たり、非同期版と注記には当たらない (標本)', () => {
    expect(SYNC_CALL.test('safeStorage.encryptString(x)')).toBe(true);
    expect(SYNC_CALL.test('safeStorage.isEncryptionAvailable()')).toBe(true);
    expect(SYNC_CALL.test('safeStorage.decryptString (b)')).toBe(true);
    expect(SYNC_CALL.test('await safeStorage.encryptStringAsync(x)')).toBe(false);
    expect(SYNC_CALL.test('await safeStorage.isAsyncEncryptionAvailable()')).toBe(false);
    expect(SYNC_CALL.test(stripComments('// safeStorage.encryptString(x) の写し\nconst a = 1;'))).toBe(false);
  });
});
