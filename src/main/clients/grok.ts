import { buildGrokSnapshot, type GrokSnapshot } from '../../shared/grokSnapshot';
import type { FetchContext } from './types';

/**
 * Grok (xAI) の画面 (2026-11-04)。AI 提供者としての Grok の呼び出しは `assistant` の
 * クライアント (`assistant/chat` の `provider: 'grok'`) が担い、鍵も `assistant` スロットに保存する
 * —— この画面は状態を読んで質問を送る窓で、自分の通信も認証も持たない。
 *
 * 本 fetcher が返すのは提供者の台帳 (`AI_PROVIDERS.grok`) から導いた土台だけ
 * (組み立ては `shared/grokSnapshot.ts` の `buildGrokSnapshot`、ブラウザ版の
 * SNAPSHOT も同じ関数を呼ぶ)。資格情報も通信も使わないので `LOCAL_SERVICES`
 * に載り、`SERVICE_DATA_ORIGIN` は 'local' (2026-11-19、ローカル完結バッチ 3。
 * 以前は snapshot 専用の stub だったため 'sample' と宣言されていた)。
 */
export type { GrokSnapshot };

export async function fetchGrokSnapshot(_ctx: FetchContext): Promise<GrokSnapshot> {
  return buildGrokSnapshot();
}
