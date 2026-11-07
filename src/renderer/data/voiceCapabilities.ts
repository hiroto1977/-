import { SERVICE_IDS } from '../../shared/serviceId';
import type { AvailableCapabilities } from './voiceCommand';

// 能力の表だけを持つモジュール。以前は描画されない部品 `VoiceCommandBar` の中に居て、
// 生きている 3 画面 (ChatbotWidget / VillagePage / AssistantPage) が部品ごと import していた。
// 音声からルーティング可能な write action を serviceId 別に宣言。
// (main の LIVE_ACTIONS は import 境界外なので renderer 側に最小の対応表を持つ。)
const VOICE_ACTIONS: AvailableCapabilities['actions'] = {
  github: ['create-issue'],
  slack: ['send-message'],
  calendar: ['create-event'],
  'uber-eats': ['record-entry'],
  'demae-can': ['record-entry'],
  'real-estate': ['record-entry'],
  'mutual-funds': ['record-entry'],
};

/** 音声/チャット共通の能力テーブル (ChatbotWidget も同じ表を参照する)。 */
export const CAPABILITIES: AvailableCapabilities = {
  serviceIds: SERVICE_IDS,
  actions: VOICE_ACTIONS,
};
