/**
 * Ollama 連携の共有ロジック (main / renderer 両方から使う純関数)。
 *
 * Electron 版は `src/main/clients/ollama.ts` が Node の fetch で叩き、
 * ブラウザ版は `src/renderer/network/ollamaWeb.ts` が window.fetch で叩く。
 * **どちらも同じ制約でなければ意味がない**ので、判定ロジックはここに 1 つだけ置く。
 *
 * 守っている制約 (docs/OLLAMA_SECURITY.md — Probllama / CVE-2024-37032 と
 * 0.1.46 のまとめ、および未パッチのパーサ OOB read):
 *   - **接続先は 3 通りだけ** (isAllowedOllamaBase)。任意ホストへの http を許すと
 *     ページが内部ネットワークの探索に使える踏み台になるため、次に限定する:
 *       (1) ループバック (127.0.0.1 / localhost / ::1) — 同じ端末で動かす通常ケース
 *       (2) **ページ自身と同じホスト名** への http — PC で配信したページをスマホから
 *           開く場合。既に利用者がそのホストからアプリを読み込んでいるので、新たな
 *           到達先を与えていない (探索には使えない)
 *       (3) 任意の **https** エンドポイント — cloudflared / Tailscale Serve 等の
 *           トンネル経由。https なので https ページから mixed content で弾かれず、
 *           経路も暗号化される。相手側が CORS で明示的に許可しないと読めないため、
 *           ホスト名を絞らなくても「勝手に内部を覗く」ことはできない
 *     いずれの場合も **平文 http で別ホストへ** は許可しない (ブラウザの
 *     mixed content でも弾かれるうえ、プロンプトが平文で流れる)。
 *   - **読み取り 3 エンドポイントのみ**。/api/pull・/api/create・/api/push・
 *     /api/copy・/api/delete・/api/blobs は呼ばない — これらが上記 CVE の攻撃
 *     ベクトルであり、未パッチ OOB read の入口でもある。
 *   - バージョンが MIN_SAFE_VERSION 未満なら「脆弱」として UI に出す。
 */

export const MIN_SAFE_VERSION = '0.1.46';
export const DEFAULT_OLLAMA_PORT = 11434;

/** 許可するループバックホスト。これ以外は base URL として受け付けない。 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** 呼んでよいパス。書き込み系は意図的に含めない。 */
export const OLLAMA_READ_PATHS = ['/api/version', '/api/tags', '/api/chat'] as const;
export type OllamaReadPath = (typeof OLLAMA_READ_PATHS)[number];

/**
 * `http://127.0.0.1:11434` 形式のループバック base URL を組み立てる。
 * ポートが不正なら null (呼び出し側で入力エラーとして扱う)。
 */
export function buildLoopbackBase(port: number | string): string | null {
  let n: number;
  if (typeof port === 'number') {
    n = port;
  } else {
    // 10 進数字のみを受ける。Number() は '0x2b' を 43、'1e3' を 1000 と解釈するため、
    // そのまま通すと「入力した覚えのないポート」へ接続してしまう
    // (self-test で 0x2b → :43 を検出したので明示的に弾く)。
    const trimmed = String(port).trim();
    if (!/^\d+$/.test(trimmed)) return null;
    n = Number(trimmed);
  }
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return `http://127.0.0.1:${n}`;
}

/** ホスト名がループバックか。 */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname);
}

/** base URL の形が Ollama の接続先として妥当か (スキーム・認証情報・パスなし)。 */
function isWellFormedBase(u: URL): boolean {
  // 認証情報付き URL (http://user:pass@…) は拒否 — パーサ差異の温床。
  if (u.username !== '' || u.password !== '') return false;
  if (u.pathname !== '/' && u.pathname !== '') return false;
  return u.search === '' && u.hash === '';
}

/**
 * 接続先として許可するか。モジュール冒頭の 3 通りだけを通す。
 *
 * @param base         判定する base URL
 * @param pageHostname アプリを配信しているホスト名 (ブラウザなら location.hostname)。
 *                     空文字なら「同じホスト」条件は無効化される (Electron 版など)。
 */
export function isAllowedOllamaBase(base: string, pageHostname = ''): boolean {
  if (typeof base !== 'string' || base.length === 0) return false;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return false;
  }
  if (!isWellFormedBase(u)) return false;
  // (3) https は任意ホストを許可 — 相手が CORS で許可しない限り読めないため、
  //     ホスト名を絞らなくても内部探索には使えない。
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:') return false;
  // (1) ループバック
  if (isLoopbackHostname(u.hostname)) return true;
  // (2) ページ自身と同じホスト名 (PC で配信したページをスマホから開くケース)。
  //     大文字小文字は URL 側で正規化済み。pageHostname 側も揃える。
  return pageHostname !== '' && u.hostname === pageHostname.toLowerCase();
}

