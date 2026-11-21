#!/usr/bin/env node
'use strict';
/*
 * 第 3 層の画面 (GET /auth/) を本物のブラウザで通す検査。
 *
 * 使い方: node zero-trust-gateway/tests/browser/auth_page.cjs
 *   (ZT_PYTHON に、requirements.txt を入れた Python を渡す。既定は python3。playwright が要る)
 *
 * 1. serve.py に空の一時ディレクトリを渡して、手元だけの入口を起こす (127.0.0.1 · 試しの控えはその場で作る)。
 * 2. Chromium の試験用の認証器 (WebAuthn の virtual authenticator) を 2 つ足す —— 物理キー (usb・同期しない) と
 *    スマホのパスキー (internal・同期する)。物理キーには serve.py が作った「登録済みの鍵」を入れる。
 * 3. 画面のボタンを利用者と同じ順に押し、画面の文と状態を確かめる:
 *      強い認証の前の許可 → 断られる / スマホのパスキーを登録 / 物理キーの 2 台目を登録コードで → 断られる /
 *      物理キーで確認 → 1 つ / スマホで確認 → 2 つ / 読み直しても状態は残る / 許可をもらって守られた道を通る /
 *      スマホ幅で横に切れない / 鍵を消す → 状態は「まだ」に戻り、許可ももらえない
 * 4. ブラウザが記録した誤り・警告は、理由を書いた 2 つ (下の EXPECTED) のほかは 1 件でも落とす。
 *
 * 外へは出ない (入口は 127.0.0.1・画面の CSP は connect-src 'self')。登録コードと鍵は一時ディレクトリと
 * このプロセスの中だけに在り、どれも刷らない。終わったら入口を止め、一時ディレクトリを消す。
 * 物理キーの「登録」が通る形は試せない —— 試験用の認証器は登録のたびに新しい自作の証明書を作るので、
 * 入口は正しく断る (README の「知っておく限界」)。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright が見つかりません (npm install --no-save playwright@<版> で入れてください)');
  process.exit(2);
}

const GATEWAY = path.resolve(__dirname, '..', '..');
const PORT = 8765;
const PAGE = `http://localhost:${PORT}/auth/`;
const PYTHON = process.env.ZT_PYTHON || 'python3';
/** ブラウザが記録してよい物 (どちらも入口が正しく断った結果)。 */
const EXPECTED = [
  // 入口が受ける算法は ES256 と EdDSA だけ (RS256 を並べない) —— Chromium はそれを警告として記録する。
  /pubKeyCredParams is missing at least one of the default algorithm identifiers/,
  // 断られることを確かめる段の、応答の記録。
  /status of (401|403)/,
];

