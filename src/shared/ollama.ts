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

/**
 * 初回セットアップで入れてもらうモデル。約 1.3 GB と小さく、CPU だけでも動く。
 * 「まず 1 回動かす」ことが目的なので、賢さより **確実に載ること** を優先する
 * (大きいモデルはメモリ不足で最初の 1 回に失敗しやすく、そこで諦められてしまう)。
 * scripts/ollama-setup.sh も同じ値を使う (ollamaSetup.test.ts が一致を検証)。
 */
export const DEFAULT_SETUP_MODEL = 'llama3.2:1b';

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
  // 数値も文字列も同じ経路で見る。数値だけ別扱いにしても結果は変わらない
  // (1.5 → '1.5' は下の正規表現で落ち、Infinity → 'Infinity' も同じ) ので、
  // 分岐を置くと観測できない変異体が増えるだけだった。
  //
  // 10 進数字のみを受ける。Number() は '0x2b' を 43、'1e3' を 1000 と解釈するため、
  // そのまま通すと「入力した覚えのないポート」へ接続してしまう
  // (self-test で 0x2b → :43 を検出したので明示的に弾く)。
  const trimmed = String(port).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  // 正規表現が 10 進数字だけを通すので Number() の結果は必ず整数。
  const n = Number(trimmed);
  if (n < 1 || n > 65535) return null;
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
  // URL の pathname は最低でも '/' なので '' との比較は要らない
  // (書いても結果が変わらない = 観測できない分岐になる)。
  if (u.pathname !== '/') return false;
  return u.search === '' && u.hash === '';
}

/**
 * 接続先として許可するか。モジュール冒頭の 3 通りだけを通す。
 *
 * @param base         判定する base URL
 * @param pageHostname アプリを配信しているホスト名 (ブラウザなら location.hostname)。
 *                     空文字なら「同じホスト」条件は無効化される (Electron 版など)。
 */
// Stryker disable next-line StringLiteral: 既定値そのものは観測できない。
// 番人の値が入っても、後段は「ホスト名が一致しない / どの正規表現にも当たらない」
// という同じ結論に落ちるため、'' でも別の文字列でも結果が変わらない。
export function isAllowedOllamaBase(base: string, pageHostname = ''): boolean {
  // 文字列以外は弾く。`{ toString: () => 'http://127.0.0.1:11434' }` のような
  // オブジェクトは `new URL()` を通ってしまうため、ここで止める必要がある。
  // 空文字は `new URL('')` が throw するので下の catch に任せる。
  if (typeof base !== 'string') return false;
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
  //     `pageHostname !== ''` の前置きは要らない — http URL の hostname は必ず
  //     非空なので、pageHostname が空なら一致しようがない。
  return u.hostname === pageHostname.toLowerCase();
}

