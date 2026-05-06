// セッション ライフサイクル の振る舞い 検証
// v37 (PDCA #26) で session 純粋ロジック は modules/sessions.js に分離済み。
// 本テストは「(a) module の関数 が単独で正しく動く」+「(b) deepMerge 経由で
// 旧データ legacy history を 1 セッションに移行する 統合シナリオ」を担当。
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// 純粋ロジック は module から
const S = await import(path.join(ROOT, 'v19/ui/modules/sessions.js'));

// dashboard.js から deepMerge を抽出 (これだけは UI 層側に残っている共通 utility)
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
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
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(extractAt(dashSrc, 'function deepMerge'), ctx);

// 簡易 adapters (textOf/hasImages の最小実装)
const adapters = {
  textOf: (c) => Array.isArray(c)
    ? c.filter(p => p.type === 'text').map(p => p.text).join('')
    : (typeof c === 'string' ? c : ''),
  hasImages: (c) => Array.isArray(c) && c.some(p => p.type === 'image'),
};

// ensureSessions / getActiveSession は dashboard.js 内 wrapper だが、
// 本テストでは state 操作の挙動 (ensureSessionsShape / getActiveSessionFrom) を
// 直接検証する形で 同等性 を確認
const ensureSessions = (state) => S.ensureSessionsShape(state.chat);
const getActiveSession = (state) => {
  let s = S.getActiveSessionFrom(state.chat.sessions, state.chat.activeSessionId);
  if (!s) {
    s = S.makeSession();
    state.chat.sessions.push(s);
    state.chat.activeSessionId = s.id;
  } else if (state.chat.activeSessionId !== s.id) {
    state.chat.activeSessionId = s.id;
  }
  return s;
};

const tests = [];

// 1. New install
{
  const state = { chat: { sessions: [], activeSessionId: null } };
  ensureSessions(state);
  tests.push(['新規: 1 セッション自動作成',
    state.chat.sessions.length === 1
    && state.chat.activeSessionId === state.chat.sessions[0].id
    && state.chat.sessions[0].title === '新しい会話']);
}

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
    merged.claude.sessions = [S.makeSession({
      history: parsed.claude.history,
      title: S.deriveTitleFromHistory(parsed.claude.history, adapters),
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
  const t = S.deriveTitleFromHistory([{ role: 'user', content: long }], adapters);
  tests.push(['タイトル: 30字以内', t.length <= 30]);
}

// 4. orphan activeSessionId fallback
{
  const s1 = S.makeSession({ title: 'A' });
  const s2 = S.makeSession({ title: 'B' });
  const state = { chat: { sessions: [s1, s2], activeSessionId: 'sess_orphan' } };
  ensureSessions(state);
  tests.push(['orphan activeSessionId は先頭に復帰', state.chat.activeSessionId === s1.id]);
}

// 5. getActiveSession 副作用
{
  const state = { chat: { sessions: [], activeSessionId: null } };
  const s = getActiveSession(state);
  tests.push(['getActiveSession: 空でも自動生成', !!s && state.chat.sessions.length === 1]);
}

// 6. セッション分離
{
  const a = S.makeSession({ title: 'A' });
  const b = S.makeSession({ title: 'B' });
  const state = { chat: { sessions: [a, b], activeSessionId: a.id } };
  getActiveSession(state).history.push({ role: 'user', content: 'A への発言' });
  state.chat.activeSessionId = b.id;
  getActiveSession(state).history.push({ role: 'user', content: 'B への発言' });
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
