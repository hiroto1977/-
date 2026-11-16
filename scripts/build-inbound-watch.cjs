#!/usr/bin/env node
'use strict';
/*
 * 見張り番 (クラウド) が使う判定を、依存の無い 1 本の Node スクリプトへ畳む。
 *
 *   node scripts/build-inbound-watch.cjs           … 組んで scripts/inbound-watch.cjs を書く
 *   node scripts/build-inbound-watch.cjs --check   … 組み直した物と committed が同じかを見る (書かない)
 *
 * なぜ畳んで追跡に入れるか: 見張り番のセッションは毎回まっさらな容器で起き、`npm ci` をしない
 * (毎日 1 回のために依存 600 個を入れない)。`node scripts/inbound-watch.cjs <入力.json>` だけで動く形にする。
 * 判定の正本は `src/shared/inboundWatch.ts` → `src/shared/inboundThreat.ts` で、ここは写しである ——
 * 食い違いは `src/shared/__tests__/inboundWatchBundle.test.ts` が毎回の npm test で落とす。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'scripts', 'inbound-watch.cjs');

/** 入力ファイルの大きさの天井 (読む前に見る)。メール 200 件 × 本文 10 万字でも収まる。 */
const MAX_INPUT_BYTES = 32 * 1024 * 1024;

const BANNER = [
  '#!/usr/bin/env node',
  '/* eslint-disable */',
  '// 生成物 —— 手で編集しない。正本は src/shared/inboundWatch.ts (組み直しは `node scripts/build-inbound-watch.cjs`)。',
  '// 使い方: node scripts/inbound-watch.cjs <入力.json>   入力 = [{ "id", "sender"?, "subject"?, "body"? }, …]',
  '// 出力 (標準出力): { "verdicts": [{ "id", "level", "label", "codes", "reasons" }], "malformed", "overLimit" }',
  '// 網へ出ない・ファイルを書かない・入力の文面を出力へ写さない (写るのは id と固定の語彙だけ)。',
].join('\n');

const ENTRY = `
import { judgeInboundItems } from './src/shared/inboundWatch';
const fs = require('node:fs');
const MAX_INPUT_BYTES = ${MAX_INPUT_BYTES};
function fail(message) {
  process.stderr.write('inbound-watch: ' + message + '\\n');
  process.exit(2);
}
const file = process.argv[2];
if (typeof file !== 'string' || file === '') fail('入力の JSON ファイルを 1 つ渡してください');
let size = 0;
try {
  size = fs.statSync(file).size;
} catch {
  fail('入力ファイルを開けません');
}
if (size > MAX_INPUT_BYTES) fail('入力ファイルが大きすぎます');
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  fail('入力を JSON として読めません');
}
process.stdout.write(JSON.stringify(judgeInboundItems(parsed), null, 2) + '\\n');
`;

function build() {
  const esbuild = require('esbuild');
  const result = esbuild.buildSync({
    absWorkingDir: ROOT,
    stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts', sourcefile: 'inbound-watch.entry.ts' },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    charset: 'utf8',
    legalComments: 'none',
    banner: { js: BANNER },
  });
  return result.outputFiles[0].text;
}

function main(argv) {
  const text = build();
  if (argv.includes('--check')) {
    const committed = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
    if (committed !== text) {
      console.error('✗ scripts/inbound-watch.cjs が正本と食い違います。`node scripts/build-inbound-watch.cjs` で組み直してください。');
      return 1;
    }
    console.log('✅ scripts/inbound-watch.cjs は正本 (src/shared/inboundWatch.ts) から組んだ物と一致します');
    return 0;
  }
  fs.writeFileSync(OUT, text);
  console.log(`✅ scripts/inbound-watch.cjs を書きました (${text.length} 字)`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { build, OUT, MAX_INPUT_BYTES };
