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
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated');
}
function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re); if (!m) throw new Error('not found: ' + name);
  return `const ${name} = ${m[1]};`;
}

// Reconstruct just the helpers we need + a stub PROVIDERS
let code = `
const PROVIDERS = {
  ollama:    { id: 'ollama',    label: 'Ollama (ローカル)',  defaultModel: 'llama3.2' },
  anthropic: { id: 'anthropic', label: 'Anthropic Claude',   defaultModel: 'claude-opus-4-7' },
  google:    { id: 'google',    label: 'Google Gemini',      defaultModel: 'gemini-2.5-flash' },
};
`;
code += extractConst(src, 'LOCAL_PROVIDER_IDS') + '\n';
for (const h of ['function isLocalProvider', 'function visibleProviders', 'function reconcileLocalOnly']) {
  code += extractAt(src, h) + '\n';
}

const ctx = { console, state: null };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const tests = [];

// 1. localOnly OFF: 全プロバイダ可視
ctx.state = { settings: { localOnly: false }, chat: { activeProviderId: 'ollama' } };
tests.push(['OFF: 3 プロバイダ全可視', ctx.visibleProviders().length === 3]);

// 2. localOnly ON: ローカルのみ
ctx.state = { settings: { localOnly: true }, chat: { activeProviderId: 'ollama' } };
{
  const v = ctx.visibleProviders();
  tests.push(['ON: ローカルのみ可視', v.length === 1 && v[0].id === 'ollama']);
}

// 3. ON にしたとき active がクラウド → ollama に強制スナップ
ctx.state = { settings: { localOnly: true }, chat: { activeProviderId: 'anthropic' } };
ctx.reconcileLocalOnly();
tests.push(['ON 中に active=anthropic → ollama に強制', ctx.state.chat.activeProviderId === 'ollama']);

// 4. ON 中に active=google でも → ollama
ctx.state = { settings: { localOnly: true }, chat: { activeProviderId: 'google' } };
ctx.reconcileLocalOnly();
tests.push(['ON 中に active=google → ollama に強制', ctx.state.chat.activeProviderId === 'ollama']);

// 5. ON 中に active=ollama はそのまま
ctx.state = { settings: { localOnly: true }, chat: { activeProviderId: 'ollama' } };
ctx.reconcileLocalOnly();
tests.push(['ON 中に active=ollama は維持', ctx.state.chat.activeProviderId === 'ollama']);

// 6. OFF のときは何もしない
ctx.state = { settings: { localOnly: false }, chat: { activeProviderId: 'anthropic' } };
ctx.reconcileLocalOnly();
tests.push(['OFF のときは active を変えない', ctx.state.chat.activeProviderId === 'anthropic']);

// 7. isLocalProvider 単体
tests.push(['isLocalProvider: ollama', ctx.isLocalProvider('ollama') === true]);
tests.push(['isLocalProvider: anthropic', ctx.isLocalProvider('anthropic') === false]);
tests.push(['isLocalProvider: 未知', ctx.isLocalProvider('xxx') === false]);

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
