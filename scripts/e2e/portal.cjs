#!/usr/bin/env node
'use strict';

/*
 * 社外向けポータルの実機 E2E (実 chromium · 2026-11-11)。
 *
 *   npm run build:web && npm run build:portal && npm run e2e:portal
 *     # 要 dist/standalone.html (社内版) / dist/portal-partner.html / dist/portal-customer.html
 *
 * 配る 2 つの単一 HTML を `file://` で開き、**利用者に見える物**と**網へ出ないこと**を確かめる:
 *   1. 並ぶ画面が台帳 (`src/shared/portal.mamori`) どおりで、社内の画面への入口が無い
 *   2. 画面が実際に描ける (パートナー: ガイドライン / 書類スタジオ / コンプライアンス、カスタマー: 4 頁)
 *   3. 社内の画面の id をハッシュに書いても開かない (`#settings` ほか)
 *   4. 橋 (`window.serviceHub`) が資格情報を預からず、どの action も実行しない
 *   5. 頁を開いてから閉じるまで、`file:` 以外への要求が 1 つも出ない・CSP 違反と console エラーが 0 件
 *   6. どの画面も、字と地の対比が WCAG AA を割らない (測定は社内版の contrast suite と同じ `scripts/lib/contrast.cjs`)・
 *      スマホ幅で横にはみ出さない
 *   7. **社内版の中の入口** (`dist/standalone.html`): サイドバーの「🚪 ポータル」と村の殻の「🚪 ポータル」から
 *      3 つの一覧が開き、社外向けの一覧には台帳の画面だけが並ぶ
 *
 * 単体検査では見えない物がここには在る: CSP は実ブラウザでしか効かないし、畳み込んだ 1 本のスクリプトが
 * 実際に走るか (ハッシュが合っているか) も、開いてみないと分からない。
 */

const fs = require('node:fs');
const path = require('node:path');

function resolvePlaywright() {
  for (const opt of [undefined, { paths: ['/opt/node22/lib/node_modules'] }]) {
    try {
      return require(opt ? require.resolve('playwright', opt) : 'playwright');
    } catch {
      /* next */
    }
  }
  return null;
}

const ROOT = path.join(__dirname, '..', '..');
const DIR = process.env.SERVICE_HUB_E2E_DIST || path.join(ROOT, 'dist');
const PARTNER = path.join(DIR, 'portal-partner.html');
const CUSTOMER = path.join(DIR, 'portal-customer.html');
const INTERNAL = path.join(DIR, 'standalone.html');
const { sweepExpression, violationsOf, groupViolations } = require('../lib/contrast.cjs');
const CONTRAST = sweepExpression();

/** 社内版の画面の id (母集団はソースから導く —— `scripts/e2e/core.cjs` と同じ読み方)。 */
const ALL_SERVICE_IDS = [...fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'services.ts'), 'utf8').matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);

/** 台帳の写しは持たない: 並ぶ画面は生成物 `src/shared/portal.ts` の字面から読む (Mamori の生成物は素の TypeScript)。 */
function ledgerScreens(constName) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'portal.ts'), 'utf8');
  const start = src.indexOf(`export const ${constName}`);
  if (start === -1) throw new Error(`e2e:portal: 台帳 ${constName} が生成物に無い`);
  const end = src.indexOf('];', start);
  const body = src.slice(start, end);
  const out = [];
  const re = /id:\s*['"]([a-z][a-z0-9-]*)['"],\s*kind:\s*['"](service|published)['"],\s*label:\s*['"]([^'"]+)['"]/g;
  for (const m of body.matchAll(re)) out.push({ id: m[1], kind: m[2], label: m[3] });
  if (out.length === 0) throw new Error(`e2e:portal: 台帳 ${constName} から画面を 1 つも読めなかった`);
  return out;
}

/** 社内の画面の id の標本。どれも社外のポータルでは開かない。 */
const INTERNAL_IDS = ['settings', 'assistant', 'github', 'team', 'overview', 'home'];

let failed = 0;
let passed = 0;
function ok(cond, label) {
  if (cond) {
    passed += 1;
    console.log('  ✅ ' + label);
  } else {
    failed += 1;
    console.log('  ❌ ' + label);
  }
}

/** いま描いている画面の字と地の対比を測る。割った行が在れば、何が・どの色でを 2 つまで刷る。 */
async function contrastOk(page, label) {
  const rows = await page.evaluate(CONTRAST);
  const bad = violationsOf(rows);
  const detail = bad.length === 0 ? '' : ' — ' + groupViolations(rows).slice(0, 2).map((g) => `${g.k} ×${g.n}「${String(g.sample).slice(0, 20)}」${g.ratio.toFixed(2)}:1`).join(' / ');
  ok(rows.length > 0 && bad.length === 0, `${label}: 字と地の対比が AA を割らない (測った ${rows.length} 行・割った ${bad.length} 行)${detail}`);
}

