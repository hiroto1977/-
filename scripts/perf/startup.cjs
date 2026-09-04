#!/usr/bin/env node
'use strict';

/*
 * 起動パフォーマンスの回帰ゲート (実 chromium・スマホ幅)。
 *
 *   npm run perf            # dist/standalone.html (フル版) と dist/standalone-lite.html を測定
 *
 * CI には入れていない。playwright/chromium は devDependencies に無く (グローバル導入前提)、
 * CI で入れると無料枠の分数を大きく消費するため、`npm run e2e` と同じくローカル/手動の
 * ゲートとして運用する。リリース前と、起動パスに触る変更のときに回すこと。
 *
 * 何を守っているか:
 *   単一ファイル配布なのでコード分割ができず、**モジュール評価時に走る処理が
 *   そのまま起動時間になる**。2026-07 に `KNOWLEDGE_CORPUS = buildCorpus()` が
 *   モジュールスコープで学術コーパス 8MB を JSON.parse していて、
 *   DOMContentLoaded 637ms / JS ヒープ 42.6MB を払っていた (誰も学術データを
 *   見ていない段階で)。遅延化して 360ms / 33.8MB になった。
 *   同じ回帰 (巨大データを起動時に触る) を数値と parse 検出の両方で捕まえる。
 *
 * 判定:
 *   1. 起動時に 1MB を超える JSON.parse が走ったら FAIL (遅延が壊れた印)
 *   2. DOMContentLoaded が閾値超過なら FAIL
 *   3. LITE 版がフル版より重かったら FAIL (LITE の意味が失われている)
 *
 * 閾値は「現状 + 余裕」で置く。CI ランナーは実機より遅いため厳しくしすぎない。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RUNS = 3; // 中央値を採る

/** 測定対象。file は dist 配下の相対パス。 */
const TARGETS = [
  { file: 'standalone-lite.html', label: 'LITE', maxDcl: 1200 },
  { file: 'standalone.html', label: 'FULL', maxDcl: 2500 },
];

function resolvePlaywright() {
  const candidates = [undefined, { paths: ['/opt/node22/lib/node_modules'] }];
  for (const opt of candidates) {
    try {
      return require(opt ? require.resolve('playwright', opt) : 'playwright');
    } catch {
      /* try next */
    }
  }
  return null;
}

const pw = resolvePlaywright();
if (!pw) {
  console.error('perf: playwright が見つかりません (グローバル導入環境で実行してください)');
  process.exit(2);
}

function serve(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(dir, rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(browser, port, file) {
  const samples = [];
  let bigParses = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    // 起動時に巨大 JSON.parse が走らないことを検出するため、読み込み前に差し込む。
    await page.addInitScript(() => {
      const orig = JSON.parse;
      window.__bigParses = [];
      JSON.parse = function (text, ...rest) {
        if (typeof text === 'string' && text.length > 1_000_000) {
          window.__bigParses.push(Math.round(text.length / 1e6));
        }
        return orig.call(this, text, ...rest);
      };
    });
    await page.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForFunction(() => document.getElementById('root')?.children.length > 0, {
      timeout: 120_000,
    });
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        dcl: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd),
        heap: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0,
        parses: window.__bigParses,
      };
    });
    /*
     * **フックが生きていることを毎回確かめる。**
     *
     * `JSON.parse` の計装が (addInitScript の失敗・上書き・API 変更で) 効いて
     * いなくても、`window.__bigParses` が空配列のままなら **「巨大 parse ゼロ」
     * という同じ報告が出る**。健全なのか計器が死んでいるのかを区別できない。
     *
     * 測り終えた**後**に既知の巨大 parse を 1 回走らせ、拾えたことを確認する
     * (測定への影響は無い)。同じ形を `smoke` にも入れてある (2026-08-24)。
     */
    const hookAlive = await page.evaluate(() => {
      const before = window.__bigParses.length;
      JSON.parse(JSON.stringify({ pad: 'x'.repeat(1_100_000) }));
      return window.__bigParses.length > before;
    });
    if (!hookAlive) {
      console.error(
        `❌ ${file}: JSON.parse の計装が働いていません — ` +
          '「巨大 parse ゼロ」が意味を持たないので止めます',
      );
      process.exit(2);
    }
    // 自己検査の分は数えない (本番の測定はこの行より前で終わっている)。
    m.parses = m.parses.filter((_, idx) => idx < m.parses.length - 1);

    samples.push(m);
    if (i === 0) bigParses = m.parses;
    await ctx.close();
  }
  return {
    dcl: median(samples.map((s) => s.dcl)),
    load: median(samples.map((s) => s.load)),
    heap: median(samples.map((s) => s.heap)),
    bigParses,
  };
}

