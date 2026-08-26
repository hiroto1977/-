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
// 古い成果物で検証していないか (判定は scripts/lib/artifact-freshness.cjs に 1 つだけ)。
// build:web は tsc -b で落ちると成果物を作らないまま止まるので、気づかず回すと
// 「壊す前の HTML」を相手に全項目が通る。2026-08-24 に 2 回踏んだ。
require('../lib/artifact-freshness.cjs').assertFreshArtifacts([targetAbs], {
  srcDir: path.join(repoRoot, 'src'),
  repoRoot,
  tool: 'E2E',
  allowEnv: 'SERVICE_HUB_E2E_ALLOW_STALE',
});

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

/**
 * 秒単位の帯が**実機で本当に動く**か。
 *
 * 単体検査は純粋関数と刻みをそれぞれ留めているが、「1 秒ごとに再描画される」
 * ことは **React が実際に描き直しているか**に依るので、組み上げないと分からない。
 * 「毎秒更新」と言いながら止まっていても、単体検査は全部緑で通る。
 *
 * 併せて、止まるべき時に止まることも見る —— タブを隠している間も 1 秒
 * タイマーを回し続けるのは電池を削るだけで、このアプリは非表示で自動施錠する
 * 設計なので筋も通らない。
 */
async function realtimeSuite(browser) {
  console.log('--- realtime (#tax の秒単位更新) ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);

  await page.goto(FILE + '#tax', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('text=いま この瞬間', { timeout: 30000 });
  ok(true, 'realtime: 帯が出る');

  /** 帯の文字列 (折れ線を持つ「リアルタイム」で始まる箱)。 */
  const band = () =>
    page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div'));
      const b = all.find((d) => d.textContent?.startsWith('リアルタイム') === true && d.querySelector('svg') !== null);
      return b?.textContent ?? null;
    });
  const points = () =>
    page.evaluate(() => {
      const p = document.querySelector('polyline');
      return p === null ? 0 : (p.getAttribute('points') ?? '').trim().split(/\s+/).length;
    });

  const t0 = await band();
  await page.waitForTimeout(3200);
  const t1 = await band();
  ok(t0 !== null && t1 !== null && t0 !== t1, '★ realtime: 3 秒で表示が変わる (止まっていたら鳴る)');

  const p1 = await points();
  await page.waitForTimeout(3200);
  const p2 = await points();
  ok(p2 > p1, `★ realtime: 折れ線が伸びる (${p1} → ${p2})`);

  // 隠したら止まる。
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const h0 = await band();
  await page.waitForTimeout(3200);
  const h1 = await band();
  ok(h0 === h1, '★ realtime: タブを隠している間は止まる (電池を削らない)');

  // 戻したら、待たずに追いつく。
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const h2 = await band();
  ok(h2 !== h1, '★ realtime: 戻すと 1 周期を待たずに追いつく');

  // 帯は取りに行かないと明示していること (毎秒 API を叩かないのが仕様)。
  const text = (await band()) ?? '';
  ok(text.includes('取り直し') || text.includes('刻み'), 'realtime: 刻みと取得の違いを画面で説明している');

  ok(errs.length === 0, `realtime: ページエラー 0 (実際 ${errs.length})`);
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
  // 手入力欄はスマホでも使う。入力が横に並ぶので、開いた状態で
  // 横スクロールが出ないこと・タップで事業を足せることまで見る。
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-business-units]', { timeout: 30000 });
  ok(await noHScroll(page), 'phone: 手入力欄を開いても横スクロールなし');
  const manualFontPx = await page
    .locator('input[aria-label="事業名"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  ok(
    manualFontPx >= 16,
    `phone: 手入力欄のフォント ${manualFontPx}px ≥ 16px (自動ズーム防止)`,
  );
  await page.locator('input[aria-label="事業名"]').fill('スマホ事業');
  await page.getByRole('button', { name: '事業を追加' }).tap();
  await page.waitForSelector('[data-business-unit]', { timeout: 30000 });
  ok(
    (await page.locator('[data-business-unit]').innerText()).includes('スマホ事業'),
    'phone: タップ操作で事業を追加できる',
  );
  ok(await noHScroll(page), 'phone: 事業を足した後も横スクロールなし');

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
/**
 * 手入力欄を**除いた**ページ本文。
 *
 * 入力欄は自分で「手入力 7,654,321 円」と出すので、body 全体で数字を探すと
 * 入力欄を読んで通ってしまい、「欄には印が付くがページの数字は変わらない」
 * 配線ミスを捕まえられない (2026-08 に実際に踏んだ)。通貨記号は Node と
 * Chromium の ICU で `\uFFE5` / `\u00A5` が揺れるので、記号は照合に使わない。
 */
