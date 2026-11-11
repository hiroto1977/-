#!/usr/bin/env node
'use strict';
/**
 * 既にコミットされている静的な電池 (src/shared/mamori/__tests__/mamoriBattery.test.ts) の弾の一覧を、
 * 対戦場の攻撃 (`*.attack.mamori`) に機械的に変換する (2026-11-08 · 対戦)。新しい手口は作らない —— 電池が
 * 「生成物に穴の形が無いか」を静的に見ている同じ弾を、**実行して**奪取・破壊・脱出が起きないかも見る。
 *
 *   node scripts/mamori-arena-from-battery.cjs <出力先ディレクトリ>
 *
 * 弾の一覧は純粋な字面の配列なので、定義の部分だけを取り出して評価する (他の物は評価しない)。
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'src', 'shared', 'mamori', '__tests__', 'mamoriBattery.test.ts');
const out = process.argv[2];
if (!out) { console.error('usage: mamori-arena-from-battery.cjs <outdir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const text = fs.readFileSync(SRC, 'utf8');
function extract(name) {
  const m = new RegExp('^const ' + name + '(?:: [^=]+)? = \\[', 'm').exec(text);
  if (!m) throw new Error('battery array not found: ' + name);
  const start = m.index + m[0].length - 1;
  const end = text.indexOf('\n];', start);
  const body = text.slice(start, end + 2);
  return vm.runInNewContext('(' + body + ')', Object.create(null), { timeout: 2000 });
}

const groups = {
  global: extract('GLOBAL_NAMES').map((n) => `return ${n};`),
  member: extract('MEMBER_ESCAPES').map((e) => `return ${e};`),
  state: extract('STATIC_STATE').map((e) => `return ${e};`),
  syntax: extract('SYNTAX_ESCAPES').map((e) => `return ${e};`),
  lexical: extract('LEXICAL_TRAPS').map((e) => `return ${e};`),
};
const header = 'const x: unknown = 1;\n  const y: unknown = 2;\n  const k = "a";\n  const n = 3;\n  const f = (v: unknown) => v;\n  ';
let count = 0;
for (const [g, lines] of Object.entries(groups)) {
  lines.forEach((line, i) => {
    const src = `// target: *\n// goal: destroy\n// idea: 電池の弾 (${g} #${i}) を実行して確かめる\nexport fn attack() -> unknown {\n  ${header}${line}\n}\n`;
    fs.writeFileSync(path.join(out, `bat-${g}-${String(i).padStart(3, '0')}.attack.mamori`), src);
    count++;
  });
}
console.log(`電池の弾 ${count} 本を ${out} に書きました`);
