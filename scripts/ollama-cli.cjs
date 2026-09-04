#!/usr/bin/env node
'use strict';

/*
 * Ollama を **ブラウザを介さず** Node から直接使う CLI。
 *
 *   npm run ollama                              # 状態確認 (バージョン + モデル一覧)
 *   npm run ollama -- --port 11500              # ポート指定
 *   npm run ollama -- chat llama3.2 "こんにちは"  # 1 往復のチャット
 *   npm run ollama -- chat llama3.2 "要約して" --system "あなたは要約器です"
 *   npm run ollama -- --json                    # 機械可読出力
 *
 * ## なぜ CLI を用意するのか
 *
 * ブラウザ版で Ollama に繋ぐには CORS (OLLAMA_ORIGINS) を設定する必要があり、
 * https のページから平文 http のローカル機器へは mixed content でも弾かれる。
 * **これらはすべて「間にブラウザがいる」ことに由来する制約**で、Node から
 * 直接叩けば一つも発生しない。Claude Code のターミナルからそのまま使える経路として
 * これを用意する (Electron 版も main プロセスが叩くので同様に CORS 無縁)。
 *
 * ## 制約は UI 版と同一
 *
 * 判定ロジックは `src/shared/ollama.ts` を esbuild で読み込んで共有する。
 * よってループバック限定・読み取り/チャットの 3 エンドポイント限定・モデル名検証は
 * UI 版とまったく同じ (docs/OLLAMA_SECURITY.md)。/api/pull・/api/create・/api/push は
 * この CLI からも呼べない。
 *
 * 終了コード: 0 = 成功 / 1 = エラー / 2 = Ollama へ到達できない
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const REQUEST_TIMEOUT_MS = 120_000; // 生成は長くかかるので UI より緩く
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/**
 * src/shared/ollama.ts を CJS へ変換して読み込む (判定ロジックを UI 版と共有するため)。
 *
 * `new Function` / `vm` は使わない — lint:forbidden の invariant #9 (任意コード実行の禁止)
 * を CLI にも同じく適用する。代わりに一時ファイルへ書き出して普通に require する。
 * 読み込むのは自リポジトリのソースだけで、外部入力は経路上に存在しない。
 */
