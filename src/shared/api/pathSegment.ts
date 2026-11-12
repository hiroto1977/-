/**
 * URL のパスの 1 区間を作る (T-190)。
 *
 * `encodeURIComponent('..')` は `'..'` のまま (予約文字ではない) なので、`/zones/${zoneId}/dns_records` に
 * `..` を入れると WHATWG URL が dot-segment として 1 段畳み、**同じホスト・同じ Bearer のまま別の
 * パスへ POST が届く** (`/repos/../user/issues` → `/user/issues`)。符号化では防げないので、`.` と `..` は
 * 区間として受けず断る。`%2e` は `%252e` へ符号化されるので畳まれない。
 */
export function refuseDotSegment(value: string): string {
  if (value === '.' || value === '..') {
    throw new Error('パスの部品に "." と ".." は使えません。');
  }
  return value;
}

/** 区間として符号化する。`.` と `..` は断る。 */
export function pathSegment(value: string): string {
  return encodeURIComponent(refuseDotSegment(value));
}
