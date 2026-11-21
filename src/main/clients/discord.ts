import { jsonFetchAny, type FetchContext } from './types';
import { fetchDiscordSnapshotWith, type DiscordSnapshot } from '../../shared/api/discord';

/**
 * Discord (チャット) — デスクトップ版の入口。**読み取りだけ** (2026-11-18)。
 *
 * ボットが参加しているサーバーの一覧を読む (`GET` 1 つ)。
 * **判定と正規化は `src/shared/api/discord.ts` に置いてある** —— ブラウザ版は利用者の
 * プロキシ経由で同じモジュールを呼ぶ。ここに残しているのは「Node の fetch を渡す」ことと、
 * ブラウザには付けられない `User-Agent` を名乗ることだけである。
 *
 * 通信は共通の口を通す (締切・応答の大きさの天井・転送に追随しない・失敗文の伏字)。
 * **`jsonFetch<T>` ではなく `jsonFetchAny` を使う** —— この照会は配列を直接返すので、
 * 封筒が物であることを要求する口では正しい応答まで断ってしまう。配列でない応答は shared 側が
 * 「読めなかった」と述べる (`DiscordJsonFetch` は `Promise<unknown>` を契約として宣言する)。
 *
 * 2026-11-18 まで、このファイルは同梱の見本をそのまま返す stub だった
 * (`SERVICE_DATA_ORIGIN.discord === 'sample'`)。
 */

export type { DiscordSnapshot } from '../../shared/api/discord';

/**
 * Discord は HTTP の利用者に `User-Agent` を名乗ることを求める (`DiscordBot (<名前>, <版>)` の形)。
 * 名乗るのは固定の名前だけで、利用者・端末・リポジトリを指す値は入れない。
 */
export const DISCORD_USER_AGENT = 'DiscordBot (service-hub-desktop, 1)';

export async function fetchDiscordSnapshot(ctx: FetchContext): Promise<DiscordSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'discord' };
  return fetchDiscordSnapshotWith(
    (url, init) =>
      jsonFetchAny(
        url,
        { ...init, headers: { ...(init.headers as Record<string, string>), 'User-Agent': DISCORD_USER_AGENT } },
        fetchCtx,
      ),
    ctx.token,
  );
}
