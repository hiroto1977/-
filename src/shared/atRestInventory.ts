/**
 * 「保存時の保護状態」の節が言う、**トークン以外の保存物**の在庫 (2026-09-09 · パス 135)。
 *
 * それまで設定画面の節はトークンのことしか言わなかった。同じ日に (パス 132 / 133) デスクトップ版は
 * 気分の記録・人材育成・チームレーダーの状態ファイルを `secrets.json` と同じ約束 (OS のキーチェーン、
 * 無ければ `plain:` の難読化) で封緘するようになった —— つまり「難読化のみ」の警告は、トークンだけでなく
 * **健康に関わる記録と他人の人事評価**にも当てはまる。ブラウザ版はそれらを localStorage に**平文**で置く
 * (保管庫の外 —— マスターパスワードでは守られない)。節の題は「保存時の保護状態」なので、トークンしか
 * 言わない節は「保存する物は全部この状態」と読める (見出しが範囲を落とす形は 2026-08-23 に 1 度直している)。
 *
 * ここは画面が読む唯一の在庫と文。デスクトップの封緘は `main/__tests__/atRestPolicy.test.ts` が実装から
 * 数え、ブラウザの鍵は各モジュールの定数と一致することを `renderer/__tests__/atRestInventory.test.ts` が留める
 * (shared は renderer を import できないので、鍵は文字列で持ち、検査が突き合わせる)。
 */
export type AtRestMechanism = 'os-keychain' | 'webcrypto-vault' | 'obfuscated';

export interface StateStoreEntry {
  /** 画面の言い方 (何が入っているか)。 */
  readonly label: string;
  /** デスクトップ版の状態ファイル (userData / ~/.local/business-hub)。 */
  readonly desktopFile: string;
  /** ブラウザ版の localStorage の鍵。 */
  readonly browserKey: string;
}

export const STATE_STORES: readonly StateStoreEntry[] = [
  { label: '気分の記録 (健康に関わる記録)', desktopFile: 'service-hub-emotions.json', browserKey: 'emotions.store' },
  { label: '人材育成 (部署名・氏名)', desktopFile: 'talent.json', browserKey: 'servicehub.talent.state.v1' },
  { label: 'チームレーダー (他人の氏名と評価)', desktopFile: 'team-radar.json', browserKey: 'teamradar.state' },
];

export function stateStoreLabels(): string {
  return STATE_STORES.map((s) => s.label).join('・');
}

/**
 * 節に足す 1 文。トークンの文の**後**に置く (トークンの文は書き換えない —— `storageClaims.test.ts` が
 * その文面を留めている)。仕組みごとに、何が守っているか・何も守っていないかを言う。
 */
export function describeStateStores(mechanism: AtRestMechanism): string {
  const names = stateStoreLabels();
  switch (mechanism) {
    case 'os-keychain':
      return `${names}の状態ファイルも、同じ OS のキーチェーン由来の鍵で封緘して保存されています (2026-09-09 から)。`;
    case 'obfuscated':
      return `同じ理由で、${names}の状態ファイルも base64 の難読化のみです (暗号化ではありません)。`;
    case 'webcrypto-vault':
      return `${names}は、この保管庫の外 —— ブラウザの localStorage に平文で保存されています (マスターパスワードでは守られません)。`;
  }
}
