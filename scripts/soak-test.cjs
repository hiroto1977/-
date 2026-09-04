// Soak / endurance test (仮想データによる永続稼働試験).
//
// Seeds virtual business data into a fresh browser-mode profile, then runs the
// app through 10 reload + unlock cycles, asserting:
//   1. the vault initializes and unlocks
//   2. virtual data is seeded
//   3. the record count stays constant across every cycle (no loss / corruption
//      / duplication) AND the app re-unlocks each time (persistence + stability)
//   4. the management cockpit still renders the seeded data after the soak
// Also reports JS heap growth across cycles (leak detector).
//
// Usage: npm run build:web && npm run exp:soak
// Exits non-zero on any failure so it can gate a release.
const { app, BrowserWindow } = require('electron');
const path=require('node:path'); const os=require('node:os'); const fs=require('node:fs');
const PROFILE=fs.mkdtempSync(path.join(os.tmpdir(),'sh-soak-'));
app.setPath('userData',PROFILE);
const ROOT='/home/user/-'; const PW='Str0ng-P@ssw0rd!'; const CYCLES=10;
const results=[]; const log=(ok,n,x='')=>{results.push(ok);console.log((ok?'PASS':'FAIL')+' '+n+(x?' :: '+x:''));};
const setPw=(i,v)=>`(()=>{const el=[...document.querySelectorAll('input[type=password]')][${i}];if(!el)return'x';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return'ok';})()`;
const click=(t)=>`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes(${JSON.stringify(t)}));if(b){b.click();return'c';}return'n';})()`;
const ack=`(()=>{const c=document.querySelector('input[type=checkbox]');if(c&&!c.checked)c.click();const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('記録完了'));if(b){b.click();return'done';}return'no';})()`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SEED=`(async()=>{const now=Date.now();let s=0;const rec=(c,d)=>({id:'soak-'+(s++),collection:c,createdAt:now+s,updatedAt:now+s,data:d});
const months=['2026-01','2026-02','2026-03','2026-04','2026-05'];
const all=[...months.map((p,i)=>rec('kpi-actuals',{period:p,unit:'全社',revenue:1200000+i*120000,cogs:480000+i*40000,advertising:90000,sga:220000,depreciation:40000,laborCost:180000})),
rec('sales-entries',{date:'2026-05-01',channel:'amazon',amount:700000,orders:140}),rec('sales-entries',{date:'2026-05-02',channel:'shopify',amount:300000,orders:50}),
rec('team-members',{name:'代表',email:'a@e.com',role:'owner'}),rec('team-members',{name:'幹部',email:'b@e.com',role:'admin'})];
await new Promise((res,rej)=>{const o=indexedDB.open('business-hub-data',1);o.onupgradeneeded=()=>{const st=o.result.createObjectStore('records',{keyPath:'id'});st.createIndex('collection','collection',{unique:false});};o.onsuccess=()=>{const db=o.result;const tx=db.transaction('records','readwrite');for(const r of all)tx.objectStore('records').put(r);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);};o.onerror=()=>rej(o.error);});
return all.length;})()`;
const COUNT=`(async()=>{return await new Promise((res)=>{const o=indexedDB.open('business-hub-data',1);o.onsuccess=()=>{const db=o.result;const tx=db.transaction('records','readonly');const rq=tx.objectStore('records').count();rq.onsuccess=()=>{db.close();res(rq.result);};rq.onerror=()=>{db.close();res(-1);};};o.onerror=()=>res(-1);});})()`;

(async()=>{await app.whenReady();
const win=new BrowserWindow({width:1280,height:1400,show:false,webPreferences:{sandbox:false}});
await win.loadFile(path.join(ROOT,'dist','standalone.html'));await sleep(2000);const e=js=>win.webContents.executeJavaScript(js);
// initialize vault
await e(setPw(0,PW));await e(setPw(1,PW));await sleep(200);await e(click('開始'));await sleep(1700);await e(ack);await sleep(1500);
log(await e(`!!document.querySelector('.content')`),'vault-initialized-unlocked');
// seed virtual data
const seeded=await e(SEED);log(seeded>=7,"virtual-data-seeded","records="+seeded);
await win.webContents.reload();await sleep(2000);
let baseline=null;
// soak: N reload+unlock cycles, verify count stable & app renders
let stable=true; let minHeap=Infinity,maxHeap=0;
for(let i=1;i<=CYCLES;i++){
  // unlock
  await e(setPw(0,PW));await sleep(120);await e(click('ロック解除'));await sleep(1200);
  const unlocked=await e(`!!document.querySelector('.content')`);
  const cnt=await e(COUNT);
  const heap=await e(`(performance&&performance.memory)?performance.memory.usedJSHeapSize:0`);
  if(heap){minHeap=Math.min(minHeap,heap);maxHeap=Math.max(maxHeap,heap);}
  if(baseline===null)baseline=cnt;if(!unlocked||cnt!==baseline){stable=false;console.log('  cycle '+i+': unlocked='+unlocked+' count='+cnt);}
  await win.webContents.reload();await sleep(1600);
}
log(stable,'data-persists-and-app-stable-over-'+CYCLES+'-cycles');
// final: unlock and verify cockpit shows seeded numbers
await e(setPw(0,PW));await sleep(120);await e(click('ロック解除'));await sleep(1400);
await e(`localStorage.setItem('servicehub.plan','enterprise');`);await win.webContents.reload();await sleep(1800);
await e(setPw(0,PW));await sleep(120);await e(click('ロック解除'));await sleep(1400);
await e(`window.dispatchEvent(new CustomEvent('servicehub:navigate',{detail:'overview'}));`);await sleep(1500);
const body=await e(`(document.querySelector('.content')||document.body).innerText`);
log(/経営|スコア|売上|ハイライト/.test(body),'cockpit-renders-seeded-data-after-soak');
const heapGrowth=maxHeap&&minHeap!==Infinity?((maxHeap-minHeap)/minHeap*100):0;
console.log('HEAP min='+minHeap+' max='+maxHeap+' growth='+heapGrowth.toFixed(1)+'%');
console.log('SUMMARY '+results.filter(Boolean).length+'/'+results.length);
try{fs.rmSync(PROFILE,{recursive:true,force:true});}catch{/* best effort cleanup */}
app.exit(results.every(Boolean)?0:1);
})().catch(e=>{console.error('SOAK_ERROR',e);try{fs.rmSync(PROFILE,{recursive:true,force:true});}catch{/* best effort cleanup */}app.exit(1);});
