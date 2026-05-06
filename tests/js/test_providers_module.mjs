// v19/ui/modules/providers.js — マルチ プロバイダ クライアント を検証
// 対応 PDCA #25 (governance/12 §10 #36): dashboard.js から provider 層を抽出
//
// テスト対象 (純粋ロジック + API 適合): partsOf / textOf / imagesOf / hasImages /
//   dataUrlPayload / ProviderError / HTTP_ERR_JA / PROVIDERS registry shape。
// fetch 部分は Node 環境では本物の API を叩けないため、構造検証 + 既存
//   tests/js/test_providers.mjs (旧 dashboard inline 抽出版) と整合確認。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const M = await import(path.join(ROOT, 'v19/ui/modules/providers.js'));

const tests = [];
const T = (name, ok) => tests.push([name, ok]);

// ── 1. content helpers ──
T('partsOf: string → 1 text part',
  (() => { const p = M.partsOf('hello'); return p.length === 1 && p[0].type === 'text' && p[0].text === 'hello'; })());
T('partsOf: array → そのまま', (() => {
  const arr = [{ type: 'text', text: 'a' }, { type: 'image', dataUrl: 'data:,' }];
  return M.partsOf(arr) === arr;
})());
T('partsOf: 不正値 → 空配列', M.partsOf(null).length === 0 && M.partsOf(42).length === 0);
T('textOf: string → そのまま', M.textOf('hi') === 'hi');
T('textOf: 複数 text parts → 連結',
  M.textOf([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]) === 'ab');
T('textOf: image だけ → 空文字',
  M.textOf([{ type: 'image', dataUrl: 'data:,' }]) === '');
T('imagesOf: 画像のみ抽出',
  M.imagesOf([{ type: 'text', text: 'x' }, { type: 'image', dataUrl: 'd' }]).length === 1);
T('hasImages: image あり → true',
  M.hasImages([{ type: 'image', dataUrl: 'd' }]) === true);
T('hasImages: text のみ → false',
  M.hasImages('plain') === false);
T('dataUrlPayload: data URL → base64 部分',
  M.dataUrlPayload('data:image/jpeg;base64,ABCDEF') === 'ABCDEF');
T('dataUrlPayload: 区切りなし → そのまま',
  M.dataUrlPayload('rawvalue') === 'rawvalue');

// ── 2. ProviderError ──
{
  const e = new M.ProviderError('msg', { status: 401, providerId: 'anthropic' });
  T('ProviderError: instance of Error', e instanceof Error);
  T('ProviderError: message',  e.message === 'msg');
  T('ProviderError: status',   e.status === 401);
  T('ProviderError: providerId', e.providerId === 'anthropic');
}
{
  const e = new M.ProviderError('m');
  T('ProviderError: opts なしで安全', e.message === 'm' && e.providerId === undefined);
}

// ── 3. HTTP_ERR_JA ──
T('HTTP_ERR_JA: 401',  M.HTTP_ERR_JA[401].includes('API キー'));
T('HTTP_ERR_JA: 429 にレート制限',  M.HTTP_ERR_JA[429].includes('レート制限'));
T('HTTP_ERR_JA: 全 8 コード',
  [400, 401, 403, 404, 413, 429, 500, 529].every(c => typeof M.HTTP_ERR_JA[c] === 'string'));

// ── 4. PROVIDERS registry ──
T('PROVIDERS: 3 件 (ollama / anthropic / google)',
  ['ollama', 'anthropic', 'google'].every(k => k in M.PROVIDERS) &&
  Object.keys(M.PROVIDERS).length === 3);

