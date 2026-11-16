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
var LABEL_ROLE_HIJACK = "AI の役割を乗っ取る指示";
var LABEL_INSTRUCTION_OVERRIDE = "これまでの指示を無視・上書きさせる指示";
var LABEL_HIDDEN_DIRECTIVE = "利用者に隠して動くよう求める指示";
var LABEL_DELIMITER_FORGERY = "システムの区切り (system / developer の印) の偽装";
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
  "dangerous-scheme": { level: "danger", text: "押すとプログラムや端末の機能が動く種類のリンクがあります (ウェブのページではありません)。" },
  "disguised-host": { level: "danger", text: "本物らしい名前を「@」の前に置いて、行き先を偽っているリンクがあります。" },
  "mismatched-link": { level: "danger", text: "表示されている宛先と、実際の行き先が違うリンクがあります。" },
  "dangerous-file": { level: "danger", text: "開くとプログラムが動く種類のファイル名があります。" },
  "ai-injection": { level: "danger", text: "AI に命令を出そうとする文が含まれています (AI に読ませないでください)。" },
  "sender-spoof": { level: "danger", text: "差出人の表示名が、実際のアドレスと別の送り主を名乗っています。" },
  "lookalike-host": { level: "caution", text: "見た目の似た別の文字を使える形の宛先 (国際化ドメイン) があります。" },
  "ip-host": { level: "caution", text: "名前ではなく数字 (IP アドレス) で書かれた行き先があります。" },
  "shortened-link": { level: "caution", text: "短縮リンクがあります (本当の行き先が見えません)。" },
  "redirect-link": { level: "caution", text: "別のページへ転送する形のリンクがあります (最後の行き先が見かけと違うことがあります)。" },
  "plain-http": { level: "caution", text: "暗号化されていない (http の) リンクがあります。" },
  "odd-port": { level: "caution", text: "通常と違う出入口 (ポート番号) を指定したリンクがあります。" },
  "other-scheme": { level: "caution", text: "ウェブ以外の宛先 (別のアプリを開く形) のリンクがあります。" },
  "unreadable-link": { level: "caution", text: "形が崩れていて行き先を読み取れないリンクがあります。" },
  "macro-file": { level: "caution", text: "中にプログラム (マクロ) を持てる種類のファイル名があります。" },
  "hidden-chars": { level: "caution", text: "目に見えない文字が混ざっています (文の一部を隠す・並びを入れ替える道具です)。" },
  "account-pressure": { level: "caution", text: "アカウントの停止・確認などを理由に、急がせる文があります。" },
  "asks-secret": { level: "caution", text: "パスワードや認証コードなどの入力・返信を求める文があります。" },
  "too-long": { level: "caution", text: "文面が長すぎるため、先頭の一部だけを調べました (残りは調べていません)。" }
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
var WATCH_LABEL_DANGER = "検疫-危険の疑い";
var WATCH_LABEL_CAUTION = "検疫-要注意";
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
if (typeof file !== "string" || file === "") fail("入力の JSON ファイルを 1 つ渡してください");
var size = 0;
try {
  size = fs.statSync(file).size;
} catch {
  fail("入力ファイルを開けません");
}
if (size > MAX_INPUT_BYTES) fail("入力ファイルが大きすぎます");
var parsed;
try {
  parsed = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  fail("入力を JSON として読めません");
}
process.stdout.write(JSON.stringify(judgeInboundItems(parsed), null, 2) + "\n");