function loadShared() {
  const file = path.join(ROOT, 'src/shared/ollama.ts');
  const source = fs.readFileSync(file, 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'cjs' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'servicehub-ollama-'));
  const out = path.join(dir, 'ollama.cjs');
  try {
    fs.writeFileSync(out, code, { mode: 0o600 });
    return require(out);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const shared = loadShared();

function parseArgs(argv) {
  const out = { cmd: 'status', positional: [], port: '', system: '', json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--port') out.port = argv[++i] ?? '';
    else if (a === '--system') out.system = argv[++i] ?? '';
    else if (a === '--help' || a === '-h') out.cmd = 'help';
    else rest.push(a);
  }
  if (rest[0] === 'chat' || rest[0] === 'status') {
    out.cmd = rest[0];
    out.positional = rest.slice(1);
  } else if (rest.length > 0) {
    out.positional = rest;
  }
  return out;
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`応答が大きすぎます (${text.length} バイト)`);
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function unreachable(base, err) {
  console.error(`❌ ${base} に接続できませんでした (${err.message})`);
  console.error('');
  console.error('確認してください:');
  console.error('  1. Ollama が起動しているか — `ollama serve`');
  console.error('  2. ポートが合っているか — 既定 11434 / 変更時は `--port <番号>`');
  console.error('  3. この CLI は Ollama と **同じマシン** で実行する必要があります');
  console.error('     (リモートのコンテナからは手元の PC の Ollama へは届きません)');
  process.exit(2);
}

/** インストール済みモデル名だけを引く (失敗しても案内を止めないので空配列を返す)。 */
async function listModels(base) {
  try {
    const r = await fetchJson(shared.buildOllamaUrl(base, '/api/tags'), { cache: 'no-store' });
    return r.ok ? shared.normalizeModels(r.json).map((m) => m.name) : [];
  } catch {
    return [];
  }
}

/** describeOllamaError の結果を人間向けに出す (JSON モードでは構造化して出す)。 */
function reportError(advice, opts, exitCode = 1) {
  if (opts.json) {
    console.log(
      JSON.stringify(
        { ok: false, kind: advice.kind, message: advice.message, detail: advice.detail, hints: advice.hints },
        null,
        2,
      ),
    );
  } else {
    console.error(`❌ ${advice.message}`);
    if (advice.hints.length > 0) {
      console.error('');
      for (const h of advice.hints) console.error(`  → ${h}`);
    }
    if (advice.detail !== '' && advice.kind !== 'unknown') {
      console.error('');
      console.error(`  (Ollama からの応答: ${advice.detail.slice(0, 200)})`);
    }
  }
  process.exit(exitCode);
}

async function cmdStatus(base, opts) {
  const versionUrl = shared.buildOllamaUrl(base, '/api/version');
  let version = '';
  // /api/version が読めなかったときの HTTP エラー。/api/tags が通れば「接続は
  // できているがバージョンが読めない」だけなので、ここでは即終了しない。
  let versionError = null;
  try {
    const r = await fetchJson(versionUrl, { cache: 'no-store' });
    if (r.ok) {
      version = typeof r.json?.version === 'string' ? r.json.version : '';
    } else {
      versionError = shared.describeOllamaError(r.status, shared.extractOllamaError(r.json, r.text));
    }
  } catch (err) {
    unreachable(base, err);
  }

  let models = [];
  let tagsOk = false;
  try {
    const r = await fetchJson(shared.buildOllamaUrl(base, '/api/tags'), { cache: 'no-store' });
    if (r.ok) {
      models = shared.normalizeModels(r.json);
      tagsOk = true;
    } else if (versionError === null) {
      versionError = shared.describeOllamaError(r.status, shared.extractOllamaError(r.json, r.text));
    }
  } catch {
    /* モデル一覧のみ失敗 — 接続自体は成功している */
  }

  // /api/version が無いのは古い Ollama によくある (0.1.14 未満)。モデル一覧が
  // 読めているならサーバは生きているので、バージョン不明として接続成功にする。
  if (versionError !== null && !tagsOk) reportError(versionError, opts);

  const warnings = shared.buildWarnings(version);
  const versionSafe = shared.isVersionSafe(version);
  const versionUnknown = version === '';

  if (opts.json) {
    console.log(
      JSON.stringify(
        { running: true, base, version, versionSafe, models, warnings },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`✅ ${base} に接続しました`);
  console.log(
    `   バージョン: ${version || '(不明)'} ${
      // バージョン不明は「古い」とは限らない (/api/version が無い古い版か、
      // 前段のプロキシが返さないだけ)。断定を避けて注記だけ出す。
      versionUnknown ? '— /api/version が読めませんでした' : versionSafe ? '' : `⚠ 推奨 ${shared.MIN_SAFE_VERSION} 未満`
    }`,
  );
  console.log('');
  if (models.length === 0) {
    console.log('モデルがまだありません。例: `ollama pull llama3.2`');
  } else {
    console.log(`インストール済みモデル (${models.length} 件):`);
    const nameWidth = Math.max(...models.map((m) => m.name.length));
    for (const m of models) {
      console.log(
        `  ${m.name.padEnd(nameWidth)}  ${String(m.parameterSize).padStart(5)}  ` +
          `${m.quantization.padEnd(8)}  ${String(m.sizeMb).padStart(6)} MB`,
      );
    }
    console.log('');
    console.log(`使い方: npm run ollama -- chat ${models[0].name} "こんにちは"`);
  }
  if (!versionSafe && version !== '') {
    console.log('');
    console.log(`⚠ ${warnings[0]}`);
  }
}

async function cmdChat(base, opts) {
  const [model, ...promptParts] = opts.positional;
  const prompt = promptParts.join(' ');
  if (!model || prompt === '') {
    console.error('使い方: npm run ollama -- chat <モデル> "<プロンプト>" [--system "..."]');
    process.exit(1);
  }
  if (!shared.isSafeModelName(model)) {
    console.error(`❌ モデル名が不正です: ${model}`);
    process.exit(1);
  }

  const messages = [];
  if (opts.system !== '') messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const started = Date.now();
  let r;
  try {
    r = await fetchJson(shared.buildOllamaUrl(base, '/api/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages }),
    });
  } catch (err) {
    unreachable(base, err);
  }
  if (!r.ok) {
    // 実運用でいちばん多いのは「まだ pull していないモデルを指定した」ケース。
    // その場合だけ /api/tags を引いて、実際にあるモデルを一緒に出す
    // (生の英語エラーだけ出しても、次に何をすればいいか分からないため)。
    const detail = shared.extractOllamaError(r.json, r.text);
    let installed = [];
    if (shared.classifyOllamaError(r.status, detail) === 'model-not-found') {
      installed = await listModels(base);
    }
    reportError(shared.describeOllamaError(r.status, detail, { model, installed }), opts);
  }
  // Ollama は HTTP 200 でも本文に error を載せて返すことがある (ストリーム無効時)。
  const inlineError = shared.extractOllamaError(r.json, '');
  if (inlineError !== '') {
    reportError(shared.describeOllamaError(200, inlineError, { model }), opts);
  }
  const reply = typeof r.json?.message?.content === 'string' ? r.json.message.content.trim() : '';
  const ms = Date.now() - started;

  if (opts.json) {
    console.log(JSON.stringify({ model, reply, durationMs: ms }, null, 2));
    return;
  }
  console.log(reply || '(空の応答)');
  console.log('');
  console.log(`— ${model} · ${(ms / 1000).toFixed(1)}s`);
}

function help() {
  console.log(`Ollama CLI — ブラウザを介さずローカル LLM を使う

  npm run ollama                                   状態確認 (バージョン + モデル一覧)
  npm run ollama -- chat <モデル> "<プロンプト>"      1 往復のチャット
  npm run ollama -- chat <モデル> "..." --system "…"  システムプロンプト付き

オプション:
  --port <番号>   Ollama のポート (既定 11434)
  --json          機械可読な JSON で出力
  -h, --help      このヘルプ

接続先は http://127.0.0.1:<ポート> に固定です。呼び出すのは /api/version ・
/api/tags ・/api/chat の 3 つだけで、モデルを取得・削除する API は呼びません
(docs/OLLAMA_SECURITY.md)。Ollama と同じマシンで実行してください。`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.cmd === 'help') {
    help();
    return;
  }
  const base = shared.buildLoopbackBase(opts.port === '' ? shared.DEFAULT_OLLAMA_PORT : opts.port);
  if (base === null) {
    console.error(`❌ ポート番号が不正です: ${opts.port} (1〜65535 の整数で指定してください)`);
    process.exit(1);
  }
  if (opts.cmd === 'chat') await cmdChat(base, opts);
  else await cmdStatus(base, opts);
}

main().catch((err) => {
  console.error('❌ 想定外のエラー:', err.message);
  process.exit(1);
});
