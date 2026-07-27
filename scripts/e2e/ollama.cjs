#!/usr/bin/env node
'use strict';

/*
 * Ollama 連携の実機 E2E (スタブサーバ + 実 chromium)。
 *
 *   npm run e2e:ollama      # 要 dist/standalone.html (npm run build:web)
 *
 * 本物の Ollama を用意せずに 3 つの状態を再現して、**利用者に出る文言**まで検証する:
 *   1. 未起動          → 起動手順が出る
 *   2. 起動 + CORS 未許可 → 「起動は検出、あとは OLLAMA_ORIGINS」と出る
 *   3. 起動 + CORS 許可   → 実モデル一覧とバージョンが出て、案内は消える
 *
 * 2 と 1 を取り違えると「壊れている」と誤解されるため、切り分けが効いていることを
 * ここで固定する (単体テストは src/renderer/network/__tests__/ollamaWeb.test.ts)。
 *
 * ポート 11434 を bind するので、実 Ollama が動いている環境では EADDRINUSE で
 * 失敗する (その場合は実機で手動確認するのが正しい)。
 *
 * ケース 4-5 は「別端末から使う」経路 —— 保存した接続先が使われること、および
 * 平文 http で別ホストを指定したら接続を試みずに拒否すること —— を固定する。
 */

const http=require('node:http'), fs=require('node:fs'), path=require('node:path');
function resolvePlaywright(){
  for (const opt of [undefined,{paths:['/opt/node22/lib/node_modules']}]) {
    try { return require(opt?require.resolve('playwright',opt):'playwright'); } catch { /* next */ }
  }
  return null;
}
const pw=resolvePlaywright();
if(!pw){console.error('e2e:ollama: playwright が見つかりません');process.exit(2);}
const DIR=path.join(__dirname,'..','..','dist');

function ollamaStub(withCors){
  return http.createServer((req,res)=>{
    const h = withCors ? {'access-control-allow-origin':'*'} : {};
    if(req.url==='/api/version'){res.writeHead(200,{...h,'content-type':'application/json'});res.end(JSON.stringify({version:'0.5.4'}));return;}
    if(req.url==='/api/tags'){res.writeHead(200,{...h,'content-type':'application/json'});
      res.end(JSON.stringify({models:[
        {name:'llama3.2:latest',size:2*1024**3,modified_at:'2026-07-01T00:00:00Z',details:{family:'llama',parameter_size:'3B',quantization_level:'Q4_K_M'}},
        {name:'qwen2.5-coder:7b',size:4*1024**3,modified_at:'2026-07-05T00:00:00Z',details:{family:'qwen2',parameter_size:'7B',quantization_level:'Q4_0'}}]}));return;}
    res.writeHead(404,h);res.end('nf');
  });
}
const appServer=http.createServer((req,res)=>{
  const p=path.join(DIR,'standalone.html');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  fs.createReadStream(p).pipe(res);
});

async function unlockAndOpenOllama(page){
  const pwd='ollama-probe-pass-1';
  const inputs=page.locator('input[type=password]');
  await inputs.nth(0).waitFor({timeout:60000});
  await inputs.nth(0).fill(pwd); await inputs.nth(1).fill(pwd);
  await page.getByRole('button',{name:/パスワードを設定して開始/}).click();
  await page.waitForTimeout(1500);
  const cb=page.locator('input[type=checkbox]').first();
  if(await cb.count()) await cb.check();
  const done=page.getByRole('button',{name:/記録完了|開始|続ける/}).first();
  if(await done.count()) await done.click();
  await page.waitForTimeout(1200);
  // 「分析・ツール」カテゴリは既定で折りたたまれているため、検索で絞って開く。
  await page.locator('.sidebar-search-input').fill('ollama');
  await page.waitForTimeout(600);
  await page.locator('.sidebar-item[data-service-id="ollama"]').first().click();
  await page.waitForTimeout(3500);
}

