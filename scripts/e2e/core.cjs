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

  // 制度判定: 入力 → 判定が実際に変わるところ。単体テストは純関数と初期描画しか見て
  // いないので、入力の state が判定へ繋がっているかは実ブラウザでしか分からない。
  await gotoService(page, '#funding', 'text=使える制度の判定');
  const age = page.locator('input[aria-label="年齢"]');
  await age.fill('30');
  await page.waitForFunction(
    () => document.body.textContent.includes('年齢 30 歳は要件（18歳以上45歳未満）を満たす'),
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'eligibility: 30歳で青年枠が「要件を満たす」に変わる');
  await age.fill('66');
  await page.waitForFunction(
    () => document.body.textContent.includes('年齢 66 歳は要件（18歳以上45歳未満）を満たさない'),
    undefined,
    { timeout: 15000 },
  );
  // 前提の認定が年齢で取れないことまで伝わるか (青年等就農資金は年齢要件を持たない)。
  ok(
    await has('前提の認定新規就農者は18歳以上65歳未満が要件のため、66 歳では取得できない'),
    'eligibility: 前提の認定の年齢まで辿って対象外にする',
  );
  // IME の全角数字。ここで弾くと「入れたのに判定が動かない」ように見える。
  await age.fill('７０');
  await page.waitForFunction(
    () => document.body.textContent.includes('年齢 70 歳は要件（18歳以上45歳未満）を満たさない'),
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'eligibility: 全角数字の年齢でも判定が動く');
  // 認定農業者は年齢要件が無いので、70歳でも落ちない。
  ok(await has('年齢の要件はない（上限なし）'), 'eligibility: 認定農業者は年齢で落ちない');
  await page.locator('select[aria-label="認定農業者か"]').selectOption('no');
  await page.waitForFunction(
    () => document.body.textContent.includes('認定農業者でない（先に農業経営改善計画の認定が要る）'),
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'eligibility: 前提の認定を「いいえ」にすると対象外の理由が出る');

  // 株主名簿: 人数の増減。単体テストは差分計算だけを見ているので、
  // 「増やした行が書面に出るか」「削除で繰り上がるか」は実ブラウザで確かめる。
  await gotoService(page, '#docstudio', '[data-doc-id="kabunushi-meibo"]');
  await page.locator('[data-doc-id="kabunushi-meibo"]').click();
  await page.waitForSelector('[data-shareholder-inputs]', { timeout: 15000 });
  const shCount = () =>
    page.locator('[data-shareholder-inputs]').getAttribute('data-shareholder-inputs');
  ok((await shCount()) === '3', 'shareholders: 既定は 3 行（従来の書式と同じ）');
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel(`株主${i} 氏名・名称`).fill(`E2E株主${i}`);
    await page.getByLabel(`株主${i} 株式数`).fill(String(i * 10));
  }
  await page.getByRole('button', { name: '＋ 株主を追加' }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-shareholder-inputs]')?.getAttribute('data-shareholder-inputs') === '4',
    undefined,
    { timeout: 15000 },
  );
  await page.getByLabel('株主4 氏名・名称').fill('E2E株主4');
  await page.getByLabel('株主4 株式数').fill('40');
  await page.waitForFunction(
    () => document.querySelector('.ds-paper')?.textContent?.includes('E2E株主4') === true,
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'shareholders: 追加した 4 人目が書面に出る');
  ok(
    (await page.locator('[data-shareholders]').getAttribute('data-shareholders')) === '4',
    'shareholders: 書面の行数が入力に追従する',
  );
  ok(await has('100'), 'shareholders: 書面の合計が 10+20+30+40 = 100');

  await page.getByLabel('株主2 を削除').click();
  await page.waitForFunction(
    () => document.querySelector('[data-shareholder-inputs]')?.getAttribute('data-shareholder-inputs') === '3',
    undefined,
    { timeout: 15000 },
  );
  ok(
    (await page.getByLabel('株主2 氏名・名称').inputValue()) === 'E2E株主3',
    'shareholders: 削除で以降の行が繰り上がる（途中に空行を残さない）',
  );
  ok(!(await has('E2E株主2')), 'shareholders: 消した株主は書面からも消える');

  await page.getByLabel('株主3 を削除').click();
  await page.waitForFunction(
    () => document.querySelector('[data-shareholder-inputs]')?.getAttribute('data-shareholder-inputs') === '2',
    undefined,
    { timeout: 15000 },
  );
  await page.getByLabel('株主2 を削除').click();
  await page.waitForFunction(
    () => document.querySelector('[data-shareholder-inputs]')?.getAttribute('data-shareholder-inputs') === '1',
    undefined,
    { timeout: 15000 },
  );
  ok(await page.getByLabel('株主1 を削除').isDisabled(), 'shareholders: 残り 1 行では削除できない');

  // 法定 / 条件付き / 任意 の仕分け。単体は表と関数しか見ていないので、
  // 「バッジが全書式に付くか」「絞り込みが効くか」は実ブラウザで確かめる。
  await gotoService(page, '#docstudio', '[data-legal-filter="mandatory"]');
  const badgeCount = await page.locator('[data-doc-id] [data-legal]').count();
  const docCount = await page.locator('[data-doc-id]').count();
  ok(badgeCount === docCount && docCount > 0, `legal: 全書式にバッジが付く (${badgeCount}/${docCount})`);
  ok((await page.locator('[data-legal="unclassified"]').count()) === 0, 'legal: 未分類の書式が無い');
  await page.locator('[data-legal-filter="mandatory"]').click();
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('[data-doc-id]')];
      return b.length > 0 && b.every((x) => x.querySelector('[data-legal="mandatory"]'));
    },
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'legal: 「法定」で絞ると法定の書式だけになる');
  ok(
    (await page.locator('[data-doc-id]').count()) < docCount,
    'legal: 絞り込みで件数が減る（絞れていない絞り込みを通さない）',
  );
  await page.locator('[data-doc-id="roudousha-meibo"]').click();
  await page.waitForSelector('[data-legal-panel="mandatory"]', { timeout: 15000 });
  const panel = await page.locator('[data-legal-panel]').innerText();
  ok(panel.includes('労働基準法107条'), 'legal: 選んだ書式に根拠条文が出る');
  ok(panel.includes('当分の間3年'), 'legal: 法定帳簿に保存期間が出る');
  await page.locator('[data-legal-filter="all"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-doc-id]').length > 9,
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'legal: 「すべて」で絞り込みが解除される');

  // ライブラリの「開く」。ここは `window.open(blob:)` をやめてアプリ内表示に
  // 変えた箇所で、**デスクトップ版では元から無反応**だった (setWindowOpenHandler
  // が blob: を落とすため)。単体は mime の振り分けしか見ていないので、
  // 「書き出し → 保存 → 開くと実際に絵が出る」までを実ブラウザで通す。
  await gotoService(page, '#templates', 'button');
  // `invoke` は失敗しても throw せず `{ok:false}` を返す。戻り値を見ないと
  // 書き出しが黙って失敗し、あとの待機がただのタイムアウトになって
  // 「なぜ落ちたか」が分からなくなる（実際に一度そうなった）。
  const exported = await page.evaluate(async () => {
    const res = await window.serviceHub.invoke('templates', 'export-template', {
      templateId: 'invoice-header',
      params: {},
    });
    return res.ok === true;
  });
  ok(exported, 'library: テンプレートの書き出しが成功する');
  await gotoService(page, '#library', '[data-library-item]');
  ok(
    (await page.locator('[data-library-item="image/svg+xml"]').count()) > 0,
    'library: 書き出した SVG がライブラリに入る',
  );
  // 開く前はプレビュー枠が存在しない（負のコントロール: 常に出ている枠を
  // 「表示できた」と数えないため）。
  ok((await page.locator('[data-preview-panel]').count()) === 0, 'library: 開く前はプレビューが無い');
  await page.locator('[data-library-open]').first().click();
  await page.waitForSelector('[data-preview-panel="image"]', { timeout: 15000 });
  ok(true, 'library: 「開く」でアプリ内にプレビューが出る（無反応でない）');
  // data: URL の <img> であること。blob: や新規タブに戻っていたら落ちる。
  const previewSrc = await page.locator('[data-preview="image"]').getAttribute('src');
  ok(
    typeof previewSrc === 'string' && previewSrc.startsWith('data:image/svg+xml'),
    'library: SVG は data: URL の <img> で描画される（同一オリジン文書にしない）',
  );
  // 新しいタブが開いていないこと。window.open へ戻したらここが落ちる。
  ok(ctx.pages().length === 1, 'library: 新しいタブを開かない');

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