/** base + 許可パス を結合する。base が未許可 / パスが未許可なら null。 */
export function buildOllamaUrl(
  base: string,
  path: OllamaReadPath,
  // Stryker disable next-line StringLiteral: 上と同じ理由で既定値は観測できない。
  pageHostname = '',
): string | null {
  if (!isAllowedOllamaBase(base, pageHostname)) return null;
  if (!(OLLAMA_READ_PATHS as readonly string[]).includes(path)) return null;
  // 末尾スラッシュは高々 1 本。`isAllowedOllamaBase` が pathname === '/' しか
  // 通さないので、2 本以上ある base はここへ来ない (検査で固定してある)。
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * 利用者が入力した接続先文字列を正規化する。
 * 受け付ける形: `11434` (ポートのみ = ループバック) / `http://host:port` / `https://host`
 * ホスト名のみ・スキーム省略も http:// を補って解釈する。
 */
// Stryker disable next-line StringLiteral: 既定値そのものは観測できない。
// 番人の値が入っても、後段は「ホスト名が一致しない / どの正規表現にも当たらない」
// という同じ結論に落ちるため、'' でも別の文字列でも結果が変わらない。
export function parseOllamaEndpoint(input: string, pageHostname = ''): string | null {
  // Stryker disable next-line StringLiteral: 空文字は既定のループバックへ落ちる経路と
  // 同じ結論になるため、番人の値を入れても観測できない。
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

export function isSafeModelName(name: unknown): name is string {
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
    // isSafeModelName が非文字列を弾くので typeof の前置きは要らない。
    if (!isSafeModelName(m.name)) continue;
    // Number.isFinite は値を変換しないので、文字列も Infinity も false になる。
    const size = Number.isFinite(m.size as number) ? (m.size as number) : 0;
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

/* ───────────────────────  実 Ollama が返すエラーの解釈  ─────────────────────── */

/**
 * Ollama は失敗時に **HTTP ステータス + `{"error": "…"}` の封筒** を返す。
 * 生の本文をそのまま画面に出すと英語の内部メッセージが出るだけで、利用者は
 * 次に何をすればいいか分からない。ここで封筒を開けて種類に分類し、日本語の
 * 説明と「次の一手」に変換する。
 *
 * 実際に最初に踏むのはほぼ必ず model-not-found (まだ pull していないモデルを
 * 指定した) で、次が out-of-memory (端末のメモリより大きいモデル)。この 2 つを
 * 取り違えずに案内できるかが、使えるか使えないかの分かれ目になる。
 */

/** エラー文の表示上限。異常に長い本文をそのままログ・UI へ流さないための上限。 */
const MAX_ERROR_DETAIL = 300;

/** エラー封筒 `{"error": "…"}` から本文を取り出す。取れなければ空文字。 */
export function extractOllamaError(json: unknown, text = ''): string {
  const err = (json as { error?: unknown } | null)?.error;
  // 空判定は要らない — 空白だけの本文は trim すると '' になり、下へ落として
  // も最後は '' を返すので、書いても結果が変わらない分岐になる。
  if (typeof err === 'string') return err.trim().slice(0, MAX_ERROR_DETAIL);
  // 稀に {"error": {"message": "…"}} の入れ子で返す経路もある。
  const nested = (err as { message?: unknown } | null)?.message;
  if (typeof nested === 'string') return nested.trim().slice(0, MAX_ERROR_DETAIL);
  // JSON として読めたのに error が無いなら、本文を出しても情報がない。
  if (json !== null && json !== undefined) return '';
  // JSON ですらない本文 (Ollama が素の "Forbidden" を返す経路など) は短く返す。
  // Stryker disable next-line StringLiteral: text 省略時の '' は「空を返す」で、
  // 番人の値を入れても呼び出し側は同じ「詳細なし」として扱う。
  return (text ?? '').trim().slice(0, MAX_ERROR_DETAIL);
}

export type OllamaErrorKind =
  | 'model-not-found' // 指定したモデルが未取得
  | 'out-of-memory' // モデルが端末の空きメモリより大きい
  | 'runner-failed' // 推論プロセスが落ちた (壊れたモデル / GPU ドライバ等)
  | 'forbidden-origin' // OLLAMA_ORIGINS 未設定で拒否された
  | 'no-such-endpoint' // そのパスが無い (古い Ollama / 前段のプロキシ)
  | 'unknown';

/** ステータスとエラー本文から種類を判定する。 */
export function classifyOllamaError(status: number, detail: string): OllamaErrorKind {
  // Stryker disable next-line StringLiteral: detail 省略時の '' はどの正規表現にも
  // 当たらない。番人の値を入れても同じく当たらないので観測できない。
  const d = (detail ?? '').toLowerCase();
  if (/not found, try pulling it first|model .* not found|no such model/.test(d)) {
    return 'model-not-found';
  }
  if (/more system memory|out of memory|insufficient memory|not enough memory/.test(d)) {
    return 'out-of-memory';
  }
  if (/runner process has terminated|llama runner|error loading model|failed to load model/.test(d)) {
    return 'runner-failed';
  }
  if (status === 403) return 'forbidden-origin';
  if (status === 404) return 'no-such-endpoint';
  return 'unknown';
}

/** `model "llama3" not found, try pulling it first` からモデル名を取り出す。 */
export function extractMissingModel(detail: string): string {
  // Stryker disable next-line StringLiteral: detail 省略時の '' はこの正規表現に
  // 当たらない。番人の値を入れても当たらないので、既定値そのものは観測できない。
  const m = /model\s+["'“”`]?([A-Za-z0-9._:/-]+)["'“”`]?\s+not found/i.exec(detail ?? '');
  // isSafeModelName は unknown を受けるので undefined の前置きは要らない。
  return isSafeModelName(m?.[1]) ? m[1]! : '';
}

/**
 * 指定されたモデル名に近い **インストール済み** モデルを 1 つ提案する。
 * `llama3.2` と入力したが実体は `llama3.2:latest`、といった食い違いが実運用で
 * いちばん多いので、タグ補完 → 前方一致 の順に見る。無ければ空文字。
 */
export function suggestInstalledModel(requested: string, installed: string[]): string {
  // Stryker disable next-line StringLiteral: requested 省略時の '' は直後の
  // `want === ''` で早期に抜ける。番人の値でも一覧に一致せず '' を返す。
  const want = (requested ?? '').trim().toLowerCase();
  if (want === '') return '';
  // 空文字は後段のどの比較にも一致しないので、除外の判定は結果を変えない。
  // Stryker disable next-line ArrayDeclaration: installed 省略時の [] は「候補なし」。
  // 番人の要素が入っても要求名に一致しないので、どちらも '' を返す。
  const list = (installed ?? []).filter((n): n is string => typeof n === 'string');
  if (list.some((n) => n.toLowerCase() === want)) return ''; // 一致しているなら提案不要
  // split は必ず 1 要素以上返すので [0] は存在する。
  const baseOf = (n: string): string => n.toLowerCase().split(':')[0]!;
  const base = baseOf(want);
  return (
    list.find((n) => n.toLowerCase() === `${want}:latest`) ??
    list.find((n) => baseOf(n) === base) ??
    list.find((n) => n.toLowerCase().startsWith(base)) ??
    ''
  );
}

export interface OllamaErrorAdvice {
  kind: OllamaErrorKind;
  /** Ollama が返した生のエラー文 (無ければ空)。ログ・詳細表示用。 */
  detail: string;
  /** 利用者向けの 1 行説明。 */
  message: string;
  /** 次にやること。順序に意味がある (上から試す)。 */
  hints: string[];
}

/**
 * HTTP エラー応答を利用者向けの説明へ変換する。
 *
 * @param status   HTTP ステータス
 * @param detail   extractOllamaError の結果
 * @param ctx.model      リクエストで指定したモデル名 (chat のとき)
 * @param ctx.installed  /api/tags で取れたモデル名一覧 (あれば提案に使う)
 */
export function describeOllamaError(
  status: number,
  detail: string,
  ctx: { model?: string; installed?: string[] } = {},
): OllamaErrorAdvice {
  const kind = classifyOllamaError(status, detail);
  const requested = ctx.model ?? extractMissingModel(detail);
  const installed = ctx.installed ?? [];
  const hints: string[] = [];
  // 初期値は置かない — switch は default を含む全分岐で代入するので、
  // 初期値があっても読まれず、変異させても観測できない。
  let message: string;

  switch (kind) {
    case 'model-not-found': {
      const name = requested || extractMissingModel(detail) || '(不明)';
      message = `モデル「${name}」がまだ取得されていません。`;
      const near = suggestInstalledModel(name, installed);
      if (near !== '') hints.push(`インストール済みの「${near}」を指定すると動きます。`);
      hints.push(`取得する: ollama pull ${name}`);
      if (installed.length > 0) {
        hints.push(`現在あるモデル: ${installed.join(', ')}`);
      } else {
        hints.push('まだ 1 つもモデルがありません。例: ollama pull llama3.2');
      }
      break;
    }
    case 'out-of-memory':
      message = 'モデルが大きすぎて、この端末の空きメモリに載りませんでした。';
      hints.push('より小さいモデルを試す (例: llama3.2:1b / qwen2.5:0.5b)');
      hints.push('量子化の強い版を選ぶ (Q4_K_M など)');
      hints.push('他のアプリを閉じて空きメモリを増やす');
      break;
    case 'runner-failed':
      message = '推論プロセスが起動できませんでした (モデル破損 / GPU ドライバの可能性)。';
      hints.push(`モデルを取り直す: ollama rm ${requested || '<モデル>'} && ollama pull ${requested || '<モデル>'}`);
      hints.push('Ollama を再起動する');
      hints.push('CPU で動かす: OLLAMA_NUM_GPU=0 ollama serve');
      break;
    case 'forbidden-origin':
      message = 'Ollama にリクエストは届きましたが、接続元が許可されていません。';
      hints.push('Ollama 側に OLLAMA_ORIGINS を設定して再起動してください。');
      break;
    case 'no-such-endpoint':
      message = `Ollama がそのエンドポイントを知りません (HTTP ${status})。`;
      hints.push('Ollama のバージョンが古い可能性があります (ollama --version)。');
      hints.push('別のサーバがそのポートを使っていないか確認してください。');
      break;
    default:
      message = `Ollama が HTTP ${status} を返しました。`;
      if (detail !== '') hints.push(detail);
      break;
  }
  return { kind, detail: detail ?? '', message, hints };
}

/**
 * HTTP エラー応答の **生本文** から直接 advice を作る。
 * 呼び出し側 (main / CLI) が JSON.parse を各自で書くと、パース失敗時の扱いが
 * ばらつくので入口を 1 つにする。本文が空・非 JSON でも必ず結果を返す。
 */
export function adviseFromBody(
  status: number,
  body: string,
  ctx: { model?: string; installed?: string[] } = {},
): OllamaErrorAdvice {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    parsed = null;
  }
  return describeOllamaError(status, extractOllamaError(parsed, body), ctx);
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
