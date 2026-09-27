/**
 * 取り込むファイルは**読む前に**大きさで断る (`data/importFile.ts`)。
 *
 * 「読んでから切る」では意味が無い —— 落ちるのは読む瞬間である。だから検査は
 * 「断ったときに `text()` が呼ばれていない」まで見る。
 */
import { describe, expect, it, vi } from 'vitest';
import { MAX_BACKUP_IMPORT_BYTES, MAX_CSV_IMPORT_BYTES, importSizeError, readImportText } from '../importFile';

const MiB = 1024 * 1024;
const source = (size: number, body = 'date,channel,amount\n') => ({ size, text: vi.fn(async () => body) });

describe('readImportText — 上限は読む前に効く', () => {
  it('上限ちょうどは読んで本文を返す (境界)', async () => {
    const f = source(MAX_CSV_IMPORT_BYTES);
    await expect(readImportText(f, MAX_CSV_IMPORT_BYTES, 'CSV ファイル')).resolves.toBe('date,channel,amount\n');
    expect(f.text).toHaveBeenCalledTimes(1);
  });

  it('★ 上限 +1 バイトは断り、本文を**読まない** (境界)', async () => {
    const f = source(MAX_CSV_IMPORT_BYTES + 1);
    await expect(readImportText(f, MAX_CSV_IMPORT_BYTES, 'CSV ファイル')).rejects.toThrow(/CSV ファイルが大きすぎます/);
    expect(f.text).not.toHaveBeenCalled();
  });

  it('文面は何が・どれだけ・上限いくつ、を言う (標本)', () => {
    expect(importSizeError(21 * MiB, 20 * MiB, 'CSV ファイル')).toBe('CSV ファイルが大きすぎます (21.0 MB。上限 20.0 MB)');
    expect(importSizeError(300 * MiB + 512 * 1024, 256 * MiB, 'バックアップファイル')).toBe(
      'バックアップファイルが大きすぎます (300.5 MB。上限 256.0 MB)',
    );
    expect(importSizeError(20 * MiB, 20 * MiB, 'CSV ファイル')).toBeNull();
    expect(importSizeError(0, 20 * MiB, 'CSV ファイル')).toBeNull();
  });

  it('出荷している上限 (安全上限 — 台帳には載せない)', () => {
    expect(MAX_CSV_IMPORT_BYTES).toBe(20 * MiB);
    expect(MAX_BACKUP_IMPORT_BYTES).toBe(256 * MiB);
  });
});
