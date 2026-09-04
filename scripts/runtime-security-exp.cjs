// Real browser-mode runtime + security experiment against the standalone build.
//
// Loads dist/standalone.html (which activates the web-shim → Vault lock path,
// the exact code real users hit in a browser) in a *fresh, throwaway* Electron
// profile so the Vault starts uninitialized, then drives the actual LockScreen
// UI and asserts security + runtime invariants end-to-end:
//
//   1. first-run shows the uninitialized (set-password) screen
//   2. setting a password generates a recovery mnemonic + acknowledgment gate
//   3. acknowledging unlocks and renders the app
//   4. setToken + listConfigured work through the real bridge
//   5. the token is encrypted at rest (no plaintext anywhere in IndexedDB)
//   6. reload re-locks the vault (state persists, requires unlock again)
//   7. a wrong password is rejected
//   8. the correct password unlocks and the stored token survived
//
// Usage: npm run build:web && npm run exp:runtime
// (requires xvfb on headless Linux: xvfb-run -a electron --no-sandbox <this>)
//
// Exits non-zero if any invariant fails, so it can gate a release.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-runtime-exp-'));
app.setPath('userData', PROFILE); // isolate → vault uninitialized → true first-run

const ROOT = path.join(__dirname, '..');
const PASSWORD = 'Str0ng-P@ssw0rd!';
const results = [];
const log = (ok, name, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
};

const setPw = (idx, value) =>
  `(()=>{const el=[...document.querySelectorAll('input[type=password]')][${idx}];if(!el)return'no-input';` +
  `const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;` +
  `s.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return'ok';})()`;
const click = (txt) =>
  `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(txt)}));if(b){b.click();return'c';}return'n';})()`;