/** 横にはみ出していないか (スマホ幅)。 */
async function noHorizontalScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, `${label}: 横スクロールなし (スマホ幅${over > 0 ? ` · ${over}px はみ出し` : ''})`);
}

async function openPortal(browser, file, hash) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const external = [];
  const consoleErrors = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)));
  await page.goto('file://' + file + (hash || ''));
  await page.waitForSelector('[data-portal-app]', { timeout: 15000 });
  return { context, page, external, consoleErrors };
}

async function navIds(page) {
  return page.$$eval('[data-portal-nav]', (els) => els.map((e) => e.getAttribute('data-portal-nav')));
}

async function commonChecks(name, session, screens) {
  const { page } = session;
  ok(JSON.stringify(await navIds(page)) === JSON.stringify(screens.map((s) => s.id)), `${name}: 並ぶ画面は台帳どおり (${screens.map((s) => s.id).join(' / ')})`);
  ok((await page.locator('[data-service-id], .sidebar, [data-village-shell], [data-portal-tab]').count()) === 0, `${name}: 社内版の殻 (サイドバー・村・ポータルの切り替え) が無い`);
  ok((await page.locator('input[type="password"]').count()) === 0, `${name}: パスワードの欄 (ロック画面・鍵の入力) が無い`);

  // 社内の画面の id をハッシュに書いても開かない。
  const before = await page.getAttribute('[data-portal-nav][aria-current="page"]', 'data-portal-nav');
  for (const id of INTERNAL_IDS) {
    await page.evaluate((h) => { location.hash = h; }, '#' + id);
  }
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  const after = await page.getAttribute('[data-portal-nav][aria-current="page"]', 'data-portal-nav');
  ok(before === after && (await page.locator('[data-portal-missing]').count()) === 0, `${name}: 社内の画面の id (#settings ほか ${INTERNAL_IDS.length} 件) をハッシュに書いても開かない`);

  // 橋: 預からない・実行しない・網へ出ない。
  const bridge = await page.evaluate(async () => {
    const hub = window.serviceHub;
    return {
      version: await hub.getVersion(),
      configured: await hub.listConfigured(),
      setToken: await hub.setToken('github', 'x'),
      invoke: await hub.invoke('slack', 'send-message', { text: 'x' }),
      internal: await hub.fetchSnapshot('settings'),
      authorize: await hub.authorize('github'),
      oauth: await hub.oauthSupported('github'),
    };
  });
  ok(bridge.version.endsWith('-web') && !/\d+\.\d+\.\d+/.test(bridge.version), `${name}: 橋は版の数を名乗らず、ブラウザ版の接尾辞だけを持つ (${bridge.version})`);
  ok(Array.isArray(bridge.configured) && bridge.configured.length === 0, `${name}: 橋は資格情報を 1 つも預かっていない`);
  ok(bridge.setToken.ok === false && bridge.authorize.ok === false && bridge.oauth === false, `${name}: 橋は鍵の保存も OAuth も断る`);
  ok(bridge.invoke.ok === false && bridge.invoke.code === 'action_not_found', `${name}: 橋はどの action も実行しない`);
  ok(bridge.internal.ok === false && bridge.internal.code === 'fetch_failed', `${name}: 橋は社内の画面の取得を断る`);
}

async function finish(name, session) {
  ok(session.external.length === 0, `${name}: file: 以外への要求が 0 件` + (session.external.length ? ' — ' + session.external.slice(0, 3).join(', ') : ''));
  ok(session.consoleErrors.length === 0, `${name}: console エラー・CSP 違反が 0 件` + (session.consoleErrors.length ? ' — ' + session.consoleErrors.slice(0, 2).join(' | ').slice(0, 300) : ''));
  await session.context.close();
}