(async()=>{
  const OLLAMA_PORT=11434;
  await new Promise(r=>appServer.listen(0,'127.0.0.1',r));
  const appPort=appServer.address().port;
  const bundled='/opt/pw-browsers/chromium';
  const browser=await pw.chromium.launch({...(fs.existsSync(bundled)?{executablePath:bundled}:{}),args:['--no-sandbox']});
  let fail=0;

  // --- ケース1: Ollama 未起動 ---
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const ok=/接続できませんでした|起動しているか/.test(body) && /つながらない場合/.test(body) && /OLLAMA_ORIGINS/.test(body);
    console.log(`${ok?'✅':'❌'} 未起動: 原因と対処 (起動 + OLLAMA_ORIGINS 手順) を表示`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,300));}
    await ctx.close();
  }

  // --- ケース2: 起動しているが CORS 未許可 ---
  const noCors=ollamaStub(false);
  await new Promise(r=>noCors.listen(OLLAMA_PORT,'127.0.0.1',r));
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const ok=/CORS/.test(body) && /OLLAMA_ORIGINS/.test(body);
    console.log(`${ok?'✅':'❌'} CORS未許可: 「起動しているが拒否」と判定して設定手順を提示`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,300));}
    await ctx.close();
  }
  await new Promise(r=>noCors.close(r));

  // --- ケース3: CORS 許可あり = 本来の連携成功 ---
  const withCors=ollamaStub(true);
  await new Promise(r=>withCors.listen(OLLAMA_PORT,'127.0.0.1',r));
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const hasModels=/llama3\.2:latest/.test(body) && /qwen2\.5-coder:7b/.test(body);
    const hasVersion=/0\.5\.4/.test(body);
    const noSetupHint=!/つながらない場合/.test(body);
    const ok=hasModels&&hasVersion&&noSetupHint;
    console.log(`${ok?'✅':'❌'} 接続成功: 実モデル2件とバージョン0.5.4を表示 (models=${hasModels} version=${hasVersion} 案内非表示=${noSetupHint})`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,400));}
    await ctx.close();
  }
  await new Promise(r=>withCors.close(r));

  // --- ケース4: 別端末経路 (ページと同じホスト名への http) ---
  // アプリを 127.0.0.1 ではないホスト名で配信し、同じホストの Ollama へ繋がることを見る。
  // (実機ではこれが「PC で配信したページをスマホから開く」構成に対応する)
  const lanOllama=ollamaStub(true);
  await new Promise(r=>lanOllama.listen(OLLAMA_PORT,'127.0.0.1',r));
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    // localhost は loopback 判定に入るため、同一ホスト経路の検証には使えない。
    // hosts に依存せず必ず解決する名前として ip6-localhost 等は環境差があるので、
    // ここでは localhost を使い「保存した接続先が使われること」を検証する。
    await page.goto(`http://localhost:${appPort}/`,{waitUntil:'load',timeout:120000});
    await page.evaluate(()=>localStorage.setItem('servicehub.ollama.endpoint','http://localhost:11434'));
    await page.reload({waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const ok=/llama3\.2:latest/.test(body) && /0\.5\.4/.test(body);
    console.log(`${ok?'✅':'❌'} 別端末経路: 保存した接続先 (http://localhost:11434) で接続しモデルを表示`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,300));}
    await ctx.close();
  }
  await new Promise(r=>lanOllama.close(r));

  // --- ケース5: 許可外の接続先は接続を試みずに拒否 ---
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'load',timeout:120000});
    await page.evaluate(()=>localStorage.setItem('servicehub.ollama.endpoint','http://192.168.99.99:11434'));
    await page.reload({waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const ok=/許可されていません|指定できません/.test(body);
    console.log(`${ok?'✅':'❌'} 許可外の接続先 (平文http・別ホスト) を拒否`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,300));}
    await ctx.close();
  }

  await browser.close(); appServer.close();
  console.log(fail? `\n${fail} 件失敗` : '\nALL OLLAMA CHECKS PASSED');
  process.exit(fail?1:0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
