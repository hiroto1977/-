import { createSnapshotStub } from './snapshotStub';
import { buildGrokSnapshot, type GrokSnapshot } from '../../shared/grokSnapshot';

/**
 * Grok (xAI) の画面 (2026-11-04)。AI 提供者としての Grok の呼び出しは `assistant` の
 * クライアント (`assistant/chat` の `provider: 'grok'`) が担い、鍵も `assistant` スロットに保存する
 * —— この画面は状態を読んで質問を送る窓で、自分の通信も認証も持たない。本 fetcher は
 * `LIVE_FETCHERS` invariant を満たす stub。
 */
export type { GrokSnapshot };

export const fetchGrokSnapshot = createSnapshotStub<GrokSnapshot>(buildGrokSnapshot());
