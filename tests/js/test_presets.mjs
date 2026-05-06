import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DASHBOARD_JS = path.join(ROOT, 'v19/ui/dashboard.js');

const src = fs.readFileSync(DASHBOARD_JS, 'utf8');

function extractAt(src, header) {
  const start = src.indexOf(header);
  if (start < 0) throw new Error('not found: ' + header);
  let i = src.indexOf('(', start);
  let pdepth = 1; i++;
  for (; i < src.length && pdepth > 0; i++) {
    if (src[i] === '(') pdepth++; else if (src[i] === ')') pdepth--;
  }
  i = src.indexOf('{', i);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated');
}
function extractArr(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[`);
  const m = src.match(re); if (!m) throw new Error('not found: ' + name);
  let i = m.index + m[0].length - 1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) return src.slice(m.index, i + 1) + ';'; }
  }
  throw new Error('unterminated array');
}

// v37 (PDCA #26) で makeSession / deriveTitleFromHistory / getSessionSystemPrompt は
// modules/sessions.js に分離。BUILTIN_PRESETS / getPresetById は dashboard.js に残存。
const S = await import(path.join(ROOT, 'v19/ui/modules/sessions.js'));

let code = extractArr(src, "BUILTIN_PRESETS").replace("const BUILTIN_PRESETS", "var BUILTIN_PRESETS") + "\n";
code += extractAt(src, 'function getPresetById') + '\n';

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code, ctx);

// session 関数群を ctx に bind (BUILTIN_PRESETS lookup は ctx.getPresetById 経由)
ctx.makeSession = S.makeSession;
ctx.deriveTitleFromHistory = (h) => S.deriveTitleFromHistory(h, {
  textOf: (c) => Array.isArray(c) ? c.filter(p => p.type === 'text').map(p => p.text).join('') : (typeof c === 'string' ? c : ''),
  hasImages: (c) => Array.isArray(c) && c.some(p => p.type === 'image'),
});
ctx.getSessionSystemPrompt = (s) => S.getSessionSystemPrompt(s, ctx.getPresetById);

const tests = [];

// 1. すべての built-in preset が必須フィールドを持つ
tests.push(['全プリセットが必須フィールドを持つ',
  ctx.BUILTIN_PRESETS.length >= 6
  && ctx.BUILTIN_PRESETS.every(p => p.id && p.label && p.icon
    && typeof p.systemPrompt === 'string' && p.systemPrompt.length > 0)]);

// 2. ID は重複しない
{
  const ids = ctx.BUILTIN_PRESETS.map(p => p.id);
  tests.push(['プリセット ID 重複なし', new Set(ids).size === ids.length]);
}

// 3. getPresetById: 既知 ID
tests.push(['getPresetById: 既知 ID', ctx.getPresetById('translate')?.label === '翻訳']);
// 4. getPresetById: 未知 ID は null
tests.push(['getPresetById: 未知 ID は null', ctx.getPresetById('xxx') === null]);
// 5. getPresetById: null 渡しは null
tests.push(['getPresetById: null は null', ctx.getPresetById(null) === null]);

// 6. makeSession のデフォルトで preset/systemPrompt フィールドが存在
{
  const s = ctx.makeSession();
  tests.push(['makeSession: presetId デフォルト null', s.presetId === null]);
  tests.push(['makeSession: systemPrompt デフォルト ""', s.systemPrompt === '']);
}

// 7. getSessionSystemPrompt: presetId だけ → preset の systemPrompt を返す
{
  const s = ctx.makeSession({ presetId: 'translate' });
  const expected = ctx.getPresetById('translate').systemPrompt;
  tests.push(['解決: presetId のみ → preset の prompt',
    ctx.getSessionSystemPrompt(s) === expected]);
}

// 8. systemPrompt 自由記述があればそちらを優先
{
  const s = ctx.makeSession({ presetId: 'translate', systemPrompt: 'カスタム上書き' });
  tests.push(['解決: 自由記述があれば優先',
    ctx.getSessionSystemPrompt(s) === 'カスタム上書き']);
}

// 9. 何もなければ空文字
{
  const s = ctx.makeSession();
  tests.push(['解決: 何もなければ ""', ctx.getSessionSystemPrompt(s) === '']);
}

// 10. systemPrompt が whitespace のみなら preset にフォールバック
{
  const s = ctx.makeSession({ presetId: 'summarize', systemPrompt: '   \n\t  ' });
  tests.push(['解決: 空白のみは無視して preset 使用',
    ctx.getSessionSystemPrompt(s) === ctx.getPresetById('summarize').systemPrompt]);
}

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
