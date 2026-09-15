/**
 * **ハードリセット (「すべてのデータを削除」) が消す物の在庫と手順。** (2026-09-09 · パス 136)
 *
 * 設定画面の「⚠ すべてのデータを削除 (ハードリセット)」は、2026-09-09 まで
 * `getVault().wipeAndReset()` —— IndexedDB `business-hub-vault` の削除 —— **だけ**だった。
 * 見出しと押しボタンは「すべてのデータ」と言い、実行後は「最初のセットアップ画面に戻る」。
 * ところが残る物のほうが多かった:
 *
 *   - `business-hub-data` …… 業務レコード (売上・KPI・CRM・貸借対照表・提出者情報)。**平文**
 *   - `business-hub-library` …… ライブラリの書類 (blob・平文)
 *   - `business-hub-preferences` …… プロキシ設定 (**共有秘密**を含む) と保存先フォルダの許可
 *   - localStorage の鍵 …… 気分の記録・人材育成・チームレーダー・会話履歴・下書き …
 *   - sessionStorage の鍵 …… PKCE の code_verifier
 *   - Cache Storage …… アプリシェル
 *
 * 端末を手放す・共用の PC で使い終える人が押す操作なので、消えていない物が在るのに
 * 「最初のセットアップ画面」が出るのは、**次に使う人へ前の人の記録を渡す**形だった
 * (保管庫だけ新しくなり、レコードは平文のまま同じ生成元に在る)。
 *
 * **ブラウザ自身の資格情報ストアは台帳に載らない —— 載せられない。** (2026-09-11 · パス 147)
 * Web Storage の API ではないので `lint:storage` の走査は仕組み上届かず、こちらから消す手も無い。
 * 台帳に在って消し方が無い物は下の検査で「消えない」として落ちるので、**消えない物の側に書いた**。
 * 各入力欄が保存を勧めないよう宣言していることは `renderer/__tests__/secretFieldAutocomplete.test.ts`
 * が母集団で留めている (宣言は勧めを減らすだけで、利用者が保存した物はブラウザの側に残る)。
 *
 * **在庫は台帳と同じ 1 組。** `scripts/lint-storage-ledger.cjs` の `STORES` (ブラウザに残る物の台帳) の
 * 全行が、ここの一覧に**名前で**在ることを `lint:storage` の規則 11 が両方向に見る ——
 * 台帳に在って一覧に無い = 消えない物が在るのに「すべて」と言う / 一覧に在って台帳に無い = 消した
 * はずの保存先が残っている印。鍵は文字列で持つ (各モジュールの定数を import すると、消すためだけに
 * 全モジュールを読み込む)。IndexedDB は**各保管層が自分の DB を消す** (`deleteRecordDatabase` ほか、
 * `vault.wipeAndReset` と同じ形) —— 画面もこの本も保管庫の内部を触らない (`lint:forbidden`)。
 *
 * **消えたと言うのは、消えた時だけ** (パス 20)。媒体ごとの結果を返し、呼ぶ側は全部消えた時だけ
 * 再読込する。Web Storage は消した後に読み直す。
 *
 * 消さない物 (この手順の外): 保存先フォルダに書き出した控え (利用者の PC のファイル)・ダウンロードした
 * バックアップと書き出し・ブラウザの履歴。画面はこれも言う (`eraseScopeSummary`)。
 */
import { deleteRecordDatabase } from '../data/store';
import { deletePreferencesDatabase } from '../fs/fsa';
import { deleteLibraryDatabase } from '../library/library';
import { pkceSessionKeys } from '../oauth/pkceSession';
import { getVault, type WipeOutcome } from './vault';
import type { BrowserEraseReport, EraseOutcome } from '../../shared/eraseReport';

/** IndexedDB。保管庫は最後 —— 途中で止まっても「保管庫だけ新しく、記録は前の人の物」の向きにはならない。 */
export const ERASE_INDEXEDDB: readonly string[] = [
  'business-hub-data',
  'business-hub-library',
  'business-hub-preferences',
  'business-hub-vault',
];

