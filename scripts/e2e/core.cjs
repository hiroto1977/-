#!/usr/bin/env node
/**
 * ブラウザ実機 E2E — ビルド済み standalone HTML を Chromium で開き、
 * 主要フロー (Vault 初期化 / 投資の追加・編集 / 士業 CRM / 敷地プランナー /
 * モバイル表示) を desktop・phone・tablet の 3 プロファイルで検証する。
 *
 * 使い方:
 *   npm run build:web && npm run e2e            # フル版を検証
 *   npm run build:web:lite && npm run e2e:lite  # ライト版を検証
 *   SERVICE_HUB_E2E_FILE=dist/foo.html node scripts/e2e/core.cjs
 *
 * 前提: Playwright と Chromium が実行環境にあること。
 *   - ローカル/サンドボックス: PLAYWRIGHT 実体が npm い無くても
 *     /opt/node22 のグローバル導入と /opt/pw-browsers/chromium を自動検出。
 *   - 見つからない場合は exit 2 (スキップ扱いにせず明示的に失敗させる)。
 * CI (GitHub Actions) では実行しない — 手動/開発時の検証ツール。
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');

function resolvePlaywright() {
  const candidates = [undefined, { paths: ['/opt/node22/lib/node_modules'] }];
  for (const opt of candidates) {
    try {
      return require(opt ? require.resolve('playwright', opt) : 'playwright');
    } catch {
      /* try next */
    }
  }
  return null;
}

const pw = resolvePlaywright();
if (!pw) {
  console.error('E2E: playwright が見つかりません (npm i -D playwright するか、グローバル導入環境で実行してください)');
  process.exit(2);
}

const repoRoot = path.resolve(__dirname, '..', '..');
const target = process.env.SERVICE_HUB_E2E_FILE || 'dist/standalone.html';
const targetAbs = path.isAbsolute(target) ? target : path.join(repoRoot, target);
if (!fs.existsSync(targetAbs)) {
  console.error(`E2E: 対象ファイルがありません: ${targetAbs} — 先に npm run build:web (または build:web:lite) を実行してください`);
  process.exit(2);
}
const FILE = 'file://' + targetAbs;
const EXEC = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const PASS = 'e2e-pass-12345';

const failures = [];
function ok(cond, label) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + label);
  if (!cond) failures.push(label);
}

async function setupVault(page) {
  await page.waitForSelector('text=はじめてのご利用', { timeout: 30000 });
  const inputs = page.locator('input[type="password"]');
  await inputs.nth(0).fill(PASS);
  await inputs.nth(1).fill(PASS);
  await page.getByRole('button', { name: 'パスワードを設定して開始' }).click();
  await page.waitForSelector('input[type="checkbox"]', { timeout: 30000 });
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /記録完了/ }).click();
  await page.waitForSelector('.sidebar', { timeout: 30000 });
}

/** 同一コンテキストで別サービスへ: hash 遷移はリロード必須 (SPA は hashchange を拾わない)。 */
async function gotoService(page, hash, readySelector) {
  await page.goto(FILE + hash, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=ロック解除', { timeout: 30000 });
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.waitForSelector(readySelector, { timeout: 30000 });
}

function collectErrors(page, sink) {
  page.on('pageerror', (e) => sink.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') sink.push('console.error: ' + m.text());
  });
}

const noHScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function desktopSuite(browser) {
  console.log('--- desktop 1280x900 ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));

  // 不動産: 追加 → KPI 反映 → 編集 → 自動反映 → 削除で復帰
  await page.goto(FILE + '#real-estate', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('text=ポートフォリオ KPI', { timeout: 30000 });
  const has = async (s) => (await page.locator('body').textContent()).includes(s);
  ok((await has('￥243,000')) || (await has('¥243,000')), 'real-estate: 基準 月次CF ¥243,000 (snapshot 再現)');
  await page.getByPlaceholder('例: 福岡市アパート').fill('E2E物件');
  await page.getByPlaceholder('100000').first().fill('100000');
  await page.getByPlaceholder('12000000').fill('12000000');
  await page.getByRole('button', { name: '＋ 物件を追加' }).click();
  await page.waitForSelector('text=E2E物件', { timeout: 15000 });
  ok((await has('￥343,000')) || (await has('¥343,000')), 'real-estate: 追加で月次CF ¥343,000');
  await page.locator('button', { hasText: '編集' }).first().click();
  await page.waitForSelector('text=物件を編集中', { timeout: 10000 });
  await page.getByPlaceholder('100000').first().fill('150000');
  await page.getByRole('button', { name: '保存 (自動反映)' }).click();
  await page.waitForFunction(
    () => document.body.textContent.includes('393,000'),
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'real-estate: 編集の保存が KPI へ自動反映 (¥393,000)');
  await page.locator('button', { hasText: '削除' }).first().click();
  await page.waitForFunction(() => !document.body.textContent.includes('E2E物件'), undefined, { timeout: 15000 });

  // 敷地プランナー: ライブ再計算と道路制限
  await page.locator('label', { hasText: '前面道路幅員' }).locator('input').fill('3');
  await page.waitForFunction(() => document.body.textContent.includes('180%'), undefined, { timeout: 15000 });
  ok(true, 'zoning: 道路3m → 実効容積率180% (幅員×6/10)');

  // 投信: 手動評価額 → auto 切替
  await gotoService(page, '#mutual-funds', 'text=銘柄を追加');
  await page.getByPlaceholder('例: ニッセイ外国株式').fill('E2Eファンド');
  await page.getByPlaceholder('空欄=自動計算').fill('300000');
  await page.getByRole('button', { name: '＋ 銘柄を追加' }).click();
  await page.waitForSelector('text=E2Eファンド', { timeout: 15000 });
  ok((await has('￥8,540,140')) || (await has('¥8,540,140')), 'funds: 手動評価額30万で合計 ¥8,540,140');
  await page.locator('button', { hasText: '編集' }).first().click();
  await page.getByPlaceholder('空欄=自動計算').fill('');
  await page.getByPlaceholder('500000').fill('200000');
  await page.getByPlaceholder('32000').fill('20000');
  await page.getByRole('button', { name: '保存 (自動反映)' }).click();
  await page.waitForFunction(() => document.body.textContent.includes('8,640,140'), undefined, { timeout: 15000 });
  ok(true, 'funds: 評価額空欄で auto 切替 (口数×基準価額 → ¥8,640,140)');
  await page.locator('button', { hasText: '削除' }).first().click();
  await page.waitForFunction(() => !document.body.textContent.includes('E2Eファンド'), undefined, { timeout: 15000 });

  // 士業 CRM: 追加 → ステータス変更 → 他ページ非漏出
  await gotoService(page, '#cpa', 'text=連携先一覧');
  await page.getByPlaceholder('例: 山田 太郎').fill('E2E会計士');
  await page.getByRole('button', { name: /を追加/ }).click();
  await page.waitForSelector('text=E2E会計士', { timeout: 15000 });
  ok(await has('連携 2 名'), 'shigyo: 追加でヘッダ連携数が 2 名');
  await page.locator('input[type="date"]').fill('2026-07-25');
  await page.getByPlaceholder('例: 決算前の節税相談').fill('E2E相談');
  await page.getByRole('button', { name: '＋ 相談を記録' }).click();
  await page.waitForSelector('select[aria-label="相談ステータスを変更"]', { timeout: 15000 });
  await page.locator('select[aria-label="相談ステータスを変更"]').first().selectOption('完了');
  ok(true, 'shigyo: 相談記録 + ステータスのインライン変更');
  await gotoService(page, '#lawyer', 'text=根拠法: 弁護士法');
  ok(!(await has('E2E会計士')), 'shigyo: 他士業ページへは非漏出 (serviceId 分離)');

  const realErrs = errs.filter((e) => !/favicon|Autofocus/.test(e));
  ok(realErrs.length === 0, `desktop: console エラーゼロ (${realErrs.length})`);
  if (realErrs.length) console.log(realErrs.join('\n'));
  await ctx.close();
}

async function phoneSuite(browser) {
  console.log('--- phone 412x915 (touch) ---');
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));
  await page.goto(FILE + '#real-estate', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('text=ポートフォリオ KPI', { timeout: 30000 });
  ok(await noHScroll(page), 'phone: real-estate 横スクロールなし');
  const fontPx = await page
    .locator('.field-grid input')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  ok(fontPx >= 16, `phone: 入力欄フォント ${fontPx}px ≥ 16px (自動ズーム防止)`);
  const cols = await page
    .locator('.stat-grid')
    .first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  ok(cols === 2, `phone: KPI グリッド ${cols} 列に折返し`);
  await page.getByPlaceholder('例: 福岡市アパート').tap();
  await page.getByPlaceholder('例: 福岡市アパート').fill('スマホ物件');
  await page.getByPlaceholder('100000').first().fill('90000');
  await page.getByPlaceholder('12000000').fill('9000000');
  await page.getByRole('button', { name: '＋ 物件を追加' }).tap();
  await page.waitForSelector('text=スマホ物件', { timeout: 15000 });
  ok(true, 'phone: タップ操作で物件追加');
  // ドロワー
  await page.locator('.menu-btn').tap();
  await page.waitForSelector('.app.nav-open', { timeout: 10000 });
  await page.locator('.sidebar-item[data-service-id="docstudio"]').first().tap();
  await page.waitForFunction(() => !document.querySelector('.app.nav-open'), undefined, { timeout: 10000 });
  ok(true, 'phone: ドロワー遷移 + 自動クローズ');
  const realErrs = errs.filter((e) => !/favicon|Autofocus/.test(e));
  ok(realErrs.length === 0, `phone: console エラーゼロ (${realErrs.length})`);
  await ctx.close();
}

async function tabletSuite(browser) {
  console.log('--- tablet 834x1194 (touch) ---');
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));
  await page.goto(FILE + '#real-estate', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('text=敷地プランナー', { timeout: 30000 });
  ok(await noHScroll(page), 'tablet: 横スクロールなし (サイドバー併存)');
  const cols = await page
    .locator('.stat-grid')
    .first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  ok(cols >= 3, `tablet: KPI グリッド ${cols} 列で広幅活用`);
  await ctx.close();
}

(async () => {
  console.log(`E2E 対象: ${targetAbs} (${(fs.statSync(targetAbs).size / 1048576).toFixed(2)} MB)`);
  const browser = await pw.chromium.launch({
    ...(EXEC ? { executablePath: EXEC } : {}),
    args: ['--no-sandbox'],
  });
  await desktopSuite(browser);
  await phoneSuite(browser);
  await tabletSuite(browser);
  await browser.close();
  if (failures.length > 0) {
    console.log(`\nFAILED: ${failures.length} 件`);
    process.exit(1);
  }
  console.log('\nALL E2E CHECKS PASSED');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
