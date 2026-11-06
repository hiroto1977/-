// 企業連携による村の拡張/縮小（/api/company の scale を描画）。未連携なら何も描かない。
/* global window, document, fetch, addEventListener, setInterval, innerHeight */

import * as THREE from 'three';
const R0=46;                      // 既存の村（最外周 r≈40）の外側に企業区画の帯を作る
const KINDS={houses:{c:0xe0b080,roof:0xc0504d},vacant:{c:0x9e9e9e,roof:0x616161},workshops:{c:0x8d6e63,roof:0x37474f},
  stalls:{c:0xfff3e0,roof:0xff7043},warehouses:{c:0xb0bec5,roof:0x546e7a},wasteland:{c:0x8d6e4a}};
const OFF={houses:0,vacant:.13,workshops:.29,stalls:.47,warehouses:.71,wasteland:.83};
const root=new THREE.Group();root.name='company';let S=null,scale=null,ground=null,curR=0,roads=[];
const items={};for(const k of [...Object.keys(KINDS),'residents'])items[k]=[];
const mat=c=>new THREE.MeshLambertMaterial({color:c});const BOX=new THREE.BoxGeometry(1,1,1),CONE=new THREE.ConeGeometry(.8,.7,4);
function slot(k,i,band){const a=(OFF[k]+i*0.618034)*Math.PI*2,rr=R0+2+((i*0.37+OFF[k]*3)%1)*Math.max(2,band-4);return [Math.cos(a)*rr,Math.sin(a)*rr]}
function mk(k,i,band){const g=new THREE.Group(),[x,z]=slot(k,i,band),K=KINDS[k];g.position.set(x,0,z);g.rotation.y=Math.atan2(-x,-z);
  if(k==='wasteland'){const m=new THREE.Mesh(new THREE.CircleGeometry(2.2,10),mat(K.c));m.rotation.x=-Math.PI/2;m.position.y=.03;g.add(m)}
  else{const w=k==='workshops'?3:k==='warehouses'?3.4:k==='stalls'?1.4:2,h=k==='stalls'?1:k==='warehouses'?2.2:1.8;
    const b=new THREE.Mesh(BOX,mat(K.c));b.scale.set(w,h,w*.8);b.position.y=h/2;g.add(b);
    const r=new THREE.Mesh(CONE,mat(K.roof));r.scale.set(w*.9,1,w*.75);r.rotation.y=Math.PI/4;r.position.y=h+.35;g.add(r)}
  g.scale.setScalar(.001);g.userData={k,t:1,x,z};root.add(g);return g}
function mkRes(i,band){const g=new THREE.Group(),c=[0x42a5f5,0x66bb6a,0xffa726,0xab47bc,0xef5350][i%5];
  const b=new THREE.Mesh(BOX,mat(c));b.scale.set(.45,.7,.35);b.position.y=.55;g.add(b);const h=new THREE.Mesh(BOX,mat(0xffe0bd));h.scale.setScalar(.4);h.position.y=1.1;g.add(h);
  const [x,z]=slot('houses',i*1.7+.5,band);g.position.set(x,0,z);g.scale.setScalar(.001);g.userData={k:'residents',t:1,tx:x,tz:z,wait:0};root.add(g);return g}
function sync(k,n,band){const L=items[k];const alive=L.filter(g=>g.userData.t>0);
  while(alive.length<n){const g=k==='residents'?mkRes(L.length,band):mk(k,L.length,band);L.push(g);alive.push(g)}
  for(let i=alive.length-1;i>=n;i--)alive[i].userData.t=0}       // 減少: 縮むアニメーション後に削除
function setGround(r){if(Math.abs(r-curR)<.05)return;curR=r;if(ground){root.remove(ground);ground.geometry.dispose()}
  ground=new THREE.Mesh(new THREE.RingGeometry(R0-1,R0+Math.max(1,r),64),new THREE.MeshLambertMaterial({color:0xa5d68a,side:THREE.DoubleSide}));
  ground.rotation.x=-Math.PI/2;ground.position.y=.02;ground.receiveShadow=true;root.add(ground)}
function setRoads(n){while(roads.length>n)root.remove(roads.pop());while(roads.length<n){const a=roads.length/Math.max(1,n)*Math.PI*2+.3,m=new THREE.Mesh(BOX,mat(0xd7b98a));
  m.scale.set(1.2,.05,12);const rr=R0-6;m.position.set(Math.cos(a)*rr,.04,Math.sin(a)*rr);m.rotation.y=Math.atan2(Math.cos(a),Math.sin(a));root.add(m);roads.push(m)}}
let tgtR=0;
function apply(s){scale=s;if(!S)return;if(!s){for(const k in items)for(const g of items[k])g.userData.t=0;tgtR=0;setRoads(0);return}
  const band=s.radius||10;tgtR=band;for(const k of Object.keys(items))sync(k,s[k]||0,band);setRoads(s.roads||0)}
