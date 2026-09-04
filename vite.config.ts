import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const electronOutDir = path.resolve(projectRoot, 'dist-electron');

// Sourcemaps embed full TypeScript source. Useful in dev (stack traces
// point at .ts lines), but in a packaged build they ship the entire
// privileged main-process source to every end user — which lowers the
// bar for finding bugs in token storage, OAuth, IPC handlers. Gate on
// production mode.
const isDev = process.env.NODE_ENV !== 'production' && process.env.VITE_DEV !== '0';

// Build-time startup optimization for the academic-knowledge dataset.
//
// `data/academicKnowledge.ts` holds ~4,100 verified concepts (~8.7 MB) as a
// plain TS array literal — the single largest module in the renderer bundle.
// Shipping it as a JS literal forces V8 to fully parse + construct the array
// eagerly at load: ~600 ms of main-thread time (measured), which is what the
// browser standalone spends on the loading screen before first paint. V8
// parses an equivalent JSON string ~50x faster (~11 ms), and it is smaller.
//
// This plugin rewrites *only the bundled output* of that module to
// `JSON.parse('…')`. The source .ts is never touched, so the append pipeline,
// the vitest suite (which imports the source) and the docs keep operating on it
// unchanged. It is best-effort: any hiccup falls back to the normal literal so
// the build can never be broken by the optimization. Build-only (dev keeps the
// literal for fast HMR).
function academicJsonParse(): Plugin {
  const TARGET = /[/\\]academicKnowledge\.ts$/;
  // U+2028 / U+2029 are illegal un-escaped in JS string literals on older
  // engines; built from an ASCII string to avoid embedding the raw chars here.
  const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');
  return {
    name: 'academic-json-parse',
    enforce: 'pre',
    apply: 'build',
    async transform(code, id) {
      if (!TARGET.test(id)) return null;
      // LITE ビルド (SERVICE_HUB_LITE=1): 学術コーパス (~8.2MB) を空にして
      // モバイル回線・WebView でも開けるサイズ (~2MB) の standalone を作る。
      // 型は tsc が実ソースで検査済みなので、ランタイム export のみ空にする。
      // コンプラ/補助金/相談窓口/経済史の各ナレッジはそのまま搭載される。
      if (process.env.SERVICE_HUB_LITE === '1') {
        this.warn('LITE build: academic corpus stripped (VERIFIED_CONCEPTS = [])');
        return { code: 'export const VERIFIED_CONCEPTS = [];\n', map: null };
      }
      try {
        const { code: cjs } = await transformWithEsbuild(code, id, {
          loader: 'ts',
          format: 'cjs',
        });
        const mod = { exports: {} as Record<string, unknown> };
        vm.runInNewContext(cjs, { module: mod, exports: mod.exports }, { timeout: 60000 });
        const concepts = mod.exports.VERIFIED_CONCEPTS;
        if (!Array.isArray(concepts) || concepts.length === 0) return null;
        const json = JSON.stringify(concepts);
        // Embed the JSON inside a SINGLE-quoted JS string literal: JSON uses
        // double quotes everywhere, so single-quoting leaves all of them
        // un-escaped — only backslashes, single quotes and the two line
        // separators need escaping. (Wrapping with JSON.stringify(json) would
        // escape ~100k structural quotes and bloat the bundle instead.)
        const esc = json
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(LINE_SEPARATORS, (c) => '\\u' + c.charCodeAt(0).toString(16));
        this.warn(
          `inlined ${concepts.length} concepts as JSON.parse (${(json.length / 1e6).toFixed(2)} MB)`,
        );
        // lazyJsonArray でラップして、**最初に触られるまで parse しない**。
        // 直接 JSON.parse を書くとモジュール評価時 (= アプリ起動時) に走ってしまい、
        // 学術データを使わない利用者まで 8MB のパースと数万オブジェクト生成を負担する。
        // 実測 (chromium・スマホ幅・中央値): JS ヒープ 41.5MB → 33.6MB、
        // DOMContentLoaded 637ms → 345ms。振る舞いは
        // src/renderer/data/__tests__/lazyJsonArray.test.ts で固定し、
        // 回帰は `npm run perf` (起動時の巨大 JSON.parse を検出) で防ぐ。
        return {
          code:
            `import { lazyJsonArray } from './lazyJsonArray';\n` +
            `export const VERIFIED_CONCEPTS = /*#__PURE__*/ lazyJsonArray('${esc}');\n`,
          map: null,
        };
      } catch (err) {
        this.warn(`skipped (${(err as Error).message}); falling back to literal`);
        return null;
      }
    },
  };
}

// Vite HMR は 5173 へ WebSocket を張るので、開発時だけ CSP にその origin が要る。
// index.html には**書かない** — Electron 版はあの meta をそのまま同梱するので、
// 書いておくと製品版のレンダラが 5173 を握るローカルプロセスへ通信できてしまう
// (画面遷移側は main.ts の allowNavigation が既に isDev で閉じている)。
// 「製品で消す」ではなく「開発で足す」向きにしてあるのは、処理が壊れたときに
// 壊れるのが製品の防御ではなく開発時の HMR になるようにするため。
function devCspOrigins(): Plugin {
  const req = createRequire(import.meta.url);
  const { addDevOriginsToCsp } = req('./scripts/dev-csp.cjs') as {
    addDevOriginsToCsp: (html: string) => string;
  };
  return {
    name: 'dev-csp-origins',
    apply: 'serve',
    transformIndexHtml(html: string) {
      return addDevOriginsToCsp(html);
    },
  };
}

export default defineConfig({
  root: 'src/renderer',
  plugins: [
    academicJsonParse(),
    devCspOrigins(),
    react(),
    electron([
      {
        entry: path.resolve(projectRoot, 'src/main/main.ts'),
        vite: {
          build: {
            outDir: electronOutDir,
            sourcemap: isDev,
            emptyOutDir: false,
          },
        },
      },
      {
        entry: path.resolve(projectRoot, 'src/preload/preload.ts'),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: electronOutDir,
            sourcemap: isDev ? 'inline' : false,
            emptyOutDir: false,
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
