/**
 * 音声コマンド・コア (round 83) — 「全機能を話しかけるだけで進行するシステム」の中核。
 *
 * 本モジュールは **純粋ロジック (IO なし)** で、テキスト化済みの発話文字列を
 * 「意図 (intent)」へ解析し、実在の serviceId / action へルーティングする。
 * 実際の音声認識 (Web Speech API) は後続の薄いアダプタが担当し、ここには関与しない。
 *
 * パイプライン:
 *   発話文字列
 *     → normalizeUtterance()  正規化 (全角→半角 / カタカナ→ひらがな / 敬語・空白除去)
 *     → parseVoiceCommand()   意図解析 ({ kind, serviceId?, action?, params?, confidence })
 *     → routeCommand()        実在の serviceId/action へ解決 (曖昧なら候補リスト)
 *     → requiresConfirmation() 破壊的/外部送信/課金系は確認必須 (安全側)
 *     → disambiguate()        複数候補時の絞り込み
 *
 * SERVICE_IDS と整合させるため serviceId.ts を import する (変更はしない)。
 */

import { SERVICE_IDS, isServiceId, type ServiceId } from '../../shared/serviceId';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 解析された意図の種類。 */
export type IntentKind = 'navigate' | 'action' | 'query' | 'unknown';

/** parseVoiceCommand / routeCommand が返す意図。 */
export interface VoiceIntent {
  readonly kind: IntentKind;
  /** 解決済みサービス (navigate / action / query で設定)。 */
  readonly serviceId?: ServiceId;
  /** action 種別 (kind==='action' のとき)。例: 'create-issue'。 */
  readonly action?: string;
  /** 抽出された付随パラメータ (将来拡張用; 現状は最小限)。 */
  readonly params?: Readonly<Record<string, string>>;
  /** 0..1。マッチの確からしさ。unknown は 0。 */
  readonly confidence: number;
  /** 複数サービスがマッチした場合の候補 (曖昧)。 */
  readonly candidates?: readonly ServiceId[];
}

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