(async () => {
  const dist = path.join(ROOT, 'dist');
  const missing = TARGETS.filter((t) => !fs.existsSync(path.join(dist, t.file)));
  if (missing.length > 0) {
    console.error(
      `perf: ${missing.map((m) => m.file).join(', ')} がありません — ` +
        '両方のブラウザ版を先に作ってください。**この順でないと片方が消えます** ' +
        '(vite の emptyOutDir が dist/ を掃除するため):\n' +
        '    npm run build:web && cp dist/standalone.html /tmp/full.html \\\n' +
        '      && npm run build:web:lite && cp /tmp/full.html dist/standalone.html\n' +
        '  `npm run build:renderer` も vite なので、走らせるならブラウザ版より**前に** ' +
        '(後ろだと両方消える。2026-08-26 に e2e.yml で実際にそうなっていた)',
    );
    process.exit(2);
  }

  // 存在だけでは足りない —— ビルドが失敗すると **前回の成果物が残る**ので、
  // 古いバンドルの起動性能を測って「問題なし」と報告してしまう。
  require('../lib/artifact-freshness.cjs').assertFreshArtifacts(
    TARGETS.map((t) => path.join(dist, t.file)),
    { srcDir: path.join(ROOT, 'src'), repoRoot: ROOT, tool: 'perf', allowEnv: 'SERVICE_HUB_PERF_ALLOW_STALE' },
  );

  const server = await serve(dist);
  const { port } = server.address();
  // executablePath はこのサンドボックス固有 (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)。
  // 無ければ playwright 自身の解決に任せるので、他環境でもそのまま動く。
  const bundled = '/opt/pw-browsers/chromium';
  const browser = await pw.chromium.launch({
    ...(fs.existsSync(bundled) ? { executablePath: bundled } : {}),
    args: ['--no-sandbox'],
  });

  const results = {};
  let failed = 0;
  for (const t of TARGETS) {
    const r = await measure(browser, port, t.file);
    results[t.label] = r;
    const sizeMb = (fs.statSync(path.join(dist, t.file)).size / 1048576).toFixed(2);
    console.log(
      `${t.label.padEnd(4)} ${t.file.padEnd(22)} ${sizeMb} MB  DCL ${r.dcl}ms  load ${r.load}ms  heap ${r.heap}MB`,
    );
    if (r.bigParses.length > 0) {
      console.error(
        `  ❌ 起動時に 1MB 超の JSON.parse が ${r.bigParses.length} 件 (${r.bigParses.join(', ')}MB) — ` +
          '巨大データの遅延読み込みが壊れています (src/renderer/data/lazyJsonArray.ts / ' +
          'assistantContext.knowledgeCorpus を確認)',
      );
      failed++;
    }
    if (r.dcl > t.maxDcl) {
      console.error(`  ❌ DOMContentLoaded ${r.dcl}ms > 上限 ${t.maxDcl}ms`);
      failed++;
    }
  }

  if (results.LITE.dcl > results.FULL.dcl) {
    console.error(
      `  ❌ LITE (${results.LITE.dcl}ms) がフル版 (${results.FULL.dcl}ms) より遅い — ` +
        'LITE ビルドで学術コーパスが除去できていない可能性',
    );
    failed++;
  }

  await browser.close();
  server.close();

  if (failed > 0) {
    console.error(`\nperf: ${failed} 件の回帰を検出しました`);
    process.exit(1);
  }
  console.log('\n✅ 起動パフォーマンス OK (起動時の巨大 JSON.parse ゼロ・閾値内)');
})().catch((err) => {
  console.error('perf: 測定に失敗しました —', err.message);
  process.exit(1);
});
