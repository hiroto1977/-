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
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
}
function extractConst(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = src.match(re); if (!m) throw new Error('not found: ' + name);
  return `const ${name} = ${m[1]};`;
}

let code = '';
for (const c of ['ANTHROPIC_API_URL','ANTHROPIC_VERSION','GOOGLE_API_BASE','OLLAMA_DEFAULT_BASE','HTTP_ERR_JA']) {
  code += extractConst(src, c) + '\n';
}
code += extractClass(src, 'ProviderError') + '\n';
for (const h of [
  'function partsOf', 'function textOf', 'function imagesOf', 'function hasImages', 'function dataUrlPayload',
  'async function safeErrorBody', 'async function readSseLines',
  'async function anthropicSendStream', 'async function googleSendStream', 'async function ollamaSendStream',
]) code += extractAt(src, h) + '\n';

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

// Helpers tests
tests.push(['partsOf: string → 1 text part',
  JSON.stringify(ctx.partsOf('hi')) === JSON.stringify([{type:'text',text:'hi'}])]);
tests.push(['partsOf: array passthrough',
  ctx.partsOf([{type:'text',text:'a'}]).length === 1]);
tests.push(['textOf: extracts text only',
  ctx.textOf([{type:'text',text:'a'},{type:'image',dataUrl:'x',mimeType:'image/png'},{type:'text',text:'b'}]) === 'ab']);
tests.push(['imagesOf: extracts images only',
  ctx.imagesOf([{type:'image',dataUrl:'data:image/png;base64,XX'},{type:'text',text:'a'}]).length === 1]);
tests.push(['dataUrlPayload: strips data URL prefix',
  ctx.dataUrlPayload('data:image/jpeg;base64,ABCD') === 'ABCD']);
tests.push(['dataUrlPayload: passes raw base64 through',
  ctx.dataUrlPayload('ABCD') === 'ABCD']);

// 1. Anthropic image marshaling
{
  const get = fakeFetch([
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n',
  ]);
  await ctx.anthropicSendStream({
    apiKey: 'k', model: 'claude-opus-4-7', maxTokens: 100,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', dataUrl: 'data:image/png;base64,IMGAAA', mimeType: 'image/png' },
        { type: 'text', text: 'これは何？' },
      ],
    }],
  });
  const body = JSON.parse(get().body);
  const msg = body.messages[0];
  tests.push(['Anthropic: array content として送信', Array.isArray(msg.content)]);
  tests.push(['Anthropic: image block 形式',
    msg.content[0].type === 'image'
    && msg.content[0].source.type === 'base64'
    && msg.content[0].source.media_type === 'image/png'
    && msg.content[0].source.data === 'IMGAAA']);
  tests.push(['Anthropic: text block 続く',
    msg.content[1].type === 'text' && msg.content[1].text === 'これは何？']);
}

// 2. Anthropic backward-compat: string content
{
  const get = fakeFetch([
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n',
  ]);
  await ctx.anthropicSendStream({
    apiKey: 'k', model: 'claude-opus-4-7', maxTokens: 100,
    messages: [{ role: 'user', content: 'hi' }],
  });
  const body = JSON.parse(get().body);
  tests.push(['Anthropic: string content はそのまま文字列で送る', body.messages[0].content === 'hi']);
}

// 3. Google image marshaling
{
  const get = fakeFetch([
    'data: {"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}\n\n',
  ]);
  await ctx.googleSendStream({
    apiKey: 'k', model: 'gemini-2.5-flash', maxTokens: 100,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', dataUrl: 'data:image/jpeg;base64,JJJ', mimeType: 'image/jpeg' },
        { type: 'text', text: 'desc' },
      ],
    }],
  });
  const body = JSON.parse(get().body);
  const parts = body.contents[0].parts;
  tests.push(['Google: inlineData 形式',
    parts[0].inlineData?.mimeType === 'image/jpeg'
    && parts[0].inlineData?.data === 'JJJ']);
  tests.push(['Google: text part が続く', parts[1].text === 'desc']);
}

// 4. Ollama image marshaling
{
  const get = fakeFetch(['{"message":{"content":"ok"},"done":true}\n']);
  await ctx.ollamaSendStream({
    apiKey: 'http://localhost:11434', model: 'llama3.2-vision', maxTokens: 100,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', dataUrl: 'data:image/png;base64,OOO', mimeType: 'image/png' },
        { type: 'text', text: 'see this' },
      ],
    }],
  });
  const body = JSON.parse(get().body);
  const msg = body.messages.find(m => m.role === 'user');
  tests.push(['Ollama: content はテキストのみ', msg.content === 'see this']);
  tests.push(['Ollama: images[] に raw base64', Array.isArray(msg.images)
    && msg.images.length === 1 && msg.images[0] === 'OOO']);
}

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