const ackAndStart =
  `(()=>{const c=document.querySelector('input[type=checkbox]');if(c&&!c.checked)c.click();` +
  `const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('記録完了'));if(b){b.click();return'done';}return'no-btn';})()`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ width: 1280, height: 1000, show: false, backgroundColor: '#0f1117', webPreferences: { sandbox: false } });
  await win.loadFile(path.join(ROOT, 'dist', 'standalone.html'));
  await sleep(2000);
  const e = (js) => win.webContents.executeJavaScript(js);

  let body = await e('document.body.innerText');
  log(/ようこそ|はじめて|マスターパスワード/.test(body) && !/ロック解除/.test(body), 'first-run-uninitialized-screen');

  await e(setPw(0, PASSWORD));
  await e(setPw(1, PASSWORD));
  await sleep(200);
  await e(click('開始'));
  await sleep(1800);
  const cbs = await e(`document.querySelectorAll('input[type=checkbox]').length`);
  log(cbs >= 1, 'mnemonic-screen-with-ack-checkbox', 'checkboxes=' + cbs);

  await e(ackAndStart);
  await sleep(1800);
  log(await e(`!!document.querySelector('.content')&&!!document.querySelector('.sidebar-item')`), 'app-unlocked-after-ack');

  const noGet = await e(`typeof window.serviceHub.getToken === 'undefined'`);
  log(noGet === true, 'security-no-getToken-on-bridge');

  const rt = await e(`(async()=>{try{await window.serviceHub.setToken('github','ghp_SECRET_TOKEN_xyz');return (await window.serviceHub.listConfigured()).includes('github');}catch(e){return 'err:'+e.message;}})()`);
  log(rt === true, 'vault-setToken-listConfigured', String(rt));

  /*
   * **バイト列は文字へ開いてから探す。**
   *
   * 2026-08-26 まで `JSON.stringify(getAll())` の結果だけを見ていた。
   * `Uint8Array` は `{"0":103,"1":104,…}` に直列化されるので、
   * **平文をバイトで保存されると文字列として一致しない**。
   *
   * 対照で確かめた: `encryptString` を「IV ゼロ + 平文バイト」に差し替えて
   * 再ビルドしても、この行は `token-encrypted-at-rest :: encrypted` と
   * PASS したままだった。暗号化が外れた形は**まさにこのバイト列**になるので、
   * この道具の一番肝心な主張が、一番ありそうな失敗を見られていなかった。
   *
   * 直したうえで、下に**陽性対照**を置く —— 同じ探し方が「本当に在るとき」に
   * 当たることを見せない限り、`encrypted` は何も言っていないのと同じ。
   */
  const atRest = await e(`(async()=>{const dec=new TextDecoder('utf-8',{fatal:false});const open=(v)=>ArrayBuffer.isView(v)?dec.decode(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)):(v instanceof ArrayBuffer?dec.decode(new Uint8Array(v)):null);const walk=(v,sink)=>{const t=open(v);if(t!==null){sink.push(t);return;}if(Array.isArray(v)){for(const x of v)walk(x,sink);return;}if(v&&typeof v==='object'){for(const x of Object.values(v))walk(x,sink);return;}if(typeof v==='string')sink.push(v);};const ns=(indexedDB.databases?(await indexedDB.databases()).map(d=>d.name):['business-hub-data']);let blob='';for(const n of ns){try{const db=await new Promise((res,rej)=>{const r=indexedDB.open(n);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});for(const st of [...db.objectStoreNames]){const all=await new Promise((res)=>{const tx=db.transaction(st,'readonly');const rq=tx.objectStore(st).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>res([]);});const sink=[];walk(all,sink);blob+=JSON.stringify(all)+'\\u0000'+sink.join('\\u0000');}db.close();}catch{}}return blob.includes('ghp_SECRET_TOKEN_xyz')?'LEAK':'encrypted';})()`);
  log(atRest === 'encrypted', 'token-encrypted-at-rest', atRest);

  // 陽性対照: 平文バイトを植えたら、同じ探し方が見つけること。
  const canFind = await e(`(async()=>{
    const db=await new Promise((res)=>{const r=indexedDB.open('business-hub-data');r.onsuccess=()=>res(r.result);});
    const st=[...db.objectStoreNames][0];
    if(st){await new Promise((res)=>{const tx=db.transaction(st,'readwrite');const store=tx.objectStore(st);
      const bytes=new TextEncoder().encode('ghp_SECRET_TOKEN_xyz');
      const rec=store.keyPath!==null?{[String(store.keyPath)]:'__probe__',leak:bytes}:{leak:bytes};
      const q=store.keyPath!==null?store.put(rec):store.put(rec,'__probe__');q.onsuccess=()=>res();q.onerror=()=>res();});}
    db.close();
    const dec=new TextDecoder('utf-8',{fatal:false});
    const open=(v)=>ArrayBuffer.isView(v)?dec.decode(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)):(v instanceof ArrayBuffer?dec.decode(new Uint8Array(v)):null);
    const walk=(v,sink)=>{const t=open(v);if(t!==null){sink.push(t);return;}
      if(Array.isArray(v)){for(const x of v)walk(x,sink);return;}
      if(v&&typeof v==='object'){for(const x of Object.values(v))walk(x,sink);return;}
      if(typeof v==='string')sink.push(v);};
    let blob='';
    for(const n of (await indexedDB.databases()).map(d=>d.name)){try{
      const d2=await new Promise((res)=>{const r=indexedDB.open(n);r.onsuccess=()=>res(r.result);});
      for(const st2 of [...d2.objectStoreNames]){
        const all=await new Promise((res)=>{const tx=d2.transaction(st2,'readonly');const rq=tx.objectStore(st2).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>res([]);});
        const sink=[];walk(all,sink);blob+=sink.join('\u0000');}
      d2.close();}catch{}}
    return blob.includes('ghp_SECRET_TOKEN_xyz')?'found':'blind';
  })()`);
  log(canFind === 'found', 'at-rest-scan-can-actually-find-plaintext', String(canFind));

  await win.webContents.reload();
  await sleep(2200);
  body = await e('document.body.innerText');
  log(/ロック解除|マスターパスワード/.test(body) && !/ようこそ|はじめて/.test(body), 'relocks-on-reload');

  await e(setPw(0, 'WRONG'));
  await sleep(150);
  await e(click('ロック解除'));
  await sleep(1200);
  log(await e(`!document.querySelector('.content')`), 'wrong-password-rejected');

  await e(setPw(0, PASSWORD));
  await sleep(150);
  await e(click('ロック解除'));
  await sleep(1600);
  const ok = await e(`!!document.querySelector('.content')`);
  const sv = await e(`(async()=>{try{return (await window.serviceHub.listConfigured()).includes('github');}catch{return false;}})()`);
  log(ok && sv, 'unlock-and-persist-across-reload', 'unlocked=' + ok + ' survived=' + sv);

  const passed = results.filter(Boolean).length;
  console.log(`SUMMARY ${passed}/${results.length}`);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* best effort */ }
  app.exit(passed === results.length ? 0 : 1);
})().catch((err) => {
  console.error('EXP_ERROR', err);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* best effort */ }
  app.exit(1);
});
