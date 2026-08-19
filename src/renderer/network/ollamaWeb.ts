/**
 * ブラウザ版から ローカル Ollama を読むクライアント。
 *
 * Electron 版 (`src/main/clients/ollama.ts`) と同じ制約 —— ループバック限定・
 * 読み取り 3 エンドポイントのみ・タイムアウト・サイズ上限 —— を
 * `src/shared/ollama.ts` の純関数で共有している。
 *
 * ## ブラウザ特有の壁: CORS
 *
 * Ollama は既定で CORS ヘッダを返さないため、`https://…github.io` や `file://`
 * から `http://127.0.0.1:11434` を fetch すると **サーバは動いているのにブラウザが
 * 結果を捨てる**。利用者にはどちらも「つながらない」に見えるので、原因を切り分けて
 * 提示しないと「壊れている」と誤解される。
 *
 * 切り分け方: 通常の fetch が失敗したあと `mode: 'no-cors'` で再試行する。
 * no-cors は opaque レスポンスを返すだけで中身は読めないが、**成功した=TCP で
 * 到達してレスポンスが返っている**ことは分かる。つまり
 *   - 通常 fetch 失敗 + no-cors 成功 → **起動しているが OLLAMA_ORIGINS 未設定**
 *   - 両方失敗                      → **起動していない / ポート違い**
 * と判定できる。前者は環境変数を 1 つ足せば直るので、その手順を UI に出す。
 *
 * なお `http://127.0.0.1` は Secure Contexts 仕様で "potentially trustworthy" と
 * 扱われるため、https ページからでも mixed content ブロックはされない (CORS だけが壁)。
 */

import {
  DEFAULT_OLLAMA_PORT,
  DEFAULT_SETUP_MODEL,
  MIN_SAFE_VERSION,
  adviseFromBody,
  buildOllamaUrl,
  buildWarnings,
  describeOllamaError,
  extractOllamaError,
  isSafeModelName,
  isVersionSafe,
  normalizeModels,
  parseOllamaEndpoint,
  type OllamaErrorAdvice,
  type OllamaSnapshot,
} from '../../shared/ollama';

/** 接続先設定の保存キー (localStorage)。UI と web-shim が共有する。
 *  値は「ポート番号のみ」または `http(s)://host:port`。旧 `…ollama.port` の値も読む。 */
export const OLLAMA_ENDPOINT_KEY = 'servicehub.ollama.endpoint';
/** 旧キー (ポート番号のみを保存していた)。後方互換のため読み取りだけ続ける。 */
export const OLLAMA_PORT_KEY = 'servicehub.ollama.port';

/** 保存済みの接続先設定を読む (新キー優先・無ければ旧キー・どちらも無ければ空)。 */
export function loadEndpointSetting(): string {
  try {
    return (
      localStorage.getItem(OLLAMA_ENDPOINT_KEY) ?? localStorage.getItem(OLLAMA_PORT_KEY) ?? ''
    );
  } catch {
    return '';
  }
}

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** 接続診断の結果種別。UI はこれを見て出す文言を変える。 */
export type OllamaProbeStatus =
  | 'ok' // 接続できてバージョン/モデルが読めた
  | 'cors-blocked' // 起動しているが OLLAMA_ORIGINS 未設定
  | 'csp-blocked' // 配信元の CSP がローカルへの接続そのものを禁じている
  | 'not-running' // 到達できない (未起動 / ポート違い / 別端末に届いていない)
  | 'bad-endpoint' // 入力された接続先が不正 or 許可外
  | 'error'; // 応答はあったが読めなかった (想定外)

/**
 * **配信元の CSP がローカル接続を禁じているか**を見張る。
 *
 * claude.ai のアーティファクトのように `connect-src 'self'` で配信されている場合、
 * fetch はサーバに届く前にブラウザが落とす。この失敗は「Ollama が起動していない」
 * ときと **区別がつかない** —— 通常 fetch も no-cors も同じように失敗するため、
 * 素直に判定すると `not-running` と誤診し、利用者を「Ollama を入れて起動する」
 * という **絶対に解決しない作業** へ送り込んでしまう。
 *
 * `securitypolicyviolation` イベントは CSP がブロックしたときだけ発火し、
 * blockedURI に対象が入る。これが出たなら原因は CSP だと確定できる。
 */