async function textOutsideManualPanel(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    for (const el of clone.querySelectorAll('[data-manual-data]')) el.remove();
    return clone.textContent ?? '';
  });
}

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
  //
  // KPI の集計タイルは実績が 1 件も無いと描画されないので、先に 1 行入れる。
  // 照合は**ページ側の通貨表記 (￥付き)** で行う。入力欄自身も
  // 「手入力 7,654,321 円」と出すため、素の数字で照合すると入力欄を読んで
  // 通ってしまい、配線ミスを捕まえられない (2026-08 に実際に踏んだ)。
  await gotoService(page, '#kpi', 'input[placeholder="YYYY-MM"]');
  const kpiForm = [
    ['YYYY-MM', '2026-01'],
    ['事業名', 'E2E'],
    ['売上高', '10000000'],
    ['売上原価', '4000000'],
    ['広告費', '500000'],
    ['販管費', '2000000'],
    ['減価償却費', '300000'],
  ];
  for (const [ph, v] of kpiForm) {
    await page.locator(`input[placeholder="${ph}"]`).first().fill(v);
  }
  // 「追加」ボタンはページ内に 40 個以上ある。first() だと別のパネルの
  // ボタンを押してしまい、実績が入らないまま素通りする (2026-08 に実際に踏んだ)。
  // 入力欄の親要素に絞ってから押す。
  const kpiFormBox = page
    .locator('input[placeholder="YYYY-MM"]')
    .first()
    .locator('xpath=ancestor::div[1]');
  ok(
    (await kpiFormBox.getByRole('button', { name: '追加' }).count()) === 1,
    'KPI: 実績フォームの「追加」ボタンを一意に絞れている',
  );
  await kpiFormBox.getByRole('button', { name: '追加' }).first().click();
  await page.waitForSelector('table', { timeout: 30000 });

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
    (await textOutsideManualPanel(page)).includes('7,654,321'),
    'KPI: 置き換えた値が画面の数字に反映される (入力欄を除いた本文で照合)',
  );

  // 投資 2 画面も一覧を持つ。置き換えた値が画面の数字に出るところまで見る。
  await gotoService(page, '#real-estate', '[data-manual-data]');
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-manual-overrides]', { timeout: 30000 });
  ok(
    (await page.locator('[data-override-row]').count()) === 5,
    `不動産の置き換え欄が 5 項目 (実際 ${await page.locator('[data-override-row]').count()})`,
  );
  ok(
    (await page.locator('[data-override-row="occupancyRate"]').count()) === 0,
    '入居率は置き換え欄に出ない (保存と表示で尺度が違うため)',
  );
  await page.fill('[data-override-row="portfolioYield"] input', '9.9');
  await page.click('[data-override-row="portfolioYield"] button:has-text("保存")');
  await page.waitForSelector('[data-override-row="portfolioYield"] [data-overridden]', {
    timeout: 30000,
  });
  ok(
    (await textOutsideManualPanel(page)).includes('9.9%'),
    '不動産: 置き換えた利回りが画面の数字に反映される (入力欄を除いた本文で照合)',
  );

  await gotoService(page, '#mutual-funds', '[data-manual-data]');
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-manual-overrides]', { timeout: 30000 });
  ok(
    (await page.locator('[data-override-row]').count()) === 4,
    `投資信託の置き換え欄が 4 項目 (実際 ${await page.locator('[data-override-row]').count()})`,
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

/**
 * 取得元の表示 (`shared/dataOrigin.ts`)。
 *
 * 2026-08 監査の回帰: 公式 API 未配線のサービスは stub が空データを「成功」で
 * 返すため、「更新」を押すと画面が空になり緑の「ライブ」バッジが付いていた。
 * 実ブラウザで (1) 更新ボタンが出ていないこと (2) バッジが「内蔵サンプル」で
 * あること (3) 士業ページの数字が残っていることを見る。単体テストは hook を
 * 見るだけなので、ページに配線されていることはここでしか確かめられない。
 */
async function dataOriginSuite(browser) {
  console.log('--- 取得元の表示 (内蔵サンプル / ライブ) ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));

  // sample: 税理士。士業 CRM の数字が残り、更新ボタンが無いこと。
  await page.goto(FILE + '#tax-accountant', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('.status-bar', { timeout: 30000 });
  const badge = (await page.textContent('.status-bar .badge')) ?? '';
  ok(badge.trim() === '内蔵サンプル', `税理士: バッジが「内蔵サンプル」(実際 "${badge.trim()}")`);
  ok(
    (await page.locator('.status-bar .badge.ok').count()) === 0,
    '税理士: 緑 (ライブ) バッジを出さない',
  );
  ok(
    (await page.locator('.status-bar button', { hasText: '更新' }).count()) === 0,
    '税理士: 更新ボタンを出さない (押すと空になる経路そのものを消す)',
  );
  ok(
    (await page.locator('[data-sample-note]').count()) === 1,
    '税理士: 「外部連携なし」の断り書きを出す',
  );

  // local: KPI。更新ボタンは出る (取得先が手元にある)。
  await gotoService(page, '#kpi', '.status-bar');
  ok(
    (await page.locator('.status-bar button', { hasText: '更新' }).count()) === 1,
    'KPI: 更新ボタンを出す (local は取得できる)',
  );
  ok(
    (await page.locator('[data-sample-note]').count()) === 0,
    'KPI: 「外部連携なし」は出さない',
  );

  // remote: GitHub。更新ボタンが出て、未取得なら「サンプル（未連携）」。
  //
  // **「スナップショット」ではない。** 2026-08-19 (#783) に言葉を変えた ——
  // 「スナップショット」は *実データをある時点で写したもの* と読めるが、
  // 実際に出ているのは同梱の作り物 (架空の氏名とメール) で、実在の同僚と
  // 受け取られる余地があった。判定は `shared/dataOrigin.ts` の
  // `describeOrigin` に 1 つだけ在る。
  //
  // ここは **e2e が CI に無いあいだに 4 日ぶん古いまま**になっていた
  // (2026-08-23 に走らせて発覚)。正しいアプリに対して赤を出す検査は、
  // 検査が無いより悪い —— 赤を無視する習慣がつく。
  await gotoService(page, '#github', '.status-bar');
  ok(
    (await page.locator('.status-bar button', { hasText: '更新' }).count()) === 1,
    'GitHub: 更新ボタンを出す',
  );
  const ghBadge = (await page.textContent('.status-bar .badge')) ?? '';
  ok(
    ghBadge.trim() === 'サンプル（未連携）',
    `GitHub: 未取得は「サンプル（未連携）」(実際 "${ghBadge.trim()}")`,
  );

  ok(errs.length === 0, `取得元の表示: ページエラー 0 (実際 ${errs.length})`);
  await ctx.close();
}

/**
 * 読み手のいない資格情報 (`shared/credentialUse.ts`)。
 *
 * 2026-08 監査の回帰: asana / discord / dropbox / line / linear / salesforce /
 * sentry / stripe は通信もアクションもしないのにトークン入力欄を出し、入力すれば
 * 暗号化保存していた。実ブラウザで (1) 入力欄が消えていること (2) 使うサービスでは
 * 残っていること (3) 過去に保存された分を設定画面から消せることを見る。
 * (3) は単体テストでは確かめられない — 保存の実体 (Vault) と画面の結線だから。
 */
async function credentialSuite(browser) {
  console.log('--- 使われない資格情報を求めない / 掃除できる ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));

  await page.goto(FILE + '#dropbox', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('.status-bar', { timeout: 30000 });
  // ラベルは画面ごとに違う (GitHub は「PAT を設定」) ので、文字列ではなく
  // **押した結果**で見る。dropbox は sample かつ none なので、更新もトークンも
  // 出ないボタン 0 個が正しい姿。
  ok(
    (await page.locator('.status-bar button').count()) === 0,
    `Dropbox: 状態バーにボタンを出さない (更新もトークンも無い) — 実際 ${JSON.stringify(
      await page.locator('.status-bar button').allTextContents(),
    )}`,
  );

  await gotoService(page, '#github', '.status-bar');
  const ghLabels = await page.locator('.status-bar button').allTextContents();
  const ghEdit = ghLabels.filter((b) => !b.includes('更新'));
  ok(ghEdit.length === 1, `GitHub: 資格情報の設定ボタンが 1 つある — 実際 ${JSON.stringify(ghLabels)}`);
  await page.locator('.status-bar button', { hasText: ghEdit[0] }).first().click();
  ok(
    (await page.locator('.status-bar input[type=password]').count()) === 1,
    'GitHub: 押すと資格情報の入力欄が出る (取得に要るので残す)',
  );

  // 過去に保存された分を作ってから設定画面へ。
  const stored = await page.evaluate(async () => {
    await window.serviceHub.setToken('dropbox', 'stale-token-from-before-the-audit');
    return (await window.serviceHub.listConfigured()).includes('dropbox');
  });
  ok(stored === true, '設定前提: dropbox のトークンを保存できた');

  await gotoService(page, '#settings', '[data-unused-credentials]');
  ok(
    (await page.locator('[data-unused-credential="dropbox"]').count()) === 1,
    '設定: 使われていない資格情報として dropbox が挙がる',
  );
  await page.locator('[data-unused-credentials] button', { hasText: '削除' }).first().click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-unused-credential="dropbox"]').length === 0,
    { timeout: 15000 },
  );
  const gone = await page.evaluate(async () => (await window.serviceHub.listConfigured()).includes('dropbox'));
  ok(gone === false, '設定: 削除すると保存先からも消える');
  ok(
    (await page.locator('[data-unused-credentials]').count()) === 0,
    '設定: 0 件になったら節そのものを描かない',
  );

  ok(errs.length === 0, `資格情報の掃除: ページエラー 0 (実際 ${errs.length})`);
  await ctx.close();
}

/**
 * 登録した事業が事業間比較グラフに出ること (2026-08 の要望)。
 *
 * 比較グラフは同梱の模擬データ 10 件に固定されており、利用者が登録した事業は
 * 金額を持てないため出られなかった。売上を入れた事業が自分の名前で並び、
 * 同梱分が「(サンプル)」と明示されることを実ブラウザで見る。
 */
/**
 * 計算書類の消費税科目 — **区分を間違えると貸借が合わなくなる**ので実機で見る。
 *
 * 単体テストは `ACCOUNTS` の区分と区分合計を固定しているが、そこから
 * 「入力欄として画面に出るか」「入れた額が貸借対照表の行に出るか」までは
 * 見ていない。フォームは `ACCOUNTS.map` で組み立てているので、その配線が
 * 切れたら単体は通ったまま画面だけ空になる。
 *
 * 決算書は書類スタジオの**別コレクション** (`data-collection="kessan"`) で、
 * 雛形書類の `data-doc-id` とは別系統。ここを取り違えると「タブが無い」と
 * 誤診する (2026-08-24 に実際に踏んだ)。
 */
async function kessanTaxSuite(browser) {
  console.log('--- 計算書類: 消費税の科目 ---');
  // 各 suite は自前の context で保管庫を作る (SERVICE_HUB_E2E_ONLY で
  // 単独実行できるようにするため)。他の suite に相乗りしない。
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  collectErrors(page, errors);
  await page.goto(FILE + '#docstudio', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('[data-collection]', { timeout: 30000 });
  await page.locator('[data-collection="kessan"]').click();
  await page.waitForSelector('[data-kessan-sheets]', { timeout: 15000 });

  // 税抜経理: 支払った税は資産、預かった税は負債。精算は片側だけに立つ。
  const ACCOUNTS = [
    ['仮払消費税等', '資産'],
    ['未収還付消費税等', '資産'],
    ['仮受消費税等', '負債'],
    ['未払消費税等', '負債'],
  ];
  for (const [name] of ACCOUNTS) {
    ok((await page.getByLabel(name, { exact: false }).count()) > 0, `kessan: 「${name}」の入力欄が在る`);
  }

  await page.getByLabel('仮払消費税等', { exact: false }).first().fill('80');
  await page.getByLabel('仮受消費税等', { exact: false }).first().fill('80');
  await page.waitForFunction(
    () => (document.querySelector('[data-kessan-sheets]')?.textContent ?? '').includes('仮払消費税等'),
    undefined,
    { timeout: 15000 },
  );
  const sheets = (await page.locator('[data-kessan-sheets]').innerText()).replace(/,/g, '');
  ok(/仮払消費税等[\s\S]{0,40}80/.test(sheets), 'kessan: 仮払が貸借対照表の行に出る');
  ok(/仮受消費税等[\s\S]{0,40}80/.test(sheets), 'kessan: 仮受が貸借対照表の行に出る');

  // 資産・負債を同額入れたので貸借は崩れない = 不一致の指摘が出ない。
  const check = await page.locator('[data-kessan-check]').innerText().catch(() => '');
  ok(!check.includes('貸借が一致していません'), 'kessan: 両建てしても貸借は崩れない');

  // 納付と還付は同時に立たない — 入力者が気づけない誤りなので検算で拾う。
  await page.getByLabel('未払消費税等', { exact: false }).first().fill('30');
  await page.getByLabel('未収還付消費税等', { exact: false }).first().fill('30');
  await page.waitForFunction(
    () => (document.querySelector('[data-kessan-check]')?.textContent ?? '').includes('どちらか一方'),
    undefined,
    { timeout: 15000 },
  );
  ok(true, 'kessan: 納付と還付の両建てを検算が指摘する');

  ok(errors.length === 0, `kessan: ページエラー 0 (実際 ${errors.length})`);
  if (errors.length > 0) errors.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx.close();
}

/**
 * クリックジャッキング拒否 — **枠に入れられたら動かない**ことを実機で見る。
 *
 * `security/frameGuard.ts` の単体検査は `isFramed()` の判定と
 * `renderFrameRefusal()` の DOM を別々に固定しているが、
 * **「枠の中でアプリが本当に立ち上がらないか」は別の問い**である
 * (判定が正しくても `main.tsx` の分岐が壊れれば React は mount する)。
 *
 * `frame-ancestors` は `<meta>` の CSP では効かない (実測済み) ので、
 * GitHub Pages / `file://` ではこの JS 側の拒否だけが防御線になる。
 * だからこそ実物で確かめる価値がある。
 *
 * **空撃ち対策**: 「アプリが描画されない」は *iframe が読み込まれなかった*
 * ときにも成立してしまう。枠の中に拒否の文言が出ていることを併せて見る。
 */
async function frameGuardSuite(browser) {
  console.log('--- 枠 (iframe) に入れられたら動かない ---');
  const attackPath = path.join(path.dirname(targetAbs), '__e2e-frame-attack.html');
  fs.writeFileSync(
    attackPath,
    '<!doctype html><meta charset="utf-8"><title>attack</title>' +
      `<h1>攻撃者のページ</h1><iframe src="./${path.basename(targetAbs)}" width="1000" height="700"></iframe>`,
  );
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto('file://' + attackPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const frame = page.frames().find((f) => f.url().includes(path.basename(targetAbs)));
    ok(!!frame, 'frame: iframe が読み込まれた (これが偽なら以降は空撃ち)');
    if (frame) {
      const text = await frame.locator('body').innerText().catch(() => '');
      ok(text.length > 0, 'frame: 枠の中は真っ白ではない');
      ok(text.includes('枠の中では開けません'), 'frame: 拒否の見出しが出る');
      ok((await frame.locator('.sidebar').count().catch(() => 0)) === 0, 'frame: アプリ本体 (サイドバー) が無い');
      ok(
        !/はじめてのご利用|ロック解除/.test(text),
        'frame: 保管庫の画面も出さない (操作させる面を一切与えない)',
      );
    }
    // 対照 — 枠でなければ普通に立ち上がる。これが無いと「常に拒否」でも通る。
    const solo = await ctx.newPage();
    await solo.goto('file://' + targetAbs, { waitUntil: 'domcontentloaded' });
    await solo.waitForTimeout(3000);
    const soloText = await solo.locator('body').innerText();
    ok(/はじめてのご利用|ロック解除/.test(soloText), 'frame: 対照 — 枠なしなら普通に動く');
    ok(!soloText.includes('枠の中では開けません'), 'frame: 対照 — 枠なしでは拒否を出さない');
    await solo.close();
  } finally {
    await ctx.close();
    fs.rmSync(attackPath, { force: true });
  }
}

/**
 * **開いただけで外へ出ていかない** — 同梱の見本データが第三者に信号を送らないこと。
 *
 * 2026-08-24 に実測して見つけた: 見本の画像 URL がホストだけ本物のままで、
 * 資格情報を 1 つも設定していないのにページを開くだけで
 *
 *   Canva のページ  → design.canva.ai へ 12 件
 *   GitHub のページ → avatars.githubusercontent.com へ 2 件
 *
 * が飛んでいた。「この IP がこの時刻にこのアプリを開いた」が相手に渡る。
 * 見本を取りに行く機能上の理由は無く、オフラインでは壊れるだけである。
 *
 * **文字列で禁じるのではなく挙動で見る** —— `<img>` だけでなく CSS の
 * `url()`・`fetch`・`<link>` など経路は複数あり、字面の規則は次の経路で抜ける。
 * ここでは「実際に何本出て行ったか」だけを数える。
 *
 * 連携を設定していない状態が前提なので、期待値は **0 件**。
 */
async function noBeaconSuite(browser) {
  console.log('--- 開いただけで外へ出ていかない ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const outbound = new Map();
  page.on('request', (r) => {
    const u = r.url();
    if (!/^https?:/.test(u)) return;
    const host = new URL(u).host;
    outbound.set(host, (outbound.get(host) ?? 0) + 1);
  });

  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  ok(outbound.size === 0, `beacon: 起動〜保管庫作成で外部通信 0 (実際 ${describeOutbound(outbound)})`);

  // 見本に画像を持つ SaaS 面を回る。ここが漏れていた 2 つを必ず含める。
  for (const id of ['canva', 'github', 'wordpress', 'gdrive', 'slack']) {
    outbound.clear();
    await page.goto(FILE + '#' + id, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=ロック解除', { timeout: 30000 });
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.getByRole('button', { name: 'ロック解除' }).click();
    await page.waitForTimeout(2500);
    ok(outbound.size === 0, `beacon: ${id} を開いて外部通信 0 (実際 ${describeOutbound(outbound)})`);

    // **「通信が起きない」だけでは足りない。** 見本画像を `data:` に差し替えた
    // ので、SVG の符号化を壊しても通信は起きず、この節は通ってしまう ——
    // 画面には壊れた画像が出る。**絵として描けているか**まで見る。
    const imgs = await page.$$eval('img', (els) =>
      els
        .filter((e) => (e.getAttribute('src') ?? '').startsWith('data:image'))
        .map((e) => ({ w: e.naturalWidth, h: e.naturalHeight, done: e.complete })),
    );
    const broken = imgs.filter((i) => !(i.done && i.w > 0 && i.h > 0));
    ok(
      broken.length === 0,
      `beacon: ${id} の data: 画像が描けている (${imgs.length} 件中 壊れ ${broken.length})`,
    );
  }
  await ctx.close();
}

/** 失敗時に「どこへ何本」まで出す。件数だけだと直す手がかりにならない。 */
function describeOutbound(map) {
  if (map.size === 0) return '0 件';
  return [...map].map(([h, n]) => `${h}:${n}`).join(' ');
}

/**
 * パスワード変更と、控えた 24 語での復旧 — **実 IndexedDB で通ること**。
 *
 * 2026-08-24 に 2 つ直した経路である。
 *
 *  - `changePassword` を新設 (以前は画面が保管庫を消して作り直しており、
 *    失窓で資格情報が消え、**控えた 24 語も通らなくなっていた**)
 *  - meta と `master-wrap` の書き込みを 1 トランザクションに寄せた
 *    (以前は `idbPut` 2 回。片方だけ書けると新旧どちらでも開けない)
 *
 * 単体検査は fake-indexeddb で通っているが、**トランザクションの意味論は
 * 実物で確かめる価値がある**。
 */
async function vaultPasswordSuite(browser) {
  console.log('--- パスワード変更と 24 語での復旧 ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);

  const PW2 = 'changed-pass-67890';
  const PW3 = 'recovered-pass-2468';

  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=はじめてのご利用', { timeout: 30000 });
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(PASS);
  await pw.nth(1).fill(PASS);
  await page.getByRole('button', { name: 'パスワードを設定して開始' }).click();
  await page.waitForSelector('input[type="checkbox"]', { timeout: 30000 });

  // 24 語を控える。画面は「1. word」の形で並べているので、そこから拾う。
  const shown = await page.locator('body').innerText();
  const WORD_RE = new RegExp('(\\d{1,2})\\.\\s*([a-z]+)', 'g');
  const words = [...shown.matchAll(WORD_RE)]
    .filter((m) => Number(m[1]) >= 1 && Number(m[1]) <= 24)
    .map((m) => m[2]);
  ok(words.length === 24, 'vault: リカバリーキー 24 語を画面から拾えた (実際 ' + words.length + ')');
  const mnemonic = words.join(' ');

  await page.locator('input[type="checkbox"]').check();
  await page.getByRole('button', { name: /記録完了/ }).click();
  await page.waitForSelector('.sidebar', { timeout: 30000 });

  // ── パスワードを変更する ──
  await page.goto(FILE + '#settings', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=ロック解除', { timeout: 30000 });
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.waitForSelector('input[placeholder="現在のパスワード"]', { timeout: 30000 });
  await page.locator('input[placeholder="現在のパスワード"]').fill(PASS);
  await page.locator('input[placeholder^="新しいパスワード ("]').first().fill(PW2);
  await page.locator('input[placeholder="新しいパスワード (確認)"]').fill(PW2);
  await page.getByRole('button', { name: 'パスワードを変更' }).click();
  await page.waitForFunction(
    () => (document.body.textContent ?? '').includes('パスワードを変更しました'),
    undefined,
    { timeout: 30000 },
  );
  ok(true, 'vault: パスワードを変更できた');

  // ── 新パスワードで開く / 旧パスワードでは開かない ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=ロック解除', { timeout: 30000 });
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.waitForFunction(
    () => (document.body.textContent ?? '').includes('パスワードが違います'),
    undefined,
    { timeout: 30000 },
  );
  ok(true, 'vault: 旧パスワードでは開かない');
  await page.locator('input[type="password"]').first().fill(PW2);
  await page.getByRole('button', { name: 'ロック解除' }).click();
  await page.waitForSelector('.sidebar', { timeout: 30000 });
  ok(true, 'vault: 新パスワードで開く');

  // ── ★ 控えた 24 語で復旧できる (変更前に控えたもの) ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=ロック解除', { timeout: 30000 });
  await page.getByRole('button', { name: /パスワードを忘れた場合/ }).click();
  await page.waitForSelector('textarea', { timeout: 15000 });
  await page.locator('textarea').fill(mnemonic);
  const recPw = page.locator('input[type="password"]');
  await recPw.nth(0).fill(PW3);
  await recPw.nth(1).fill(PW3);
  await page.getByRole('button', { name: '復元してロック解除' }).click();
  // **成否のどちらかが出るまで待つ。** `.sidebar` だけを待つと、復旧が壊れた
  // ときに 30 秒のタイムアウトになり「何が起きたか」が読めない失敗になる
  // (対照実験で実際にそうなった)。画面が出す拒否の文言も見て、
  // どちらが起きたかを名指しする。
  const recovered = await page
    .waitForFunction(
      () => {
        if (document.querySelector('.sidebar')) return 'ok';
        const t = document.body.textContent ?? '';
        if (t.includes('リカバリーキーが違います')) return 'rejected';
        return false;
      },
      undefined,
      { timeout: 30000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => 'timeout');
  ok(
    recovered === 'ok',
    `★ vault: パスワード変更後も、控えた 24 語で復旧できる (実際 ${recovered})`,
  );

  ok(errs.length === 0, 'vault: ページエラー 0 (実際 ' + errs.length + ')');
  if (errs.length > 0) errs.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx.close();
}

/*
 * 保管領域が「消えうる」ことを、実機の画面が正しく名乗るか。
 *
 * ブラウザ版の保管庫は IndexedDB に在り、既定では best-effort の領域になる
 * (実測 2026-08-25: `persisted()` も `persist()` も false)。この状態では
 * 空き容量の都合や長期の無操作でブラウザが立ち退かせうるが、**控えた 24 語
 * では戻せない** —— フレーズは保管庫を*開ける*ための物で、立ち退きでは
 * 暗号化されたトークンごと消えるため、開ける対象が残らない。
 *
 * ## 対照を節の中に入れてある
 *
 * 「best-effort のとき警告が出る」だけを見ると、**常に警告を出す実装**でも
 * 通り、**常に best-effort を返す実装**でも通ってしまう。そこで 2 つの
 * 文脈を走らせ、**値と表示が連動する**ことを見る:
 *
 *   A. 既定 (実際の環境)        → durability=best-effort / 警告が**出る**
 *   B. persisted() を true に偽装 → durability=persistent  / 警告が**出ない**
 *
 * A だけなら「常に警告」で通り、B だけなら「常に沈黙」で通る。両方あって
 * はじめて「問い合わせた値で出し分けている」と言える。
 */
async function storageDurabilitySuite(browser) {
  console.log('--- 保管領域が消えうることを名乗る ---');

  // 保護状態の欄が非同期に埋まるまで待つ (「確認中…」の間に読むと空振りする)。
  const waitProtection = (page) =>
    page.waitForFunction(
      () => {
        const t = document.body.textContent ?? '';
        return (
          t.includes('トークンは暗号化されています') ||
          t.includes('トークンを暗号化できません') ||
          t.includes('保護状態を取得できませんでした')
        );
      },
      undefined,
      { timeout: 30000 },
    );

  // ── A. 既定の環境 ──
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);

  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await setupVault(page);

  const sp = await page.evaluate(() => window.serviceHub.storageProtection());
  ok(
    ['file', 'persistent', 'best-effort'].includes(sp.durability),
    `durability: 3 値のどれかを名乗る (実際 ${JSON.stringify(sp.durability)})`,
  );
  // ブラウザ版に `file` は無い —— あれは Electron の userData のファイル。
  ok(sp.durability !== 'file', `durability: ブラウザ版で file を名乗らない (実際 ${sp.durability})`);
  ok(sp.encrypted === true, `durability: 暗号化の欄とは別に立っている (encrypted=${sp.encrypted})`);

  // 実際に**問い合わせて**いるか —— ブラウザ自身の答えと突き合わせる。
  const persisted = await page.evaluate(async () => {
    try {
      return await navigator.storage.persisted();
    } catch {
      return 'unavailable';
    }
  });
  ok(
    persisted === 'unavailable'
      ? sp.durability === 'best-effort'
      : sp.durability === (persisted ? 'persistent' : 'best-effort'),
    `durability: ブラウザの persisted() と一致する (persisted=${persisted} / durability=${sp.durability})`,
  );

  await gotoService(page, '#settings', 'text=保存時の保護状態');
  await waitProtection(page);
  const body = await page.locator('body').innerText();
  const warned = body.includes('消えうる');
  ok(
    warned === (sp.durability === 'best-effort'),
    `★ 表示: durability の値と警告の有無が一致する (durability=${sp.durability} / 警告=${warned})`,
  );
  if (sp.durability === 'best-effort') {
    ok(body.includes('24 語では戻せません'), '表示: 24 語では戻せないことを書いている');
    ok(body.includes('生成元の保存領域ごと'), '表示: 消えるのは保管庫だけでないと書いている');
    // **何が戻って何が戻らないかを、両方向とも出す。** 片側しか出ない表は
    // 「全部戻せる」または「全部諦めろ」に読めて、どちらも行動を誤らせる。
    ok(body.includes('戻せます'), '表示: 戻せる物を名指ししている (業務レコード)');
    ok(body.includes('戻せません'), '表示: 戻せない物を名指ししている (API キー)');
    ok(body.includes('登録し直す'), '表示: 戻せない物のその後を書いている (再登録)');
    /*
     * **退行の番人。** 最初の実装は「トークンごと失われます」の直後に
     * 「バックアップを書き出してください」と書いており、**書き出せば
     * トークンも戻る**と読めた。実際にはバックアップは業務レコードだけで、
     * API キーは構造的に入らない (`BACKUP_EXCLUSIONS` の 1 番目)。
     * **守られたつもりで失う**のがいちばん悪いので、この文言に戻ったら鳴らす。
     */
    ok(
      !body.includes('バックアップを書き出してください'),
      '★ 表示: 「バックアップを書き出してください」と言い切らない (トークンは戻らない)',
    );
  }
  /*
   * **同じ話を、利用者が居る場所でしているか。**
   *
   * 「暗号化されているのはトークンだけ」「立ち退きで全部消える」は
   * 監査文書には書いたが、書類を置く人が見るのは**ライブラリの画面**である。
   * 設定画面まで読みに行く前提の開示は、開示していないのとあまり変わらない。
   */
  await gotoService(page, '#library', 'text=50 MB / 100 件');
  const lib = await page.locator('body').innerText();
  ok(lib.includes('暗号化されません'), 'ライブラリ: 書類が暗号化されないと画面で言っている');
  ok(lib.includes('ここのファイルは入りません'), 'ライブラリ: バックアップに入らないと画面で言っている');
  // アプリ自身の自動削除 (50 MB / 100 件) と、ブラウザの立ち退きは**別の消え方**。
  // 片方だけ書くと、もう片方に備えられない。
  ok(lib.includes('50 MB / 100 件'), 'ライブラリ: アプリ側の自動削除の上限を言っている');
  ok(lib.includes('まとめて'), 'ライブラリ: ブラウザ側の立ち退き (全部消える) を別に言っている');

  ok(errs.length === 0, `durability: ページエラー 0 (実際 ${errs.length})`);
  if (errs.length > 0) errs.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx.close();

  // ── B. 対照: persisted() が true を返す環境を作る ──
  // `addInitScript` は毎回の遷移の前に走るので、リロードを挟む gotoService でも効く。
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(() => {
    try {
      Object.defineProperty(navigator.storage, 'persisted', {
        value: async () => true,
        configurable: true,
      });
    } catch {
      /* 偽装できない環境ではそのまま (下の検査が実際の値で落ちて気づける) */
    }
  });
  const page2 = await ctx2.newPage();
  const errs2 = [];
  collectErrors(page2, errs2);

  await page2.goto(FILE, { waitUntil: 'domcontentloaded' });
  await setupVault(page2);
  const sp2 = await page2.evaluate(() => window.serviceHub.storageProtection());
  ok(
    sp2.durability === 'persistent',
    `★ 対照: persisted() が true なら persistent を名乗る (実際 ${sp2.durability})`,
  );

  await gotoService(page2, '#settings', 'text=保存時の保護状態');
  await waitProtection(page2);
  const body2 = await page2.locator('body').innerText();
  ok(
    !body2.includes('消えうる'),
    '★ 対照: 消えない領域では立ち退きの警告を出さない (常に警告する実装をここで落とす)',
  );
  // 警告が消えても、保護状態の欄そのものは出ている (節ごと落ちたのを
  // 「警告が無い」と読み違えないため)。
  ok(
    body2.includes('保存先:'),
    '対照: 保護状態の欄自体は出ている (節ごと消えたのを「警告なし」と読まない)',
  );
  ok(errs2.length === 0, `対照: ページエラー 0 (実際 ${errs2.length})`);
  if (errs2.length > 0) errs2.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx2.close();
}

/*
 * セキュリティ診断が、**たどり着き方で変わらない**こと。
 *
 * 2026-08-25 の実測 —— 同じ端末・同じ設定なのに:
 *
 * ```
 *   アプリ内で移動して開く  → 自動ロック ✅  スコア 10
 *   直接ロードして解錠      → 自動ロック ⚠   スコア  0
 * ```
 *
 * 原因は**読む時刻**だった。自動ロックは `App` の効果 (解錠後) で始まるが、
 * `SecurityPage` は `useMemo(..., [])` で**初回描画中**に読む ——
 * あらゆる効果より前で、React は子の効果を親より先に走らせるので、
 * どの経路でも「まだ始まっていない」しか見えない…はずが、アプリ内移動では
 * **親の効果が既に走り終えている**ので見える。悪いほうを出すのは
 * **ブックマークや再読み込みの経路**だった。
 *
 * 「読む関数がある」ことと「正しい時刻に読む」ことは別である。
 * ここで留めるのは**経路によらず同じ答えを出す**という性質そのもの
 * ——「✅ が出る」だけを見ると、両方 ⚠ の実装でも通ってしまう。
 */
async function securityPostureSuite(browser) {
  console.log('--- 診断が、たどり着き方で変わらない ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);

  const readReport = async () => {
    await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('セキュリティ・グレード'),
      undefined,
      { timeout: 30000 },
    );
    const t = await page.locator('body').innerText();
    const i = t.indexOf('データベース・セキュリティ診断');
    const block = t.slice(i, i + 900);
    const score = /スコア\s*(\d+)\s*\/\s*100/.exec(block);
    const autolock = /自動ロック[^\n]*/.exec(block);
    const master = /マスターパスワード設定[^\n]*/.exec(block);
    return {
      score: score === null ? null : Number(score[1]),
      autolock: autolock === null ? '' : autolock[0],
      master: master === null ? '' : master[0],
      block,
    };
  };

  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await setupVault(page);

  // ── 経路 A: アプリ内で移動 (親の効果は既に走り終えている) ──
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 'security' })),
  );
  const a = await readReport();

  // ── 経路 B: 直接ロードして解錠 (画面が親の効果より先に描かれる) ──
  await gotoService(page, '#security', 'text=セキュリティ・グレード');
  const b = await readReport();

  ok(
    a.score !== null && b.score !== null,
    `診断: 両経路でスコアが読めた (A=${a.score} / B=${b.score})`,
  );
  ok(
    a.score === b.score,
    `★ 診断: たどり着き方でスコアが変わらない (アプリ内移動 ${a.score} / 直接ロード ${b.score})`,
  );
  ok(
    a.autolock === b.autolock,
    `★ 診断: たどり着き方で自動ロックの札が変わらない (A「${a.autolock}」/ B「${b.autolock}」)`,
  );

  // **「同じ」だけでは足りない。** 両方 ⚠ の実装でも「同じ」は成り立つ。
  // 実際に動いている物が ✅ で出ていることまで見る。
  ok(b.autolock.includes('✅'), `診断: 自動ロックは実際に動いているので ✅ (実際「${b.autolock}」)`);
  ok(
    b.master.includes('✅'),
    `★ 診断: マスターパスワードは設定済みなので ✅ (保管庫を作らないとここへ来られない) — 実際「${b.master}」`,
  );

  // 従えない助言を出していないか (レコード暗号化を有効にする画面は無い)。
  ok(
    !b.block.includes('設定でレコード暗号化を有効化し'),
    '★ 診断: 存在しない設定へ誘導していない (レコード暗号化の有効化画面は未配線)',
  );

  /*
   * **直せないものを、直せることとして並べない。**
   *
   * 7 観点のうち 5 つはこの版に仕組みが無く (重み 75)、重み降順の一覧では
   * 上を占めていた。今できる 2 件は下に埋まる。分けて出すこと自体を留める。
   */
  ok(
    b.block.includes('この版に無い保護'),
    '★ 診断: 直せない項目を別枠にしている (混ぜると一覧ごと信じなくなる)',
  );
  ok(
    b.block.includes('設定を変えても直せません'),
    '診断: 直せないことを明言している',
  );
  // **グレードの意味が読めること。** 到達しうる最大が 100 未満なら、
  // 満点を取れない理由は利用者の側に無い。それを書かずに D だけ見せない。
  ok(
    b.block.includes('この版で到達しうる最大'),
    '★ 診断: 到達しうる最大点を示している (D の意味が読める)',
  );
  // 「クラウド」と名乗らせる —— 手で書き出したバックアップを数えていないのに
  // 「バックアップ鮮度」と書くと、毎日書き出している人にも「未実施」と告げる。
  ok(
    b.block.includes('クラウドバックアップ鮮度'),
    '診断: バックアップ鮮度が「クラウド」の話だと名乗っている',
  );

  ok(errs.length === 0, `診断: ページエラー 0 (実際 ${errs.length})`);
  if (errs.length > 0) errs.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx.close();
}

/*
 * 第三者へ送る機能が、**送ると言ってから送る**こと。
 *
 * ## なぜ節を立てるか (2026-08-25)
 *
 * セキュリティ画面には 3 つ並んでいる:
 *
 *   パスワード強度チェッカー … 「この端末内だけで評価し、外部に送信しません」
 *   メール漏洩チェック (HIBP) … 入力したアドレスを第三者へ送る
 *   URL スキャン (VirusTotal) … 入力した URL を第三者へ送る
 *
 * VirusTotal の節は説明を**入力欄より前**に置いてある (送信は取り消せない
 * から、という理由がコードに書いてある)。**HIBP には何も無かった。**
 * すぐ上が「送信しません」と約束しているので、黙っていると
 * **その約束がページ全体に及ぶと読まれる**。
 *
 * ## もう 1 つ、門が開かなかった
 *
 * ブラウザ版の `fetchSnapshot('security')` は `not_implemented` を返して
 * いたので、`keysConfigured` は同梱スナップショットの false から**永久に
 * 動かなかった**。利用者は画面の言うとおり鍵を保存し (**保存は成功する**)、
 * それでもボタンは押せない。送信側は shim に実装済みだったので、
 * **動く機能が、開かない門の向こうに在った**。
 */
async function thirdPartyDisclosureSuite(browser) {
  console.log('--- 第三者へ送る前に、送ると言う ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);

  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  await setupVault(page);

  // 鍵を入れる前は閉じている (門が最初から開いていたら、開くことを測れない)。
  const before = await page.evaluate(() => window.serviceHub.fetchSnapshot('security'));
  ok(
    before.ok === true && before.data.keysConfigured.hibp === false,
    `第三者送信: 鍵を入れる前は未設定と返る (実際 ${JSON.stringify(before).slice(0, 90)})`,
  );

  const saved = await page.evaluate(() =>
    window.serviceHub.setToken('security', '{"hibp":"stub-key","vt":"stub-key"}'),
  );
  ok(saved.ok === true, '第三者送信: 鍵を保存できた');

  const after = await page.evaluate(() => window.serviceHub.fetchSnapshot('security'));
  ok(
    after.ok === true && after.data.keysConfigured.hibp === true && after.data.keysConfigured.vt === true,
    `★ 第三者送信: 鍵を保存すると門が開く (実際 ${JSON.stringify(after.data?.keysConfigured)})`,
  );

  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 'security' })),
  );
  await page.waitForSelector('text=メール漏洩チェック', { timeout: 30000 });
  // 画面はスナップショット由来で描かれるので、実データを取り直させる。
  const refresh = page.getByRole('button', { name: '更新' });
  if ((await refresh.count()) > 0) {
    await refresh.first().click();
    await page.waitForTimeout(1500);
  }

  const check = page.getByRole('button', { name: 'チェック' });
  const enabled = (await check.count()) > 0 && (await check.first().isEnabled());
  ok(enabled, '★ 第三者送信: 鍵を保存すると HIBP の欄が実際に開ける (以前は永久に disabled だった)');
  if (enabled) await check.first().click();
  const scan = page.getByRole('button', { name: 'スキャン' });
  if ((await scan.count()) > 0 && (await scan.first().isEnabled())) await scan.first().click();
  await page.waitForTimeout(800);

  const t = await page.locator('body').innerText();
  ok(t.includes('第三者のサービス) へ送信されます'), '★ HIBP: 第三者へ送ると書いている');
  ok(t.includes('端末内で完結しません'), '★ HIBP: 上の「送信しません」と違うと明言している');
  ok(
    t.includes('他の VirusTotal 利用者が検索できる状態'),
    'VirusTotal: 送信先で残ることを書いている',
  );
  // 経路に居るのは相手だけではない —— ブラウザ版はプロキシを通る。
  ok(
    t.split('プロキシ (Cloudflare Worker) を経由').length - 1 >= 2,
    `★ 両方: プロキシの運用者からも見えると書いている (実際 ${t.split('プロキシ (Cloudflare Worker) を経由').length - 1} 箇所)`,
  );

  /*
   * **経路の持ち主が誰かを言う。**
   *
   * BYO プロキシの欄は自由入力の URL で、他人の Worker を入れても止まらない
   * (どの URL が「あなたの物」かは判定できないので、止めようも無い)。
   * `fetchViaProxy` は呼び出し側のヘッダをそのまま封筒へ載せるため、
   * **`Authorization: Bearer <トークン>` が Worker の運用者に見える**。
   *
   * 画面には「共有秘密を空欄にすると誰でも中継できます」= **他人があなたの
   * Worker を使う**側だけが書いてあった。**あなたが他人の Worker を使う**側は
   * 帯域ではなく資格情報を失うので明らかに重い。判定できない以上、
   * **言うことが唯一の対策**になる。
   */
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('servicehub:navigate', { detail: 'settings' })),
  );
  await page.waitForSelector('text=BYO プロキシ', { timeout: 30000 });
  const st = await page.locator('body').innerText();
  ok(
    st.includes('あなたが管理している Worker だけ'),
    '★ プロキシ: 自分の Worker だけを入れるよう言っている',
  );
  ok(
    st.includes('Authorization ヘッダ) がそのまま乗ります'),
    '★ プロキシ: 何が渡るのか (トークン) を名指ししている',
  );
  /*
   * 逆向き (他人が自分の Worker を使う) の説明は**入力欄を開かないと出ない**
   * ので、ここでは見ない —— 字面は `storageClaims.test.ts` が既に留めている。
   * (最初はここでも見ようとして落ちた。折りたたんだ本文に無いのが理由で、
   *  検査のほうが誤っていた。同じ画面に「設定する」が 4 つあるのも罠。)
   */

  ok(errs.length === 0, `第三者送信: ページエラー 0 (実際 ${errs.length})`);
  if (errs.length > 0) errs.slice(0, 3).forEach((e) => console.log('     ' + e.slice(0, 160)));
  await ctx.close();
}

