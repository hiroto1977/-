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
  // Skip past the parameter list — find the first `(` after start, then its matching `)`
  let i = src.indexOf('(', start);
  if (i < 0) throw new Error('no params: ' + header);
  let pdepth = 1;
  i++;
  for (; i < src.length && pdepth > 0; i++) {
    if (src[i] === '(') pdepth++;
    else if (src[i] === ')') pdepth--;
  }
  // Now find the function body opening `{`
  i = src.indexOf('{', i);
  if (i < 0) throw new Error('no body: ' + header);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unterminated: ' + header);
}

const fns = ['function deepMerge', 'function makeSession',
             'function deriveTitleFromHistory', 'function ensureSessions',
             'function getActiveSession'];
const code = fns.map(h => extractAt(src, h)).join('\n\n');

const ctx = { console, state: null, toast: () => {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);

const tests = [];

// 1. New install
ctx.state = { chat: { sessions: [], activeSessionId: null } };
ctx.ensureSessions();
tests.push(['新規: 1 セッション自動作成',
  ctx.state.chat.sessions.length === 1
  && ctx.state.chat.activeSessionId === ctx.state.chat.sessions[0].id
  && ctx.state.chat.sessions[0].title === '新しい会話']);

// 2. Migration: legacy single history -> wrap as one session
{
  const DEFAULT = { settings: { theme: 'light' }, claude: {
    apiKey: '', model: 'x', maxTokens: 4096, systemPrompt: '',
    rememberKey: true, sessions: [], activeSessionId: null,
  }};
  const parsed = { claude: { history: [
    { role: 'user', content: 'JavaScript の async/await を教えて' },
    { role: 'assistant', content: 'async/await は ...' },
  ]}};
  const merged = ctx.deepMerge(structuredClone(DEFAULT), parsed);
  if (Array.isArray(parsed.claude.history) && parsed.claude.history.length
      && (!merged.claude.sessions || !merged.claude.sessions.length)) {
    merged.claude.sessions = [ctx.makeSession({
      history: parsed.claude.history,
      title: ctx.deriveTitleFromHistory(parsed.claude.history),
      autoTitle: true,
    })];
    merged.claude.activeSessionId = merged.claude.sessions[0].id;
  }
  delete merged.claude.history;
  tests.push(['移行: legacy history を 1 セッションに包む',
    merged.claude.sessions.length === 1
    && merged.claude.sessions[0].history.length === 2
    && merged.claude.sessions[0].title === 'JavaScript の async/await を教えて'
    && !('history' in merged.claude)]);
}

// 3. Title truncation
{
  const long = 'これは とても長い質問文 で 30 字より長い そして空白を含むけれど整形されるはず';
  const t = ctx.deriveTitleFromHistory([{ role: 'user', content: long }]);
  tests.push(['タイトル: 30字以内', t.length <= 30]);
}

// 4. orphan activeSessionId fallback
{
  const s1 = ctx.makeSession({ title: 'A' });
  const s2 = ctx.makeSession({ title: 'B' });
  ctx.state = { chat: { sessions: [s1, s2], activeSessionId: 'sess_orphan' } };
  ctx.ensureSessions();
  tests.push(['orphan activeSessionId は先頭に復帰', ctx.state.chat.activeSessionId === s1.id]);
}

// 5. getActiveSession 副作用
{
  ctx.state = { chat: { sessions: [], activeSessionId: null } };
  const s = ctx.getActiveSession();
  tests.push(['getActiveSession: 空でも自動生成', !!s && ctx.state.chat.sessions.length === 1]);
}

// 6. セッション分離
{
  const a = ctx.makeSession({ title: 'A' });
  const b = ctx.makeSession({ title: 'B' });
  ctx.state = { chat: { sessions: [a, b], activeSessionId: a.id } };
  ctx.getActiveSession().history.push({ role: 'user', content: 'A への発言' });
  ctx.state.chat.activeSessionId = b.id;
  ctx.getActiveSession().history.push({ role: 'user', content: 'B への発言' });
  tests.push(['セッション分離: A=1, B=1 混ざらない',
    a.history.length === 1 && b.history.length === 1
    && a.history[0].content === 'A への発言' && b.history[0].content === 'B への発言']);
}

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
