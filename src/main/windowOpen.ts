/**
 * 窓の `window.open()` を外部ブラウザへ渡す口 (2026-10-24 · threat: T-173)。
 *
 * 以前は `setWindowOpenHandler` が URL の関門 (`externalUrlOrNull`) だけを通して `shell.openExternal` を直に
 * 呼んでいた。IPC の `app:openExternal` は同じ関門の後に本人確認の門 (速度制限・警戒態勢・ロックアウト)
 * を通すので、乗っ取られたレンダラーは `window.open` に切り替えるだけでその門を丸ごと迂回できた
 * (実機の Electron で 200 回呼ぶと、IPC は 20 回・`window.open` は 200 回が OS に届いた)。
 * 2 つの扉は**同じ門・同じ口の名前 (`app:openExternal`)** を通る —— 速度の枠も共有する。
 *
 * Electron に依らない純関数にして、門と OS の呼び出しを差し込める (検査で実際に数える)。
 */
import { externalUrlOrNull } from '../shared/externalUrlGate';
import type { PresenceDecision, PresenceRequest } from './userPresence';

export interface WindowOpenDeps {
  /** 呼び出し元の窓の URL (同梱の画面か。門が信用する送り手かを決める)。 */
  senderUrl: () => string;
  /** 本人確認の門。 */
  guard: (senderUrl: string, req: PresenceRequest) => Promise<PresenceDecision>;
  /** OS に URL を開かせる。 */
  open: (url: string) => Promise<void>;
  /** OS が開けなかった・門が投げたときの記録先。 */
  log?: (message: string) => void;
}

export async function openFromWindow(url: unknown, deps: WindowOpenDeps): Promise<void> {
  const target = externalUrlOrNull(url);
  if (target === null) return;
  try {
    const presence = await deps.guard(deps.senderUrl(), { channel: 'app:openExternal', tier: 'egress', summary: target });
    if (!presence.ok) return;
    await deps.open(target);
  } catch (e) {
    deps.log?.(`[window.open] 外部の URL を開けませんでした: ${e instanceof Error ? e.message : String(e)}`);
  }
}
