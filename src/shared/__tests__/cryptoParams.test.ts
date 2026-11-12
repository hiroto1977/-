import { describe, expect, it } from 'vitest';
import {
  AES_GCM_IV_BYTES,
  MIN_SALT_BYTES,
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  kdfLabel,
} from '../cryptoParams';
import { BACKUP_CIPHER_ALGO, BACKUP_IV_LENGTH, BACKUP_KEY_DERIVATION } from '../../renderer/data/cloudBackup';

describe('暗号パラメータの値', () => {
  it('IV は GCM 標準の 96 ビット', () => {
    expect(AES_GCM_IV_BYTES).toBe(12);
  });

  it('PBKDF2 は SHA-256 で 60 万回以上', () => {
    expect(PBKDF2_HASH).toBe('SHA-256');
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it('ソルト長の下限は 128 ビット以上', () => {
    expect(MIN_SALT_BYTES).toBeGreaterThanOrEqual(16);
  });
});

describe('kdfLabel', () => {
  // 既存のバックアップに書かれている表記。ここを変えると過去の暗号メタと
  // 突き合わせられなくなるので、現在値での出力を固定する。
  it('現在の設定では従来どおりの表記になる', () => {
    expect(kdfLabel()).toBe('PBKDF2-SHA-256-600k');
  });

  it('反復回数を上げれば表示も一緒に動く（焼き込まない）', () => {
    expect(kdfLabel(1_000_000)).toBe('PBKDF2-SHA-256-1000k');
    expect(kdfLabel(1_200_000)).toBe('PBKDF2-SHA-256-1200k');
  });

  it('1000 の倍数でなければ生の数値で出す', () => {
    expect(kdfLabel(600_001)).toBe('PBKDF2-SHA-256-600001');
    expect(kdfLabel(1)).toBe('PBKDF2-SHA-256-1');
  });

  it('ハッシュを変えれば表示も変わる', () => {
    expect(kdfLabel(600_000, 'SHA-512')).toBe('PBKDF2-SHA-512-600k');
  });

  it('0 は 0k として扱う（境界）', () => {
    expect(kdfLabel(0)).toBe('PBKDF2-SHA-256-0k');
  });
});

// 「同じ 1 つの決定」が 3 モジュールに写経されていたのを共有化した。
// 写経へ戻すとこのテストが落ちる。
describe('バックアップの暗号メタが実装と一致していること', () => {
  it('IV 長は共有の値と同じ', () => {
    expect(BACKUP_IV_LENGTH).toBe(AES_GCM_IV_BYTES);
  });

  it('鍵導出の識別子は実際の反復回数から組み立てられている', () => {
    expect(BACKUP_KEY_DERIVATION).toBe(kdfLabel(PBKDF2_ITERATIONS, PBKDF2_HASH));
  });

  it('暗号方式は AES-GCM', () => {
    expect(BACKUP_CIPHER_ALGO).toBe('AES-GCM');
  });
});
