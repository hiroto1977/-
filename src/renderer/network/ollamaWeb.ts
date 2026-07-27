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
  MIN_SAFE_VERSION,
  buildLoopbackBase,
  buildOllamaUrl,
  buildWarnings,
  isVersionSafe,
  normalizeModels,
  type OllamaSnapshot,
} from '../../shared/ollama';

/** ポート設定の保存キー (localStorage)。UI と web-shim が共有する。 */
export const OLLAMA_PORT_KEY = 'servicehub.ollama.port';

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** 接続診断の結果種別。UI はこれを見て出す文言を変える。 */
export type OllamaProbeStatus =
  | 'ok' // 接続できてバージョン/モデルが読めた
  | 'cors-blocked' // 起動しているが OLLAMA_ORIGINS 未設定
  | 'not-running' // 到達できない (未起動 / ポート違い)
  | 'bad-port' // 入力ポートが不正
  | 'error'; // 応答はあったが読めなかった (想定外)

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
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
 * ローカル Ollama を診断する。
 *
 * @param port  既定 11434。文字列でも可 (UI の input から直接渡せる)。
 * @param fetchFn テスト用に注入可能。
 */
export async function probeOllama(
  port: number | string = DEFAULT_OLLAMA_PORT,
  fetchFn: typeof fetch = fetch,
): Promise<OllamaProbeResult> {
  const base = buildLoopbackBase(port);
  if (base === null) {
    return {
      status: 'bad-port',
      message: 'ポート番号は 1〜65535 の整数で入力してください。',
      snapshot: emptySnapshot(),
    };
  }
  const versionUrl = buildOllamaUrl(base, '/api/version');
  const tagsUrl = buildOllamaUrl(base, '/api/tags');
  // buildLoopbackBase の出力は必ずループバックなので null にはならない。
  // 型の narrowing のためだけのガード。
  if (versionUrl === null || tagsUrl === null) {
    return {
      status: 'error',
      message: '接続先 URL の組み立てに失敗しました。',
      snapshot: emptySnapshot(),
    };
  }

  let versionRes: Response;
  try {
    versionRes = await fetchWithTimeout(fetchFn, versionUrl, { cache: 'no-store' });
  } catch {
    // 通常 fetch が失敗 → 到達性だけ no-cors で確かめて原因を切り分ける。
    const reachable = await reachableButOpaque(fetchFn, versionUrl);
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
            `${base} に接続できませんでした。Ollama が起動しているか、ポートが合っているかを確認してください ` +
            '(既定は 11434 / `ollama serve` で起動)。',
          snapshot: emptySnapshot(),
        };
  }

  if (!versionRes.ok) {
    return {
      status: 'error',
      message: `Ollama が HTTP ${versionRes.status} を返しました。`,
      snapshot: emptySnapshot(),
    };
  }

  const versionJson = await readJsonCapped(versionRes);
  const version =
    typeof (versionJson as { version?: unknown } | null)?.version === 'string'
      ? ((versionJson as { version: string }).version)
      : '';

  // モデル一覧は取れなくても致命ではない (バージョンが読めた時点で接続は成功)。
  let models: OllamaProbeResult['snapshot']['models'] = [];
  try {
    const tagsRes = await fetchWithTimeout(fetchFn, tagsUrl, { cache: 'no-store' });
    if (tagsRes.ok) models = normalizeModels(await readJsonCapped(tagsRes));
  } catch {
    /* モデル一覧のみ失敗 — 空配列で続行 */
  }

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
