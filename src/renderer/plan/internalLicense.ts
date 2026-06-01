/**
 * 社内ライセンス (Internal License) — 自社商品としての無償・全機能開放。
 *
 * オーナー (あなた)・自社社員・招待状を受け取った人は、招待コードを入力すると
 * `internal` プラン (全機能・上限なし・¥0) が有効化される。ライセンス状態は
 * ローカル (localStorage) に保存され、サーバー課金は介在しない。
 *
 * 招待コードは「秘密の合言葉 (シークレット) + 任意のラベル」から決定的に導出した
 * 短いトークン。同じシークレットを知っていれば誰でも検証でき、社内配布に向く。
 * 高度な失効管理が要るなら将来サーバー検証へ差し替えられるよう、検証ロジックは
 * 純粋関数に閉じてある。
 *
 * **セキュリティ注記:** これは「自社/招待者に無償開放する」ための軽量ゲートであり、
 * 強固な DRM ではない。シークレットを共有する範囲が配布範囲になる。
 */

const LS_KEY = 'servicehub.internalLicense';

/**
 * 自社商品フラグ — true の間、本ビルドは「全員・全機能無償」で配布される。
 * オーナー・自社社員・招待者向けの社内配布ビルドなので、招待コード入力すら
 * 不要にして、起動時から `internal` プラン (全機能) を既定で有効にする。
 * 一般向け有償配布に切り替えるときだけ false にする。
 */
export const SELF_PRODUCT_ALL_ACCESS = true;

/** 自社の招待シークレット (合言葉)。招待コードの検証鍵。 */
export const INTERNAL_INVITE_SECRET = 'service-hub-jisha-2026';

/** ライセンス保持者の記録。 */
export interface InternalLicense {
  /** 有効化に使った招待コード。 */
  readonly code: string;
  /** 保持者ラベル (社員名・メール等、任意)。 */
  readonly holder: string;
  /** 有効化時刻 (ISO)。 */
  readonly activatedAt: string;
}

/** 文字列を 8 桁の英数トークンへ決定的に畳み込む (簡易ハッシュ)。 */
function shortToken(input: string): string {
  // FNV-1a 32bit を 2 回 (異なる種) かけて 8 文字の base36 に。
  const fnv = (str: string, seed: number): number => {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  };
  const a = fnv(input, 0x811c9dc5).toString(36).padStart(7, '0').slice(0, 4);
  const b = fnv(input + '#', 0x9e3779b1).toString(36).padStart(7, '0').slice(0, 4);
  return (a + b).toUpperCase();
}

/**
 * 招待コードを発行する (オーナー用)。`label` は招待相手の識別子 (空でも可)。
 * 形式: `SVCHUB-XXXXXXXX`。同じ secret + label からは常に同じコードが出る。
 */
export function issueInviteCode(label = '', secret: string = INTERNAL_INVITE_SECRET): string {
  return `SVCHUB-${shortToken(`${secret}|${label.trim().toLowerCase()}`)}`;
}

/**
 * 招待コードが有効か検証する。`label` を指定すればその相手向けコードと一致するか、
 * 省略すれば「ラベル無し (汎用) コード」と一致するかを見る。大文字小文字・前後空白は無視。
 */
export function verifyInviteCode(code: string, label = '', secret: string = INTERNAL_INVITE_SECRET): boolean {
  if (typeof code !== 'string') return false;
  const norm = code.trim().toUpperCase();
  return norm === issueInviteCode(label, secret);
}

/** 現在の保存済みライセンスを読む (無ければ null)。 */
export function readInternalLicense(): InternalLicense | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as InternalLicense;
    if (typeof v?.code === 'string' && verifyInviteCode(v.code, v.holder ?? '')) return v;
    // ラベル無しコードでの有効化も許容。
    if (typeof v?.code === 'string' && verifyInviteCode(v.code, '')) return v;
    return null;
  } catch {
    return null;
  }
}

/** ライセンスが有効か (＝全機能無償が使えるか)。
 *  自社商品ビルド (SELF_PRODUCT_ALL_ACCESS) では招待コード無しでも常に有効。 */
export function hasInternalLicense(): boolean {
  if (SELF_PRODUCT_ALL_ACCESS) return true;
  return readInternalLicense() !== null;
}

/**
 * 招待コードでライセンスを有効化する。成功すれば保存して true。
 * `holder` 指定時はその相手向けコード、未指定なら汎用コードを受け付ける。
 */
export function activateInternalLicense(code: string, holder = ''): boolean {
  const ok = verifyInviteCode(code, holder) || verifyInviteCode(code, '');
  if (!ok) return false;
  const license: InternalLicense = {
    code: code.trim().toUpperCase(),
    holder: holder.trim(),
    activatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(license));
  } catch {
    // 保存失敗してもこのセッションでは有効として扱う。
  }
  return true;
}

/** ライセンスを解除する (このデバイスを Free に戻す)。 */
export function deactivateInternalLicense(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // best effort
  }
}