async function partnerSuite(browser) {
  console.log('\nパートナーポータル');
  const screens = ledgerScreens('PARTNER_SCREENS');
  const s = await openPortal(browser, PARTNER);
  const { page } = s;
  ok((await page.textContent('h1')) === 'パートナーポータル', 'partner: 見出しはパートナーポータル');
  ok((await page.locator('[data-portal-sample]').count()) >= 1, 'partner: 見本の内容には「見本」の札が出る');
  ok((await page.locator('[data-portal-published="guidelines"] [data-portal-guideline]').count()) >= 1, 'partner: 取引ガイドラインが描ける');
  await contrastOk(page, 'partner / お知らせ・取引ガイドライン');
  await commonChecks('partner', s, screens);

  await page.click('[data-portal-nav="docstudio"]');
  await page.waitForSelector('.ds-paper, [data-docstudio], select, input', { timeout: 15000 });
  ok((await page.getAttribute('[data-portal-nav][aria-current="page"]', 'data-portal-nav')) === 'docstudio', 'partner: 書類スタジオへ移れる');
  ok((await page.locator('[data-page-error]').count()) === 0, 'partner: 書類スタジオは描画で落ちない');
  ok((await page.evaluate(() => location.hash)) === '#docstudio', 'partner: ハッシュが画面を指す (#docstudio)');
  await contrastOk(page, 'partner / 書類スタジオ');

  await page.click('[data-portal-nav="compliance"]');
  await page.waitForFunction(() => document.querySelector('main')?.textContent?.includes('下請') === true, null, { timeout: 15000 });
  ok((await page.locator('[data-page-error]').count()) === 0, 'partner: コンプライアンスは描画で落ちない (確証済みの知識が出る)');
  await contrastOk(page, 'partner / コンプライアンス');

  // この端末に残した入力を消す口。
  ok((await page.locator('[data-portal-erase] button').count()) === 1, 'partner: 「この端末に残した入力を消す」の口が在る');
  await page.evaluate(() => localStorage.setItem('servicehub.docstudio.v1', '{"probe":1}'));
  await page.evaluate(() => localStorage.setItem('unrelated-key', 'keep'));
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('[data-portal-erase] button')]);
  await page.waitForSelector('[data-portal-app]', { timeout: 15000 });
  const left = await page.evaluate(() => ({ draft: localStorage.getItem('servicehub.docstudio.v1'), other: localStorage.getItem('unrelated-key') }));
  ok(left.draft === null && left.other === 'keep', 'partner: 消す口は書類スタジオの下書きだけを消し、他の鍵には触らない');
  await page.evaluate(() => localStorage.removeItem('unrelated-key'));
  await finish('partner', s);

  // 直リンク。
  const d = await openPortal(browser, PARTNER, '#compliance');
  ok((await d.page.getAttribute('[data-portal-nav][aria-current="page"]', 'data-portal-nav')) === 'compliance', 'partner: #compliance の直リンクで始まる');
  await d.context.close();
}

async function customerSuite(browser) {
  console.log('\nカスタマーポータル');
  const screens = ledgerScreens('CUSTOMER_SCREENS');
  const s = await openPortal(browser, CUSTOMER);
  const { page } = s;
  ok((await page.textContent('h1')) === 'カスタマーポータル', 'customer: 見出しはカスタマーポータル');
  ok(screens.every((x) => x.kind === 'published'), 'customer: 台帳はアプリの画面を 1 つも出さない');
  await commonChecks('customer', s, screens);
  for (const sc of screens) {
    await page.click(`[data-portal-nav="${sc.id}"]`);
    await page.waitForSelector(`[data-portal-published="${sc.id}"]`, { timeout: 15000 });
    await contrastOk(page, `customer / ${sc.label}`);
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await noHorizontalScroll(page, 'customer');
  await page.setViewportSize({ width: 1280, height: 900 });
  ok(true, `customer: ${screens.length} 頁すべてが描ける (${screens.map((x) => x.label).join(' / ')})`);
  ok((await page.locator('[data-portal-published="contact"] input, [data-portal-published="contact"] textarea, form').count()) === 0, 'customer: お問い合わせは送らない (入力欄もフォームも無い)');
  ok((await page.locator('[data-portal-erase]').count()) === 0, 'customer: 端末に何も残さないので、消す口も無い');
  const stored = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length }));
  ok(stored.ls === 0 && stored.ss === 0, 'customer: localStorage / sessionStorage に何も書かない');
  await finish('customer', s);
}

const PASS = 'e2e-portal-pass-12345';

/** 社内版の保管庫を作って解錠する (手順は `scripts/e2e/core.cjs` の setupVault と同じ)。 */
async function setupVault(page, readySelector) {
  await page.waitForSelector('text=はじめてのご利用', { timeout: 30000 });
  const inputs = page.locator('input[type="password"]');
  await inputs.nth(0).fill(PASS);
  await inputs.nth(1).fill(PASS);
  await page.getByRole('button', { name: 'パスワードを設定して開始' }).click();
  await page.waitForSelector('input[type="checkbox"]', { timeout: 30000 });
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /記録完了/ }).click();
  await page.waitForSelector(readySelector, { timeout: 30000 });
}

