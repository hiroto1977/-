import type { FetchContext } from './types';

/**
 * コネクター / 自動化 — 無料 (認証不要) のローカル連携カタログを一覧表示する
 * サービス。コネクター宣言とプラグイン束は純ロジック層
 * (`src/shared/connectors/*`) に存在し、renderer 側で直接描画 + ドライラン
 * (送信ペイロードの試算) を行う。実行結果は renderer の record store に残る。
 *
 * 本 fetcher はネットワーク I/O を持たず、返すのは **空の土台** だけ
 * (カタログそのものは shared が正)。資格情報も通信も使わないので
 * `LOCAL_SERVICES` に載り、`SERVICE_DATA_ORIGIN` は 'local'。
 */

export interface ConnectorsSnapshot {
  items: { id: string; name: string }[];
}

export async function fetchConnectorsSnapshot(_ctx: FetchContext): Promise<ConnectorsSnapshot> {
  return { items: [] };
}
