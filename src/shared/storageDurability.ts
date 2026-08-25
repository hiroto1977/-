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
