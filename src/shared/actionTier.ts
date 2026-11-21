// 生成物 —— src/shared/actionTier.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * 登録 action の段階の台帳 (`service/action` → Tier)。
 *
 * ## Mamori で書いてある (2026-11-05 · MG-042)
 *
 * 元は TypeScript で、Mamori 0.21 の型引数つき `new Set<Tier>(…)` で書き直した。足りなかったのは非 null 断定 `!` と
 * template 文字列で、どちらも書き直して避けた (組み上がる鍵 `service/action` は連結で同じ文字列になる)。
 * 文字列の鍵の添字 `ACTION_TIER[key]` は Mamori に無い (`x["constructor"]` で表を迂回する道) ので、表を `Object.entries` で歩いて鍵を比べる
 * (自分の属性だけを見る点は `Object.hasOwn` と同じで、prototype の鍵 `constructor` などは表に無いまま `external-write` に落ちる)。
 * 表の中身・順序・判定は 1 字も変えていない。**載っていない action は `external-write`** (fail closed) も同じ。
 */

/**
 * 登録 action の**段階**の台帳 (`service/action` → Tier)。
 *
 * 2026-10-29 (パス 552 · threat: T-215) まで `src/main/userPresence.ts` の中に在り、
 * main の本人確認 (T-147) だけが読んでいた。**出力インターセプター**
 * (`outboundContentGate.ts`) が「この action は外へ送るか」を両ビルドで同じ台帳から
 * 決める必要が出たので shared へ移した —— ブラウザ版 (`web-shim.ts`) は main を
 * import できない (`lint:imports`) ので、台帳が main に在るかぎり片方のビルドだけが
 * 段階を知る形になる。**中身は 1 字も変えていない** (`userPresence.ts` は再輸出し、
 * `userPresenceCensus.test.ts` が LIVE_ACTIONS と両方向に突き合わせる)。
 *
 * **載っていない action は `external-write` として扱う** (fail closed)。
 */
export type Tier = 'destructive' | 'credential-write' | 'external-write' | 'egress' | 'local-write' | 'read';

/** 毎回、人に確かめる段階。 */
export const CONFIRMED_TIERS: ReadonlySet<Tier> = new Set<Tier>(['destructive', 'credential-write', 'external-write']);

/** 端末の外へ中身が出る段階 —— 出力インターセプターが本文を検める対象。 */
export const OUTBOUND_TIERS: ReadonlySet<Tier> = new Set<Tier>(['external-write', 'egress']);

/** 注: `security/scan-url` を external-write にしてあるのは、VirusTotal へ URL を送ると他の利用者から検索できる状態で残り取り消せないため (red team 2026-10-21)。 */
export const ACTION_TIER: Readonly<Record<string, Tier>> = { 'github/create-issue': 'external-write', 'notion/create-page': 'external-write', 'slack/send-message': 'external-write', 'calendar/create-event': 'external-write', 'atlassian/create-issue': 'external-write', 'wordpress/create-post-draft': 'external-write', 'gmail/create-draft': 'external-write', 'drive/create-folder': 'external-write', 'canva/create-folder': 'external-write', 'cloudflare/create-dns-record': 'external-write', 'cloudflare/purge-cache': 'external-write', 'microsoft-365/send-mail': 'external-write', 'microsoft-365/create-event': 'external-write', 'shopify/sync-to-slack': 'external-write', 'shopify/sync-to-discord': 'external-write', 'shopify/sync-to-line': 'external-write', 'shopify/sync-to-gmail': 'external-write', 'shopify/sync-to-notion': 'external-write', 'shopify/sync-to-salesforce': 'external-write', 'shopify/sync-to-stripe': 'external-write', 'skills/run-skill': 'egress', 'security/check-email-breach': 'egress', 'security/scan-url': 'external-write', 'emotions/analyze-text': 'egress', 'ollama/chat': 'egress', 'stocks/advise': 'egress', 'business/advise': 'egress', 'uber-eats/advise': 'egress', 'demae-can/advise': 'egress', 'real-estate/advise': 'egress', 'mutual-funds/advise': 'egress', 'assistant/chat': 'egress', 'assistant/chatAll': 'egress', 'emotions/log-mood': 'local-write', 'emotions/clear-history': 'destructive', 'stocks/register-ticker': 'local-write', 'stocks/unregister-ticker': 'local-write', 'stocks/export-dashboard': 'local-write', 'stocks/export-dashboard-md': 'local-write', 'business/export-dashboard': 'local-write', 'business/export-dashboard-md': 'local-write', 'teamradar/save-state': 'local-write', 'teamradar/export-svg': 'local-write', 'templates/export-template': 'local-write', 'talent/save-state': 'local-write', 'uber-eats/record-entry': 'local-write', 'demae-can/record-entry': 'local-write', 'real-estate/record-entry': 'local-write', 'mutual-funds/record-entry': 'local-write', 'stocks/backtest': 'read', 'stocks/compare-strategies': 'read', 'talent/judge-leader': 'read', 'assistant/providers': 'read', 'docstudio/list-collections': 'read' };

export function tierOfAction(serviceId: string, action: string): Tier {
  const key = serviceId + '/' + action;
  for (const entry of Object.entries(ACTION_TIER)) {
    if (entry[0] === key) return entry[1];
  }
  return 'external-write';
}
