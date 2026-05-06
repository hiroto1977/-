// INV: INV-8: UI Markdown は XSS 安全 (escape → markup の順)
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DASHBOARD_JS = path.join(ROOT, 'v19/ui/dashboard.js');
const MD_MODULE = path.join(ROOT, 'v19/ui/modules/markdown.js');

// v30 から markdown は modules/markdown.js に移動。dashboard.js には import 済
const src = fs.readFileSync(DASHBOARD_JS, 'utf8');
const mdSrc = fs.existsSync(MD_MODULE) ? fs.readFileSync(MD_MODULE, 'utf8') : '';

// Brace-balanced extraction starting from a function declaration.
function extract(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

// v30 から: dashboard.js になければ modules/markdown.js から取る
function extractAcross(headers, sources) {
  for (const header of headers) {
    for (const source of sources) {
      const r = extract(source, header);
      if (r) return r;
    }
  }
  return null;
}

const escFn = extractAcross(['function escapeHtml', 'export function escapeHtml'], [src, mdSrc]);
const mdFn  = extractAcross(['function renderMarkdown', 'export function renderMarkdown'], [src, mdSrc]);
if (!escFn || !mdFn) { console.error('functions not found in dashboard.js or modules/markdown.js'); process.exit(2); }
// export prefix を vm 用に剥がす
const stripExport = (s) => s.replace(/^export\s+/, '');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(stripExport(escFn) + '\n' + stripExport(mdFn), ctx);

const cases = [
  ['plain paragraph', 'こんにちは。',
    ['<p class="md-p">こんにちは。</p>'], []],
  ['XSS via tag', '<script>alert(1)</script>',
    ['&lt;script&gt;'], ['<script>']],
  ['inline code with HTML inside', 'code: `<div onclick="x">`',
    ['<code class="md-inline">&lt;div onclick=&quot;x&quot;&gt;</code>'],
    ['<div onclick=']],
  ['fenced code with language', '```javascript\nconst x = 1;\n```',
    ['data-lang="javascript"', 'class="md-copy"', 'const x = 1;'], []],
  ['bold and italic', 'This is **bold** and *italic*.',
    ['<strong>bold</strong>', '<em>italic</em>'], []],
  ['bullet list', '- one\n- two\n- three',
    ['<ul class="md-ul">', '<li>one</li>', '<li>two</li>', '<li>three</li>', '</ul>'], []],
  ['numbered list', '1. first\n2. second',
    ['<ol class="md-ol">', '<li>first</li>', '<li>second</li>', '</ol>'], []],
  ['heading levels', '# H1\n## H2\n### H3',
    ['<h3 class="md-h">H1</h3>', '<h4 class="md-h">H2</h4>', '<h5 class="md-h">H3</h5>'], []],
  ['safe link', '[Anthropic](https://www.anthropic.com)',
    ['<a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer">Anthropic</a>'], []],
  ['javascript: link not converted', '[click](javascript:alert(1))', [],
    ['<a href="javascript:']],
  ['mixed: text + code block + text',
    'Here is some code:\n\n```\nfoo()\n```\n\nDone.',
    ['<p class="md-p">Here is some code:</p>',
     '<pre class="md-pre"',
     'foo()',
     '<p class="md-p">Done.</p>'],
    ['<p class="md-p"><pre', '<p class="md-p">\x00MD']],
  ['multi-paragraph', 'A line.\nSame para.\n\nNew para.',
    ['<p class="md-p">A line. Same para.</p>', '<p class="md-p">New para.</p>'], []],
  ['inline code preserved in paragraph',
    'Use the `npm install` command.',
    ['<p class="md-p">Use the <code class="md-inline">npm install</code> command.</p>'], []],
];

let pass = 0, fail = 0;
for (const [name, input, must, mustNot] of cases) {
  const out = ctx.renderMarkdown(input);
  const okMust = must.every(s => out.includes(s));
  const okNot  = mustNot.every(s => !out.includes(s));
  const ok = okMust && okNot;
  console.log(ok ? '✅' : '❌', name);
  if (!ok) {
    console.log('   出力:', JSON.stringify(out));
    if (!okMust) console.log('   不足:', must.filter(s => !out.includes(s)));
    if (!okNot)  console.log('   漏れ:', mustNot.filter(s => out.includes(s)));
  }
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