async function businessComparisonSuite(browser) {
  console.log('--- 事業間比較に自分の事業を足す ---');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  collectErrors(page, errs);
  await page.addInitScript(() => localStorage.setItem('servicehub.plan', 'enterprise'));

  await page.goto(FILE + '#overview', { waitUntil: 'domcontentloaded' });
  await setupVault(page);
  await page.waitForSelector('[data-manual-data]', { timeout: 30000 });

  // 同梱分がサンプルと明示されている (実績と混同させない)。**ラベルで見る** —
  // 本文全体で探すと、説明文に書いた「(サンプル)」の語に当たって素通りする。
  await page.waitForSelector('[data-bar-row]', { timeout: 30000 });
  const barLabelsBefore = await page.locator('[data-bar-row]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-bar-row') ?? ''),
  );
  ok(
    barLabelsBefore.every((l) => l.endsWith('(サンプル)')),
    `同梱の 10 件はすべて「(サンプル)」付き — 実際 ${JSON.stringify(barLabelsBefore.slice(0, 2))}`,
  );

  // 事業を金額つきで登録する。
  await page.click('[data-manual-data] > button');
  await page.waitForSelector('[data-business-units]', { timeout: 30000 });
  await page.fill('[data-business-units] input[aria-label="事業名"]', '自社EC');
  await page.fill('[data-business-units] input[aria-label="月次の売上高"]', '2000000');
  await page.fill('[data-business-units] input[aria-label="月次の変動費"]', '800000');
  await page.fill('[data-business-units] input[aria-label="月次の固定費"]', '400000');
  await page.click('[data-business-units] button:has-text("事業を追加")');
  await page.waitForSelector('[data-business-unit]', { timeout: 15000 });

  ok(
    ((await page.textContent('[data-business-amounts]')) ?? '').includes('2,000,000'),
    '一覧に月次の売上が出る',
  );

  // 比較グラフの対象事業に自分の事業が入る。**この select に限定する** —
  // ページ上には数値を紐づける用の事業ドロップダウンもあり、そちらは
  // 売上の無い事業も載るのが正しいので、混ぜて数えると判定にならない。
  const unitOptions = await page.locator('[data-financial-unit-select] option').allTextContents();
  ok(unitOptions.includes('自社EC'), `比較の対象に自分の事業が入る — 実際 ${JSON.stringify(unitOptions.slice(0, 3))}`);
  ok(unitOptions[0] === '自社EC', '自分の事業がサンプルより先に並ぶ (既定の選択になる)');

  // 棒グラフの行として描かれていること。**行のラベルで見る** — 本文全体で
  // 探すと、入力欄自身が出している事業名に当たって素通りする。
  const barLabels = await page.locator('[data-bar-row]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-bar-row') ?? ''),
  );
  ok(barLabels.includes('自社EC'), `比較グラフの行に自分の事業が出る — 実際 ${JSON.stringify(barLabels.slice(0, 2))}`);
  // 2,000,000 − 800,000 − 400,000 = 800,000 → 利益率 40.0%。
  const ecRow = (await page.textContent('[data-bar-row="自社EC"]')) ?? '';
  ok(ecRow.includes('40'), `入力から導いた利益率が行に出る (期待 40%) — 実際 "${ecRow.trim()}"`);

  // 売上なしの事業は比較に出さない (未入力を 0% として並べない)。
  await page.fill('[data-business-units] input[aria-label="事業名"]', '名前だけ事業');
  await page.click('[data-business-units] button:has-text("事業を追加")');
  await page.waitForTimeout(300);
  const unitOptionsAfter = await page.locator('[data-financial-unit-select] option').allTextContents();
  ok(!unitOptionsAfter.includes('名前だけ事業'), '売上の無い事業は比較に出さない (未入力を 0% として並べない)');
  const barLabelsAfter = await page.locator('[data-bar-row]').evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-bar-row') ?? ''),
  );
  ok(!barLabelsAfter.includes('名前だけ事業'), '売上の無い事業は棒グラフにも出さない');
  const tagOptions = await page.locator('[data-manual-data] select option').allTextContents();
  ok(tagOptions.includes('名前だけ事業'), '売上が無くても数値の紐づけ先としては使える');

  // 連結（合算）は出所を混ぜない。棒グラフは 1 本ずつラベルが付くので実績と
  // サンプルを並べてよいが、連結は 1 つの数に潰れる — 混ぜた合計はどちらの
  // 会社の数でもない。合算した集合を見出しに書いているかを実物で確かめる。
  const consolidateLabel = (await page.textContent('label:has-text("連結")')) ?? '';
  ok(consolidateLabel.includes('自分の事業 1 件'),
    `連結は実績だけを足すと明示する — 実際 "${consolidateLabel.trim()}"`);
  ok(!consolidateLabel.includes('全事業合算'), '「全事業合算」と称して出所を伏せない');

  await page.click('label:has-text("連結") input[type="checkbox"]');
  await page.waitForTimeout(200);

  // 連結の損益計算書から「売上高」の行の金額そのものを読む。
  // 本文全体で数字を探すと、単体表示の年商やサンプルの数字に当たって
  // 素通りする — 行を特定して値を取る。
  const consolidatedRevenue = await page.evaluate(() => {
    for (const tr of Array.from(document.querySelectorAll('tr'))) {
      const cells = tr.querySelectorAll('td');
      if (cells.length >= 2 && (cells[0].textContent ?? '').trim() === '売上高') {
        return (cells[1].textContent ?? '').replace(/[^0-9]/g, '');
      }
    }
    return null;
  });
  // 実績は自社EC 1 件だけ。月商 200 万 → 年商 2,400 万。
  // サンプル 10 件を足していればこの値には絶対にならない。
  ok(consolidatedRevenue === '24000000',
    `連結の売上高が実績 1 件ぶんと一致する (期待 24000000) — 実際 ${consolidatedRevenue}`);

  ok(errs.length === 0, `事業間比較: ページエラー 0 (実際 ${errs.length})`);
  await ctx.close();
}

