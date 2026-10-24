/**
 * 本人確認の門 (`userPresence.ts`) を Electron に繋ぐ薄い口 (2026-10-21 · 脅威 T-147)。
 *
 * ダイアログは**主プロセスが出す**ネイティブの物で、レンダラーの JS からは押せない・文面を偽装できない。
 * 既定のボタンは「実行しない」 (Enter 連打・誤クリックで通さない)。窓が無いときは断る (fail closed)。
 */
import path from 'node:path';
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import {
  createPresenceGate,
  isTrustedSenderUrl,
  type ExternalSignalKind,
  type PresenceDecision,
  type PresenceRequest,
  type Tier,
} from './userPresence';

const TITLES: Readonly<Record<Tier, string>> = {
  destructive: 'データを削除します',
  'credential-write': '資格情報を書き換えます',
  'external-write': '外部のサービスへ書き込みます',
  egress: '外部へ送信します',
  'local-write': '端末に書き込みます',
  read: '読み取ります',
};

async function confirmNatively(req: PresenceRequest): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win === undefined) return false;
  const r = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '本人確認',
    message: TITLES[req.tier],
    detail: `${req.posture === 'alert' ? '⚠ 警戒態勢: 短時間に不審な操作が重なったため、通常は確認しない操作も確かめています。\n\n' : ''}${req.channel}\n\n${req.summary}\n\nこの操作をあなた自身が行った場合だけ「実行する」を選んでください。`,
    buttons: ['実行しない', '実行する'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  return r.response === 1;
}

const gate = createPresenceGate({ confirm: confirmNatively });

const DIST_ROOT = path.join(__dirname, '..', 'dist');

/** 呼び出し元が「アプリ自身の画面の最上位フレーム」か。 */
function senderTrusted(e: IpcMainInvokeEvent): boolean {
  const frame = e.senderFrame;
  if (frame === null || frame === undefined || frame.parent !== null) return false;
  return isTrustedSenderUrl(frame.url, DIST_ROOT, process.env.VITE_DEV_SERVER_URL);
}

export function requirePresence(e: IpcMainInvokeEvent, req: PresenceRequest): Promise<PresenceDecision> {
  return gate.guard(req, senderTrusted(e));
}

export function recentPresenceEvents(): ReturnType<typeof gate.recentEvents> {
  return gate.recentEvents();
}

/** 外の感知器 (file:// の門など) が断ったことを門へ知らせる。警戒の元として数えられる。 */
export function reportThreatSignal(kind: ExternalSignalKind, where: string): void {
  gate.report(kind, where);
}