function startServer(state) {
  const child = spawn(PYTHON, [path.join(__dirname, 'serve.py'), state, String(PORT)], {
    cwd: GATEWAY,
    env: { ...process.env, PYTHONPATH: 'src' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const handoff = new Promise((resolve, reject) => {
    let buffered = '';
    child.stdout.on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      const end = buffered.indexOf('\n');
      if (end !== -1) resolve(JSON.parse(buffered.slice(0, end)));
    });
    child.once('exit', (code) => reject(new Error(`入口が止まりました (exit ${code})`)));
  });
  return { child, handoff };
}

async function main() {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'zt-browser-'));
  const { child, handoff } = startServer(state);
  let browser = null;
  let failed = 0;
  try {
    const { codes, hardware } = await handoff;
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => {
      if ((m.type() === 'error' || m.type() === 'warning') && !EXPECTED.some((re) => re.test(m.text()))) problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('dialog', (d) => d.accept());

    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable', { enableUI: false });
    const base = { protocol: 'ctap2', ctap2Version: 'ctap2_1', hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: false };
    const hw = (await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...base, transport: 'usb' } })).authenticatorId;
    const phone = (await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...base, transport: 'internal',
      defaultBackupEligibility: true, defaultBackupState: true } })).authenticatorId;
    await cdp.send('WebAuthn.addCredential', { authenticatorId: hw, credential: {
      credentialId: hardware.credentialId, isResidentCredential: true, rpId: 'localhost',
      privateKey: hardware.privateKey, userHandle: hardware.userHandle, signCount: 0 } });
    /** 応じる認証器を 1 つに絞る (利用者がどちらに触れたか)。 */
    const only = async (id) => {
      for (const a of [hw, phone]) await cdp.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId: a, enabled: a === id });
    };

    // 入口が立ち上がるまで開き直す (待つのは「開けた」という条件で、回数ではない)。
    for (let i = 0; ; i += 1) {
      try {
        const res = await page.goto(PAGE);
        if (res && res.ok()) break;
      } catch (err) {
        if (i >= 60) throw err;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const msg = () => page.locator('#msg').textContent();
    const strength = () => page.locator('#state').getAttribute('data-strength');
    const idle = () => page.waitForFunction(() => !document.getElementById('btn-state').disabled);
    const check = async (label, ok, detail) => {
      console.log(`${ok ? 'ok  ' : 'NG  '}${label}${ok ? '' : ` :: ${detail}`}`);
      if (!ok) failed += 1;
    };
    /** 押して、終わるのを待ち、画面の文と状態を確かめる。 */
    const step = async (label, act, wantMsg, wantStrength) => {
      await act();
      await idle();
      const m = await msg();
      const s = await strength();
      await check(label, m.includes(wantMsg) && (wantStrength === undefined || s === wantStrength), `文「${m}」 状態 ${s}`);
    };

    await idle();
    await check('開くと状態を調べる (まだ確認していない)', (await msg()).includes('状態を調べました') && (await strength()) === 'none', await msg());
    const keyId = await page.locator('#key-id').textContent();
    await check('この端末の鍵の指紋が出る', /^[A-Za-z0-9_-]{8,}/.test(keyId || ''), keyId);

    await step('強い認証の前は、許可をもらえない', () => page.click('#btn-try'), '許可をもらえませんでした', 'none');

    await only(phone);
    await step('スマホのパスキーを登録コードで登録する', async () => {
      await page.locator('input[value="phone_passkey"]').check();
      await page.fill('#code', codes[0]);
      await page.click('#btn-register');
    }, 'スマホのパスキーを登録しました');
    await check('登録できたら、コードの欄は空に戻る', (await page.inputValue('#code')) === '', '欄が空でない');

    await only(hw);
    await step('物理キーの 2 台目は登録コードでは足せない (断られる)', async () => {
      await page.locator('input[value="hardware_key"]').check();
      await page.fill('#code', codes[1]);
      await page.click('#btn-register');
    }, '登録できませんでした');

    await step('物理キーで確認すると 1 つ', () => page.click('#btn-verify'), 'もう 1 つで確認してください', 'single');
    await only(phone);
    await step('スマホで確認すると 2 つそろう', () => page.click('#btn-verify'), '2 つそろいました', 'strong');
    await step('読み直しても強い認証は残る (この端末の鍵に結び付いている)', () => page.reload(), '状態を調べました', 'strong');
    await step('許可をもらって、守られた道を通る', () => page.click('#btn-try'), '通りました');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await check('スマホ幅で横に切れない', overflow <= 0, `${overflow}px はみ出す`);

    await step('この端末の鍵を消す', () => page.click('#btn-forget'), '消しました');
    await step('鍵を消すと、確認はやり直し', () => page.click('#btn-state'), '状態を調べました', 'none');
    await step('鍵を消したあとは、許可をもらえない', () => page.click('#btn-try'), '許可をもらえませんでした', 'none');

    await check('ブラウザの記録に、想定していない誤り・警告が無い', problems.length === 0, JSON.stringify(problems));
  } finally {
    if (browser !== null) await browser.close();
    child.kill('SIGTERM');
    fs.rmSync(state, { recursive: true, force: true });
  }
  if (failed > 0) {
    console.error(`${failed} 件が合いませんでした`);
    process.exit(1);
  }
  console.log('画面をブラウザで通しました');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