export interface CspWatcher {
  /** CSP 違反が観測されたか。 */
  hit: () => boolean;
  /** 監視をやめる (必ず呼ぶ)。 */
  stop: () => void;
}

/**
 * 違反イベントは **タスク** として配送されるため、fetch の reject 直後
 * (マイクロタスク連鎖の中) に読むとまだ届いていない。実ブラウザで
 * 「CSP が塞いだのに not-running と誤診する」のを再現したので、
 * 一度タスクキューへ譲ってから読む。
 */
const CSP_SETTLE_MS = 60;

async function settledCspHit(csp: CspWatcher): Promise<boolean> {
  if (csp.hit()) return true;
  await new Promise((resolve) => setTimeout(resolve, CSP_SETTLE_MS));
  return csp.hit();
}

export function createCspWatcher(url: string): CspWatcher {
  if (typeof document === 'undefined') {
    return { hit: () => false, stop: () => undefined };
  }
  let seen = false;
  const onViolation = (event: Event) => {
    const e = event as SecurityPolicyViolationEvent;
    // connect-src 違反の blockedURI はオリジンまでに切り詰められることがあるため、
    // 前方一致で照合する。ディレクティブ名だけでも判定材料にする。
    const blocked = typeof e.blockedURI === 'string' ? e.blockedURI : '';
    const directive = typeof e.violatedDirective === 'string' ? e.violatedDirective : '';
    if (blocked !== '' && url.startsWith(blocked)) seen = true;
    else if (directive.startsWith('connect-src')) seen = true;
  };
  document.addEventListener('securitypolicyviolation', onViolation);
  return {
    hit: () => seen,
    stop: () => document.removeEventListener('securitypolicyviolation', onViolation),
  };
}

export interface OllamaProbeResult {
  status: OllamaProbeStatus;
  /** 人間向けの説明 (UI にそのまま出せる)。 */
  message: string;
  /** ページ描画用のスナップショット。status !== 'ok' なら running: false。 */
  snapshot: OllamaSnapshot;
}

const emptySnapshot = (): OllamaSnapshot => ({
  running: false,
  version: '',
  versionSafe: false,
  versionMinRecommended: MIN_SAFE_VERSION,
  models: [],
  warnings: [],
});