for (const id of ['ollama', 'anthropic', 'google']) {
  const p = M.PROVIDERS[id];
  T(`${id}: id 一致`, p.id === id);
  T(`${id}: label 存在`, typeof p.label === 'string' && p.label.length > 0);
  T(`${id}: defaultModel 存在`, typeof p.defaultModel === 'string' && p.defaultModel.length > 0);
  T(`${id}: modelSuggestions 配列`, Array.isArray(p.modelSuggestions) && p.modelSuggestions.length > 0);
  T(`${id}: defaultModel が suggestions に含まれる`,
    p.modelSuggestions.includes(p.defaultModel));
  T(`${id}: sendStream 関数`, typeof p.sendStream === 'function');
  T(`${id}: keyDocsUrl https`, /^https:\/\//.test(p.keyDocsUrl));
}

T('ollama: localhost URL hint',
  M.PROVIDERS.ollama.keyHint.includes('11434'));
T('ollama: keyLabelOverride で API キー UI を URL ラベルに',
  M.PROVIDERS.ollama.keyLabelOverride === 'サーバー URL');
T('anthropic: claude モデル',
  M.PROVIDERS.anthropic.defaultModel.startsWith('claude-'));
T('anthropic: opus-4-7 を suggestions に含む',
  M.PROVIDERS.anthropic.modelSuggestions.includes('claude-opus-4-7'));
T('google: gemini-2.5-flash',
  M.PROVIDERS.google.defaultModel === 'gemini-2.5-flash');

// ── 5. sendStream は早期エラーで Provider Error を投げる (空 messages / 空 apiKey) ──
{
  let err;
  try { await M.PROVIDERS.anthropic.sendStream({ apiKey: '', model: 'm', messages: [{ role: 'user', content: 'x' }] }); }
  catch (e) { err = e; }
  T('anthropic: 空 apiKey で ProviderError',
    err instanceof M.ProviderError && err.providerId === 'anthropic');
}
{
  let err;
  try { await M.PROVIDERS.google.sendStream({ apiKey: '', model: 'm', messages: [{ role: 'user', content: 'x' }] }); }
  catch (e) { err = e; }
  T('google: 空 apiKey で ProviderError',
    err instanceof M.ProviderError && err.providerId === 'google');
}
{
  let err;
  try { await M.PROVIDERS.anthropic.sendStream({ apiKey: 'k', model: 'm', messages: [] }); }
  catch (e) { err = e; }
  T('anthropic: 空 messages で ProviderError',
    err instanceof M.ProviderError && err.message.includes('メッセージ'));
}
{
  // ollama は apiKey 不要 → 空でも空 messages でも ProviderError (messages 空)
  let err;
  try { await M.PROVIDERS.ollama.sendStream({ apiKey: '', model: 'm', messages: [] }); }
  catch (e) { err = e; }
  T('ollama: 空 messages で ProviderError',
    err instanceof M.ProviderError && err.message.includes('メッセージ'));
}

// ── 6. drift sniff: dashboard.js が providers モジュール を import + 重複なし ──
const dashSrc = fs.readFileSync(path.join(ROOT, 'v19/ui/dashboard.js'), 'utf8');
T('dashboard.js が providers モジュール を import',
  dashSrc.includes("from './modules/providers.js'"));
T('dashboard.js: ProviderError 重複定義なし',
  !/^class\s+ProviderError\s/m.test(dashSrc));
T('dashboard.js: anthropicSendStream 重複定義なし',
  !/^async\s+function\s+anthropicSendStream\s*\(/m.test(dashSrc));
T('dashboard.js: googleSendStream 重複定義なし',
  !/^async\s+function\s+googleSendStream\s*\(/m.test(dashSrc));
T('dashboard.js: ollamaSendStream 重複定義なし',
  !/^async\s+function\s+ollamaSendStream\s*\(/m.test(dashSrc));
T('dashboard.js: PROVIDERS の inline オブジェクト リテラルなし',
  !/^const\s+PROVIDERS\s*=\s*\{/m.test(dashSrc));
T('dashboard.js: textOf / imagesOf を providers から import',
  /import\s*\{\s*[^}]*\btextOf\b[^}]*\bimagesOf\b[^}]*\}\s*from\s*['"]\.\/modules\/providers\.js['"]/.test(
    dashSrc.replace(/\s+/g, ' ')));

// ── レポート ──
let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