window.__companyTick=(dt)=>{if(!S&&window.__S){S=window.__S;S.add(root);apply(scale)}
  if(Math.abs(curR-tgtR)>.05)setGround(curR+(tgtR-curR)*Math.min(1,dt*1.5));else if(tgtR===0&&ground){root.remove(ground);ground=null;curR=0}
  for(const k in items){const L=items[k];for(let i=L.length-1;i>=0;i--){const g=L[i],u=g.userData,cur=g.scale.x,to=u.t?1:0;
    const nx=cur+(to-cur)*Math.min(1,dt*2.5);g.scale.setScalar(Math.max(.001,nx));
    if(!u.t&&nx<.02){root.remove(g);L.splice(i,1);continue}
    if(k==='residents'&&u.t){const d=Math.hypot(u.tx-g.position.x,u.tz-g.position.z);
      if(d<.3){if((u.wait-=dt)<0){const a=Math.random()*Math.PI*2,rr=R0+1+Math.random()*Math.max(2,curR-2);u.tx=Math.cos(a)*rr;u.tz=Math.sin(a)*rr;u.wait=1+Math.random()*4}}
      else{const sp=Math.min(d,dt*1.6);g.position.x+=(u.tx-g.position.x)/d*sp;g.position.z+=(u.tz-g.position.z)/d*sp;g.rotation.y=Math.atan2(u.tx-g.position.x,u.tz-g.position.z)}}}}};
// ---- 企業指標パネル ----
const P=document.createElement('div');P.id='company';P.style.cssText='position:fixed;left:10px;top:150px;background:#fffaf0f2;border:3px solid #c9a46a;border-radius:12px;padding:6px 10px;font-size:12px;max-width:260px;display:none;z-index:5';
document.body.appendChild(P);const yen=v=>v==null?'—':Math.abs(v)>=1e8?(v/1e8).toFixed(1)+'億円':Math.abs(v)>=1e4?(v/1e4).toFixed(0)+'万円':v+'円';
function place(){const h=document.getElementById('hud'),c=document.getElementById('chat');if(!h)return;const top=h.getBoundingClientRect().bottom+8,bot=c?c.getBoundingClientRect().top-8:innerHeight-10;
  P.style.top=top+'px';P.style.maxHeight=Math.max(40,bot-top)+'px';P.style.overflow='auto'}
addEventListener('resize',place);setInterval(place,2000);
const esc=s=>String(s??'').replace(/[<>&]/g,'');
function statusLabel(j){
  if(j&&typeof j.label==='string'&&j.label) return j.label;
  if(j&&j.demo) return j.linked?'架空（デモ）':'架空（デモ）・未取得';
  if(j&&j.linked) return '連携中';
  return '未連携';
}
function panel(j){place();P.style.display='block';
  const label=statusLabel(j);P.dataset.companyLabel=label;
  if(label==='未連携'&&!(j&&j.error)){P.innerHTML='<b>🏢 企業データ</b>：未連携';return}
  const m=j.metrics||{},s=j.scale||{},H={normal:'🟢 健全',warning:'🟡 注意',crisis:'🔴 危機'}[s.health]||'';
  const row=(a,b)=>`<div>${a}：<b>${esc(b)}</b></div>`;
  const fict=(j.fictional||j.demo)?'<div class="sm">実在の企業ではありません</div>':'';
  P.innerHTML=`<b>🏢 企業データ</b>：${esc(label)}`+fict+(j.linked?`<div><b>${esc(j.name||'企業')}</b> ${H}</div>`:'')+(j.error?`<div style="color:#c0392b">⚠ ${esc(j.error)}</div>`:'')+
   (j.linked?row('売上',yen(m.revenue))+row('営業利益',yen(m.operating_income))+row('純利益',yen(m.net_income))+row('総資産',yen(m.total_assets))+row('純資産',yen(m.net_assets))+
   row('現金',yen(m.cash))+row('従業員',m.employees??'—')+row('取引先',m.partners??'—')+
   `<div class="sm">村: 住民${s.residents??0} 家${s.houses??0} 空き家${s.vacant??0} 工房${s.workshops??0} 屋台${s.stalls??0} 倉庫${s.warehouses??0} 荒れ地${s.wasteland??0} 区画${s.plots??0}</div>`+
   `<div class="sm">最終取得: ${esc(j.last_fetch||'—')}</div>`:'');}
let lastKey='';async function poll(){try{const j=await (await fetch('/api/company')).json();window.__company=j;panel(j);
  const s=j.linked?j.scale:null,key=JSON.stringify(s);if(key!==lastKey){lastKey=key;apply(s)}}catch{return}}
poll();setInterval(poll,5000);window.__companyCount=()=>Object.fromEntries(Object.entries(items).map(([k,L])=>[k,L.filter(g=>g.userData.t).length]));
// 帯の外周（全体カメラ・ミニマップ・霧・ズーム上限を規模に合わせる）
setInterval(()=>{const ext=curR>0.5?R0+curR:0;window.__companyExtent=ext;const k=Math.max(1,Math.max(ext,1)/50);
  if(S&&S.fog)S.fog.far=190*k;if(window.O)window.O.maxDistance=Math.max(150,150*k);if(window.__C&&window.__C.far<700*k){window.__C.far=700*k;window.__C.updateProjectionMatrix()}},500);
window.__companyMini=(mc,toMini,MS)=>{if(curR<.5)return;mc.fillStyle='#a5d68a';mc.beginPath();mc.arc(85,85,(R0+curR)*MS,0,7);mc.arc(85,85,(R0-1)*MS,0,7,true);mc.fill();
  const col={houses:'#c0504d',vacant:'#757575',workshops:'#5d4037',stalls:'#ff7043',warehouses:'#546e7a',wasteland:'#8d6e4a'};
  for(const k in col)for(const g of items[k]){if(!g.userData.t)continue;mc.fillStyle=col[k];const [x,y]=toMini(g.position.x,g.position.z);mc.fillRect(x-1.5,y-1.5,3,3)}};