/**
 * 各 DB を消すのはその保管層 (画面が保管庫の内部を触らない)。**呼ぶ時に**解く —— import 時に束縛すると、
 * 保管層を部分的に差し替える検査 (21 本) が、消し方を使いもしないのに読み込みで落ちる。
 */
const IDB_ERASERS: Readonly<Record<string, () => Promise<WipeOutcome>>> = {
  'business-hub-data': () => deleteRecordDatabase(),
  'business-hub-library': () => deleteLibraryDatabase(),
  'business-hub-preferences': () => deletePreferencesDatabase(),
  'business-hub-vault': () => getVault().wipeAndReset(),
};

export const ERASE_LOCAL_STORAGE_KEYS: readonly string[] = [
  'servicehub.recents',
  'servicehub.favorites',
  'servicehub.plan',
  'servicehub.internalLicense',
  'servicehub.recordEncryption',
  'servicehub.docstudio.v1',
  'servicehub.teamradar.draft.v1',
  'servicehub.ollama.endpoint',
  'servicehub.ollama.port',
  'teamradar.state',
  'servicehub.talent.state.v1',
  'assistant-history',
  'assistant-theme',
  'assistant-provider',
  'chatbot-history',
  'chatbot-requests',
  'chatbot-ollama-model',
  'emotions.store',
  'stocks.watchlist',
  'google-client-id',
  'ms365-client-id',
];

/**
 * sessionStorage の鍵を知っているのは `oauth/pkceSession.ts` だけ (扉は 1 つ —— `pkceSession.test.ts` が
 * `pkce.` の直書きを数える)。在庫はその扉から読む。台帳の規則 11 はこの形を `INDIRECT_SITES` の登録
 * (同じ 4 つの鍵) から解く。
 */
export const ERASE_SESSION_STORAGE_KEYS: readonly string[] = pkceSessionKeys();

export const ERASE_CACHE_STORAGE: readonly string[] = ['service-hub-v2'];

/**
 * `unavailable` = この環境にその媒体が無い (file:// の Cache Storage など)。残る物は無いので「消えた」と同じ扱い。
 * 型は両ビルドで 1 つ (`shared/eraseReport.ts` · パス 137) —— 橋 `window.serviceHub.eraseAll` はこの報告に
 * `kind: 'browser'` を付けて返す。
 */
export type { EraseOutcome };
export type EraseReport = Omit<BrowserEraseReport, 'kind'>;

interface StorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

interface CachesLike {
  delete(name: string): Promise<boolean>;
}

/** 検査のための差し替え口。既定は実物 (window の物)。取得そのものが投げうる (SecurityError) ので thunk。 */
export interface EraseDeps {
  readonly localStorage?: () => StorageLike | null | undefined;
  readonly sessionStorage?: () => StorageLike | null | undefined;
  readonly caches?: () => CachesLike | undefined;
  readonly idbErasers?: Readonly<Record<string, () => Promise<WipeOutcome>>>;
}

function eraseKeys(open: () => StorageLike | null | undefined, keys: readonly string[]): EraseOutcome {
  let storage: StorageLike | null | undefined;
  try {
    storage = open();
  } catch {
    // 取得が拒まれた (SecurityError)。中に何が在るか分からないので「消えた」とは言わない。
    return 'failed';
  }
  if (storage === null || storage === undefined) return 'unavailable';
  try {
    for (const key of keys) storage.removeItem(key);
    // 消えたと言う前に読み直す —— 黙って何もしない removeItem を「消えた」と報せない。
    for (const key of keys) if (storage.getItem(key) !== null) return 'failed';
    return 'deleted';
  } catch {
    return 'failed';
  }
}

async function eraseCaches(open: () => CachesLike | undefined, names: readonly string[]): Promise<EraseOutcome> {
  let store: CachesLike | undefined;
  try {
    store = open();
  } catch {
    return 'failed';
  }
  if (store === undefined) return 'unavailable';
  try {
    for (const name of names) await store.delete(name);
    return 'deleted';
  } catch {
    return 'failed';
  }
}

function done(outcome: EraseOutcome): boolean {
  return outcome === 'deleted' || outcome === 'unavailable';
}

