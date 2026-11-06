/**
 * 会話で頼んだ作業の知らせ (2026-11-06) —— 会話の部品 (コンシェルジュ) が**実際に**実行した操作を、
 * 村の景色が「作業の様子」として見せるための、アプリ内だけの小さな口。
 *
 * - **運ぶのは「どのサービスの何をしているか」と段階だけ。** 話した文・実行の引数 (params)・
 *   結果の本文は載せない (載せると、景色が持つ必要のない個人データを抱える)。
 * - 外へは何も出さない (通信も保存もしない)。購読者の例外は発行側へ戻さない
 *   (景色が壊れても、頼んだ操作の経路は止めない)。
 * - 段階は `running` → `done` | `failed`。`done` は「実行して結果を受け取った」で、
 *   保存されたかどうかの区別は会話の部品が従来どおり文で述べる。
 */
import type { ServiceId } from '../../shared/serviceId';

export type ConversationWorkStage = 'running' | 'done' | 'failed';

export interface ConversationWorkEvent {
  readonly stage: ConversationWorkStage;
  readonly serviceId: ServiceId;
  readonly action: string;
}

/** action 名は台帳の識別子だが、景色に出す前提で長さだけ縛る。 */
const MAX_ACTION_CHARS = 40;

type Handler = (event: ConversationWorkEvent) => void;
const handlers = new Set<Handler>();

/** 知らせる。載せるのは 3 つの欄だけ (余計な欄は持ち込まない)。 */
export function publishConversationWork(event: ConversationWorkEvent): void {
  const safe: ConversationWorkEvent = {
    stage: event.stage,
    serviceId: event.serviceId,
    action: event.action.slice(0, MAX_ACTION_CHARS),
  };
  for (const h of [...handlers]) {
    try {
      h(safe);
    } catch {
      // 購読者の失敗は発行側に戻さない。
    }
  }
}

/** 聞く。戻り値で止める。 */
export function subscribeConversationWork(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