/** base + 許可パス を結合する。base が未許可 / パスが未許可なら null。 */
export function buildOllamaUrl(
  base: string,
  path: OllamaReadPath,
  pageHostname = '',
): string | null {
  if (!isAllowedOllamaBase(base, pageHostname)) return null;
  if (!(OLLAMA_READ_PATHS as readonly string[]).includes(path)) return null;
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * 利用者が入力した接続先文字列を正規化する。
 * 受け付ける形: `11434` (ポートのみ = ループバック) / `http://host:port` / `https://host`
 * ホスト名のみ・スキーム省略も http:// を補って解釈する。
 */
export function parseOllamaEndpoint(input: string, pageHostname = ''): string | null {
  const raw = (input ?? '').trim();
  if (raw === '') return buildLoopbackBase(DEFAULT_OLLAMA_PORT);
  // 数字のみ → ループバックのポート指定
  if (/^\d+$/.test(raw)) return buildLoopbackBase(raw);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  // ポート未指定なら Ollama の既定ポートを補う (https トンネルは 443 のままにする)。
  if (u.port === '' && u.protocol === 'http:') u.port = String(DEFAULT_OLLAMA_PORT);
  const base = `${u.protocol}//${u.host}`;
  return isAllowedOllamaBase(base, pageHostname) ? base : null;
}

/**
 * モデル識別子の検証。"llama3.2" / "qwen2.5-coder:7b" / "library/mistral:latest"
 * は許可し、空白・`..`・バックスラッシュ・スキーム記号などは拒否する。
 */
const MODEL_NAME_RE = /^[a-z0-9][a-z0-9._:/-]{0,127}$/i;

export function isSafeModelName(name: string): boolean {
  if (typeof name !== 'string') return false;
  if (name.includes('..')) return false;
  // 連続スラッシュは Ollama の正規なモデル名 (library/mistral:latest) には現れず、
  // URL 風の文字列 ('http://x/y') を弾くための防御。self-test で通過を検出した。
  if (name.includes('//')) return false;
  return MODEL_NAME_RE.test(name);
}

/** semver 風の比較。-1 / 0 / +1 を返す (Array.sort と同じ規約)。 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] => {
    // split は必ず 1 要素以上返すので [0] は常に存在する。オプショナル
    // チェーンと ?? '' は型の narrowing 用で、実行時には到達しない。
    // Stryker disable next-line OptionalChaining,StringLiteral
    const clean = v.split('-')[0]?.split('+')[0] ?? '';
    return clean.split('.').map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  // Stryker disable next-line EqualityOperator
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

/**
 * MIN_SAFE_VERSION 以上か。空文字や壊れた文字列は「安全でない」扱い —
 * 不明なバージョンを黙って通すより安全側に倒す。
 */
// Stryker disable next-line LogicalOperator,ConditionalExpression
export function isVersionSafe(version: string): boolean {
  // Stryker disable next-line LogicalOperator,ConditionalExpression
  if (!version || typeof version !== 'string') return false;
  // 型ガードで非文字列は弾かれ、compareVersions は文字列に対して throw しない
  // (split/map は String 上で全域)。この catch は到達不能。
  // Stryker disable BlockStatement,BooleanLiteral
  try {
    return compareVersions(version, MIN_SAFE_VERSION) >= 0;
  } catch {
    return false;
  }
  // Stryker restore BlockStatement,BooleanLiteral
}

/** 未パッチ OOB read についての運用上の注意 (毎スナップショットに載せる)。 */
export const UNPATCHED_OOB_NOTICE =
  'Ollama 本体に未パッチの out-of-bounds read (モデル/エンジンファイルパーサ) ' +
  'が公表されています。本アプリは /api/pull・/api/create・/api/push を呼ばない ' +
  '設計でこの攻撃ベクトルを遮断していますが、CLI からモデルを取得する場合は ' +
  '必ず Ollama 公式 library など検証済みソースのみを使用してください。詳細は ' +
  'docs/OLLAMA_SECURITY.md を参照。';

/** /api/tags の 1 件を UI 用に正規化した形。 */
export interface OllamaModelInfo {
  name: string;
  family: string;
  parameterSize: string;
  quantization: string;
  sizeMb: number;
  modifiedAt: string;
}

/** Ollama ページが描画する状態 (main / browser 共通)。 */
export interface OllamaSnapshot {
  running: boolean;
  version: string;
  versionSafe: boolean;
  versionMinRecommended: string;
  models: OllamaModelInfo[];
  warnings: string[];
}

/** /api/tags のレスポンスを OllamaModelInfo[] へ正規化する (未知形状は捨てる)。 */
export function normalizeModels(raw: unknown): OllamaModelInfo[] {
  const list = (raw as { models?: unknown } | null)?.models;
  if (!Array.isArray(list)) return [];
  const out: OllamaModelInfo[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const m = item as {
      name?: unknown;
      size?: unknown;
      modified_at?: unknown;
      details?: { family?: unknown; parameter_size?: unknown; quantization_level?: unknown };
    };
    if (typeof m.name !== 'string' || !isSafeModelName(m.name)) continue;
    const size = typeof m.size === 'number' && Number.isFinite(m.size) ? m.size : 0;
    out.push({
      name: m.name,
      family: typeof m.details?.family === 'string' ? m.details.family : '—',
      parameterSize: typeof m.details?.parameter_size === 'string' ? m.details.parameter_size : '—',
      quantization:
        typeof m.details?.quantization_level === 'string' ? m.details.quantization_level : '—',
      sizeMb: Math.round(size / (1024 * 1024)),
      modifiedAt: typeof m.modified_at === 'string' ? m.modified_at : '',
    });
  }
  return out;
}

/** バージョンから警告リストを組み立てる (UI 表示順を固定するため純関数化)。 */
export function buildWarnings(version: string): string[] {
  const warnings: string[] = [UNPATCHED_OOB_NOTICE];
  if (version !== '' && !isVersionSafe(version)) {
    warnings.unshift(
      `検出された Ollama ${version} は既知の脆弱性が修正された ${MIN_SAFE_VERSION} 未満です。` +
        'ただちに更新してください (Probllama / CVE-2024-37032 ほか)。',
    );
  }
  return warnings;
}
