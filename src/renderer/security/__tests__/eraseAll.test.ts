/** @vitest-environment jsdom */
/**
 * **「すべてのデータを削除」は、保管庫だけでは「すべて」ではない。** (2026-09-09 · パス 136)
 *
 * 設定画面のハードリセットは `vault.wipeAndReset()` (IndexedDB `business-hub-vault` の削除) だけで、
 * 業務レコード (`business-hub-data`・平文)・ライブラリ・プロキシ設定 (共有秘密)・localStorage の
 * 気分の記録や会話履歴・sessionStorage の code_verifier・Cache Storage は残っていた。実行後は
 * 「最初のセットアップ画面」なので、**次に使う人が前の人の記録を見る**。
 *
 * ここは実物の媒体 (fake-indexeddb + jsdom の Web Storage) で「全部消える」を測り、
 * 消えなかった時 (他のタブが掴む / ブラウザが拒む / removeItem が黙って何もしない) に
 * **消えたと言わない**ことを留める。在庫は台帳 (`lint-storage-ledger.cjs` の `STORES`) と
 * 両方向で突き合わせる —— 規則 11 の双子 (規則は字面を読み、ここは実物の配列を読む)。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  ERASE_CACHE_STORAGE,
  ERASE_INDEXEDDB,
  ERASE_LOCAL_STORAGE_KEYS,
  ERASE_SESSION_STORAGE_KEYS,
  describeEraseReport,
  eraseEverything,
  eraseScopeSummary,
} from '../eraseAll';
import { _resetVaultForTests } from '../vault';
import { deleteRecordDatabase } from '../../data/store';
import { deletePreferencesDatabase } from '../../fs/fsa';
import { deleteLibraryDatabase } from '../../library/library';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function createDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('probe');
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? '');
}

/** 接続を掴んだまま返す (versionchange で閉じない = 他のタブが使用中)。 */
function holdOpen(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        /* 閉じない */
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

const NO_CACHES = (): undefined => undefined;

beforeEach(async () => {
  _resetVaultForTests();
  localStorage.clear();
  sessionStorage.clear();
  for (const name of ERASE_INDEXEDDB) await createDatabase(name);
  for (const key of ERASE_LOCAL_STORAGE_KEYS) localStorage.setItem(key, 'x');
  localStorage.setItem('other-app.keep', '1');
  for (const key of ERASE_SESSION_STORAGE_KEYS) sessionStorage.setItem(key, 'x');
});

describe('ハードリセットは在庫の全媒体を消す (eraseEverything)', () => {
  it('★ 実物の媒体: IndexedDB 4 つ・localStorage・sessionStorage・Cache Storage が消え、隣人の鍵は残る', async () => {
    const deleted: string[] = [];
    const report = await eraseEverything({
      caches: () => ({
        delete: async (name: string): Promise<boolean> => {
          deleted.push(name);
          return true;
        },
      }),
    });
    expect(report.allDeleted).toBe(true);
    expect(describeEraseReport(report)).toBeNull();
    const names = await databaseNames();
    for (const name of ERASE_INDEXEDDB) expect(names, `${name} が残っている`).not.toContain(name);
    for (const key of ERASE_LOCAL_STORAGE_KEYS) expect(localStorage.getItem(key), key).toBeNull();
    for (const key of ERASE_SESSION_STORAGE_KEYS) expect(sessionStorage.getItem(key), key).toBeNull();
    // ★ 隣人 (別のアプリ) の鍵は消さない —— file:// は生成元を共有しうる。
    expect(localStorage.getItem('other-app.keep')).toBe('1');
    expect(deleted).toEqual([...ERASE_CACHE_STORAGE]);
  });

  for (const held of ['business-hub-data', 'business-hub-library', 'business-hub-preferences'] as const) {
    it(`★ 他のタブが ${held} を掴んでいたら blocked —— 他は消え、全体は「消えた」と言わない`, async () => {
      const holder = await holdOpen(held);
      try {
        const report = await eraseEverything({ caches: NO_CACHES });
        expect(report.indexeddb[held]).toBe('blocked');
        for (const name of ERASE_INDEXEDDB) if (name !== held) expect(report.indexeddb[name], name).toBe('deleted');
        expect(report.allDeleted).toBe(false);
        const text = describeEraseReport(report) ?? '';
        expect(text).toContain('(他のタブが使用中)');
        expect(text).toContain('他のタブをすべて閉じて');
        expect(text).toContain('データは残っています');
        expect(text).not.toContain('ブラウザに拒否されました');
      } finally {
        holder.close();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    });
  }

  it('★ 残った物は名指しされる (業務レコード)', async () => {
    const holder = await holdOpen('business-hub-data');
    try {
      const text = describeEraseReport(await eraseEverything({ caches: NO_CACHES })) ?? '';
      expect(text).toContain('業務レコード (他のタブが使用中)');
    } finally {
      holder.close();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });

  it('★ Web Storage の取得が拒まれたら (SecurityError) failed —— 「消えた」と言わず、打ち手は再読込', async () => {
    const report = await eraseEverything({
      localStorage: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      caches: NO_CACHES,
    });
    expect(report.localStorage).toBe('failed');
    expect(report.allDeleted).toBe(false);
    const text = describeEraseReport(report) ?? '';
    expect(text).toContain('気分の記録・人材育成・チームレーダー (ブラウザに拒否されました)');
    expect(text).toContain('ページを再読み込みしてから');
    expect(text).not.toContain('他のタブをすべて閉じて');
  });

  it('★ 消えたと言う前に読み直す —— 黙って何もしない removeItem は failed', async () => {
    const stubborn = { getItem: (): string => 'still-there', removeItem: (): void => {} };
    const report = await eraseEverything({ sessionStorage: () => stubborn, caches: NO_CACHES });
    expect(report.sessionStorage).toBe('failed');
    expect(report.allDeleted).toBe(false);
  });

  it('対照: 無い媒体 (Cache Storage 無し / Web Storage が null) は unavailable で、失敗ではない', async () => {
    const report = await eraseEverything({ localStorage: () => null, caches: NO_CACHES });
    expect(report.localStorage).toBe('unavailable');
    expect(report.cacheStorage).toBe('unavailable');
    expect(report.allDeleted).toBe(true);
  });

  it('Cache Storage の削除が投げたら failed (無いのとは違う)', async () => {
    const report = await eraseEverything({
      caches: () => ({
        delete: async (): Promise<boolean> => {
          throw new Error('cache refused');
        },
      }),
    });
    expect(report.cacheStorage).toBe('failed');
    expect(describeEraseReport(report)).toContain('アプリシェルのキャッシュ (ブラウザに拒否されました)');
  });

  it('★ 在庫に在るのに消し方が無い IndexedDB は failed (黙って通さない)', async () => {
    const report = await eraseEverything({ idbErasers: {}, caches: NO_CACHES });
    for (const name of ERASE_INDEXEDDB) expect(report.indexeddb[name], name).toBe('failed');
    expect(report.allDeleted).toBe(false);
  });

  it('保管庫は最後に消す (途中で止まっても「保管庫だけ新しく、記録は前の人の物」にならない)', async () => {
    const order: string[] = [];
    const erasers = Object.fromEntries(
      ERASE_INDEXEDDB.map((name) => [
        name,
        async (): Promise<'deleted'> => {
          order.push(name);
          return 'deleted';
        },
      ]),
    );
    await eraseEverything({ idbErasers: erasers, caches: NO_CACHES });
    expect(order).toEqual([...ERASE_INDEXEDDB]);
    expect(order.at(-1)).toBe('business-hub-vault');
  });

  it('各保管層の消し方: ブラウザが削除を拒んだら failed (onerror)', async () => {
    const real = globalThis.indexedDB;
    const stub = {
      ...real,
      open: real.open.bind(real),
      deleteDatabase: (): IDBOpenDBRequest => {
        const req = {} as IDBOpenDBRequest;
        setTimeout(() => req.onerror?.(new Event('error')), 0);
        return req;
      },
    };
    Object.defineProperty(globalThis, 'indexedDB', { value: stub, configurable: true, writable: true });
    try {
      expect(await deleteRecordDatabase()).toBe('failed');
      expect(await deleteLibraryDatabase()).toBe('failed');
      expect(await deletePreferencesDatabase()).toBe('failed');
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, configurable: true, writable: true });
    }
  });
});

describe('在庫は台帳と同じ 1 組 (規則 11 の双子 —— 規則は字面、ここは実物の配列)', () => {
  const ledger = require_(path.join(REPO_ROOT, 'scripts', 'lint-storage-ledger.cjs')) as {
    STORES: Record<string, { medium: string }>;
  };
  const ofMedium = (medium: string): string[] =>
    Object.entries(ledger.STORES)
      .filter(([, row]) => row.medium === medium)
      .map(([name]) => name)
      .sort();

  it('★ IndexedDB / Cache Storage / localStorage / sessionStorage の全行が在庫に在り、在庫に台帳の外は無い', () => {
    expect([...ERASE_INDEXEDDB].sort()).toEqual(ofMedium('indexeddb'));
    expect([...ERASE_CACHE_STORAGE].sort()).toEqual(ofMedium('cachestorage'));
    expect([...ERASE_LOCAL_STORAGE_KEYS].sort()).toEqual(ofMedium('localstorage'));
    expect([...ERASE_SESSION_STORAGE_KEYS].sort()).toEqual(ofMedium('sessionstorage'));
  });

  it('台帳に在庫の無い媒体が無い (cookie / OPFS の行が現れたら在庫にも一覧が要る)', () => {
    const covered = new Set(['indexeddb', 'cachestorage', 'localstorage', 'sessionstorage']);
    for (const [name, row] of Object.entries(ledger.STORES)) {
      expect(covered.has(row.medium), `${name}: ${row.medium}`).toBe(true);
    }
  });

  it('説明文は媒体を全部言い、数は在庫から、消えない物も言う', () => {
    const s = eraseScopeSummary();
    for (const word of [
      '保管庫',
      '業務レコード',
      'ライブラリの書類',
      'プロキシ設定',
      '気分の記録',
      '人材育成',
      'チームレーダー',
      '会話履歴',
      'sessionStorage',
      'キャッシュ',
      '消えない物',
    ]) {
      expect(s).toContain(word);
    }
    expect(s).toContain(`localStorage ${ERASE_LOCAL_STORAGE_KEYS.length} 鍵`);
  });
});