/** カタカナ → ひらがな (1 文字単位; 半角ｶﾅは先に NFKC で全角化される)。 */
function katakanaToHiragana(s: string): string {
  // U+30A1..U+30F6 を 0x60 引いて U+3041..U+3096 へ。長音符ーは対象外で残す。
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** 文末の敬語・丁寧表現を落とす (「〜してください」「〜して」「〜を」など)。 */
// Stryker disable all
const POLITE_SUFFIXES: readonly string[] = [
  'をお願いします',
  'お願いします',
  'をおねがいします',
  'おねがいします',
  'してください',
  'してくれ',
  'してね',
  'してよ',
  'できますか',
  'できる',
  'ください',
  'ちょうだい',
  'しといて',
  'しておいて',
  'たいです',
  'たい',
  'ますか',
  'ですか',
  'でしょうか',
  'なのか',
];
// Stryker restore all

function stripPoliteSuffixes(s: string): string {
  let out = s;
  // 末尾から繰り返し剥がす。
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of POLITE_SUFFIXES) {
      if (out.length > suf.length && out.endsWith(suf)) {
        out = out.slice(0, out.length - suf.length);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * 発話文字列を正規化する。
 * - NFKC で全角英数記号 / 半角カナを正規化
 * - 小文字化
 * - カタカナ → ひらがな
 * - 空白・句読点・記号を除去
 * - 末尾の敬語表現を除去
 */
export function normalizeUtterance(text: string): string {
  if (typeof text !== 'string') return '';
  let s = text.normalize('NFKC').toLowerCase();
  s = katakanaToHiragana(s);
  // 空白・句読点・約物を除去 (英数字とひらがな・漢字・長音符は残す)。
  // Stryker disable next-line Regex: 文字クラスの個々の約物は等価変異が多発。除去「ロジック」は実テストで撃墜。
  s = s.replace(/[\s、。．，！？!?「」『』（）()・,.\-_/\\:;~〜＋"'`]+/g, '');
  s = stripPoliteSuffixes(s);
  return s;
}

// ---------------------------------------------------------------------------
// サービス別名辞書
// ---------------------------------------------------------------------------

/**
 * serviceId → 別名 (正規化後の表記)。SERVICE_IDS と整合。
 * 音声認識 (Web Speech API) の出力は漢字混じりになるため、漢字・ひらがな・
 * カタカナ・英語表記をすべて含める。比較は normalizeUtterance を通した形
 * (小文字・カタカナ→ひらがな・記号なし; 漢字はそのまま) で行われるため、
 * カタカナ別名はここでもひらがなで記述する。
 *
 * 注: 大量の文字列リテラル辞書のため StringLiteral / ArrayDeclaration mutation は
 * block-level disable する (罠#2)。マッチ「ロジック」自体は実テストで撃墜する。
 */
// Stryker disable all
const SERVICE_ALIASES: Readonly<Record<ServiceId, readonly string[]>> = {
  home: ['ほーむ', 'とっぷ', 'top', 'home'],
  github: ['github', 'ぎっとはぶ', 'ぎっと'],
  wordpress: ['wordpress', 'わーどぷれす', 'wp'],
  atlassian: ['atlassian', 'あとらしあん', 'jira', 'じら', 'confluence', 'こんふるえんす'],
  notion: ['notion', 'のーしょん'],
  drive: ['googledrive', 'gどらいぶ', 'どらいぶ', 'drive', 'ぐーぐるどらいぶ'],
  calendar: ['googlecalendar', 'かれんだー', 'calendar', '予定', 'よてい', 'すけじゅーる'],
  gmail: ['gmail', 'じーめーる', 'めーる', '메일', 'mail', 'メール'],
  slack: ['slack', 'すらっく'],
  canva: ['canva', 'きゃんば'],
  skills: ['skills', 'すきる', 'skill'],
  security: ['security', 'せきゅりてぃ', '安全', 'あんぜん'],
  cloudflare: ['cloudflare', 'くらうどふれあ'],
  emotions: ['emotions', '感情', 'かんじょう', 'えもーしょん', '気分', 'きぶん'],
  ollama: ['ollama', 'おらま', 'ろーかるllm'],
  kpi: ['kpi', 'けーぴーあい', 'bep', '損益分岐', 'そんえきぶんき'],
  stocks: ['stocks', '株価', '株', 'かぶか', 'かぶ', 'stock', '証券', 'しょうけん'],
  business: ['事業ダッシュボード', '事業だっしゅぼーど', 'じぎょうだっしゅぼーど', 'びじねすだっしゅぼーど', 'だっしゅぼーど', '事業', 'じぎょう'],
  teamradar: ['チームレーダー', 'ちーむれーだー', 'teamradar', 'れーだー'],
  templates: ['テンプレート', 'てんぷれーと', 'templates', '雛形', 'ひながた', 'template'],
  library: ['ライブラリ', 'らいぶらり', 'library', '資料', 'しりょう'],
  settings: ['設定', 'せってい', 'settings', 'こんふぃぐ', 'setting'],
  'uber-eats': ['ubereats', 'うーばーいーつ', 'うーばー'],
  'demae-can': ['出前館', 'でまえかん', 'でまえ', 'demaecan'],
  'real-estate': ['不動産投資', 'ふどうさんとうし', '不動産', 'ふどうさん', 'realestate'],
  'mutual-funds': ['投資信託', 'とうししんたく', 'ふぁんど', 'mutualfunds', '信託', 'しんたく'],
  quality: ['品質ダッシュボード', '品質', 'ひんしつ', 'quality', 'くおりてぃ'],
  'microsoft-365': ['microsoft365', 'まいくろそふと', 'office365', 'おふぃす', 'ms365'],
  dropbox: ['dropbox', 'どろっぷぼっくす'],
  salesforce: ['salesforce', 'せーるすふぉーす'],
  discord: ['discord', 'でぃすこーど'],
  asana: ['asana', 'あさな'],
  linear: ['linear', 'りにあ'],
  sentry: ['sentry', 'せんとり'],
  shopify: ['shopify', 'しょっぴふぁい'],
  stripe: ['stripe', 'すとらいぷ'],
  line: ['line', 'らいん'],
  storage: ['ストレージ最適化', 'すとれーじ', 'storage', '容量', 'ようりょう'],
  'tax-accountant': ['税理士', 'ぜいりし'],
  'labor-consultant': ['社労士', 'しゃろうし', '社会保険労務士', 'しゃかいほけんろうむし'],
  lawyer: ['弁護士', 'べんごし'],
  'judicial-scrivener': ['司法書士', 'しほうしょし'],
  'admin-scrivener': ['行政書士', 'ぎょうせいしょし'],
  'sme-consultant': ['中小企業診断士', 'ちゅうしょうきぎょうしんだんし', '診断士', 'しんだんし'],
  'patent-attorney': ['弁理士', 'べんりし'],
  base: ['base', 'べーす'],
  netsea: ['netsea', 'ねっしー'],
  'super-delivery': ['すーぱーでりばりー', 'superdelivery'],
  topseller: ['topseller', 'とっぷせらー'],
  a8net: ['a8net', 'a8', 'えーはちねっと'],
  'ai-blogkun': ['aiぶろぐくん', 'ぶろぐくん', 'blogkun'],
  moneyforward: ['マネーフォワード', 'まねーふぉわーど', 'moneyforward', 'まねーふぉーわーど'],
  amazon: ['amazon', 'あまぞん'],
  'amazon-associates': ['amazonあそしえいと', 'あまぞんあそしえいと', 'あそしえいと'],
  sales: ['売上集計', '売上高', '売上', 'うりあげだか', 'うりあげしゅうけい', 'うりあげ', 'せーるす', 'sales'],
  team: ['チーム管理', 'ちーむかんり', 'チーム', 'ちーむ', 'team', 'めんばー'],
  youtube: ['youtube', 'ゆーちゅーぶ'],
  overview: ['経営サマリー', '経営さまりー', 'けいえいさまりー', 'さまりー', 'overview', '税引後利益', 'ぜいびきごりえき', '利益', 'りえき', '経営', 'けいえい'],
  coconala: ['ここなら', 'coconala'],
  tiktok: ['tiktok', 'てぃっくとっく'],
  tax: ['税務試算', '税務', 'ぜいむ', '税金', 'ぜいきん', 'tax', '納税', 'のうぜい'],
  funding: ['資金調達レーダー', '資金調達', 'しきんちょうたつ', 'funding', '融資', 'ゆうし'],
  freee: ['freee', 'ふりー', 'freee会計', '会計', 'かいけい'],
};
// Stryker restore all

// ---------------------------------------------------------------------------
// 動詞 → action / kind 辞書
// ---------------------------------------------------------------------------

interface ActionRule {
  readonly verbs: readonly string[];
  readonly action: string;
}

/**
 * 発話動詞から「アクション種別」を推定するためのルール。
 * SaaS の write 系 action 名 (create-issue / send-message / create-event 等) に対応。
 */
// Stryker disable all
const ACTION_RULES: readonly ActionRule[] = [
  { verbs: ['イシュー', 'いしゅー', 'issue', '課題作', 'かだいつく'], action: 'create-issue' },
  { verbs: ['メッセージ', 'めっせーじ', '送って', 'おくっ', '送信', 'そうしん', '投稿', 'とうこう'], action: 'send-message' },
  { verbs: ['イベント', 'いべんと', '予定作', 'よていつく', '予定登録', 'よていとうろく'], action: 'create-event' },
  { verbs: ['バックアップ', 'ばっくあっぷ', 'backup', '退避', 'たいひ'], action: 'backup' },
  { verbs: ['記録', 'きろく', '入力', 'にゅうりょく', '登録', 'とうろく', 'れこーど'], action: 'record-entry' },
  { verbs: ['削除', 'さくじょ', '消し', 'けし', '消す', 'でりーと', 'delete'], action: 'delete' },
];
// Stryker restore all

/**
 * navigate を示す典型動詞 (正規化後)。これらが含まれれば「表示・移動」の意図。
 * query を示す疑問語 (正規化後)。
 */
// Stryker disable all
const NAVIGATE_VERBS: readonly string[] = [
  '見せ', 'みせ', '見たい', 'みたい', '開い', 'ひらい', '開け', 'ひらけ', '行き', 'いき', '表示', 'ひょうじ', '出し', 'だし', 'ちぇっく', '確認', 'かくにん', '見て', 'みて',
];
const QUERY_MARKERS: readonly string[] = [
  'いくら', 'なんぼ', 'どれくらい', 'どのくらい', '何', 'なに', 'なん', '教え', 'おしえ', '知りたい', 'しりたい',
];
// Stryker restore all

// ---------------------------------------------------------------------------
// 別名マッチ
// ---------------------------------------------------------------------------

/**
 * 正規化済みテキストから、含まれるサービス候補を返す。
 * 複数サービスが一致する場合は全て返す (曖昧)。最長別名一致のサービスを先頭に置く。
 */
export function matchServices(normalized: string): readonly ServiceId[] {
  if (normalized.length === 0) return [];
  const hits: { id: ServiceId; aliasLen: number }[] = [];
  for (const id of SERVICE_IDS) {
    const aliases = SERVICE_ALIASES[id];
    let best = 0;
    for (const alias of aliases) {
      if (alias.length > 0 && normalized.includes(alias) && alias.length > best) {
        best = alias.length;
      }
    }
    if (best > 0) {
      hits.push({ id, aliasLen: best });
    }
  }
  if (hits.length === 0) return [];
  // 最長別名一致のサービスを最有力に (長さ降順で安定ソート)。
  hits.sort((a, b) => b.aliasLen - a.aliasLen);
  return hits.map((h) => h.id);
}

/** 正規化済みテキストに最初にマッチした action ルールを返す (なければ null)。 */
function matchAction(normalized: string): string | null {
  for (const rule of ACTION_RULES) {
    for (const verb of rule.verbs) {
      if (verb.length > 0 && normalized.includes(verb)) {
        return rule.action;
      }
    }
  }
  return null;
}

function containsAny(normalized: string, markers: readonly string[]): boolean {
  for (const m of markers) {
    if (m.length > 0 && normalized.includes(m)) return true;
  }
  return false;
}

/**
 * 生発話が疑問文か。正規化で記号が落ちる前に判定する必要があるため raw を受ける。
 * 末尾の疑問符 (? / ？) または末尾の「は」(「〜は?」省略形) を疑問とみなす。
 */
export function isQuestion(rawText: string): boolean {
  if (typeof rawText !== 'string') return false;
  // 末尾の空白を除いた最後の意味文字で判定。
  const trimmed = rawText.replace(/[\s。、．，]+$/u, '');
  if (trimmed.length === 0) return false;
  const last = trimmed[trimmed.length - 1]!;
  return last === '?' || last === '？';
}

// ---------------------------------------------------------------------------
// 意図解析
// ---------------------------------------------------------------------------

const UNKNOWN: VoiceIntent = { kind: 'unknown', confidence: 0 };

/**
 * 発話文字列を意図へ解析する。
 *
 * 判定順:
 *   1. 正規化 → 空なら unknown
 *   2. サービス候補を抽出
 *   3. action 動詞があれば kind='action'
 *   4. query マーカーがあり (navigate 動詞が無く) service があれば kind='query'
 *   5. service があれば kind='navigate'
 *   6. いずれも無ければ unknown
 */
export function parseVoiceCommand(text: string): VoiceIntent {
  const normalized = normalizeUtterance(text);
  if (normalized.length === 0) return UNKNOWN;

  const services = matchServices(normalized);
  const action = matchAction(normalized);
  const primary = services[0];
  const ambiguous = services.length > 1;

  // service が特定できない場合: service 非依存 action (backup) だけ拾う。
  if (primary === undefined) {
    if (action === 'backup') {
      return { kind: 'action', action: 'backup', confidence: 0.6 };
    }
    return UNKNOWN;
  }

  // action 意図 (動詞 + サービス)
  if (action !== null) {
    const conf = ambiguous ? 0.5 : action === 'backup' ? 0.8 : 0.9;
    return {
      kind: 'action',
      serviceId: primary,
      action,
      confidence: conf,
      ...(ambiguous ? { candidates: services } : {}),
    };
  }

  // query 意図 (疑問 + サービス)。navigate 動詞があれば navigate を優先。
  const navHit = containsAny(normalized, NAVIGATE_VERBS);
  const queryHit = containsAny(normalized, QUERY_MARKERS) || isQuestion(text);
  if (queryHit && !navHit) {
    return {
      kind: 'query',
      serviceId: primary,
      confidence: ambiguous ? 0.5 : 0.7,
      ...(ambiguous ? { candidates: services } : {}),
    };
  }

  // navigate 意図 (サービスのみ / 表示動詞)
  return {
    kind: 'navigate',
    serviceId: primary,
    confidence: ambiguous ? 0.5 : 0.7,
    ...(ambiguous ? { candidates: services } : {}),
  };
}

// ---------------------------------------------------------------------------
// ルーター
// ---------------------------------------------------------------------------

/** routeCommand が参照する実在の能力テーブル。 */
export interface AvailableCapabilities {
  /** 実在する serviceId 集合 (通常 SERVICE_IDS)。 */
  readonly serviceIds: readonly ServiceId[];
  /** serviceId → 実在 action 名集合。未登録のサービスは action 不可。 */
  readonly actions: Readonly<Partial<Record<ServiceId, readonly string[]>>>;
}

/**
 * intent を実在の serviceId / action へ解決する。
 * - serviceId が available.serviceIds に無ければ unknown
 * - action が available.actions[serviceId] に無ければ navigate へ降格 (action は破棄)
 * - 候補が複数残る曖昧ケースは candidates を保持したまま confidence 0.5 で返す
 */
export function routeCommand(
  intent: VoiceIntent,
  available: AvailableCapabilities,
): VoiceIntent {
  if (intent.kind === 'unknown') return UNKNOWN;

  // service 非依存 action (backup) はそのまま通す。
  if (intent.serviceId === undefined) {
    if (intent.kind === 'action' && intent.action !== undefined) {
      return intent;
    }
    return UNKNOWN;
  }

  const known = new Set<string>(available.serviceIds);
  if (!known.has(intent.serviceId)) {
    return UNKNOWN;
  }

  // 曖昧候補がある場合: available に存在する候補だけへ絞り込む。
  if (intent.candidates !== undefined && intent.candidates.length > 1) {
    const filtered = intent.candidates.filter((c) => known.has(c));
    if (filtered.length === 0) return UNKNOWN;
    if (filtered.length === 1) {
      const only = filtered[0]!;
      return resolveResolved(
        { ...intent, serviceId: only, candidates: undefined, confidence: bumpConfidence(intent) },
        available,
      );
    }
    return {
      ...intent,
      candidates: filtered,
      serviceId: filtered[0]!,
      confidence: 0.5,
    };
  }

  return resolveResolved(intent, available);
}

/** 曖昧解消後に confidence を確定値へ引き上げる。 */
function bumpConfidence(intent: VoiceIntent): number {
  return intent.kind === 'action' ? 0.9 : 0.7;
}

/** service が単一に確定した intent を action 有無で最終解決する。 */
function resolveResolved(intent: VoiceIntent, available: AvailableCapabilities): VoiceIntent {
  if (intent.kind !== 'action' || intent.action === undefined || intent.serviceId === undefined) {
    return intent;
  }
  const actions = available.actions[intent.serviceId] ?? [];
  if (actions.includes(intent.action)) {
    return intent;
  }
  // action が実在しなければ navigate へ降格。
  return {
    kind: 'navigate',
    serviceId: intent.serviceId,
    confidence: 0.6,
  };
}

// ---------------------------------------------------------------------------
// 確認要否
// ---------------------------------------------------------------------------

/**
 * 破壊的 / 外部送信 / 課金系 action は確認必須 (安全側 = true)。
 */
// Stryker disable all
const CONFIRM_ACTIONS: ReadonlySet<string> = new Set([
  'delete',
  'send-message',
  'create-issue',
  'create-event',
  'backup',
  'record-entry',
  'create-pr',
  'pay',
  'checkout',
  'purchase',
  'publish',
]);
const DANGEROUS_STEMS: readonly string[] = [
  'delete',
  'remove',
  'send',
  'pay',
  'buy',
  'purchase',
  'publish',
  'destroy',
  'create',
];
// Stryker restore all

/**
 * intent が実行前に確認を要するか。
 * - kind !== 'action' → false (navigate / query は副作用なし)
 * - action が CONFIRM_ACTIONS に含まれる → true
 * - action 名に破壊的/外部送信語幹を含む → 安全側で true
 * - それ以外の action → false
 */
export function requiresConfirmation(intent: VoiceIntent): boolean {
  if (intent.kind !== 'action') return false;
  const action = intent.action;
  if (action === undefined || action.length === 0) return false;
  if (CONFIRM_ACTIONS.has(action)) return true;
  // ヒューリスティック: 破壊的/外部送信を示す語幹を含むなら安全側で確認。
  const lowered = action.toLowerCase();
  for (const stem of DANGEROUS_STEMS) {
    if (lowered.includes(stem)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 曖昧性解消
// ---------------------------------------------------------------------------

/** disambiguate の結果。単一確定なら resolved、未確定なら candidates のみ。 */
export interface DisambiguationResult {
  readonly resolved?: ServiceId;
  readonly candidates: readonly ServiceId[];
}

/** 「いちばんめ」「つぎ」等の序数語で候補を選ぶためのルール。 */
// Stryker disable all
const ORDINAL_MARKERS: readonly { readonly tokens: readonly string[]; readonly index: number }[] = [
  { tokens: ['一番目', 'いちばんめ', '一つ目', 'ひとつめ', '最初', 'さいしょ', '1番目'], index: 0 },
  { tokens: ['二番目', 'にばんめ', '二つ目', 'ふたつめ', '次', 'つぎ', '2番目'], index: 1 },
  { tokens: ['三番目', 'さんばんめ', '三つ目', 'みっつめ', '3番目'], index: 2 },
];
// Stryker restore all

function pickByOrdinal(normalized: string, candidates: readonly ServiceId[]): ServiceId | null {
  for (const rule of ORDINAL_MARKERS) {
    for (const token of rule.tokens) {
      if (token.length > 0 && normalized.includes(token) && rule.index < candidates.length) {
        return candidates[rule.index]!;
      }
    }
  }
  return null;
}

/**
 * 複数候補から、追加の発話 (text) で 1 つへ絞り込む。
 * - 入力候補を実在 serviceId のみへ正規化
 * - text の別名一致 (最長優先) で確定を試みる
 * - 別名一致が無ければ序数語 (いちばんめ等) で選択
 * - 1 つに絞れれば resolved、未確定なら絞り込み後 candidates を返す
 */
export function disambiguate(
  text: string,
  candidates: readonly ServiceId[],
): DisambiguationResult {
  const valid = candidates.filter((c) => isServiceId(c));
  if (valid.length === 0) return { candidates: [] };
  if (valid.length === 1) return { resolved: valid[0]!, candidates: valid };

  const normalized = normalizeUtterance(text);
  if (normalized.length === 0) return { candidates: valid };

  // 候補のうち、発話にマッチするものを抽出 (最長別名一致を優先)。
  const matched: { id: ServiceId; len: number }[] = [];
  for (const id of valid) {
    let best = 0;
    for (const alias of SERVICE_ALIASES[id]) {
      if (alias.length > 0 && normalized.includes(alias) && alias.length > best) {
        best = alias.length;
      }
    }
    if (best > 0) matched.push({ id, len: best });
  }

  if (matched.length === 0) {
    const ordinal = pickByOrdinal(normalized, valid);
    if (ordinal !== null) return { resolved: ordinal, candidates: valid };
    return { candidates: valid };
  }

  matched.sort((a, b) => b.len - a.len);
  // 最長一致が単独 (1 件 or 2 位と差あり) なら確定。
  if (matched.length === 1 || matched[0]!.len > matched[1]!.len) {
    return { resolved: matched[0]!.id, candidates: valid };
  }
  // 同点複数 → 絞り込んだ候補のみ返す。
  return { candidates: matched.map((m) => m.id) };
}
