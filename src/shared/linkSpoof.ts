/**
 * **リンクの見かけと行き先の食い違いを、押す前に見せる** (2026-11-10 · 乗っ取り防止 ·
 * 脅威類 `ai-phishing` の「リンクの表示文字と行き先の食い違い・似た文字 (IDN) のドメイン」の穴)。
 *
 * 外へ出る `<a href>` は関門 (`externalUrlOrNull`) が http(s) だけ・利用者情報なしに絞るが、
 * **関門が見るのは行き先の形で、利用者が読む表示文字との整合ではない**。第三者の文書や AI の応答に
 * 混ざったリンクは、「`nta.go.jp` の手引き」と読ませて別のドメインへ連れて行ける。
 * 人が騙されること自体は防げないので、ここは**騙しの手がかりを押す前に画面へ出す**側を担う
 * (リンクは今までどおり開ける —— 機能は残し、警告だけを足す)。
 *
 * 2 つだけ見る:
 * 1. **似た文字のドメイン** —— 行き先のホストに punycode (`xn--`) のラベルが在る。URL は非 ASCII の
 *    ホストを解析すると `xn--…` へ畳むので、「見た目は本物・実体は別のドメイン」はここで必ず現れる。
 *    (日本語ドメインの正当な利用もあり得るので、**止めずに見せる**。)
 * 2. **表示にドメインが書いてあるのに、行き先が別のドメイン** —— 表示から最初のドメインらしい綴りを
 *    取り、行き先のホストと同じか親子 (サブドメイン) でなければ警告する。表示にドメインが無ければ
 *    (「手引きを開く」など) 何も言わない —— 偽陽性で警告が日常になると誰も読まなくなる。
 */

export interface LinkSpoof {
  readonly kind: 'lookalike-host' | 'label-mismatch';
  /** 利用者へ見せる 1 文 (秘密も path も含まない・ホストだけを名乗る)。 */
  readonly message: string;
}

/** 表示文字の中の最初の「ドメインらしい綴り」(`scheme://` と `:port` と path は読み飛ばす)。 */
const LABEL_HOST = /(?:[a-z][a-z0-9+.-]*:\/\/)?((?:[a-z0-9¡-￿](?:[a-z0-9¡-￿-]{0,61}[a-z0-9¡-￿])?\.)+[a-z¡-￿]{2,})/iu;

function hostOf(href: string): string | null {
  try {
    return new URL(href).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function labelHostOf(label: string): string | null {
  const m = LABEL_HOST.exec(label);
  if (m === null) return null;
  try {
    return new URL('https://' + m[1]).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function related(a: string, b: string): boolean {
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a);
}

/**
 * `href` (関門を通した行き先) と `label` (利用者が読む表示。文字列でなければ `null`) を突き合わせる。
 * 食い違いが無ければ `null`。行き先が解析できなければ `null` (その場合は関門が既に断っている)。
 */
export function linkSpoofWarning(href: string, label: string | null): LinkSpoof | null {
  const host = hostOf(href);
  if (host === null) return null;
  if (host.split('.').some((part) => part.startsWith('xn--'))) {
    return { kind: 'lookalike-host', message: '行き先のドメイン ' + host + ' は、似た文字で作られた別のドメインかもしれません。' };
  }
  if (label === null) return null;
  const shown = labelHostOf(label);
  if (shown !== null && !related(shown, host)) {
    return { kind: 'label-mismatch', message: '表示は ' + shown + ' ですが、行き先は ' + host + ' です。' };
  }
  return null;
}
