// INV: INV-9: Anthropic SSE で input/output_tokens 両方保持
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
function extractClass(src, name) {
  const start = src.indexOf('class ' + name);
  if (start < 0) throw new Error('class not found: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated class: ' + name);
}
function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re); if (!m) throw new Error('not found const: ' + name);
  return `const ${name} = ${m[1]};`;
}

let code = '';
for (const c of ['ANTHROPIC_API_URL','ANTHROPIC_VERSION','GOOGLE_API_BASE','OLLAMA_DEFAULT_BASE','HTTP_ERR_JA']) {
  code += extractConst(src, c) + '\n';
}
code += extractClass(src, 'ProviderError') + '\n';
for (const h of [
  'function partsOf', 'function textOf', 'function imagesOf', 'function dataUrlPayload', 'async function safeErrorBody',
  'async function readSseLines',
  'async function anthropicSendStream',
  'async function googleSendStream',
  'async function ollamaSendStream',
]) {
  code += extractAt(src, h) + '\n';
}

const ctx = { console, TextDecoder, TextEncoder, ReadableStream, Response };
vm.createContext(ctx);
vm.runInContext(code, ctx);

function fakeFetch(canned) {
  let captured = null;
  ctx.fetch = async (url, opts) => {
    captured = { url, ...opts };
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(c) { for (const chunk of canned) c.enqueue(enc.encode(chunk)); c.close(); }
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return () => captured;
}

const tests = [];

// 1. Anthropic
{
  const get = fakeFetch([
    'event: message_start\ndata: {"type":"message_start","message":{"id":"m","usage":{"input_tokens":11}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
  ]);
  let txt = '';
  const r = await ctx.anthropicSendStream({
    apiKey: 'sk-ant-test', model: 'claude-opus-4-7', maxTokens: 100, system: 'be brief',
    messages: [{ role: 'user', content: 'hi' }],
    onText: d => { txt += d; },
  });
  const req = get();
  const body = JSON.parse(req.body);
  tests.push(['Anthropic: URL', req.url === 'https://api.anthropic.com/v1/messages']);
  tests.push(['Anthropic: x-api-key', req.headers['x-api-key'] === 'sk-ant-test']);
  tests.push(['Anthropic: dangerous-direct-browser ヘッダー',
    req.headers['anthropic-dangerous-direct-browser-access'] === 'true']);
  tests.push(['Anthropic: body 形状',
    body.max_tokens === 100 && body.system === 'be brief' && body.stream === true]);
  tests.push(['Anthropic: 本文組み立て', r.text === 'Hello world' && txt === 'Hello world']);
  tests.push(['Anthropic: usage 両方保持', r.usage?.input_tokens === 11 && r.usage?.output_tokens === 2]);
}

// 2. Google
{
  const get = fakeFetch([
    'data: {"candidates":[{"content":{"parts":[{"text":"こんにちは"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"、世界"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":4}}\n\n',
  ]);
  let txt = '';
  const r = await ctx.googleSendStream({
    apiKey: 'AIzaTest', model: 'gemini-2.5-flash', maxTokens: 100, system: 'briefly',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }, { role: 'user', content: 'again' }],
    onText: d => { txt += d; },
  });
  const req = get();
  const body = JSON.parse(req.body);
  tests.push(['Google: URL に streamGenerateContent + alt=sse',
    req.url.includes('gemini-2.5-flash:streamGenerateContent') && req.url.includes('alt=sse')]);
  tests.push(['Google: x-goog-api-key', req.headers['x-goog-api-key'] === 'AIzaTest']);
  tests.push(['Google: assistant → model 変換',
    body.contents[1].role === 'model' && body.contents[0].role === 'user']);
  tests.push(['Google: systemInstruction', body.systemInstruction?.parts?.[0]?.text === 'briefly']);
  tests.push(['Google: maxOutputTokens', body.generationConfig.maxOutputTokens === 100]);
  tests.push(['Google: 本文組み立て', r.text === 'こんにちは、世界']);
  tests.push(['Google: usage 正規化',
    r.usage?.input_tokens === 5 && r.usage?.output_tokens === 4]);
}

// 3. Ollama: NDJSON
{
  const get = fakeFetch([
    '{"message":{"role":"assistant","content":"hi "},"done":false}\n',
    '{"message":{"role":"assistant","content":"there"},"done":false}\n',
    '{"done":true,"prompt_eval_count":7,"eval_count":3}\n',
  ]);
  let txt = '';
  const r = await ctx.ollamaSendStream({
    apiKey: 'http://localhost:11434', model: 'llama3.2', maxTokens: 50,
    system: 'sys', messages: [{ role: 'user', content: 'hi' }],
    onText: d => { txt += d; },
  });
  const req = get();
  const body = JSON.parse(req.body);
  tests.push(['Ollama: URL は base + /api/chat',
    req.url === 'http://localhost:11434/api/chat']);
  tests.push(['Ollama: body 形状 (system 先頭挿入)',
    body.model === 'llama3.2' && body.stream === true
    && body.options.num_predict === 50
    && body.messages[0].role === 'system' && body.messages[0].content === 'sys']);
  tests.push(['Ollama: NDJSON 本文組み立て', r.text === 'hi there']);
  tests.push(['Ollama: usage 正規化', r.usage?.input_tokens === 7 && r.usage?.output_tokens === 3]);
}

// 4. Ollama: 空 URL → デフォルト
{
  const get = fakeFetch(['{"message":{"content":"ok"},"done":true}\n']);
  await ctx.ollamaSendStream({
    apiKey: '', model: 'llama3.2', maxTokens: 10,
    messages: [{ role: 'user', content: 'hi' }],
  });
  tests.push(['Ollama: 空 URL → デフォルト localhost:11434',
    get().url === 'http://localhost:11434/api/chat']);
}

// 5. Ollama: 末尾スラッシュ正規化
{
  const get = fakeFetch(['{"message":{"content":"ok"},"done":true}\n']);
  await ctx.ollamaSendStream({
    apiKey: 'http://192.168.1.10:11434/', model: 'qwen2.5', maxTokens: 10,
    messages: [{ role: 'user', content: 'hi' }],
  });
  tests.push(['Ollama: 末尾 / 正規化',
    get().url === 'http://192.168.1.10:11434/api/chat']);
}

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