(async () => {
  console.log(`E2E 対象: ${targetAbs} (${(fs.statSync(targetAbs).size / 1048576).toFixed(2)} MB)`);
  const browser = await pw.chromium.launch({
    ...(EXEC ? { executablePath: EXEC } : {}),
    args: ['--no-sandbox'],
  });
  // `SERVICE_HUB_E2E_ONLY=dataOrigin,manualData` で一部だけ流す。
  // 目的は対照実験 — 「本体を壊したらこの検査が実際に落ちるのか」を確かめる時、
  // 全 suite (数分) を回さずに済む。既定 (未設定) は全 suite。
  const only = (process.env.SERVICE_HUB_E2E_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const run = (name) => only.length === 0 || only.includes(name);
  if (only.length > 0) console.log(`(SERVICE_HUB_E2E_ONLY=${only.join(',')})`);
  if (run('desktop')) await desktopSuite(browser);
  if (run('manualData')) await manualDataSuite(browser);
  if (run('dataOrigin')) await dataOriginSuite(browser);
  if (run('credential')) await credentialSuite(browser);
  if (run('businessComparison')) await businessComparisonSuite(browser);
  if (run('kessanTax')) await kessanTaxSuite(browser);
  if (run('frameGuard')) await frameGuardSuite(browser);
  if (run('noBeacon')) await noBeaconSuite(browser);
  if (run('vaultPassword')) await vaultPasswordSuite(browser);
  if (run('storageDurability')) await storageDurabilitySuite(browser);
  if (run('securityPosture')) await securityPostureSuite(browser);
  if (run('thirdPartyDisclosure')) await thirdPartyDisclosureSuite(browser);
  if (run('realtime')) await realtimeSuite(browser);
  if (run('phone')) await phoneSuite(browser);
  if (run('tablet')) await tabletSuite(browser);
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
