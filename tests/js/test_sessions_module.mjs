// v19/ui/modules/sessions.js — 純粋ロジック層 を検証
// 対応 PDCA #26 (governance/12 §10 #37): dashboard.js から セッション層を抽出
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const M = await import(path.join(ROOT, 'v19/ui/modules/sessions.js'));

const tests = [];
const T = (name, ok) => tests.push([name, ok]);

// ── 1. makeSession ──
{
  const s = M.makeSession();
  T('makeSession: 引数なしで生成 OK',
    s.id.startsWith('sess_') && s.title === '新しい会話' &&
    s.autoTitle === true && Array.isArray(s.history) && s.history.length === 0);
  T('makeSession: createdAt と updatedAt 同値',
    s.createdAt === s.updatedAt && Number.isFinite(s.createdAt));
  T('makeSession: presetId / systemPrompt 既定 null/空',
    s.presetId === null && s.systemPrompt === '');
}
{
  const s = M.makeSession({ id: 'fix', title: 'タイトル', presetId: 'translator' });
  T('makeSession: id 指定が反映', s.id === 'fix');
  T('makeSession: title 指定が反映', s.title === 'タイトル');
  T('makeSession: presetId 指定が反映', s.presetId === 'translator');
}
{
  // unique id 担保 (連続生成)
  const ids = new Set();
  for (let i = 0; i < 30; i++) ids.add(M.makeSession().id);
  T('makeSession: 30 連続生成で id 一意', ids.size === 30);
}

// ── 2. getSessionSystemPrompt ──
{
  const lookup = (id) => id === 'p1' ? { systemPrompt: 'preset prompt' } : null;
  T('getSessionSystemPrompt: 自由文 が優先',
    M.getSessionSystemPrompt({ systemPrompt: '自由', presetId: 'p1' }, lookup) === '自由');
  T('getSessionSystemPrompt: 自由文 空 → preset',
    M.getSessionSystemPrompt({ systemPrompt: '', presetId: 'p1' }, lookup) === 'preset prompt');
  T('getSessionSystemPrompt: preset 不在 → 空',
    M.getSessionSystemPrompt({ systemPrompt: '', presetId: 'unknown' }, lookup) === '');
  T('getSessionSystemPrompt: getPresetById 注入なし → 空',
    M.getSessionSystemPrompt({ systemPrompt: '', presetId: 'p1' }, null) === '');
  T('getSessionSystemPrompt: 自由文 空白のみ → preset',
    M.getSessionSystemPrompt({ systemPrompt: '   ', presetId: 'p1' }, lookup) === 'preset prompt');
}

// ── 3. deriveTitleFromHistory ──
{
  const adapters = {
    textOf: (c) => Array.isArray(c) ? c.filter(p => p.type === 'text').map(p => p.text).join('') : '',
    hasImages: (c) => Array.isArray(c) && c.some(p => p.type === 'image'),
  };
  T('deriveTitle: 空 → 「新しい会話」',
    M.deriveTitleFromHistory([], adapters) === '新しい会話');
  T('deriveTitle: user 不在 → 「新しい会話」',
    M.deriveTitleFromHistory([{ role: 'assistant', content: 'hi' }], adapters) === '新しい会話');
  T('deriveTitle: string content そのまま (30 字 cap)',
    M.deriveTitleFromHistory([{ role: 'user', content: 'こんにちは、今日もよろしくお願いします' }], adapters)
      === 'こんにちは、今日もよろしくお願いします');
  T('deriveTitle: 30 字超は切り詰め',
    M.deriveTitleFromHistory([{ role: 'user', content: 'a'.repeat(50) }], adapters).length === 30);
  T('deriveTitle: 空白 連続 を 1 個に正規化',
    M.deriveTitleFromHistory([{ role: 'user', content: 'hello   world' }], adapters)
      === 'hello world');
  T('deriveTitle: parts 配列 (text only)',
    M.deriveTitleFromHistory([{ role: 'user', content: [{ type: 'text', text: '質問' }] }], adapters)
      === '質問');
  T('deriveTitle: parts 配列 (image only) → 「🖼 画像」',
    M.deriveTitleFromHistory([{ role: 'user', content: [{ type: 'image', dataUrl: 'd' }] }], adapters)
      === '🖼 画像');
  T('deriveTitle: parts 配列 (text 空 + image なし) → 「新しい会話」',
    M.deriveTitleFromHistory([{ role: 'user', content: [] }], adapters)
      === '新しい会話');
}

