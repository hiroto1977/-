#!/usr/bin/env node
'use strict';

/**
 * ローカル LLM への引継ぎパックを作る (CLI)。
 *
 *   npm run local-llm:handoff                      # 計画の表示だけ (何も書かない)
 *   npm run local-llm:handoff -- --write           # reports/local-llm-handoff/ へ書く
 *   npm run local-llm:handoff -- --write --tier large
 *   npm run local-llm:handoff -- --write --out reports/my-handoff
 *
 * 既定は書かない (scripts/local-llm-setup.sh と同じ規則)。出力先はリポジトリの中だけ。
 * ネットワークに触らず、子プロセスを作らず、`ollama create` も走らせない (コマンドを案内するだけ)。
 */

const path = require('node:path');
const lib = require('./lib/local-llm-handoff.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = 'reports/local-llm-handoff';

function parseArgs(argv) {
  const out = { write: false, tier: 'medium', out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--write') out.write = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--tier') {
      i += 1;
      out.tier = argv[i];
    } else if (a === '--out') {
      i += 1;
      out.out = argv[i];
    } else {
      return { error: `知らない引数: ${a}` };
    }
  }
  if (!Object.prototype.hasOwnProperty.call(lib.TIERS, out.tier)) {
    return { error: `知らない tier: ${String(out.tier)} (${Object.keys(lib.TIERS).join(' / ')})` };
  }
  if (typeof out.out !== 'string' || out.out === '') return { error: '--out に出力先を渡してください' };
  return out;
}

/** 出力先はリポジトリの中だけ (外のファイルを上書きしない)。 */
function resolveOut(rel) {
  const abs = path.resolve(ROOT, rel);
  const inside = path.relative(ROOT, abs);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return abs;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write('使い方: npm run local-llm:handoff -- [--write] [--tier small|medium|large|xlarge] [--out <dir>]\n');
    return 0;
  }
  const { files, report } = lib.buildHandoff(ROOT, args.tier);
  const lines = [
    `tier: ${report.tier} (${report.model}, num_ctx ${report.numCtx})`,
    `SYSTEM: ${report.systemChars} / ${report.budgetChars} 字 (入れた節: ${report.included.join(' · ')})`,
    report.dropped.length > 0 ? `入らなかった節: ${report.dropped.join(' · ')}` : '入らなかった節: なし',
    `法則の索引: SYSTEM に ${report.lawsInSystem} 本 / 全 ${report.lawsTotal === null ? '不明' : report.lawsTotal} 本 (全部は laws-index.md)`,
  ];
  if (!args.write) {
    process.stdout.write(`${lines.join('\n')}\n\n計画の表示だけです。書くには --write を付けてください。\n`);
    return 0;
  }
  const outAbs = resolveOut(args.out);
  if (outAbs === null) {
    process.stderr.write(`出力先はリポジトリの中だけです: ${args.out}\n`);
    return 2;
  }
  lib.writeHandoff(outAbs, files);
  const rel = path.relative(ROOT, outAbs);
  process.stdout.write(
    `${lines.join('\n')}\n\n書きました: ${rel}/ (${Object.keys(files).join(', ')})\n\n` +
      `次の手 (このコマンドは自動では走らせません):\n` +
      `  ollama pull ${report.model}\n` +
      `  cd ${rel} && ollama create service-hub-dev-${report.tier} -f Modelfile\n` +
      `  ollama run service-hub-dev-${report.tier}\n` +
      `Continue / 他のクライアントでは SYSTEM.md を system prompt に貼る (接続先は 127.0.0.1 のまま)。\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main, parseArgs, resolveOut };