async function directoryIds(page) {
  return page.$$eval('[data-portal-directory] [data-portal-screen]', (els) => els.map((e) => e.getAttribute('data-portal-screen')));
}

/**
 * 一覧の中身 (どちらの殻でも同じ部品 `PortalDirectory`)。社内の一覧が開いた状態で呼ぶ。
 */
async function directoryChecks(name, page) {
  const partner = ledgerScreens('PARTNER_SCREENS');
  const customer = ledgerScreens('CUSTOMER_SCREENS');

  const internal = await directoryIds(page);
  ok(
    internal.length === ALL_SERVICE_IDS.length && JSON.stringify([...internal].sort()) === JSON.stringify([...ALL_SERVICE_IDS].sort()),
    `${name}: 社内の一覧は画面を全部並べる (${internal.length} / ${ALL_SERVICE_IDS.length})`,
  );
  ok(JSON.stringify(await page.$$eval('[data-portal-tab]', (els) => els.map((e) => e.getAttribute('data-portal-tab')))) === JSON.stringify(['internal', 'partner', 'customer']), `${name}: 切り替えは 社内 / パートナー / カスタマー の 3 つ`);
  await contrastOk(page, `${name} / 社内の一覧`);

  await page.click('[data-portal-tab="partner"]');
  await page.waitForSelector('[data-portal-directory="partner"]', { timeout: 15000 });
  ok(JSON.stringify(await directoryIds(page)) === JSON.stringify(partner.map((x) => x.id)), `${name}: パートナーの一覧は台帳の画面だけ (${partner.map((x) => x.id).join(' / ')})`);
  await page.click('[data-portal-directory] [data-portal-screen="guidelines"]');
  await page.waitForSelector('[data-portal-preview] [data-portal-published="guidelines"]', { timeout: 15000 });
  ok(true, `${name}: 会社が載せる頁 (取引ガイドライン) は一覧の中に下見として開く`);
  await contrastOk(page, `${name} / パートナーの一覧と下見`);

  await page.click('[data-portal-tab="customer"]');
  await page.waitForSelector('[data-portal-directory="customer"]', { timeout: 15000 });
  ok(JSON.stringify(await directoryIds(page)) === JSON.stringify(customer.map((x) => x.id)), `${name}: カスタマーの一覧は台帳の画面だけ (${customer.map((x) => x.id).join(' / ')})`);
  ok((await page.locator('[data-portal-preview]').count()) === 0, `${name}: ポータルを切り替えると、前の下見は閉じる`);
  await page.click('[data-portal-directory] [data-portal-screen="faq"]');
  await page.waitForSelector('[data-portal-preview] [data-portal-published="faq"]', { timeout: 15000 });
  await contrastOk(page, `${name} / カスタマーの一覧と下見`);
}

