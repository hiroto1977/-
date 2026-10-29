/**
 * **送り先を変える操作には、この端末の持ち主の確認が要る** (2026-10-29 · パス 554 · threat: T-219)。
 *
 * 癌の対応表 (パス 553) の「免疫チェックポイント = 守りの無効化」の軸。アプリがどこへ資格情報と
 * 本文を送るかを決める設定は 2 つ —— BYO プロキシ (経由する全要求に `Authorization` が乗る) と
 * Ollama の接続先 (会話の本文が行く先) —— で、2026-10-29 まで**どちらも通常の保存と同じ 1 押しで
 * 書けた** (実測: プロキシは `setProxyConfig` を直接・接続先は `localStorage.setItem` を直接。
 * 本人確認 T-183 は main の IPC にだけ掛かり、この 2 つは IPC を通らない)。資格情報そのものの
 * 書き込みにはデスクトップ版で本人確認が要るのに、**その資格情報が丸ごと渡る先**を変える操作には
 * 何も要らなかった。
 *
 * ## 何をするか
 * - 判定 (`ollamaEndpointNeedsStepUp` / `proxyChangeNeedsStepUp`) と文面 (`stepUpReason` ほか) は
 *   ここ 1 つ。画面は `StepUpPassword` (components/) がこの文を描き、保管庫の `verifyPassword` で
 *   照合してから書く。**持ち主の証は保管庫のパスワード** —— ブラウザ版には main が無く、
 *   ネイティブダイアログは構造上持てない。
 * - Ollama は**同じ端末の外**へ向く接続先だけに掛ける (ポート番号だけ = loopback は掛けない ——
 *   本文は端末を出ないので、重さが違う)。プロキシは常に (どの URL も端末の外)。
 * - 文面は**送り先のホストだけ**を名乗る。共有秘密も URL の path / query も引用しない
 *   (この文は画面に出る —— 秘密を映す面を増やさない)。
 *
 * ## 限界 (正直に)
 * この門はレンダラーの中に在る。レンダラーを乗っ取った相手には効かない (`setProxyConfig` を
 * 直接呼べる) —— 効くのは**人の手**: 貼り付けを促す指示 (「この URL を入れてください」) に
 * 従う前に、自分のパスワードを打つ段で立ち止まれる。乗っ取られたレンダラーからの書き込みを
 * 止めるには保管層を main へ移す (ブラウザ版には無い) 道しか無く、それは別の判断である。
 */
import { isLoopbackHostname, parseOllamaEndpoint } from '../../shared/ollama';

export type EgressSetting = 'proxy' | 'ollama';

/**
 * Ollama の接続先の変更に持ち主の確認が要るか。
 * - 許可されない接続先 (`null`) は別の門 (画面の「指定できません」) が断るので false。
 * - 解決した先が loopback (同じ端末) なら false —— 本文は端末を出ない。
 * - それ以外 (同じホストへの http・https のトンネル) は true。
 */
export function ollamaEndpointNeedsStepUp(endpointInput: string, pageHostname: string): boolean {
  const base = parseOllamaEndpoint(endpointInput, pageHostname);
  if (base === null) return false;
  return !isLoopbackHostname(new URL(base).hostname);
}

/** プロキシの保存は常に要る (どの URL も端末の外で、経由する要求に資格情報が乗る)。 */
export function proxyChangeNeedsStepUp(next: { url: string } | null): boolean {
  return next !== null;
}

/** 文面に出すのはホストだけ。読めない URL は「(読めない URL)」と言う (生の文字列を映さない)。 */
export function destinationHost(url: string): string {
  try {
    const h = new URL(url).hostname;
    return h === '' ? '(読めない URL)' : h;
  } catch {
    return '(読めない URL)';
  }
}

const WHAT: Readonly<Record<EgressSetting, string>> = {
  proxy: 'BYO プロキシの送り先 —— 以後、経由する要求は API トークン (Authorization ヘッダ) ごとこの Worker へ渡ります',
  ollama: 'Ollama の接続先 —— 以後、会話の本文はこの端末の外のホストへ送られます',
};

/** 確認の文。何が・どこへ変わるかを名乗り、なぜ確認が要るかを 1 文で言う。 */
export function stepUpReason(setting: EgressSetting, destinationUrl: string): string {
  return `${WHAT[setting]}。送り先: ${destinationHost(destinationUrl)}。`
    + 'この端末の持ち主の確認のため、保管庫のパスワードを入力してください (変えるまで何も送りません)。';
}

export const STEP_UP_WRONG_PASSWORD = 'パスワードが違います。送り先は変えていません。';
export const STEP_UP_CANCELLED = '送り先の変更をやめました (何も変えていません)。';
export const STEP_UP_PASSWORD_LABEL = '保管庫のパスワード（送り先の変更の確認）';
export const STEP_UP_APPLY_LABEL = '確認して変更する';
export const STEP_UP_CANCEL_LABEL = 'やめる';
