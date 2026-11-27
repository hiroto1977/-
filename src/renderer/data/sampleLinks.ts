/**
 * **見本のリンクは押させない。** (2026-11-27)
 *
 * 同梱の見本 (`SNAPSHOT`) の一覧は、実在しないページを指す URL を持つ
 * (Canva の `design/DAGEXAMPLE1` は 404「そのリンクは機能しません」、ユーチューブの `watch?v=demo1` は動画が無い、
 * ワードプレスの `example-blog-a.wordpress.com` は**他人のブログでありうる**)。利用者の報告 (2026-11-27 · Canva の 404 の画面) で分かった。
 *
 * 見本は「どんな画面になるか」を見せるための物で、その行の先へ行く物ではない。だから一覧の「開く」は、
 * 相手から実際に取れた内容 (`source === 'live'`) のときだけ出す。前回取れた内容を見せている間も `live` なので、本物のリンクは押せる。
 */
import type { Source } from '../hooks/useServiceData';

/** 実データのときだけ URL を返す (見本のときは押せる所を作らない)。 */
export function liveLink(source: Source, url: string | undefined): string | undefined {
  return source === 'live' ? url : undefined;
}
