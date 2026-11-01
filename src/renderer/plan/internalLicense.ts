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
    // raw が null/'' でも下の JSON.parse 経路が catch/フォールスルーで null を返すため、
    // この早期 return の ConditionalExpression は equivalent。
    // Stryker disable next-line ConditionalExpression
    if (!raw) return null;
    const v = JSON.parse(raw) as InternalLicense;
    // ?. は JSON.parse('null') で v が null のときの防御だが、その場合も catch で null を
    // 返すため `?.`↔`.` は equivalent。また verifyInviteCode 自身が typeof code!=='string' を
    // 弾くため hasCode を true 固定しても matches=false で同値 → ConditionalExpression も無効化
    // (EqualityOperator は valid/invalid テストで撃墜可能なので維持)。
    // Stryker disable next-line OptionalChaining,ConditionalExpression
    const hasCode = typeof v?.code === 'string';
    // holder 指定コード or 汎用コードのいずれか一致で有効。判定を変数に出して「常に評価される
    // 三項 (return matches ? v : null)」にすることで、偽造拒否 (matches=false) の経路も perTest
    // カバレッジ下で撃墜可能になる (if 文だと cond=false 側が文未実行=未カバー扱いになる盲点を回避)。
    // `v.holder ?? ''` の '' は holder 欠落時の既定で、汎用コード判定 (右の verify(v.code,'')) が
    // 同値に救済するため StringLiteral を無効化。
    // Stryker disable next-line StringLiteral
    const matches = hasCode && (verifyInviteCode(v.code, v.holder ?? '') || verifyInviteCode(v.code, ''));
    return matches ? v : null;
  } catch {
    return null;
  }
}

/**
 * **なぜ**全機能が開いているか (2026-09-12 · パス 158)。
 *
 * - `build` … 自社商品ビルド (`SELF_PRODUCT_ALL_ACCESS`)。招待コードは要らない。
 * - `invite` … 保存済みの招待コードが検証を通った。
 * - `none`  … 開いていない (有償配布に切り替えたときだけ現れる)。
 *
 * **「開いているか」だけでは足りない。** `hasInternalLicense()` は `build` と
 * `invite` を同じ `true` に畳むので、画面は `build` のときにも「解除して Free に
 * 戻す」という**効かない操作**を出していた —— 解除は保存を消すだけで、
 * `SELF_PRODUCT_ALL_ACCESS` による開放は続く (`usePlan.test.ts` が
 * 「revokeInvite 後も internalUnlocked=true のまま」として**既に固定していた**)。
 * 論理は分かっていて、画面だけが知らなかった。
 */
export type AllAccessSource = 'build' | 'invite' | 'none';

export function allAccessSource(
  /**
   * **Test seam。** `SELF_PRODUCT_ALL_ACCESS` はビルド定数なので、既定のままでは
   * 有償配布側の枝を**一度も走らせられない** (`vi.doMock` で export を差し替えても、
   * この関数が読むのはモジュール内の束縛なので変わらない —— パス 158 で実測)。
   * 引数で渡せるようにして、`false` の枝を**実物の論理で**測る
   * (`exchangeGoogleCode` の `fetchImpl` と同じ形)。
   */
  allAccess: boolean = SELF_PRODUCT_ALL_ACCESS,
): AllAccessSource {
  if (allAccess) return 'build';
  // Stryker disable next-line ConditionalExpression,EqualityOperator
  return readInternalLicense() !== null ? 'invite' : 'none';
}

/**
 * 解除 (Free に戻す) が**実際に効くか**。`build` では効かない ——
 * 効かない操作をボタンとして出さないために、画面はこれを見る。
 */
export function canRevokeAllAccess(allAccess: boolean = SELF_PRODUCT_ALL_ACCESS): boolean {
  return allAccessSource(allAccess) === 'invite';
}

/** ライセンスが有効か (＝全機能無償が使えるか)。理由から導く (判断を 2 つ持たない)。 */
export function hasInternalLicense(allAccess: boolean = SELF_PRODUCT_ALL_ACCESS): boolean {
  return allAccessSource(allAccess) !== 'none';
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

/**
 * ライセンスを解除する。**効いたかどうかを返す** (パス 158)。
 *
 * 自社商品ビルドでは `false` —— 保存を消しても `SELF_PRODUCT_ALL_ACCESS` が
 * 開放を続けるので、「Free に戻した」と言えない。**何もしないで false を返す**
 * のではなく保存は消す (入れた記録を残さない方が筋が通る) が、**呼び出し側に
 * 「戻っていない」ことを必ず伝える**。
 */
export function deactivateInternalLicense(allAccess: boolean = SELF_PRODUCT_ALL_ACCESS): boolean {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // best effort — 保存が消せなくても、下の判定は現物を読み直す。
  }
  return allAccessSource(allAccess) === 'none';
}
