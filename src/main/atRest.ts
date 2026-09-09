/**
 * 端末に置く状態ファイルの封緘 —— `secrets.ts` と同じ約束 (2026-09-09 · パス 132)。
 *
 * OS のキーチェーン (`safeStorage`) が使えるときは封緘した base64、使えないときは
 * `plain:` + base64 (難読化であって暗号化ではない —— Linux でキーチェーンが無い環境。
 * `secrets.ts` が同じ倒し方をしており、設定画面がその状態を言う)。
 *
 * `secrets.ts` の encode / decode と同じ形だが、あちらは保護対象 (integrity chain) で
 * トークン専用なので、状態ファイル用の口をここに 1 つ置く。
 *
 * 2026-09-09 まで感情ログ (気分の点数・メモ・解析に貼った文の抜粋 = **健康に関わる記録**) は
 * `service-hub-emotions.json` に**平文**で置かれていた —— 同じ userData の `secrets.json` は
 * safeStorage で封緘しているのに。`docs/DATA_PROTECTION.md` の在庫にも載っていなかった。
 *
 * パス 133 (同日): `talent.json` (部署名・氏名・STEP) と `team-radar.json` (氏名・軸ごとの評価・付箋) も
 * 同じ口を通した。文書の封筒は `sealJsonDocument` / `unsealJsonDocument` の 1 組 —— 読み手 (中身が
 * JSON として正しいか・形が合うか) は今までどおり各モジュールが持つ。
 */
import { safeStorage } from 'electron';

export const PLAIN_PREFIX = 'plain:';

/** 封緘した状態ファイルの封筒。`v: 2` は「封緘済み」の印 (2026-09-09 までの平文には無い)。 */
export interface AtRestEnvelope {
  readonly v: 2;
  readonly sealed: string;
}

export function isAtRestEnvelope(v: unknown): v is AtRestEnvelope {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as { v?: unknown; sealed?: unknown };
  return r.v === 2 && typeof r.sealed === 'string';
}

/** 平文 → 保存形。キーチェーンが無ければ `plain:` (難読化)。 */
export function sealAtRest(plaintext: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plaintext).toString('base64');
  }
  return PLAIN_PREFIX + Buffer.from(plaintext, 'utf8').toString('base64');
}

export type OpenAtRest =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'no-keychain' | 'undecryptable' };

/**
 * 保存形 → 平文。**投げない** —— 理由を返す (キーチェーンが無い / 壊れているか別の鍵)。
 * 呼ぶ側が利用者向けの文と「履歴を消去」の道を添える。
 */
export function openAtRest(sealed: string): OpenAtRest {
  if (sealed.startsWith(PLAIN_PREFIX)) {
    return { ok: true, text: Buffer.from(sealed.slice(PLAIN_PREFIX.length), 'base64').toString('utf8') };
  }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, reason: 'no-keychain' };
  try {
    return { ok: true, text: safeStorage.decryptString(Buffer.from(sealed, 'base64')) };
  } catch {
    return { ok: false, reason: 'undecryptable' };
  }
}

/** 今の環境でどう封緘されるか (設定画面や文書が言うため)。 */
export function atRestMechanism(): 'os-keychain' | 'obfuscated' {
  return safeStorage.isEncryptionAvailable() ? 'os-keychain' : 'obfuscated';
}

/** 封緘して書く JSON 文書の封筒 (文字列)。呼ぶ側は中身の JSON 文字列だけ渡す。 */
export function sealJsonDocument(json: string): string {
  return JSON.stringify({ v: 2, sealed: sealAtRest(json) });
}

export type UnsealedDocument =
  | { readonly ok: true; readonly json: string; readonly sealed: boolean }
  | { readonly ok: false; readonly reason: 'no-keychain' | 'undecryptable' };

/**
 * 保存形の文字列 → 中身の JSON 文字列 (パス 133)。
 *
 * 封筒 (`{ v: 2, sealed }`) なら開ける。封筒でなければ (2026-09-09 までの平文・壊れた JSON も)
 * **そのまま返す** —— 中身が JSON として正しいか・形が合うかの判定は、呼ぶ側の読み手
 * (`readStoredTalent` / `readStoredTeamRadar` / 感情ログの `asRecord`) が今までどおり持つ。
 * `sealed` は「開けた物か」の印 —— 開けた中身が JSON でなければ壊れた封緘と言えるが、
 * 平文が JSON でないのは 2026-09-09 までの壊れ方で、読み手がその文を持っている。
 */
export function unsealJsonDocument(raw: string): UnsealedDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: true, json: raw, sealed: false };
  }
  if (!isAtRestEnvelope(parsed)) return { ok: true, json: raw, sealed: false };
  const opened = openAtRest(parsed.sealed);
  return opened.ok ? { ok: true, json: opened.text, sealed: true } : opened;
}

/** 開けられない封緘の理由 (利用者向け)。呼ぶ側が「作り直す道」を添える。 */
export function atRestUnreadableReason(reason: 'no-keychain' | 'undecryptable'): string {
  return reason === 'no-keychain'
    ? 'OS のキーチェーンで封緘されていますが、この環境ではキーチェーンが使えません'
    : '封緘を復号できません (値が壊れているか、保存時と別の鍵が使われています)';
}
