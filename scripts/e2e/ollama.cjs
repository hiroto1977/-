#!/usr/bin/env node
'use strict';

/*
 * Ollama 連携の実機 E2E (スタブサーバ + 実 chromium)。
 *
 *   npm run e2e:ollama      # 要 dist/standalone.html (npm run build:web)
 *
 * 本物の Ollama を用意せずに各状態を再現して、**利用者に出る文言**まで検証する:
 *   1. 未起動          → 起動手順が出る
 *   2. 起動 + CORS 未許可 → 「起動は検出、あとは OLLAMA_ORIGINS」と出る
 *   3. 起動 + CORS 許可   → 実モデル一覧とバージョンが出て、案内は消える
 *   3b. チャット送信      → ブラウザから /api/chat へ実 HTTP で往復し応答が出る
 *      (画面に入力欄があるだけでは「使える」ことにならないので、ここまで見る。
 *       POST + JSON は CORS プリフライトを起こすため、スタブも OPTIONS に応答する)
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

const STUB_MODELS=['llama3.2:latest','qwen2.5-coder:7b'];

function ollamaStub(withCors){
  return http.createServer((req,res)=>{
    // 本物の Ollama は OLLAMA_ORIGINS 許可時、プリフライトにも応答する。
    // POST + content-type: application/json はプリフライトを起こすので、
    // ここを省くとチャットだけブラウザに落とされる (スタブでだけ通る状態になる)。
    const h = withCors ? {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type',
    } : {};
    if(req.method==='OPTIONS'){res.writeHead(withCors?204:403,h);res.end();return;}
    if(req.url==='/api/version'){res.writeHead(200,{...h,'content-type':'application/json'});res.end(JSON.stringify({version:'0.5.4'}));return;}
    if(req.url==='/api/tags'){res.writeHead(200,{...h,'content-type':'application/json'});
      res.end(JSON.stringify({models:[
        {name:'llama3.2:latest',size:2*1024**3,modified_at:'2026-07-01T00:00:00Z',details:{family:'llama',parameter_size:'3B',quantization_level:'Q4_K_M'}},
        {name:'qwen2.5-coder:7b',size:4*1024**3,modified_at:'2026-07-05T00:00:00Z',details:{family:'qwen2',parameter_size:'7B',quantization_level:'Q4_0'}}]}));return;}
    if(req.url==='/api/chat'&&req.method==='POST'){
      let body='';req.on('data',c=>{body+=c;});
      req.on('end',()=>{
        let p;
        try{p=JSON.parse(body||'{}');}catch{p={};}
        // 未取得モデルは本物と同じ 404 + エラー封筒で返す。
        if(!STUB_MODELS.includes(p.model)){
          res.writeHead(404,{...h,'content-type':'application/json'});
          res.end(JSON.stringify({error:`model "${p.model}" not found, try pulling it first`}));
          return;
        }
        const last=(p.messages||[]).slice(-1)[0]||{};
        res.writeHead(200,{...h,'content-type':'application/json'});
        res.end(JSON.stringify({message:{role:'assistant',content:`STUB_REPLY:${last.content||''}`},total_duration:1234567}));
      });
      return;
    }
    res.writeHead(404,h);res.end('nf');
  });
}
// アーティフ ァクト配信 (claude.ai) を再現するためのスイッチ。真にすると
// connect-src 'self' を **HTTP ヘッダ** で送る。アプリ自身の meta CSP はループバックを
// 許可しているが、2 つのポリシーは積で効くのでローカルへの fetch は落とされる。
let RESTRICT_CSP=false;
const appServer=http.createServer((req,res)=>{
  const p=path.join(DIR,'standalone.html');
  const h={'content-type':'text/html; charset=utf-8'};
  if(RESTRICT_CSP) h['content-security-policy']="connect-src 'self'";
  res.writeHead(200,h);
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
    // 未起動なら「導入からの通し手順」を出す。ここで許可設定だけ見せると、
    // Ollama 自体を持っていない人は手順どおりにやっても動かない。
    const ok=/接続できませんでした|起動しているか/.test(body) && /はじめて使う/.test(body)
      && /ollama pull llama3\.2:1b/.test(body) && /ollama\.com\/download/.test(body) && /OLLAMA_ORIGINS/.test(body);
    console.log(`${ok?'✅':'❌'} 未起動: 導入→モデル取得→許可→確認 の通し手順を表示`);
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
    // 起動が検出できている段階では、導入・モデル取得の手順は出さない
    // (済んでいる段を読ませると、どこを直せばいいのか分からなくなる)。
    const ok=/CORS/.test(body) && /OLLAMA_ORIGINS/.test(body) && /あと 1 つだけ設定が要ります/.test(body)
      && !/ollama pull llama3\.2:1b/.test(body);
    console.log(`${ok?'✅':'❌'} CORS未許可: 残り 1 手順だけに絞って提示 (導入手順は出さない)`);
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
    const noSetupHint=!/はじめて使う/.test(body) && !/あと 1 つだけ設定が要ります/.test(body);
    const ok=hasModels&&hasVersion&&noSetupHint;
    console.log(`${ok?'✅':'❌'} 接続成功: 実モデル2件とバージョン0.5.4を表示 (models=${hasModels} version=${hasVersion} 案内非表示=${noSetupHint})`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,400));}

    // --- ケース3b: 実際にチャットを送って応答が返る ---
    // 画面にチャット欄があるだけでは「使える」ことにならない。ブラウザから
    // 実 HTTP (プリフライト含む) で /api/chat まで往復することをここで固定する。
    try{
      await page.getByRole('button',{name:'送信'}).first().click();
      const card=page.locator('.card').filter({has:page.locator('textarea')}).first();
      await card.locator('textarea').waitFor({timeout:15000});
      await card.locator('select').selectOption('llama3.2:latest');
      await card.locator('textarea').fill('E2Eテスト');
      await card.locator('button.primary').click();
      await page.waitForTimeout(3000);
      const after=await page.evaluate(()=>document.body.innerText);
      const replied=/STUB_REPLY:E2Eテスト/.test(after);
      console.log(`${replied?'✅':'❌'} チャット送信: ブラウザから /api/chat へ往復して応答を表示`);
      if(!replied){fail++;console.log('   body抜粋:',after.replace(/\s+/g,' ').slice(0,400));}
    }catch(e){fail++;console.log('❌ チャット送信: 例外',e.message);}
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

  // --- ケース6: 配信元 CSP がローカル接続を禁じている (claude.ai アーティファクト相当) ---
  // 通常 fetch も no-cors も同じように失敗するため、素直に判定すると「未起動」と
  // 誤診し、利用者を絶対に解決しない作業へ送り込む。securitypolicyviolation で
  // 確定できていることを実ブラウザで固定する。
  const cspOllama=ollamaStub(true);
  await new Promise(r=>cspOllama.listen(OLLAMA_PORT,'127.0.0.1',r));
  RESTRICT_CSP=true;
  {
    const ctx=await browser.newContext(); const page=await ctx.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/`,{waitUntil:'load',timeout:120000});
    await unlockAndOpenOllama(page);
    const body=await page.evaluate(()=>document.body.innerText);
    const named=/この配布形態では接続できません/.test(body);
    // Ollama 側をいじらせる案内を出していないこと (出せば必ず徒労になる)
    const noFutileSteps=!/はじめて使う/.test(body) && !/ollama\.com\/download/.test(body);
    const hasWayOut=/npm run ollama:setup/.test(body) && /localhost:8080/.test(body);
    const ok=named&&noFutileSteps&&hasWayOut;
    console.log(`${ok?'✅':'❌'} 配信元CSP遮断: 未起動と誤診せず、原因と代替経路を提示 (判定=${named} 徒労な手順を出さない=${noFutileSteps} 代替=${hasWayOut})`);
    if(!ok){fail++;console.log('   body抜粋:',body.replace(/\s+/g,' ').slice(0,500));}
    await ctx.close();
  }
  RESTRICT_CSP=false;
  await new Promise(r=>cspOllama.close(r));

  await browser.close(); appServer.close();
  console.log(fail? `\n${fail} 件失敗` : '\nALL OLLAMA CHECKS PASSED');
  process.exit(fail?1:0);
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