/**
 * 事業・数値の手入力 — 全画面共通の欄。
 *
 * この欄は App が 1 か所で描くので、画面ごとに貼り忘れる余地は無い。
 * ここで確かめるのは「一覧を持つ画面では置き換え欄が出て、持たない画面では
 * 出ないこと」「事業は画面をまたいで共有され、数値は画面ごとに分かれること」
 * の 2 点である。単体テストでは module の境界までしか見えない。
 */
async function manualDataSuite(browser) {
  console.log('--- 事業・数値の手入力 (全画面共通) ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));

  await page.goto(FILE + '#overview', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('[data-manual-data]', { timeout: 30000 });
  ok(
    (await page.getAttribute('[data-manual-data]', 'data-scope')) === 'overview',
    '手入力欄が現在の画面 id を持つ',
  );
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-business-units]', { timeout: 30000 });

  // 事業を足す
  await page.fill('input[aria-label="事業名"]', '物販事業');
  await page.fill('input[aria-label="開始時期"]', '2024-04');
  await page.click('button:has-text("事業を追加")');
  await page.waitForSelector('[data-business-unit]', { timeout: 30000 });
  ok((await page.locator('[data-business-unit]').count()) === 1, '事業を任意に追加できる');

  // 任意の数値を、その事業に紐づけて足す
  await page.fill('input[aria-label="項目名"]', '想定客単価');
  await page.fill('input[aria-label="値"]', '4800');
  await page.selectOption('select[aria-label="紐づける事業"]', { label: '物販事業' });
  await page.click('button:has-text("数値を追加")');
  await page.waitForSelector('[data-manual-metric]', { timeout: 30000 });
  const metricText = await page.locator('[data-manual-metric]').first().innerText();
  ok(metricText.includes('想定客単価'), '任意の数値を追加できる');
  ok(metricText.includes('4,800 円'), '追加した数値が単位付きで出る');
  ok(metricText.includes('物販事業'), '数値を事業に紐づけられる');

  // 計算値の置き換え（一覧を持つ画面）
  ok((await page.locator('[data-manual-overrides]').count()) > 0, '一覧を持つ画面には置き換え欄が出る');
  await page.fill('[data-override-row="kpi.revenue"] input', '12345678');
  await page.click('[data-override-row="kpi.revenue"] button:has-text("保存")');
  await page.waitForSelector('[data-override-row="kpi.revenue"] [data-overridden]', { timeout: 30000 });
  ok(
    (await page.locator('[data-override-row="kpi.revenue"] [data-overridden]').innerText()).includes(
      '12,345,678 円',
    ),
    '計算値を手入力で置き換えられる',
  );

  // KPI も一覧を持つ。置き換えた値が画面の数字に出るところまで見る
  // （欄に印が付くだけで、実際の表示に反映されない配線ミスを捕まえる）。
  await gotoService(page, '#kpi', '[data-manual-data]');
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-manual-overrides]', { timeout: 30000 });
  ok(
    (await page.locator('[data-override-row]').count()) === 8,
    `KPI の置き換え欄が 8 項目 (実際 ${await page.locator('[data-override-row]').count()})`,
  );
  await page.fill('[data-override-row="operatingProfit"] input', '7654321');
  await page.click('[data-override-row="operatingProfit"] button:has-text("保存")');
  await page.waitForSelector('[data-override-row="operatingProfit"] [data-overridden]', {
    timeout: 30000,
  });
  ok(
    (await page.locator('body').innerText()).includes('7,654,321'),
    'KPI: 置き換えた値が画面の数字に反映される',
  );

  // 一覧を持たない画面: 足す側だけが出る／事業は共有・数値は画面ごと
  await gotoService(page, '#github', '[data-manual-data]');
  ok(
    (await page.getAttribute('[data-manual-data]', 'data-scope')) === 'github',
    '別の画面でも手入力欄が出る',
  );
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-manual-metrics]', { timeout: 30000 });
  ok(
    (await page.locator('[data-manual-overrides]').count()) === 0,
    '一覧を持たない画面には置き換え欄を出さない',
  );
  ok((await page.locator('[data-business-unit]').count()) === 1, '事業は画面をまたいで共有される');
  ok(
    (await page.locator('[data-manual-metric]').count()) === 0,
    '数値は画面ごとに分かれる (別画面のものは出ない)',
  );

  ok(errs.length === 0, `手入力欄: ページエラー 0 (実際 ${errs.length})`);
  await ctx.close();
}

(async () => {
  console.log(`E2E 対象: ${targetAbs} (${(fs.statSync(targetAbs).size / 1048576).toFixed(2)} MB)`);
  const browser = await pw.chromium.launch({
    ...(EXEC ? { executablePath: EXEC } : {}),
    args: ['--no-sandbox'],
  });
  await desktopSuite(browser);
  await manualDataSuite(browser);
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