async function internalSuite(browser) {
  console.log('\n社内版の中の入口 (既定の殻)');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    await page.goto('file://' + INTERNAL);
    await setupVault(page, '.sidebar');
    ok((await page.locator('[data-portal-open]').count()) === 1, 'internal: サイドバーに「ポータル」の入口が 1 つ在る');
    await page.click('[data-portal-open]');
    await page.waitForSelector('[data-portal-directory="internal"]', { timeout: 15000 });
    ok((await page.evaluate(() => location.hash)) === '#portal/internal', 'internal: ハッシュが一覧を指す (#portal/internal)');
    await directoryChecks('internal', page);
    ok((await page.evaluate(() => location.hash)) === '#portal/customer', 'internal: 切り替えるとハッシュも変わる (#portal/customer)');

    // スマホ幅: 一覧が横にはみ出さない。
    await page.setViewportSize({ width: 412, height: 915 });
    await noHorizontalScroll(page, 'internal / カスタマーの一覧');
    await page.setViewportSize({ width: 1280, height: 900 });

    // アプリの画面を選ぶと一覧を閉じて、その画面へ移る。
    await page.click('[data-portal-tab="partner"]');
    await page.waitForSelector('[data-portal-directory="partner"]', { timeout: 15000 });
    await page.click('[data-portal-directory] [data-portal-screen="docstudio"]');
    await page.waitForFunction(() => document.querySelector('[data-portal-directory]') === null && location.hash === '#docstudio', null, { timeout: 15000 });
    ok(true, 'internal: 一覧からアプリの画面 (書類スタジオ) を選ぶと、一覧を閉じてその画面へ移る');

    // 直リンク (同じ頁の中の hash の変更で一覧が開く)。
    await page.evaluate(() => { location.hash = '#portal/partner'; });
    await page.waitForSelector('[data-portal-directory="partner"]', { timeout: 15000 });
    ok(true, 'internal: #portal/partner で一覧が開く');
    await page.evaluate(() => { location.hash = '#portal/nope'; });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
    ok((await page.locator('[data-portal-directory="partner"]').count()) === 1, 'internal: 知らないポータルの hash (#portal/nope) では何も変わらない');
    ok(errors.length === 0, 'internal: console エラーが 0 件' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ').slice(0, 300) : ''));
    await context.close();
  }

  console.log('\n社内版の中の入口 (村の殻 ?ui=village)');
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    await page.goto('file://' + INTERNAL + '?ui=village');
    await setupVault(page, '[data-village-shell]');
    ok((await page.locator('[data-village-portal-open]').count()) === 1, 'village: 上のバーに「🚪 ポータル」の入口が 1 つ在る');
    await page.click('[data-village-portal-open]');
    await page.waitForSelector('[data-village-hall] [data-portal-directory="internal"]', { timeout: 15000 });
    ok((await page.getAttribute('[data-village-hall]', 'data-village-window')) === 'portal', 'village: 一覧は役場の窓に開く (村はそのまま残る)');
    await directoryChecks('village', page);

    await page.click('[data-portal-tab="partner"]');
    await page.waitForSelector('[data-portal-directory="partner"]', { timeout: 15000 });
    await page.click('[data-portal-directory] [data-portal-screen="compliance"]');
    await page.waitForSelector('[data-village-window="compliance"]', { timeout: 15000 });
    ok((await page.locator('[data-portal-directory]').count()) === 0, 'village: 一覧からアプリの画面 (コンプライアンス) を選ぶと、同じ窓にその画面が開く');
    await page.click('[data-village-hall] [data-dialog-initial]');
    await page.waitForSelector('[data-village-hall] [data-portal-directory="partner"]', { timeout: 15000 });
    ok(true, 'village: 画面を閉じると、村ではなく一覧へ戻る');
    await page.click('[data-village-hall] [data-dialog-initial]');
    await page.waitForFunction(() => document.querySelector('[data-village-hall]') === null, null, { timeout: 15000 });
    ok((await page.locator('[data-village-shell]').count()) === 1, 'village: 一覧を閉じると村へ戻る');

    await page.setViewportSize({ width: 412, height: 915 });
    await page.click('[data-village-portal-open]');
    await page.waitForSelector('[data-village-hall] [data-portal-directory="internal"]', { timeout: 15000 });
    await noHorizontalScroll(page, 'village / 社内の一覧');
    ok(errors.length === 0, 'village: console エラーが 0 件' + (errors.length ? ' — ' + errors.slice(0, 2).join(' | ').slice(0, 300) : ''));
    await context.close();
  }
}

async function main() {
  const pw = resolvePlaywright();
  if (!pw) {
    console.error('e2e:portal: playwright が見つかりません');
    process.exit(2);
  }
  for (const f of [INTERNAL, PARTNER, CUSTOMER]) {
    if (!fs.existsSync(f)) {
      console.error(
        `e2e:portal: ${path.relative(ROOT, f)} が無い —— 先に npm run build:web (社内版) → npm run build:portal の順に通してください ` +
          '(社内版のビルドは dist/ を掃除するので、ポータルは後に組む)。',
      );
      process.exit(2);
    }
  }
  // 成果物の鮮度 —— 古い HTML を相手に「通った」と言わない (判定は e2e / perf / smoke と同じ道具)。
  require('../lib/artifact-freshness.cjs').assertFreshArtifacts([INTERNAL, PARTNER, CUSTOMER], {
    srcDir: path.join(ROOT, 'src'),
    repoRoot: ROOT,
    tool: 'e2e:portal',
    allowEnv: 'SERVICE_HUB_E2E_ALLOW_STALE',
  });
  const browser = await pw.chromium.launch();
  try {
    await partnerSuite(browser);
    await customerSuite(browser);
    await internalSuite(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n${failed === 0 ? '✅' : '❌'} e2e:portal: ${passed} 件通過 / ❌ ${failed} 件`);
  // 件数の床: 走査が黙って縮んだら落とす。
  const FLOOR = 65;
  if (failed === 0 && passed < FLOOR) {
    console.error(`e2e:portal: 通過 ${passed} 件が床 ${FLOOR} を割った (検査が黙って縮んだ)`);
    process.exit(1);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('e2e:portal: 走り切れなかった —— ' + (err instanceof Error ? err.stack || err.message : String(err)));
  process.exit(1);
});