// ── 4. sanitizeTitle ──
T('sanitizeTitle: 通常文字列', M.sanitizeTitle('hello') === 'hello');
T('sanitizeTitle: 60 字 cap', M.sanitizeTitle('a'.repeat(100)).length === 60);
T('sanitizeTitle: 空 → 既定', M.sanitizeTitle('') === '新しい会話');
T('sanitizeTitle: 空白のみ → 既定', M.sanitizeTitle('   ') === '新しい会話');
T('sanitizeTitle: null → 既定', M.sanitizeTitle(null) === '新しい会話');
T('sanitizeTitle: trim',  M.sanitizeTitle('  hi  ') === 'hi');

// ── 5. nextActiveSessionId ──
{
  const sessions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  T('nextActive: 削除対象 が active で 中央 → 前 (b 削除 → a)',
    M.nextActiveSessionId([{ id: 'a' }, { id: 'c' }], 1, 'b', 'b') === 'a');
  T('nextActive: 削除対象 が active で 先頭 → 0 番目 (a 削除 → c)',
    M.nextActiveSessionId([{ id: 'b' }, { id: 'c' }], 0, 'a', 'a') === 'b');
  T('nextActive: 削除対象 が non-active → 現在維持',
    M.nextActiveSessionId([{ id: 'a' }, { id: 'c' }], 1, 'a', 'b') === 'a');
  T('nextActive: 全削除 → null',
    M.nextActiveSessionId([], 0, 'a', 'a') === null);
}

// ── 6. ensureSessionsShape ──
{
  const sc = { sessions: [], activeSessionId: null };
  const changed = M.ensureSessionsShape(sc);
  T('ensure: 空 → セッション追加 (changed=true)',
    changed === true && sc.sessions.length === 1 && sc.activeSessionId === sc.sessions[0].id);
}
{
  const sc = { sessions: [{ id: 'a' }, { id: 'b' }], activeSessionId: 'a' };
  const changed = M.ensureSessionsShape(sc);
  T('ensure: active が存在 → 変更なし', changed === false && sc.activeSessionId === 'a');
}
{
  const sc = { sessions: [{ id: 'a' }, { id: 'b' }], activeSessionId: 'lost' };
  const changed = M.ensureSessionsShape(sc);
  T('ensure: active が孤立 → 先頭にスナップ',
    changed === true && sc.activeSessionId === 'a');
}

// ── 7. getActiveSessionFrom ──
{
  const sessions = [{ id: 'x' }, { id: 'y' }];
  T('getActive: 一致', M.getActiveSessionFrom(sessions, 'y').id === 'y');
  T('getActive: 不一致 → 先頭', M.getActiveSessionFrom(sessions, 'lost').id === 'x');
  T('getActive: 空 → null', M.getActiveSessionFrom([], 'x') === null);
}

// ── 8. exportFileName ──
{
  const d = new Date('2026-05-06T12:00:00Z');
  T('exportFileName: 通常',
    M.exportFileName('翻訳セッション', 'session', d) === 'claude-翻訳セッション-2026-05-06.md');
  T('exportFileName: 記号 → ハイフン',
    M.exportFileName('a/b:c?d#e', 'session', d) === 'claude-a-b-c-d-e-2026-05-06.md');
  T('exportFileName: 空 タイトル → kind',
    M.exportFileName('', 'session', d) === 'claude-session-2026-05-06.md');
  T('exportFileName: 40 字 cap',
    M.exportFileName('あ'.repeat(60), 'session', d).startsWith('claude-' + 'あ'.repeat(40) + '-'));
}

// ── 9. drift sniff: dashboard.js が sessions モジュール を import + 重複なし ──
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
T('dashboard.js が sessions モジュール を import',
  dashSrc.includes("from './modules/sessions.js'"));
T('dashboard.js: makeSession の inline 定義なし',
  !/^function\s+makeSession\s*\(/m.test(dashSrc));
T('dashboard.js: sanitizeTitle 重複なし (import only)',
  !/^function\s+sanitizeTitle\s*\(/m.test(dashSrc));
T('dashboard.js: deleteSession で nextActiveSessionId 経由',
  /nextActiveSessionId\s*\(/.test(dashSrc));
T('dashboard.js: ensureSessions が ensureSessionsShape を呼ぶ',
  /ensureSessionsShape\s*\(\s*state\.chat\s*\)/.test(dashSrc));
T('dashboard.js: exportFileName を使用',
  /exportFileName\s*\(/.test(dashSrc));

// ── レポート ──
let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