/** 在庫の全部を消し、媒体ごとの結果を返す。投げない (何が残ったかを呼ぶ側が言えるように)。 */
export async function eraseEverything(deps: EraseDeps = {}): Promise<EraseReport> {
  const local = eraseKeys(deps.localStorage ?? (() => globalThis.localStorage), ERASE_LOCAL_STORAGE_KEYS);
  const session = eraseKeys(deps.sessionStorage ?? (() => globalThis.sessionStorage), ERASE_SESSION_STORAGE_KEYS);
  const cache = await eraseCaches(
    deps.caches ?? (() => (typeof caches === 'undefined' ? undefined : caches)),
    ERASE_CACHE_STORAGE,
  );
  const erasers = deps.idbErasers ?? IDB_ERASERS;
  const indexeddb: Record<string, EraseOutcome> = {};
  for (const name of ERASE_INDEXEDDB) {
    const erase = erasers[name];
    // 在庫に在るのに消し方が無い = 消えない。黙って通さない。
    indexeddb[name] = erase === undefined ? 'failed' : await erase();
  }
  const allDeleted = done(local) && done(session) && done(cache) && Object.values(indexeddb).every(done);
  return { indexeddb, localStorage: local, sessionStorage: session, cacheStorage: cache, allDeleted };
}

/** 画面と報告が使う、媒体ごとの言い方。 */
const MEDIUM_WORDS: Readonly<Record<string, string>> = {
  'business-hub-data': '業務レコード',
  'business-hub-library': 'ライブラリの書類',
  'business-hub-preferences': 'プロキシ設定と保存先フォルダの許可',
  'business-hub-vault': '保管庫 (トークン・リカバリーキー)',
  localStorage: '画面の設定・下書き・会話履歴・気分の記録・人材育成・チームレーダー',
  sessionStorage: 'OAuth の一時データ',
  cacheStorage: 'アプリシェルのキャッシュ',
};

function outcomeWord(outcome: EraseOutcome): string | null {
  if (outcome === 'blocked') return '他のタブが使用中';
  if (outcome === 'failed') return 'ブラウザに拒否されました';
  return null;
}

/** 全部消えたら null。残った物があれば、何が・なぜ残ったかと次の手 (原因ごとに違う)。 */
export function describeEraseReport(report: EraseReport): string | null {
  if (report.allDeleted) return null;
  const entries: readonly (readonly [string, EraseOutcome])[] = [
    ...Object.entries(report.indexeddb),
    ['localStorage', report.localStorage],
    ['sessionStorage', report.sessionStorage],
    ['cacheStorage', report.cacheStorage],
  ];
  const left: string[] = [];
  let blocked = false;
  let failed = false;
  for (const [name, outcome] of entries) {
    const word = outcomeWord(outcome);
    if (word === null) continue;
    if (outcome === 'blocked') blocked = true;
    else failed = true;
    left.push(`${MEDIUM_WORDS[name] ?? name} (${word})`);
  }
  const advice =
    (blocked ? '他のタブをすべて閉じてから、もう一度実行してください。' : '') +
    (failed ? 'ページを再読み込みしてから、もう一度実行してください。' : '');
  return `削除できなかった物: ${left.join(' / ')}。${advice}データは残っています。`;
}

/** 設定画面の説明文。数は在庫から (手で書いた数は検算されない —— パス 135 の教訓)。 */
export function eraseScopeSummary(): string {
  return (
    'このブラウザにアプリが保存した物をすべて消します: 保管庫 (全トークン・暗号化メタデータ・24 単語リカバリーキー)、' +
    '業務レコード (売上・KPI・CRM・貸借対照表・提出者情報 …)、ライブラリの書類、プロキシ設定と保存先フォルダの許可、' +
    `画面の設定・下書き・会話履歴・気分の記録・人材育成・チームレーダー (localStorage ${ERASE_LOCAL_STORAGE_KEYS.length} 鍵)、` +
    'OAuth の一時データ (sessionStorage)、アプリシェルのキャッシュ。' +
    '消えない物: 保存先フォルダに書き出した控え・ダウンロードしたバックアップや書き出しファイル・ブラウザの履歴・' +
    'ブラウザ自身に保存させたパスワードや API キー (ブラウザの設定から消してください)。'
  );
}
