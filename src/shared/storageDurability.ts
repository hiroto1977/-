/**
 * 保管庫の領域が「消えうる」かどうかの判定と、利用者へ伝える理由。
 *
 * ## なぜ画面から出したか
 *
 * これは**描画ではなく判断**である。`SettingsPage` の中に `=== 'best-effort'`
 * と書くと、`mutate` に `.tsx` が 1 件も無い構成では**一度も測られない**
 * (2026-08-24 に `safeImageSrc` で同じ足元を掬われている)。
 * 判断をここへ出せば、反転させた変異体が検査で落ちる。
 *
 * ## 何を伝えるのか
 *
 * ブラウザ版の保管庫は IndexedDB に在り、既定では **best-effort** の領域に
 * なる —— 実測 (2026-08-25) で `navigator.storage.persisted()` は `false`、
 * `persist()` も `false` を返した。この状態では**空き容量の都合や長期の
 * 無操作でブラウザが立ち退かせる**ことがある (Safari の ITP は無操作 7 日)。
 *
 * **控えた 24 語では戻せない。** リカバリーフレーズは保管庫を*開ける*ための
 * 物であって、立ち退きでは暗号化されたトークンごと消えるため、開ける対象が
 * 残らない。戻せるのは書き出したバックアップだけである。
 *
 * **暗号化されているかとは独立**に判断する —— 暗号化されていても消えるときは
 * 消えるので、`encrypted` の真偽で出し分けてはいけない。
 */

/** `secrets.ts` の `StorageProtection.durability` と同じ語彙。 */
export type StorageDurability = 'file' | 'persistent' | 'best-effort';

/**
 * 立ち退きの注意を出すべきか。
 *
 * `undefined` (古いブリッジ・取得前) では**出さない** —— 分からないときに
 * 警告を出すと、確かめずに脅すことになる。判断できるときだけ言う。
 */
export function isEvictableStorage(durability: StorageDurability | undefined): boolean {
  return durability === 'best-effort';
}

/**
 * 立ち退きが起きたとき、**何が戻せて何が戻せないか**。
 *
 * ## なぜ表にしたか
 *
 * 2026-08-25 の最初の実装は、警告の末尾に
 * 「**バックアップを書き出してください**」と書いていた。**これは危ない誤りだった。**
 *
 * その一文は「暗号化されたトークンごと失われます」という文の**直後**に在り、
 * 読んだ人は「書き出しておけばトークンも戻る」と受け取る。ところが
 * このアプリが作れる唯一のバックアップ (`BackupPanel`) は
 * `getRecordStore().exportAll()` —— **業務レコードだけ**である。
 * 保管庫は別の IndexedDB (`business-hub-vault`) に在り、
 * `BACKUP_EXCLUSIONS` の 1 番目が「**API キー (Vault 管理のため)**」と
 * 明記しているとおり、**構造的に入らない**。
 *
 * つまり利用者は、勧められたとおりに書き出し、**守られたつもりで**
 * トークンを失う。**警告を出したのに、出す前より危なくなっている** ——
 * 本当の警告が「対処済み」の感覚に置き換わるため。
 *
 * ## 立ち退きは生成元ごと起きる
 *
 * 消えるのは保管庫だけではない。ブラウザの立ち退きは**その生成元の保存領域**
 * を対象にするので、4 つの IndexedDB (`business-hub-data` / `-vault` /
 * `-library` / `-preferences`) と localStorage が一緒に失われる。
 * このうちバックアップが覆うのは `business-hub-data` **1 つだけ**である。
 *
 * ## 表にしてある理由
 *
 * 文言を JSX に直書きすると (1) `mutate` に `.tsx` が無いので測られない
 * (2) 暗号化できる場合とできない場合で**同じ文が 2 か所**に出るため黙って
 * 食い違う。データにして 1 か所から描く。
 *
 * `BACKUP_EXCLUSIONS` (renderer 側) との整合は**検査で縛る** ——
 * `src/shared` から renderer を import することはできない (境界検査) ので、
 * 両方を読む検査が突き合わせる。
 */
export interface EvictionRecovery {
  /** 失われるものの名前。 */
  readonly what: string;
  /** 書き出したファイルから戻せるか。 */
  readonly recoverable: boolean;
  /** 戻せるなら手順、戻せないならその後どうするか。 */
  readonly note: string;
}

export const EVICTION_RECOVERY: readonly EvictionRecovery[] = [
  {
    what: '業務レコード (売上・KPI・CRM など)',
    recoverable: true,
    note: '上の「バックアップ / 復元」で書き出したファイルから戻せます (ファイルは端末に残るため)',
  },
  {
    what: 'API キー・トークン',
    recoverable: false,
    note: 'バックアップに含まれません (Vault 管理のため)。消えたら各サービスで登録し直すことになります',
  },
  {
    what: 'ライブラリの書類・ブラウザ内の設定',
    recoverable: false,
    note: '別のデータベースにあり、バックアップに含まれません',
  },
];