/** タイムアウト付き fetch。中断・ネットワーク失敗は例外で伝える。 */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** サイズ上限つき JSON 読み取り。上限超過・非 JSON は null。 */
async function readJsonCapped(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * 起動しているのに CORS で弾かれているのかを判定する。
 * no-cors が通れば「到達している」ので CORS 未設定と結論できる。
 */
async function reachableButOpaque(fetchFn: typeof fetch, url: string): Promise<boolean> {
  try {
    await fetchWithTimeout(fetchFn, url, { mode: 'no-cors', cache: 'no-store' });
    return true;
  } catch {
    return false;
  }
}

/**
 * HTTP エラーを UI 用の結果へ整形する。**説明だけでなく最初の「次の一手」まで**
 * 載せる — 原因が分かっても手順が無ければ利用者は動けない。
 */
function httpError(status: number, advice: OllamaErrorAdvice): OllamaProbeResult {
  const hint = advice.hints[0];
  return {
    status: 'error',
    message:
      `Ollama が HTTP ${status} を返しました。${advice.message}` +
      (hint === undefined ? '' : ` ${hint}`),
    snapshot: emptySnapshot(),
  };
}

/**
 * Ollama を診断する。
 *
 * @param endpoint 接続先。ポート番号のみ (= ループバック) か `http(s)://host:port`。
 *                 空文字なら既定の `http://127.0.0.1:11434`。
 * @param fetchFn  テスト用に注入可能。
 * @param pageHostname アプリを配信しているホスト名。ブラウザでは location.hostname を
 *                 渡す。これにより「PC で配信したページをスマホから開く」構成で
 *                 同じホストの Ollama へ http 接続できる (shared/ollama.ts の方針 (2))。
 */
export async function probeOllama(
  endpoint: number | string = '',
  fetchFn: typeof fetch = fetch,
  pageHostname: string = typeof location !== 'undefined' ? location.hostname : '',
  watchCsp: (url: string) => CspWatcher = createCspWatcher,
): Promise<OllamaProbeResult> {
  const base = parseOllamaEndpoint(String(endpoint), pageHostname);
  if (base === null) {
    return {
      status: 'bad-endpoint',
      message:
        '接続先が不正か、許可されていません。ポート番号のみ (例 11434)、' +
        'このページと同じホストの http (例 http://192.168.1.10:11434)、' +
        'または https のトンネル URL を入力してください。',
      snapshot: emptySnapshot(),
    };
  }
  const versionUrl = buildOllamaUrl(base, '/api/version', pageHostname);
  const tagsUrl = buildOllamaUrl(base, '/api/tags', pageHostname);
  // parseOllamaEndpoint が許可済みの base を返すので null にはならない。
  // 型の narrowing のためだけのガード。
  if (versionUrl === null || tagsUrl === null) {
    return {
      status: 'error',
      message: '接続先 URL の組み立てに失敗しました。',
      snapshot: emptySnapshot(),
    };
  }

  let versionRes: Response;
  const csp = watchCsp(versionUrl);
  try {
    versionRes = await fetchWithTimeout(fetchFn, versionUrl, { cache: 'no-store' });
    csp.stop();
  } catch {
    // 通常 fetch が失敗 → 到達性だけ no-cors で確かめて原因を切り分ける。
    const reachable = await reachableButOpaque(fetchFn, versionUrl);
    // CSP でブロックされた場合、通常 fetch も no-cors も同じように失敗するため
    // 「未起動」と見分けがつかない。違反イベントが出ていたらそちらを優先する
    // (誤診したまま「Ollama を入れて起動」へ送ると、絶対に解決しない)。
    const cspBlocked = await settledCspHit(csp);
    csp.stop();
    if (cspBlocked) {
      return {
        status: 'csp-blocked',
        message:
          'このページの配信元が CSP でローカルへの接続を禁止しているため、Ollama へ接続できません。' +
          'Ollama の設定を変えても解決しません（ブラウザがリクエストを送る前に落としています）。' +
          '下の「この配布形態では接続できません」を参照してください。',
        snapshot: emptySnapshot(),
      };
    }
    return reachable
      ? {
          status: 'cors-blocked',
          message:
            `Ollama は ${base} で動作していますが、このページからの読み取りが CORS で拒否されました。` +
            'Ollama 側に OLLAMA_ORIGINS を設定して再起動してください (下の手順を参照)。',
          snapshot: emptySnapshot(),
        }
      : {
          status: 'not-running',
          message:
            `${base} に接続できませんでした。Ollama が起動しているか、接続先が合っているかを確認してください ` +
            '(同じ端末なら 11434 / 別端末からは下の「スマホなど別の端末から使う」を参照)。',
          snapshot: emptySnapshot(),
        };
  }

  let version = '';
  // /api/version が 404 なのは「古い Ollama にそのエンドポイントが無い」ケースが
  // ある (0.1.14 未満)。サーバ自体は生きているので、ここで打ち切らず /api/tags で
  // 生存を確かめ、読めたらバージョン不明のまま接続成功として扱う。
  let versionAdvice: ReturnType<typeof describeOllamaError> | null = null;
  if (versionRes.ok) {
    const versionJson = await readJsonCapped(versionRes);
    version =
      typeof (versionJson as { version?: unknown } | null)?.version === 'string'
        ? ((versionJson as { version: string }).version)
        : '';
  } else {
    const body = await readJsonCapped(versionRes);
    versionAdvice = describeOllamaError(versionRes.status, extractOllamaError(body, ''));
    // 403 は「届いているが接続元が許可されていない」= CORS 未設定と同じ直し方。
    // UI 側の設定手順をそのまま出したいので cors-blocked に寄せる。
    if (versionAdvice.kind === 'forbidden-origin') {
      return {
        status: 'cors-blocked',
        message:
          `Ollama は ${base} で動作していますが、このページからの読み取りが拒否されました (HTTP 403)。` +
          'Ollama 側に OLLAMA_ORIGINS を設定して再起動してください (下の手順を参照)。',
        snapshot: emptySnapshot(),
      };
    }
    if (versionRes.status !== 404) return httpError(versionRes.status, versionAdvice);
  }

  // モデル一覧は取れなくても致命ではない (バージョンが読めた時点で接続は成功)。
  // 逆にバージョンが読めていない場合は、ここが唯一の生存確認になる。
  let models: OllamaProbeResult['snapshot']['models'] = [];
  let tagsOk = false;
  try {
    const tagsRes = await fetchWithTimeout(fetchFn, tagsUrl, { cache: 'no-store' });
    if (tagsRes.ok) {
      models = normalizeModels(await readJsonCapped(tagsRes));
      tagsOk = true;
    }
  } catch {
    /* モデル一覧のみ失敗 — 空配列で続行 */
  }

  if (versionAdvice !== null && !tagsOk) return httpError(versionRes.status, versionAdvice);

  return {
    status: 'ok',
    message:
      `Ollama ${version || '(バージョン不明)'} に接続しました。モデル ${models.length} 件を検出。`,
    snapshot: {
      running: true,
      version,
      versionSafe: isVersionSafe(version),
      versionMinRecommended: MIN_SAFE_VERSION,
      models,
      warnings: buildWarnings(version),
    },
  };
}

/* ─────────────────────────────  チャット  ───────────────────────────── */

/** 生成は診断より時間がかかる。5 秒で切ると実用にならないので別枠にする。 */
const CHAT_TIMEOUT_MS = 120_000;
/** 送信サイズの上限 (main プロセス側の chat と同じ)。 */
const MAX_SYSTEM_CHARS = 8_192;
const MAX_PROMPT_CHARS = 32_768;

export type OllamaChatOutcome =
  | { ok: true; reply: string; durationMs: number }
  | { ok: false; kind: string; message: string };

export interface OllamaChatInput {
  model: string;
  prompt: string;
  system?: string;
  endpoint?: string;
}

/**
 * ブラウザ版からローカル Ollama へ 1 往復のチャットを投げる。
 *
 * Electron 版は main プロセスの `clients/ollama.ts` が同じことをする。ブラウザ版に
 * これが無いと **画面にチャット欄はあるのに送信だけ動かない**ので、同じ制約
 * (接続先 3 通り・/api/chat のみ・モデル名検証・NUL 拒否・長さ上限・タイムアウト)
 * でここに実装する。失敗時は shared/ollama.ts の分類器を通して「次の一手」まで返す。
 */
export async function chatOllama(
  input: OllamaChatInput,
  fetchFn: typeof fetch = fetch,
  pageHostname: string = typeof location !== 'undefined' ? location.hostname : '',
): Promise<OllamaChatOutcome> {
  const model = (input.model ?? '').trim();
  const prompt = (input.prompt ?? '').trim();
  const system = (input.system ?? '').trim();

  const base = parseOllamaEndpoint(input.endpoint ?? '', pageHostname);
  if (base === null) {
    return { ok: false, kind: 'bad-endpoint', message: '接続先が不正か、許可されていません。' };
  }
  if (!isSafeModelName(model)) {
    // isSafeModelName は unknown を受ける型ガードなので、否定側では never に
    // 狭まる。表示は明示的に文字列化する。
    return { ok: false, kind: 'bad-model', message: `モデル名が不正です: ${String(model).slice(0, 32)}` };
  }
  if (prompt === '') {
    return { ok: false, kind: 'empty-prompt', message: 'プロンプトを入力してください。' };
  }
  // NUL は上流パーサのバグの足がかりになるため送らない (main 版と同じ判断)。
  if (prompt.includes('\0') || system.includes('\0')) {
    return { ok: false, kind: 'bad-input', message: '入力に NUL 文字が含まれています。' };
  }

  const url = buildOllamaUrl(base, '/api/chat', pageHostname);
  if (url === null) {
    return { ok: false, kind: 'bad-endpoint', message: '接続先 URL の組み立てに失敗しました。' };
  }

  const messages: { role: string; content: string }[] = [];
  if (system !== '') messages.push({ role: 'system', content: system.slice(0, MAX_SYSTEM_CHARS) });
  messages.push({ role: 'user', content: prompt.slice(0, MAX_PROMPT_CHARS) });

  const started = now();
  let res: Response;
  const csp = createCspWatcher(url);
  try {
    res = await fetchWithTimeout(
      fetchFn,
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false }),
      },
      CHAT_TIMEOUT_MS,
    );
    csp.stop();
  } catch {
    // 診断と同じ切り分け: 配信元の CSP か / 到達しているのか / 届いていないのか。
    const reachable = await reachableButOpaque(fetchFn, url);
    const cspBlocked = await settledCspHit(csp);
    csp.stop();
    if (cspBlocked) {
      return {
        ok: false,
        kind: 'csp-blocked',
        message:
          'このページの配信元が CSP でローカルへの接続を禁止しているため送信できません。' +
          'Ollama 側の設定では解決しません。',
      };
    }
    return reachable
      ? {
          ok: false,
          kind: 'cors-blocked',
          message:
            `Ollama は ${base} で動作していますが、このページからの送信が CORS で拒否されました。` +
            'OLLAMA_ORIGINS を設定して再起動してください。',
        }
      : {
          ok: false,
          kind: 'not-running',
          message: `${base} に接続できませんでした。Ollama が起動しているか確認してください。`,
        };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // 未取得モデルのときだけ、実際にあるモデルを添えて案内する。
    const first = adviseFromBody(res.status, body, { model });
    const installed =
      first.kind === 'model-not-found' ? await listInstalledModels(fetchFn, base, pageHostname) : [];
    const advice = adviseFromBody(res.status, body, { model, installed });
    return { ok: false, kind: advice.kind, message: [advice.message, ...advice.hints].join(' ') };
  }

  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    return { ok: false, kind: 'too-large', message: '応答が大きすぎたため中断しました。' };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, kind: 'bad-response', message: 'Ollama が JSON 以外を返しました。' };
  }
  // HTTP 200 でも本文にエラーを載せてくる経路がある。
  const inline = extractOllamaError(parsed, '');
  if (inline !== '') {
    const advice = describeOllamaError(200, inline, { model });
    return { ok: false, kind: advice.kind, message: [advice.message, ...advice.hints].join(' ') };
  }

  const content = (parsed as { message?: { content?: unknown } } | null)?.message?.content;
  return {
    ok: true,
    reply: typeof content === 'string' ? content.trim() : '',
    durationMs: Math.max(0, Math.round(now() - started)),
  };
}

