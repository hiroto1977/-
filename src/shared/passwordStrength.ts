/**
 * パスワード強度の評価 (目安)。
 *
 * **重要 — これは強度の目安であり、暗号学的な安全性の保証ではありません。**
 * 長さ・文字種・推定エントロピーから 0..100 のスコアと推定突破時間を算出します。
 * 辞書攻撃・既知の漏洩リスト・パターン検知 (将来) は反映しません。実際の保護は
 * Vault の PBKDF2 + AES-GCM が担います。本モジュールは入力強度の参考値です。
 */

/** 文字種の有無。 */
export interface CharsetFlags {
  readonly hasLower: boolean;
  readonly hasUpper: boolean;
  readonly hasDigit: boolean;
  readonly hasSymbol: boolean;
}

/** パスワード強度の評価結果。 */
export interface PasswordStrength {
  /** 強度スコア (0..100)。 */
  readonly score: number;
  /** 判定 (weak / fair / good / strong)。 */
  readonly verdict: 'weak' | 'fair' | 'good' | 'strong';
  /** 推定エントロピー (ビット)。 */
  readonly entropyBits: number;
  /** 文字種の有無。 */
  readonly charset: CharsetFlags;
  /** 文字数。 */
  readonly length: number;
}

/** 文字種ごとの文字数 (エントロピー推定用)。 */
function charsetSize(flags: CharsetFlags): number {
  let size = 0;
  if (flags.hasLower) size += 26;
  if (flags.hasUpper) size += 26;
  if (flags.hasDigit) size += 10;
  if (flags.hasSymbol) size += 32; // 記号の概算
  return size;
}

/** パスワードの文字種フラグを判定する。 */
export function detectCharset(password: string): CharsetFlags {
  return {
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    // 英数字以外を記号とみなす。
    hasSymbol: /[^a-zA-Z0-9]/.test(password),
  };
}

/** 推定エントロピー (ビット) = 文字数 × log2(文字種サイズ)。 */
export function estimateEntropyBits(password: string): number {
  if (password.length === 0) return 0;
  // 非空パスワードは 4 つの文字種正規表現が網羅的 (任意の 1 文字は小英字/大英字/数字/
  // それ以外=記号 のいずれか) のため charsetSize は必ず >=10。size<=0 ガードは到達不能
  // なので置かない (空は上で 0 を返す)。
  const size = charsetSize(detectCharset(password));
  return Math.round(password.length * Math.log2(size) * 100) / 100;
}

/**
 * パスワード強度を 0..100 で評価する。
 *
 * 長さ (最大40点) + 文字種の多様性 (最大30点) + エントロピー (最大30点) の合計。
 * 連続する同一文字 (aaa) があれば減点。
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  const length = password.length;
  const charset = detectCharset(password);
  const entropyBits = estimateEntropyBits(password);

  // 空文字は以降の計算がそのまま score 0 / verdict 'weak' / entropyBits 0 を返すため、
  // 専用の早期 return は冗長 (フォールスルーと同一結果)。

  // 長さスコア (16文字以上で満点40)。
  const lengthScore = Math.min(40, Math.round((length / 16) * 40));
  // 文字種スコア (4種で満点30)。
  const kinds = [charset.hasLower, charset.hasUpper, charset.hasDigit, charset.hasSymbol].filter(Boolean).length;
  const charsetScore = kinds * 7.5;
  // エントロピースコア (80ビットで満点30)。
  const entropyScore = Math.min(30, (entropyBits / 80) * 30);
  // 連続同一文字 (3文字以上) の減点。
  const hasRun = /(.)\1\1/.test(password);
  const penalty = hasRun ? 10 : 0;

  const score = Math.max(0, Math.min(100, Math.round(lengthScore + charsetScore + entropyScore - penalty)));
  const verdict: PasswordStrength['verdict'] =
    score >= 80 ? 'strong' : score >= 60 ? 'good' : score >= 35 ? 'fair' : 'weak';

  return { score, verdict, entropyBits, charset, length };
}

/**
 * エントロピーから推定突破時間 (秒) を返す。
 *
 * 試行回数 = 2^(エントロピー − 1) (平均的に半分で当たる)。
 * @param entropyBits 推定エントロピー (ビット)
 * @param guessesPerSecond 1秒あたりの試行回数 (オフライン高速攻撃の目安は 1e10)
 */
export function estimateCrackSeconds(entropyBits: number, guessesPerSecond = 1e10): number {
  if (entropyBits <= 0 || guessesPerSecond <= 0) return 0;
  const guesses = Math.pow(2, entropyBits - 1);
  return guesses / guessesPerSecond;
}

/** 秒数を人間可読な目安文字列にする。 */
export function humanizeCrackTime(seconds: number): string {
  if (seconds < 1) return '一瞬';
  const minute = 60, hour = 3600, day = 86400, year = day * 365;
  if (seconds < minute) return `${Math.round(seconds)}秒`;
  if (seconds < hour) return `${Math.round(seconds / minute)}分`;
  if (seconds < day) return `${Math.round(seconds / hour)}時間`;
  if (seconds < year) return `${Math.round(seconds / day)}日`;
  const years = seconds / year;
  if (years < 1000) return `${Math.round(years)}年`;
  if (years < 1e6) return `${Math.round(years / 1000)}千年`;
  if (years < 1e9) return `${Math.round(years / 1e6)}百万年`;
  return '事実上解読不能';
}
