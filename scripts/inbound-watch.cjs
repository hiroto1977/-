#!/usr/bin/env node
/* eslint-disable */
// 生成物 —— 手で編集しない。正本は src/shared/inboundWatch.ts (組み直しは `node scripts/build-inbound-watch.cjs`)。
// 使い方: node scripts/inbound-watch.cjs <入力.json>   入力 = [{ "id", "sender"?, "subject"?, "body"? }, …]
// 出力 (標準出力): { "verdicts": [{ "id", "level", "label", "codes", "reasons" }], "malformed", "overLimit" }
// 網へ出ない・ファイルを書かない・入力の文面を出力へ写さない (写るのは id と固定の語彙だけ)。

// src/shared/inputCeiling.ts
function clampToCeiling(value, max) {
  if (!Number.isFinite(max) || max <= 0) return "";
  let out = "";
  let n = 0;
  for (const ch of value) {
    if (n >= max) break;
    out += ch;
    n += 1;
  }
  return out;
}
function moreThanChars(value, n) {
  if (!Number.isFinite(n)) return true;
  if (n < 0) return true;
  let seen = 0;
  for (const _ch of value) {
    seen += 1;
    if (seen > n) return true;
  }
  return false;
}

// src/shared/promptInjection.ts
var LABEL_ROLE_HIJACK = "AI \u306E\u5F79\u5272\u3092\u4E57\u3063\u53D6\u308B\u6307\u793A";
var LABEL_INSTRUCTION_OVERRIDE = "\u3053\u308C\u307E\u3067\u306E\u6307\u793A\u3092\u7121\u8996\u30FB\u4E0A\u66F8\u304D\u3055\u305B\u308B\u6307\u793A";
var LABEL_HIDDEN_DIRECTIVE = "\u5229\u7528\u8005\u306B\u96A0\u3057\u3066\u52D5\u304F\u3088\u3046\u6C42\u3081\u308B\u6307\u793A";
var LABEL_DELIMITER_FORGERY = "\u30B7\u30B9\u30C6\u30E0\u306E\u533A\u5207\u308A (system / developer \u306E\u5370) \u306E\u507D\u88C5";
function labelOf(group) {
  switch (group) {
    case "role-hijack":
      return LABEL_ROLE_HIJACK;
    case "instruction-override":
      return LABEL_INSTRUCTION_OVERRIDE;
    case "hidden-directive":
      return LABEL_HIDDEN_DIRECTIVE;
    case "delimiter-forgery":
      return LABEL_DELIMITER_FORGERY;
  }
}
var INJECTION_RULES = [{ id: "en-ignore-previous", group: "instruction-override", re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|initial|original|system)\s+(?:instructions?|prompts?|rules?|directions?|guidelines?)\b/ }, { id: "en-new-instructions", group: "instruction-override", re: /\b(?:your|the)\s+(?:new|updated|real|actual)\s+instructions?\b|\b(?:new|updated)\s+(?:instructions?|rules?)\s+for\s+(?:the\s+)?(?:ai|assistant|model|chatbot)\b/ }, { id: "en-from-now-on", group: "instruction-override", re: /\bfrom now on[, ]+you\s+(?:are|will|must|should|shall)\b/ }, { id: "ja-ignore-previous", group: "instruction-override", re: /(?:これまで|今まで|以前|上記|前述|先ほど|最初|元)の(?:指示|命令|ルール|制約|設定|プロンプト)(?:を|は)?\s*(?:すべて|全て|全部)?\s*(?:無視|破棄|忘れ|取り消|上書き|解除)/ }, { id: "ja-new-instructions", group: "instruction-override", re: /(?:新しい|本当の|真の|正しい)(?:指示|命令|ルール)\s*[:：]/ }, { id: "ja-from-now-on", group: "instruction-override", re: /(?:これ以降|今後|以後|ここから)は?(?:、|,)?\s*あなたは/ }, { id: "en-you-are-now", group: "role-hijack", re: /\byou are (?:now|no longer)\s+(?:a|an|the|in|not|free|unrestricted|dan|jailbroken)\b/ }, { id: "en-act-as", group: "role-hijack", re: /\b(?:act|behave|respond|pretend)\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|jailbroken|evil|different|new)\b/ }, { id: "en-developer-mode", group: "role-hijack", re: /\b(?:developer|god|admin|sudo|dan)\s+mode\b/ }, { id: "ja-you-are-now", group: "role-hijack", re: /あなたは(?:今から|これから|今後|もう)\s*(?:制限の?ない|何でも|自由な|別の|新しい|.{0,12}として)/ }, { id: "ja-developer-mode", group: "role-hijack", re: /(?:開発者|管理者|デバッグ|無制限)モード(?:に|へ|を)?(?:入|移行|切り替|有効)/ }, { id: "en-hide-from-user", group: "hidden-directive", re: /\b(?:do not|don't|never)\s+(?:tell|reveal|mention|show|inform)\s+(?:this\s+to\s+)?the\s+user\b/ }, { id: "en-reveal-system", group: "hidden-directive", re: /\b(?:reveal|print|show|output|repeat|leak|dump)\s+(?:your\s+|the\s+)?(?:system\s+prompt|instructions|hidden\s+prompt|api\s+keys?|secrets?|credentials?)\b/ }, { id: "en-send-to", group: "hidden-directive", re: /\b(?:send|forward|post|upload|exfiltrate)\s+(?:all\s+|the\s+|every\s+)?(?:data|files?|contents?|credentials?|keys?|history|conversation|secrets?)\s+to\s+(?:https?:\/\/|[a-z0-9.-]+\.[a-z]{2,})/ }, { id: "ja-hide-from-user", group: "hidden-directive", re: /(?:ユーザー|利用者|人間|本人)に(?:は)?(?:知らせ|伝え|見せ|言わ|告げ)(?:ず|ない|ないで|ないよう)/ }, { id: "ja-reveal-system", group: "hidden-directive", re: /(?:システムプロンプト|システム\s*プロンプト|内部の指示|隠された指示|api\s*キー|秘密鍵|資格情報)を?(?:すべて|全て|全部)?\s*(?:表示|出力|開示|教え|公開|送信|漏ら)/ }, { id: "ja-send-to", group: "hidden-directive", re: /(?:すべて|全て|全部|データ|ファイル|内容|履歴|鍵)を?\s*(?:https?:\/\/|[a-z0-9.-]+\.[a-z]{2,})\S*\s*(?:へ|に)\s*(?:送|転送|投稿|アップロード)/ }, { id: "chat-template-tokens", group: "delimiter-forgery", re: /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>|\[\/?inst\]|<<\s*sys\s*>>|<\/?s>\s*\[inst\]/ }, { id: "fake-role-marker", group: "delimiter-forgery", re: /(?:^|\n)\s*(?:#{1,6}\s*)?(?:system|developer)\s*(?:prompt|message|instructions?)\s*[:：]|(?:^|\n)\s*(?:system|developer)\s*[:：]\s*(?:you are|ignore|from now on|あなたは|これまでの)/ }, { id: "fake-begin-block", group: "delimiter-forgery", re: /\b(?:begin|end)\s+(?:system|hidden|secret)\s+(?:prompt|instructions?|message)\b/ }];
var INVISIBLE = /[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF\u00AD]|[\uDB40][\uDC00-\uDC7F]/g;
function normalizeForInjectionScan(text) {
  return text.normalize("NFKC").replace(INVISIBLE, "").toLowerCase().replace(/[\t\f\v ]+/g, " ").replace(/\r\n?/g, "\n");
}
function detectPromptInjection(text) {
  const norm = normalizeForInjectionScan(text);
  for (const rule of INJECTION_RULES) {
    if (rule.re.test(norm)) return { rule: rule.id, group: rule.group, label: labelOf(rule.group) };
  }
  return null;
}

// src/shared/inboundThreat.ts
var MAX_INBOUND_TEXT_CHARS = 1e5;
var INBOUND_RULES = {
  "dangerous-scheme": { level: "danger", text: "\u62BC\u3059\u3068\u30D7\u30ED\u30B0\u30E9\u30E0\u3084\u7AEF\u672B\u306E\u6A5F\u80FD\u304C\u52D5\u304F\u7A2E\u985E\u306E\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059 (\u30A6\u30A7\u30D6\u306E\u30DA\u30FC\u30B8\u3067\u306F\u3042\u308A\u307E\u305B\u3093)\u3002" },
  "disguised-host": { level: "danger", text: "\u672C\u7269\u3089\u3057\u3044\u540D\u524D\u3092\u300C@\u300D\u306E\u524D\u306B\u7F6E\u3044\u3066\u3001\u884C\u304D\u5148\u3092\u507D\u3063\u3066\u3044\u308B\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "mismatched-link": { level: "danger", text: "\u8868\u793A\u3055\u308C\u3066\u3044\u308B\u5B9B\u5148\u3068\u3001\u5B9F\u969B\u306E\u884C\u304D\u5148\u304C\u9055\u3046\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "dangerous-file": { level: "danger", text: "\u958B\u304F\u3068\u30D7\u30ED\u30B0\u30E9\u30E0\u304C\u52D5\u304F\u7A2E\u985E\u306E\u30D5\u30A1\u30A4\u30EB\u540D\u304C\u3042\u308A\u307E\u3059\u3002" },
  "ai-injection": { level: "danger", text: "AI \u306B\u547D\u4EE4\u3092\u51FA\u305D\u3046\u3068\u3059\u308B\u6587\u304C\u542B\u307E\u308C\u3066\u3044\u307E\u3059 (AI \u306B\u8AAD\u307E\u305B\u306A\u3044\u3067\u304F\u3060\u3055\u3044)\u3002" },
  "sender-spoof": { level: "danger", text: "\u5DEE\u51FA\u4EBA\u306E\u8868\u793A\u540D\u304C\u3001\u5B9F\u969B\u306E\u30A2\u30C9\u30EC\u30B9\u3068\u5225\u306E\u9001\u308A\u4E3B\u3092\u540D\u4E57\u3063\u3066\u3044\u307E\u3059\u3002" },
  "lookalike-host": { level: "caution", text: "\u898B\u305F\u76EE\u306E\u4F3C\u305F\u5225\u306E\u6587\u5B57\u3092\u4F7F\u3048\u308B\u5F62\u306E\u5B9B\u5148 (\u56FD\u969B\u5316\u30C9\u30E1\u30A4\u30F3) \u304C\u3042\u308A\u307E\u3059\u3002" },
  "ip-host": { level: "caution", text: "\u540D\u524D\u3067\u306F\u306A\u304F\u6570\u5B57 (IP \u30A2\u30C9\u30EC\u30B9) \u3067\u66F8\u304B\u308C\u305F\u884C\u304D\u5148\u304C\u3042\u308A\u307E\u3059\u3002" },
  "shortened-link": { level: "caution", text: "\u77ED\u7E2E\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059 (\u672C\u5F53\u306E\u884C\u304D\u5148\u304C\u898B\u3048\u307E\u305B\u3093)\u3002" },
  "redirect-link": { level: "caution", text: "\u5225\u306E\u30DA\u30FC\u30B8\u3078\u8EE2\u9001\u3059\u308B\u5F62\u306E\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059 (\u6700\u5F8C\u306E\u884C\u304D\u5148\u304C\u898B\u304B\u3051\u3068\u9055\u3046\u3053\u3068\u304C\u3042\u308A\u307E\u3059)\u3002" },
  "plain-http": { level: "caution", text: "\u6697\u53F7\u5316\u3055\u308C\u3066\u3044\u306A\u3044 (http \u306E) \u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "odd-port": { level: "caution", text: "\u901A\u5E38\u3068\u9055\u3046\u51FA\u5165\u53E3 (\u30DD\u30FC\u30C8\u756A\u53F7) \u3092\u6307\u5B9A\u3057\u305F\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "other-scheme": { level: "caution", text: "\u30A6\u30A7\u30D6\u4EE5\u5916\u306E\u5B9B\u5148 (\u5225\u306E\u30A2\u30D7\u30EA\u3092\u958B\u304F\u5F62) \u306E\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "unreadable-link": { level: "caution", text: "\u5F62\u304C\u5D29\u308C\u3066\u3044\u3066\u884C\u304D\u5148\u3092\u8AAD\u307F\u53D6\u308C\u306A\u3044\u30EA\u30F3\u30AF\u304C\u3042\u308A\u307E\u3059\u3002" },
  "macro-file": { level: "caution", text: "\u4E2D\u306B\u30D7\u30ED\u30B0\u30E9\u30E0 (\u30DE\u30AF\u30ED) \u3092\u6301\u3066\u308B\u7A2E\u985E\u306E\u30D5\u30A1\u30A4\u30EB\u540D\u304C\u3042\u308A\u307E\u3059\u3002" },
  "hidden-chars": { level: "caution", text: "\u76EE\u306B\u898B\u3048\u306A\u3044\u6587\u5B57\u304C\u6DF7\u3056\u3063\u3066\u3044\u307E\u3059 (\u6587\u306E\u4E00\u90E8\u3092\u96A0\u3059\u30FB\u4E26\u3073\u3092\u5165\u308C\u66FF\u3048\u308B\u9053\u5177\u3067\u3059)\u3002" },
  "account-pressure": { level: "caution", text: "\u30A2\u30AB\u30A6\u30F3\u30C8\u306E\u505C\u6B62\u30FB\u78BA\u8A8D\u306A\u3069\u3092\u7406\u7531\u306B\u3001\u6025\u304C\u305B\u308B\u6587\u304C\u3042\u308A\u307E\u3059\u3002" },
  "asks-secret": { level: "caution", text: "\u30D1\u30B9\u30EF\u30FC\u30C9\u3084\u8A8D\u8A3C\u30B3\u30FC\u30C9\u306A\u3069\u306E\u5165\u529B\u30FB\u8FD4\u4FE1\u3092\u6C42\u3081\u308B\u6587\u304C\u3042\u308A\u307E\u3059\u3002" },
  "too-long": { level: "caution", text: "\u6587\u9762\u304C\u9577\u3059\u304E\u308B\u305F\u3081\u3001\u5148\u982D\u306E\u4E00\u90E8\u3060\u3051\u3092\u8ABF\u3079\u307E\u3057\u305F (\u6B8B\u308A\u306F\u8ABF\u3079\u3066\u3044\u307E\u305B\u3093)\u3002" }
};
var INBOUND_CODES = Object.keys(INBOUND_RULES);
var DANGEROUS_SCHEMES = /* @__PURE__ */ new Set(["javascript:", "vbscript:", "data:", "file:", "smb:", "ms-msdt:", "search-ms:", "ms-officecmd:"]);
var SHORTENER_HOSTS = /* @__PURE__ */ new Set([
  "bit.ly",
  "t.co",
  "tinyurl.com",
  "goo.gl",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "lnkd.in",
  "x.gd",
  "t.ly",
  "shorturl.at",
  "tiny.cc",
  "rb.gy",
  "onl.li"
]);
var EXECUTABLE_EXTS = /* @__PURE__ */ new Set([
  "exe",
  "scr",
  "pif",
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "msi",
  "msp",
  "jar",
  "lnk",
  "iso",
  "img",
  "vhd",
  "apk",
  "dmg",
  "pkg",
  "reg",
  "chm",
  "cpl",
  "dll"
]);
var MACRO_EXTS = /* @__PURE__ */ new Set(["docm", "xlsm", "pptm", "dotm", "xlam"]);
var LINK_RE = /(?:\b[a-z][a-z0-9+.-]{1,30}:\/\/(?:\[[0-9a-f:.%]{2,60}\])?|\bwww\.)[^\s<>"'`[\]\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]*/gi;
var SCRIPT_SCHEME_RE = /\b(?:javascript|vbscript):|\bdata:[a-z]+\/[a-z0-9.+-]+/gi;
var TRAILING_PUNCT_RE = /[.,;:!?)\]}」』）。、]+$/;
var MARKDOWN_LINK_RE = /\[([^\]\n]{1,300})\]\(\s*([^)\s]{1,2000})/g;
var HTML_LINK_RE = /<a\b[^>]{0,500}?\bhref\s*=\s*["']?([^"'\s>]{1,2000})[^>]{0,500}>([^<]{1,300})</gi;
var HOST_TOKEN_RE = /(?:[a-z0-9-]+\.)+[a-z]{2,}/i;
var FILE_EXT_RE = /\.([a-z0-9]{2,4})(?![a-z0-9_-])/gi;
var LINKLIKE_RE = /^(?:[a-z][a-z0-9+.-]{1,30}:|www\.)/i;
var IPV4_HOST_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
var REDIRECT_PARAM_RE = /https?(?::|%3a)(?:\/|%2f){2}/i;
var HIDDEN_CHARS_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
var ACCOUNT_PRESSURE_RES = [
  /(?:アカウント|口座|カード|お支払い|支払方法|会員資格)[^\n。]{0,30}(?:停止|凍結|ロック|制限|無効|失効|解約|確認が必要|更新が必要)/,
  /(?:24|48|72)\s*時間以内に[^\n。]{0,30}(?:確認|手続|更新|ログイン|対応)/,
  /\b(?:account|password|payment|card)\b[^\n.]{0,40}\b(?:suspend(?:ed)?|locked|disabled|expire[sd]?|unusual|unauthori[sz]ed)\b/,
  /\bverify\s+your\s+(?:account|identity|payment)\b/
];
var ASKS_SECRET_RES = [
  /(?:パスワード|暗証番号|認証コード|確認コード|ワンタイム|セキュリティコード|カード番号|マイナンバー)[^\n。]{0,20}(?:入力|返信|送信|教えて|お知らせください|ご記入)/,
  /\b(?:enter|confirm|send|reply\s+with|provide)\b[^\n.]{0,30}\b(?:password|passcode|pin|verification\s+code|one[- ]time\s+code|card\s+number)\b/
];
function hit(tally, code, times = 1) {
  if (times <= 0) return;
  const before = tally.get(code);
  tally.set(code, before === void 0 ? times : before + times);
}
function countMatches(text, re) {
  return (text.match(re) ?? []).length;
}
function bareHost(host) {
  return host.toLowerCase().replace(/^www\./, "");
}
function sameSite(a, b) {
  const x = bareHost(a);
  const y = bareHost(b);
  return x === y || x.endsWith("." + y) || y.endsWith("." + x);
}
function parseLink(raw) {
  try {
    return new URL(/^www\./i.test(raw) ? "https://" + raw : raw);
  } catch {
    return null;
  }
}
function pathExtension(pathname) {
  return pathname.slice(pathname.lastIndexOf(".")).slice(1).toLowerCase();
}
function tallyLink(tally, raw) {
  const u = parseLink(raw);
  if (u === null) {
    hit(tally, "unreadable-link");
    return;
  }
  if (DANGEROUS_SCHEMES.has(u.protocol)) hit(tally, "dangerous-scheme");
  else if (u.protocol === "http:") hit(tally, "plain-http");
  else if (u.protocol !== "https:") hit(tally, "other-scheme");
  if (u.username !== "" || u.password !== "") hit(tally, "disguised-host");
  const host = u.hostname;
  if (host.startsWith("[") || IPV4_HOST_RE.test(host)) hit(tally, "ip-host");
  if (host.includes("xn--")) hit(tally, "lookalike-host");
  if (SHORTENER_HOSTS.has(bareHost(host))) hit(tally, "shortened-link");
  if (u.port !== "") hit(tally, "odd-port");
  if (REDIRECT_PARAM_RE.test(u.search + u.hash)) hit(tally, "redirect-link");
  const ext = pathExtension(u.pathname);
  if (EXECUTABLE_EXTS.has(ext)) hit(tally, "dangerous-file");
  else if (MACRO_EXTS.has(ext)) hit(tally, "macro-file");
}
function tallyShownTarget(tally, shown, href) {
  const named = HOST_TOKEN_RE.exec(shown);
  const u = parseLink(href);
  if (named === null || u === null || u.hostname === "") return;
  if (!sameSite(named[0], u.hostname)) hit(tally, "mismatched-link");
}
function extractLinks(text) {
  return (text.match(LINK_RE) ?? []).map((m) => m.replace(TRAILING_PUNCT_RE, ""));
}
function shownTargets(text) {
  return [
    ...[...text.matchAll(MARKDOWN_LINK_RE)].map((m) => ({ shown: m[1], href: m[2] })),
    ...[...text.matchAll(HTML_LINK_RE)].map((m) => ({ shown: m[2], href: m[1] }))
  ];
}
function tallySender(tally, sender) {
  const m = /(.*)<([^<>\s]+)>/.exec(sender);
  const address = m === null ? sender : m[2];
  const host = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  if (host.includes("xn--") || /[\u0080-\uffff]/.test(host)) hit(tally, "lookalike-host");
  const named = m === null ? null : HOST_TOKEN_RE.exec(m[1]);
  if (named !== null && !sameSite(named[0], host)) hit(tally, "sender-spoof");
}
function tallyText(tally, text) {
  const pairs = shownTargets(text);
  const links = /* @__PURE__ */ new Set([...extractLinks(text), ...pairs.map((p) => p.href).filter((href) => LINKLIKE_RE.test(href))]);
  for (const raw of links) tallyLink(tally, raw);
  const scripts = countMatches(text, SCRIPT_SCHEME_RE);
  hit(tally, "dangerous-scheme", scripts);
  for (const p of pairs) tallyShownTarget(tally, p.shown, p.href);
  for (const piece of text.split(LINK_RE)) {
    for (const m of piece.matchAll(FILE_EXT_RE)) {
      const ext = m[1].toLowerCase();
      if (EXECUTABLE_EXTS.has(ext)) hit(tally, "dangerous-file");
      else if (MACRO_EXTS.has(ext)) hit(tally, "macro-file");
    }
  }
  hit(tally, "hidden-chars", countMatches(text, HIDDEN_CHARS_RE));
  const norm = text.normalize("NFKC").toLowerCase();
  if (ACCOUNT_PRESSURE_RES.some((re) => re.test(norm))) hit(tally, "account-pressure");
  if (ASKS_SECRET_RES.some((re) => re.test(norm))) hit(tally, "asks-secret");
  if (detectPromptInjection(text) !== null) hit(tally, "ai-injection");
  return links.size + scripts;
}
function defangLink(raw) {
  const head = raw.slice(0, raw.indexOf("://") + 1);
  const scheme = head === "" ? "" : head.slice(0, -1).replace(/^http/i, "hxxp") + "[:]//";
  const rest = raw.slice(head.length).replace(/^\/\//, "");
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  const tail = end < 0 ? "" : rest.slice(end);
  return scheme + authority.replace(/\./g, "[.]").replace(/@/g, "[@]") + tail;
}
function defangText(text) {
  return text.replace(HIDDEN_CHARS_RE, "").replace(LINK_RE, defangLink).replace(/:\/\//g, "[:]//").replace(/\bwww\./gi, (m) => m.slice(0, 3) + "[.]").replace(SCRIPT_SCHEME_RE, (m) => m.replace(":", "[:]"));
}
function analyzeInbound(input) {
  const full = typeof input.text === "string" ? input.text : "";
  const tally = /* @__PURE__ */ new Map();
  const tooLong = moreThanChars(full, MAX_INBOUND_TEXT_CHARS);
  const text = tooLong ? clampToCeiling(full, MAX_INBOUND_TEXT_CHARS) : full;
  if (tooLong) hit(tally, "too-long");
  const links = tallyText(tally, text);
  if (typeof input.sender === "string") tallySender(tally, input.sender);
  const findings = INBOUND_CODES.filter((code) => tally.has(code)).map((code) => ({ code, level: INBOUND_RULES[code].level, text: INBOUND_RULES[code].text, count: tally.get(code) }));
  const level = findings.some((f) => f.level === "danger") ? "danger" : findings.length > 0 ? "caution" : "ok";
  return { level, findings, links, defanged: defangText(text) };
}

// src/shared/inboundWatch.ts
var MAX_WATCH_ITEMS = 200;
var MAX_WATCH_ID_CHARS = 200;
var MIN_CAUTION_KINDS = 2;
var WATCH_LABEL_DANGER = "\u691C\u75AB-\u5371\u967A\u306E\u7591\u3044";
var WATCH_LABEL_CAUTION = "\u691C\u75AB-\u8981\u6CE8\u610F";
function fieldOf(item, key) {
  return Object(item)[key];
}
function isString(v) {
  return typeof v === "string";
}
function watchLabelFor(level, kinds) {
  if (level === "danger") return WATCH_LABEL_DANGER;
  if (level === "caution" && kinds >= MIN_CAUTION_KINDS) return WATCH_LABEL_CAUTION;
  return null;
}
function judgeInboundItems(input) {
  if (!Array.isArray(input)) return { verdicts: [], malformed: 1, overLimit: 0 };
  const verdicts = [];
  let malformed = 0;
  let overLimit = 0;
  for (const item of input) {
    const id = fieldOf(item, "id");
    if (!isString(id) || id.trim() === "" || moreThanChars(id, MAX_WATCH_ID_CHARS)) {
      malformed += 1;
      continue;
    }
    if (verdicts.length >= MAX_WATCH_ITEMS) {
      overLimit += 1;
      continue;
    }
    const text = [fieldOf(item, "subject"), fieldOf(item, "body")].filter(isString).join("\n");
    const r = analyzeInbound({ text, sender: fieldOf(item, "sender") });
    verdicts.push({
      id,
      level: r.level,
      label: watchLabelFor(r.level, r.findings.length),
      codes: r.findings.map((f) => f.code),
      reasons: r.findings.map((f) => f.text)
    });
  }
  return { verdicts, malformed, overLimit };
}

// inbound-watch.entry.ts
var fs = require("node:fs");
var MAX_INPUT_BYTES = 33554432;
function fail(message) {
  process.stderr.write("inbound-watch: " + message + "\n");
  process.exit(2);
}
var file = process.argv[2];
if (typeof file !== "string" || file === "") fail("\u5165\u529B\u306E JSON \u30D5\u30A1\u30A4\u30EB\u3092 1 \u3064\u6E21\u3057\u3066\u304F\u3060\u3055\u3044");
var size = 0;
try {
  size = fs.statSync(file).size;
} catch {
  fail("\u5165\u529B\u30D5\u30A1\u30A4\u30EB\u3092\u958B\u3051\u307E\u305B\u3093");
}
if (size > MAX_INPUT_BYTES) fail("\u5165\u529B\u30D5\u30A1\u30A4\u30EB\u304C\u5927\u304D\u3059\u304E\u307E\u3059");
var parsed;
try {
  parsed = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("\u5165\u529B\u3092 JSON \u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093");
}
process.stdout.write(JSON.stringify(judgeInboundItems(parsed), null, 2) + "\n");