/** 経過時間の取得。performance が無い環境 (テスト) でも動くようにする。 */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** モデル名だけを引く (失敗しても案内を止めないので空配列)。 */
async function listInstalledModels(
  fetchFn: typeof fetch,
  base: string,
  pageHostname: string,
): Promise<string[]> {
  const url = buildOllamaUrl(base, '/api/tags', pageHostname);
  if (url === null) return [];
  try {
    const res = await fetchWithTimeout(fetchFn, url, { cache: 'no-store' });
    if (!res.ok) return [];
    return normalizeModels(await readJsonCapped(res)).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * **初回セットアップの全手順**を OS ごとに 1 ブロックへまとめる。
 *
 * originsSetupSteps は「Ollama は入っていて、あとは許可だけ」の人向け。
 * だが実際に詰まるのは *その手前* —— Ollama 自体が入っていない / モデルが 1 つも
 * 無い —— であることが多く、そこを飛ばした案内は「手順どおりにやったのに動かない」
 * になる。ここでは 導入 → モデル取得 → 許可 → 再起動 → 確認 を通しで出し、
 * **貼って実行すれば終わる**状態にする。
 *
 * 導入行は `command -v ollama` で分岐させ、既に入っている人には何もしない。
 * macOS だけは公式スクリプトが Linux 向けのため、アプリのダウンロードを案内する。
 */
export function setupCommands(
  origin: string,
  model: string = DEFAULT_SETUP_MODEL,
): { os: string; command: string }[] {
  const value = origin === 'null' || origin === '' ? '*' : origin;
  const verify = `sleep 3 && curl -s http://127.0.0.1:${DEFAULT_OLLAMA_PORT}/api/version`;
  return [
    {
      os: 'macOS',
      command:
        `# 1. Ollama を入れる — 未導入なら https://ollama.com/download から\n` +
        `#    Ollama.app を入れて一度起動 (ここだけ手作業)\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}\n` +
        `# 3. このページからの読み取りを許可して再起動\n` +
        `launchctl setenv OLLAMA_ORIGINS "${value}"\n` +
        `killall ollama 2>/dev/null; open -a Ollama\n` +
        `# 4. 確認 — {"version":"..."} が出れば成功\n` +
        verify,
    },
    {
      os: 'Linux (systemd)',
      command:
        `# 1. Ollama を入れる (入っていれば何もしません)\n` +
        `command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}\n` +
        `# 3. このページからの読み取りを許可して再起動\n` +
        `sudo mkdir -p /etc/systemd/system/ollama.service.d\n` +
        `printf '[Service]\\nEnvironment="OLLAMA_ORIGINS=${value}"\\n' \\\n` +
        `  | sudo tee /etc/systemd/system/ollama.service.d/origins.conf\n` +
        `sudo systemctl daemon-reload && sudo systemctl restart ollama\n` +
        `# 4. 確認 — {"version":"..."} が出れば成功\n` +
        verify,
    },
    {
      os: 'Windows (PowerShell)',
      command:
        `# 1. Ollama を入れる (入っていれば何もしません)\n` +
        `if (-not (Get-Command ollama -EA SilentlyContinue)) { winget install -e --id Ollama.Ollama }\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}\n` +
        `# 3. このページからの読み取りを許可して再起動\n` +
        `[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${value}", "User")\n` +
        `Get-Process ollama -EA SilentlyContinue | Stop-Process\n` +
        `Start-Process "$env:LOCALAPPDATA\\Programs\\Ollama\\ollama app.exe"\n` +
        `# 4. 確認 — {"version":"..."} が出れば成功\n` +
        `Start-Sleep 3; curl.exe -s http://127.0.0.1:${DEFAULT_OLLAMA_PORT}/api/version`,
    },
    {
      os: '1 回だけ試す (OS 共通・このターミナルは開いたまま)',
      command: `ollama pull ${model}\nOLLAMA_ORIGINS="${value}" ollama serve`,
    },
  ];
}

/**
 * **デスクトップ (Electron) 版向け**の初回セットアップ。
 *
 * main プロセスが直接叩くためブラウザの CORS が存在せず、`OLLAMA_ORIGINS` は
 * **一切不要**。setupCommands (ブラウザ版向け) をそのまま出すと、やらなくていい
 * sudo / launchctl 作業を初心者に課すことになるので、導入とモデル取得だけに絞る。
 */
export function desktopSetupCommands(model: string = DEFAULT_SETUP_MODEL): {
  os: string;
  command: string;
}[] {
  return [
    {
      os: 'Linux',
      command:
        `# 1. Ollama を入れる (入っていれば何もしません)\n` +
        `command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}`,
    },
    {
      os: 'macOS',
      command:
        `# 1. https://ollama.com/download から Ollama.app を入れて一度起動\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}`,
    },
    {
      os: 'Windows (PowerShell)',
      command:
        `# 1. Ollama を入れる (入っていれば何もしません)\n` +
        `if (-not (Get-Command ollama -EA SilentlyContinue)) { winget install -e --id Ollama.Ollama }\n` +
        `# 2. 軽いモデルを 1 つ入れる (約 1.3 GB)\n` +
        `ollama pull ${model}`,
    },
  ];
}

/** OS ごとの OLLAMA_ORIGINS 設定手順 (UI に出す)。origin は実行中のページのもの。 */
export function originsSetupSteps(origin: string): { os: string; command: string }[] {
  const value = origin === 'null' || origin === '' ? '*' : origin;
  return [
    {
      os: 'macOS',
      command: `launchctl setenv OLLAMA_ORIGINS "${value}" && killall ollama && open -a Ollama`,
    },
    {
      os: 'Linux (systemd)',
      command:
        `sudo systemctl edit ollama.service\n` +
        `# [Service] セクションに追記:\n` +
        `Environment="OLLAMA_ORIGINS=${value}"\n` +
        `sudo systemctl daemon-reload && sudo systemctl restart ollama`,
    },
    {
      os: 'Windows (PowerShell)',
      command:
        `[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${value}", "User")\n` +
        `# Ollama を終了して再起動`,
    },
    {
      os: '手元で試すだけ',
      command: `OLLAMA_ORIGINS="${value}" ollama serve`,
    },
  ];
}
