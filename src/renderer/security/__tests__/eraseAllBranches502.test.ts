/**
 * **「すべてのデータを削除」の失敗の枝・環境の有無の枝・残った物の文面を、値ごとに留める。**
 * (2026-09-30 · パス 502)
 *
 * 既存の `eraseAll.test.ts` は媒体が**消える**側と、主な失敗 (他のタブが掴む・取得が拒まれる・
 * 黙って何もしない `removeItem`) を見ている。全掃引の変異検査 (run 36784826064) は、その外側が
 * 誰にも主張されていないことを残していた:
 *
 * | 変異体 | 観測できる差 |
 * | --- | --- |
 * | `storage === undefined` → `false` | 取得は成功したが**値が `undefined`** (`globalThis.localStorage` が無い環境) → `unavailable`。`false` だと `removeItem` で投げて `failed` (= 「消えなかった」と誤報) |
 * | `removeItem` / `getItem` が投げたときの `catch` (`{ return 'failed'; }`) | 投げても `failed` と言う (空の catch だと `undefined` が報告に載る) |
 * | Cache Storage の取得 (`open()`) が投げたときの `catch` | 同上 |
 * | 既定の `caches` の取り方 `typeof caches === 'undefined' ? undefined : caches` | **この環境に `caches` が無ければ `unavailable`・在れば実際に消す** (どちらの向きに潰しても片方の環境で答えが変わる) |
 * | `describeEraseReport` の組み立て (`sessionStorage` の行・`left` の初期値・`blocked` / `failed` の旗・助言の空文字・区切り ` / `) | 残った物の**文を丸ごと**見ないと、断片ごとの `toContain` は繋ぎ目を見ない |
 *
 * 期待値の文は**字面**で書く (`MEDIUM_WORDS` は export されておらず、原文の式で期待値を組むと
 * 原文が変わったときに両辺が一緒に動く)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERASE_CACHE_STORAGE, ERASE_INDEXEDDB, describeEraseReport, eraseEverything, type EraseReport } from '../eraseAll';

/** どの IndexedDB も「消えた」と答える消し方 (検査するのは Web Storage と Cache Storage の側)。 */
const ALL_IDB_DELETED = Object.fromEntries(
  ERASE_INDEXEDDB.map((name) => [name, async (): Promise<'deleted'> => 'deleted']),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Web Storage の取得・削除の枝 (eraseKeys)', () => {
  it('★ 取得は成功したが値が undefined (この環境に媒体が無い) は unavailable —— 失敗ではない', async () => {
    const report = await eraseEverything({
      localStorage: () => undefined,
      sessionStorage: () => undefined,
      caches: () => undefined,
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.localStorage).toBe('unavailable');
    expect(report.sessionStorage).toBe('unavailable');
    expect(report.allDeleted).toBe(true);
  });

  it('★ removeItem が投げたら failed (「消えた」と言わない)', async () => {
    const report = await eraseEverything({
      localStorage: () => ({
        getItem: (): string | null => null,
        removeItem: (): void => {
          throw new Error('removeItem refused');
        },
      }),
      sessionStorage: () => null,
      caches: () => undefined,
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.localStorage).toBe('failed');
    expect(report.sessionStorage).toBe('unavailable');
    expect(report.allDeleted).toBe(false);
  });

  it('★ 消した後の読み直し (getItem) が投げても failed', async () => {
    const report = await eraseEverything({
      localStorage: () => null,
      sessionStorage: () => ({
        getItem: (): string | null => {
          throw new Error('getItem refused');
        },
        removeItem: (): void => {},
      }),
      caches: () => undefined,
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.sessionStorage).toBe('failed');
    expect(report.allDeleted).toBe(false);
  });
});

describe('Cache Storage の取得の枝 (eraseCaches)', () => {
  it('★ Cache Storage の取得そのものが拒まれたら (SecurityError) failed —— 無いのとは違う', async () => {
    const report = await eraseEverything({
      localStorage: () => null,
      sessionStorage: () => null,
      caches: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.cacheStorage).toBe('failed');
    expect(report.allDeleted).toBe(false);
  });

  it('★ 既定の取り方: この環境に caches が無ければ unavailable (投げて failed にしない)', async () => {
    // 前提 (標本が的に当たっている): テスト環境に `caches` は無い —— 参照すれば ReferenceError になる。
    expect(typeof caches).toBe('undefined');
    const report = await eraseEverything({
      localStorage: () => null,
      sessionStorage: () => null,
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.cacheStorage).toBe('unavailable');
    expect(report.allDeleted).toBe(true);
  });

  it('★ 既定の取り方: caches が在れば実際にその世代を消す', async () => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      delete: async (name: string): Promise<boolean> => {
        deleted.push(name);
        return true;
      },
    });
    const report = await eraseEverything({
      localStorage: () => null,
      sessionStorage: () => null,
      idbErasers: ALL_IDB_DELETED,
    });
    expect(report.cacheStorage).toBe('deleted');
    expect(deleted).toEqual([...ERASE_CACHE_STORAGE]);
    expect(report.allDeleted).toBe(true);
  });
});

describe('describeEraseReport: 残った物の文を丸ごと固定する', () => {
  const DELETED_IDB = {
    'business-hub-data': 'deleted',
    'business-hub-library': 'deleted',
    'business-hub-preferences': 'deleted',
    'business-hub-vault': 'deleted',
  } as const;

  const report = (over: Partial<EraseReport>): EraseReport => ({
    indexeddb: DELETED_IDB,
    localStorage: 'deleted',
    sessionStorage: 'deleted',
    cacheStorage: 'deleted',
    allDeleted: false,
    ...over,
  });

  it('★ 全部消えたら null', () => {
    expect(describeEraseReport(report({ allDeleted: true }))).toBeNull();
  });

  it('★ sessionStorage だけが拒まれた: その 1 行だけを名指しし、助言は再読み込みだけ', () => {
    expect(describeEraseReport(report({ sessionStorage: 'failed' }))).toBe(
      '削除できなかった物: OAuth の一時データ (ブラウザに拒否されました)。' +
        'ページを再読み込みしてから、もう一度実行してください。データは残っています。',
    );
  });

  it('★ 他のタブが掴んだだけ: その 1 行だけを名指しし、助言はタブを閉じることだけ', () => {
    expect(describeEraseReport(report({ indexeddb: { ...DELETED_IDB, 'business-hub-data': 'blocked' } }))).toBe(
      '削除できなかった物: 業務レコード (他のタブが使用中)。' +
        '他のタブをすべて閉じてから、もう一度実行してください。データは残っています。',
    );
  });

  it('★ 消えた物・無い物は挙げない (消えなかった物だけを 1 件 1 行で言う)', () => {
    expect(describeEraseReport(report({ cacheStorage: 'unavailable', localStorage: 'failed' }))).toBe(
      '削除できなかった物: 画面の設定・下書き・会話履歴・気分の記録・人材育成・チームレーダー (ブラウザに拒否されました)。' +
        'ページを再読み込みしてから、もう一度実行してください。データは残っています。',
    );
  });

  it('★ 2 つ以上残ったら「 / 」で並べ、原因が割れていれば助言は両方を (タブが先・再読み込みが後)', () => {
    expect(
      describeEraseReport(
        report({
          indexeddb: { ...DELETED_IDB, 'business-hub-library': 'blocked', 'business-hub-vault': 'blocked' },
          sessionStorage: 'failed',
          cacheStorage: 'failed',
        }),
      ),
    ).toBe(
      '削除できなかった物: ライブラリの書類 (他のタブが使用中) / 保管庫 (トークン・リカバリーキー) (他のタブが使用中) / ' +
        'OAuth の一時データ (ブラウザに拒否されました) / アプリシェルのキャッシュ (ブラウザに拒否されました)。' +
        '他のタブをすべて閉じてから、もう一度実行してください。' +
        'ページを再読み込みしてから、もう一度実行してください。データは残っています。',
    );
  });
});
