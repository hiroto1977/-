/**
 * Grok (xAI) 画面の見本 (2026-11-04)。**提供者の台帳 (`AI_PROVIDERS.grok`) から導く** ——
 * モデル名を写すと、既定を替えた日にこの見本だけが古びる。画面の状態 (設定済みか・既定か) は
 * `assistant/providers` が答えるので、ここには入らない。通信も認証もない。
 */
import { AI_PROVIDERS } from './ai/providers';

export interface GrokSnapshot {
  readonly provider: 'grok';
  readonly label: string;
  readonly defaultModel: string;
  readonly endpointHost: string;
}

export function buildGrokSnapshot(): GrokSnapshot {
  const spec = AI_PROVIDERS.grok;
  return {
    provider: 'grok',
    label: spec.label,
    defaultModel: spec.defaultModel,
    endpointHost: new URL(spec.defaultBaseUrl).hostname,
  };
}
