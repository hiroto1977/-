'use strict';
// 第 3 層の画面の動き。外のファイルを読まず、画面へ字を出すときは textContent だけを使う。
//
// 守っていること:
//   - この端末の鍵 (DPoP の鍵) は WebCrypto で作り、取り出せない形 (extractable: false) で端末の中にだけ置く。
//   - 要求のたびに、その鍵で「どのメソッドで・どの URL へ・いつ」を署名して付ける (RFC 9449)。
//   - 認証器の応答は、入口が読む欄だけを並べて送る。
//   - 許可 (Token) はメモリにだけ置き、画面にもファイルにも出さない。
(() => {
  const DB_NAME = 'zero-trust-gateway';
  const STORE = 'device-key';
  const KEY_NAME = 'dpop';
  const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
  const encoder = new TextEncoder();

  const $ = (id) => document.getElementById(id);
  const buttons = ['btn-state', 'btn-verify', 'btn-register', 'btn-try', 'btn-forget'].map($);
  const unavailable = new Set(); // この端末では押せないボタン (busy が解けても押せるようにしない)
  let busy = false;
  let token = null; // 許可はメモリにだけ置く

  function say(text, tone) {
    const msg = $('msg');
    msg.textContent = text;
    msg.setAttribute('data-tone', tone || 'info');
    msg.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  }

  // ---- base64url ----
  function b64url(bytes) {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('bad base64url');
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    const raw = atob(padded);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }
  const bytesOf = (buffer) => new Uint8Array(buffer);

  // ---- この端末の鍵 (IndexedDB に置く。読めない端末ではメモリだけ) ----
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function withStore(mode, work) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  let device = null;
  let persisted = true;

  async function deviceKey() {
    if (device !== null) return device;
    let pair = null;
    try {
      pair = await withStore('readonly', (store) => store.get(KEY_NAME));
    } catch (_) {
      persisted = false;
    }
    if (!pair || !pair.privateKey || !pair.publicKey) {
      // 秘密鍵は取り出せない形で作る (extractable: false)。公開鍵だけが外へ出られる。
      pair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
      if (persisted) {
        try {
          await withStore('readwrite', (store) => store.put(pair, KEY_NAME));
        } catch (_) {
          persisted = false;
        }
      }
    }
    const full = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const jwk = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };
    const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
    const thumbprint = b64url(bytesOf(await crypto.subtle.digest('SHA-256', encoder.encode(canonical))));
    device = { pair, jwk, thumbprint };
    $('key-id').textContent = thumbprint.slice(0, 16) + (persisted ? '' : ' (この端末に残せません。閉じると消えます)');
    return device;
  }

  async function forgetKey() {
    const ok = window.confirm(
      'この端末の鍵を消します。この端末での確認はやり直しになります。登録した認証器 (物理キー・パスキー) は消えません。よろしいですか?'
    );
    if (!ok) return;
    try {
      await withStore('readwrite', (store) => store.delete(KEY_NAME));
    } catch (_) {
      // 置き場が読めない端末では、もともとメモリにしか無い。
    }
    device = null;
    token = null;
    $('key-id').textContent = '—';
    showState('none');
    say('この端末の鍵を消しました。', 'ok');
  }

  // ---- DPoP の証明 ----
  function target(path) {
    const url = new URL(path, window.location.href);
    url.search = '';
    url.hash = '';
    return url;
  }

  async function proof(method, url, accessToken) {
    const { pair, jwk } = await deviceKey();
    const header = { typ: 'dpop+jwt', alg: 'ES256', jwk };
    const claims = {
      jti: b64url(crypto.getRandomValues(new Uint8Array(24))),
      htm: method,
      htu: url.href,
      iat: Math.floor(Date.now() / 1000),
    };
    if (accessToken) {
      claims.ath = b64url(bytesOf(await crypto.subtle.digest('SHA-256', encoder.encode(accessToken))));
    }
    const input = b64url(encoder.encode(JSON.stringify(header))) + '.' + b64url(encoder.encode(JSON.stringify(claims)));
    const signature = bytesOf(await crypto.subtle.sign(SIGN, pair.privateKey, encoder.encode(input)));
    return input + '.' + b64url(signature);
  }

  async function call(method, path, body, accessToken) {
    const url = target(path);
    const headers = { DPoP: await proof(method, url, accessToken) };
    if (accessToken) headers.Authorization = 'DPoP ' + accessToken;
    const init = { method, headers, cache: 'no-store', credentials: 'omit', redirect: 'error' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(url, init);
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    return { status: response.status, data };
  }

  // ---- 認証器の応答を、入口が読む欄だけにする ----
  function credentialJson(credential) {
    const response = credential.response;
    const out = {
      id: credential.id,
      rawId: b64url(bytesOf(credential.rawId)),
      type: credential.type,
      clientExtensionResults: {},
      response: { clientDataJSON: b64url(bytesOf(response.clientDataJSON)) },
    };
    if (credential.authenticatorAttachment) out.authenticatorAttachment = credential.authenticatorAttachment;
    if (response.attestationObject) {
      out.response.attestationObject = b64url(bytesOf(response.attestationObject));
      if (typeof response.getTransports === 'function') out.response.transports = response.getTransports();
    } else {
      out.response.authenticatorData = b64url(bytesOf(response.authenticatorData));
      out.response.signature = b64url(bytesOf(response.signature));
      if (response.userHandle) out.response.userHandle = b64url(bytesOf(response.userHandle));
    }
    return out;
  }

  function creationOptions(options, kind) {
    return {
      rp: options.rp,
      user: { id: fromB64url(options.user.id), name: options.user.name, displayName: options.user.displayName },
      challenge: fromB64url(options.challenge),
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      excludeCredentials: (options.excludeCredentials || []).map((c) => ({ type: c.type, id: fromB64url(c.id) })),
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
      hints: kind === 'hardware_key' ? ['security-key'] : ['client-device', 'hybrid'],
    };
  }

  function requestOptions(options) {
    return {
      challenge: fromB64url(options.challenge),
      rpId: options.rpId,
      timeout: options.timeout,
      userVerification: options.userVerification,
      allowCredentials: [],
    };
  }

  // ---- 失敗の言い方 (入口はわざと理由を言わないので、確かめる所を挙げる) ----
  function explain(error) {
    const name = error && error.name;
    if (name === 'NotAllowedError') return '取り消されたか、時間切れです。もう一度押してください。';
    if (name === 'InvalidStateError') return 'この認証器は、もう登録されています。';
    if (name === 'SecurityError') return 'このページの場所 (URL) では使えません。管理者に知らせてください。';
    if (name === 'NotSupportedError') return 'この認証器では使えない方式です。';
    if (error instanceof TypeError) return 'つながりませんでした。電波や接続を確かめてください。';
    return 'うまくいきませんでした。もう一度押してください。';
  }
  const DENIED = {
    401: '確認できませんでした。端末の時計がずれていないか、登録した認証器かを確かめてください。',
    403: '登録できませんでした。登録コード・種類・期限を確かめてください (2 つ目からは、先に強い認証を済ませます)。',
    413: '送る内容が大きすぎます。',
  };
  const denied = (status) => DENIED[status] || 'うまくいきませんでした (' + status + ')。';

  // ---- 状態 ----
  const STATE_TEXT = {
    none: 'まだ確認していません',
    single: '1 つ確認しました。2 分以内に、もう 1 つ (物理キーかスマホ) で確認してください',
    strong: '2 つそろいました (強い認証)',
  };
  function showState(strength) {
    const state = $('state');
    const known = Object.prototype.hasOwnProperty.call(STATE_TEXT, strength) ? strength : 'none';
    state.textContent = STATE_TEXT[known];
    state.setAttribute('data-strength', known);
  }

  function setButtons(enabled) {
    buttons.forEach((b) => { b.disabled = !enabled || unavailable.has(b.id); });
  }

  async function guarded(work) {
    if (busy) return;
    busy = true;
    setButtons(false);
    try {
      await work();
    } catch (error) {
      say(explain(error), 'error');
    } finally {
      busy = false;
      setButtons(true);
    }
  }

  async function checkState() {
    const result = await call('GET', 'session');
    if (result.status !== 200 || !result.data) return say(denied(result.status), 'error');
    showState(result.data.strength);
    say('状態を調べました。', 'ok');
  }

  async function verify() {
    const begin = await call('POST', 'webauthn/authenticate/options', {});
    if (begin.status !== 200 || !begin.data) return say(denied(begin.status), 'error');
    say('物理キーに触れるか、スマホで本人確認をしてください。');
    const credential = await navigator.credentials.get({ publicKey: requestOptions(begin.data) });
    const result = await call('POST', 'webauthn/authenticate/verify', { credential: credentialJson(credential) });
    if (result.status !== 200 || !result.data) return say(denied(result.status), 'error');
    showState(result.data.strength);
    say(result.data.strength === 'strong' ? '確認できました。2 つそろいました。' : '確認できました。もう 1 つで確認してください。', 'ok');
  }

  async function register() {
    const picked = document.querySelector('input[name="kind"]:checked');
    const kind = picked ? picked.value : 'hardware_key';
    const code = $('code').value.trim();
    const body = { kind };
    if (code !== '') body.enrollment_code = code;
    const begin = await call('POST', 'webauthn/register/options', body);
    if (begin.status !== 200 || !begin.data) return say(denied(begin.status), 'error');
    say(kind === 'hardware_key' ? '物理キーを差して、触れてください。' : 'スマホで本人確認をしてください。');
    const credential = await navigator.credentials.create({ publicKey: creationOptions(begin.data, kind) });
    const result = await call('POST', 'webauthn/register/verify', { credential: credentialJson(credential) });
    if (result.status !== 200) return say(denied(result.status), 'error');
    $('code').value = '';
    say(kind === 'hardware_key' ? '物理キーを登録しました。' : 'スマホのパスキーを登録しました。', 'ok');
  }

  async function tryAccess() {
    const issued = await call('POST', '../token', {});
    if (issued.status !== 200 || !issued.data || typeof issued.data.access_token !== 'string') {
      return say('許可をもらえませんでした。先に 2 つで確認してください (強い認証は 12 時間で切れます)。', 'error');
    }
    token = issued.data.access_token;
    const ping = await call('GET', '../resource/ping', undefined, token);
    if (ping.status !== 200 || !ping.data) return say(denied(ping.status), 'error');
    say('通りました。許可は 5 分で切れます。', 'ok');
  }

  // ---- 始める ----
  if (!window.isSecureContext || !window.crypto || !crypto.subtle) {
    say('このページは https で開いてください。', 'error');
    buttons.forEach((b) => unavailable.add(b.id));
    setButtons(false);
    return;
  }
  const webauthn = typeof window.PublicKeyCredential === 'function';
  $('btn-state').addEventListener('click', () => guarded(checkState));
  $('btn-verify').addEventListener('click', () => guarded(verify));
  $('btn-register').addEventListener('click', () => guarded(register));
  $('btn-try').addEventListener('click', () => guarded(tryAccess));
  $('btn-forget').addEventListener('click', () => guarded(forgetKey));
  if (!webauthn) {
    unavailable.add('btn-verify');
    unavailable.add('btn-register');
  }
  guarded(async () => {
    await deviceKey();
    await checkState();
    if (!webauthn) say('このブラウザでは物理キーとパスキーを使えません。', 'error');
  });
})();
