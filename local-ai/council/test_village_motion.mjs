/**
 * 住民の歩行と建物の出入り。
 * 変更前（勤務 15 時・ヘッドレスで 8 秒）: 机の 24 人中 4 人だけが 0.8 以上動いた。一般職は座標が固定。
 * ここは同じ移動関数を時間を進めて試し、続けて実ページ（WebGL）でも入退室を数える。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { phaseOf, tickResident, tickExtraResident } from './web/villageMotion.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORG = JSON.parse(fs.readFileSync(path.join(HERE, 'org.json'), 'utf8'));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function route(from, to) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 7) return [{ x: to.x, z: to.z }];
  return [{ x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }, { x: to.x, z: to.z }];
}

function world(phase, rng) {
  const execs = ORG.people.filter((p) => p.tier === '役員');
  const doors = { coo: { x: 0, z: -12 } };
  execs.forEach((e, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / execs.length) * Math.PI * 2;
    doors[e.id] = { x: Math.cos(a) * 16, z: Math.sin(a) * 16 };
  });
  const plazas = [{ x: 0, z: 7 }, { x: 8, z: 9 }, { x: -9, z: 8 }, { x: 10, z: -2 }, { x: -10, z: -3 }];
  const nodes = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    nodes.push({ x: Math.cos(a) * 22, z: Math.sin(a) * 22 });
  }
  return { phase, doors, plazas, nodes, route, rng };
}

function deptOf(p, byId) {
  if (p.tier === 'COO' || p.id === 'coo') return 'coo';
  if (p.tier === '役員') return p.id;
  if (p.tier === '一般職') return byId.get(p.parent)?.parent || 'coo';
  return p.parent || 'coo';
}

function makePeople() {
  const byId = new Map(ORG.people.map((p) => [p.id, p]));
  const execs = ORG.people.filter((p) => p.tier === '役員');
  const ang = new Map(execs.map((e, i) => [e.id, -Math.PI / 2 + ((i + 0.5) / execs.length) * Math.PI * 2]));
  ang.set('coo', -Math.PI / 2);
  return ORG.people.map((p) => {
    const dept = deptOf(p, byId);
    const a = ang.get(dept) ?? 0;
    const desk = p.tier === '管理職' || p.tier === '一般職';
    const r = desk ? 30 : p.tier === '秘書' ? 18 : 14;
    const spread = desk ? ((hash(p.id) % 7) - 3) * 0.08 : 0.15;
    const x = Math.cos(a + spread) * r;
    const z = Math.sin(a + spread) * r;
    return {
      travel: 0,
      entries: 0,
      exits: 0,
      A: {
        key: p.id, desk, dept, home: { x, z }, speed: 2.3, face: 0, tier: p.tier,
        state: 'idle', path: [], goal: null, timer: 0, inside: 0, speaking: false, stuck: 0,
      },
      pose: { x, z, rot: 0, visible: true },
    };
  });
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 33 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function stepAll(people, dt, ctx) {
  for (const p of people) {
    const others = people.map((q) => ({ key: q.A.key, svc: false, x: q.pose.x, z: q.pose.z, visible: q.pose.visible }));
    const x0 = p.pose.x;
    const z0 = p.pose.z;
    const vis0 = p.pose.visible;
    tickResident(p.A, p.pose, dt, ctx, others);
    p.travel += Math.hypot(p.pose.x - x0, p.pose.z - z0);
    if (vis0 && p.pose.visible === false) p.entries += 1;
    if (vis0 === false && p.pose.visible) p.exits += 1;
  }
}

assert.equal(phaseOf(15), 'work');
assert.equal(phaseOf(23), 'night');
assert.equal(phaseOf(19), 'free');
assert.equal(phaseOf(Number.NaN), 'free');

{
  const people = makePeople();
  const ctx = world('work', mulberry32(7));
  for (let t = 0; t < 1400; t++) stepAll(people, 0.1, ctx);
  const desk = people.filter((p) => p.A.desk);
  const stuck = people.filter((p) => p.travel < 4 || p.entries < 1 || p.exits < 1);
  assert.equal(desk.length, 24, '管理職+一般職は 24 人');
  assert.deepEqual(stuck.map((p) => ({ id: p.A.key, travel: +p.travel.toFixed(1), entries: p.entries, exits: p.exits, state: p.A.state })), [], '勤務中も全員が歩き、建物に入り、出てくる');
}

{
  const people = makePeople();
  const ctx = world('night', mulberry32(3));
  for (let t = 0; t < 1400; t++) stepAll(people, 0.1, ctx);
  const stuck = people.filter((p) => p.entries < 1 || p.exits < 1 || p.travel < 4);
  assert.deepEqual(stuck.map((p) => p.A.key), [], '夜も入りっぱなしにせず、出てまた歩く');
}

{
  const people = makePeople();
  const ceo = { A: { key: 'me' }, pose: { x: 0, z: 2.8, visible: true } };
  const ctx = world('work', mulberry32(1));
  for (let t = 0; t < 50; t++) stepAll(people, 0.1, ctx);
  assert.equal(ceo.pose.x, 0);
  assert.equal(ceo.pose.z, 2.8);
}

{
  // 机に着いた直後の次の行動は外。乱数が常に 0 でも机で終わらない。
  const A = { key: 'staff-tax-deductions', desk: true, dept: 'cfo', home: { x: 20, z: -20 }, speed: 2.2, face: 0, state: 'idle', path: [], goal: null, timer: 0, inside: 0, speaking: false, stuck: 0 };
  const pose = { x: 20, z: -20, rot: 0, visible: true };
  const ctx = world('work', () => 0);
  let left = false;
  for (let t = 0; t < 80; t++) {
    tickResident(A, pose, 0.1, ctx, []);
    if (A.state !== 'work' && (Math.hypot(pose.x - 20, pose.z + 20) > 1 || A.state === 'inside')) left = true;
  }
  assert.equal(left, true);
  assert.notEqual(A.state, 'work');
}

{
  const door = { x: 0, z: 0 };
  const blocker = { key: 'block', x: 0.15, z: 0.35, visible: true, svc: false };
  const crowd = [0, 1, 2, 3, 4].map((i) => ({
    A: { key: 'c' + i, desk: false, dept: 'coo', home: { x: 0, z: 6 }, speed: 2.4, state: 'walk', path: [{ ...door }], goal: 'door', stuck: 0, speaking: false, face: null },
    pose: { x: (i - 2) * 0.35, z: 2.8, rot: 0, visible: true },
  }));
  const ctx = world('free', mulberry32(9));
  ctx.doors.coo = door;
  const entered = new Set();
  for (let t = 0; t < 80; t++) {
    for (const p of crowd) {
      const vis0 = p.pose.visible;
      const others = [blocker, ...crowd.map((q) => ({ key: q.A.key, svc: false, x: q.pose.x, z: q.pose.z, visible: q.pose.visible }))];
      tickResident(p.A, p.pose, 0.1, ctx, others);
      if (vis0 && p.pose.visible === false) entered.add(p.A.key);
    }
  }
  assert.deepEqual([...entered].sort(), ['c0', 'c1', 'c2', 'c3', 'c4'], '入口が塞がっていても中に入れる');
}

{
  const house = { x: 12, z: 4 };
  const u = { tx: 12, tz: 4, wait: 0, inside: 0, mode: 'door', spot: house };
  const pose = { x: 12, z: 4, rot: 0, visible: true };
  const env = { houses: [house], rng: mulberry32(4), pickOutdoor: () => ({ x: 40, z: -10 }) };
  tickExtraResident(u, pose, 0.1, env);
  assert.equal(pose.visible, false);
  assert.ok(u.inside > 0);
  for (let t = 0; t < 90; t++) tickExtraResident(u, pose, 0.1, env);
  assert.equal(pose.visible, true, '企業区画の住民も家から出る');
  assert.ok(Math.hypot(pose.x - 13.3, pose.z - 4) > 2, `出たあと外を歩いていない ${pose.x},${pose.z}`);
}

console.log('sim ok');

if (process.env.SIM_ONLY === '1') process.exit(0);

const WEB = path.join(HERE, 'web');
const state = {
  status: '待機中', topic: '移動の確認', updated: 't', speaking: null, exec: '-',
  free_mb: 8000, transcript: [], services: {}, decisions: [], chat: [], user: '清継',
  claude: { status: '未ログイン' }, advice: [], guard: { rejected: [] }, locks: { items: [] },
};
const org = {
  user: '清継',
  people: ORG.people.map((p) => ({ id: p.id, tier: p.tier, name: p.name, title: p.title, dept: p.dept, parent: p.parent, model: p.model })),
};
const company = {
  enabled: true, linked: true, name: '架空商事', error: null, last_fetch: 't',
  metrics: { revenue: 1000000, employees: 12 },
  scale: { radius: 12, residents: 6, houses: 4, roads: 2, health: 'normal', vacant: 0, workshops: 0, stalls: 0, warehouses: 0, wasteland: 0, plots: 0 },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/state') return json(res, state);
  if (url.pathname === '/api/org') return json(res, org);
  if (url.pathname === '/api/company') return json(res, company);
  if (url.pathname === '/api/person/' || url.pathname.startsWith('/api/person/')) return json(res, { recent: [] });
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    req.on('data', () => {});
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'cfo', text: '村を歩いて、建物にも入っています。' }));
    });
    return;
  }
  const rel = (url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('no'); return;
  }
  const ct = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
  res.writeHead(200, { 'content-type': ct });
  res.end(fs.readFileSync(file));
});
function json(res, o) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(o));
}
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const dbg = port + 1;
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${dbg}`, `--user-data-dir=/tmp/chrome-village-motion-${port}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
async function version() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${dbg}/json/version`);
      if (r.ok) return r.json();
    } catch { /* 起動待ち */ }
    await sleep(150);
  }
  throw new Error('chrome のデバッグポートが開かない');
}

try {
  const ver = await version();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) pending.get(m.id)(m);
    if (m.method === 'Runtime.exceptionThrown') logs.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception'));
    if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
      logs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
    }
  };
  const cdp = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const target = await cdp('Target.createTarget', { url: 'about:blank' });
  const sess = await cdp('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
  const sessionId = sess.result.sessionId;
  const send = (method, params) => cdp(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error(d.text || d.exception?.description || 'eval failed');
    }
    return r.result?.result?.value;
  };
  const snapExpr = `(() => {
    const a = window.__agents || {};
    const rows = {};
    for (const [k,A] of Object.entries(a)) rows[k] = {x:A.g.position.x,z:A.g.position.z,state:A.state,vis:A.g.visible,desk:!!A.desk,svc:!!A.svc};
    let extras = [];
    const root = window.__S && window.__S.getObjectByName('company');
    if (root) root.traverse(o => { if (o.userData && o.userData.k==='residents' && o.userData.t) extras.push({x:o.position.x,z:o.position.z,vis:o.visible,inside:o.userData.inside||0,mode:o.userData.mode||''}); });
    return {rows, extras, self: document.getElementById('selftest')?.textContent || '', pill: document.getElementById('pill')?.textContent || '', n: Object.keys(a).length};
  })()`;

  async function watch(hour, ms) {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/?hour=${hour}&selftest=nochat&lowgpu` });
    let ready = null;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      ready = await evalJs(snapExpr);
      if (ready && ready.n >= 36 && ready.pill && !ready.pill.includes('読み込み')) break;
    }
    assert.ok(ready && ready.n >= 36, `住民が揃わない hour=${hour} pill=${ready && ready.pill} logs=${logs.join(' | ')}`);
    const first = ready.rows;
    const seenIn = new Set();
    const seenOutAfterIn = new Set();
    const wasIn = new Set();
    let extraIn = 0;
    let extraMoved = 0;
    const extra0 = ready.extras.map((e) => ({ x: e.x, z: e.z }));
    const t0 = Date.now();
    let last = ready;
    while (Date.now() - t0 < ms) {
      await sleep(400);
      last = await evalJs(snapExpr);
      for (const [k, a] of Object.entries(last.rows)) {
        if (!a.vis) { seenIn.add(k); wasIn.add(k); }
        else if (wasIn.has(k)) seenOutAfterIn.add(k);
      }
      extraIn = Math.max(extraIn, last.extras.filter((e) => !e.vis || e.inside > 0).length);
      extraMoved = last.extras.filter((e, i) => extra0[i] && Math.hypot(e.x - extra0[i].x, e.z - extra0[i].z) > 1).length;
    }
    let deskN = 0; let deskAlive = 0; let alive = 0; let residents = 0;
    for (const [k, a] of Object.entries(last.rows)) {
      if (a.svc || k === 'me') continue;
      residents += 1;
      const b = first[k];
      const moved = Math.hypot(a.x - b.x, a.z - b.z) > 2 || seenIn.has(k);
      if (moved) alive += 1;
      if (a.desk) { deskN += 1; if (moved || seenIn.has(k)) deskAlive += 1; }
    }
    const me = last.rows.me;
    const me0 = first.me;
    return { hour, deskN, deskAlive, alive, residents, seenIn: [...seenIn], seenOutAfterIn: [...seenOutAfterIn], extraIn, extraMoved, extras: last.extras.length, self: last.self, me: Math.hypot(me.x - me0.x, me.z - me0.z), logs: logs.splice(0) };
  }

  const work = await watch(15, 16000);
  console.log('browser work', JSON.stringify({ ...work, seenIn: work.seenIn.length, seenOutAfterIn: work.seenOutAfterIn.length }));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/village-work-after.png', Buffer.from(shot.result.data, 'base64'));

  assert.ok(work.me < 0.05, `CEO が動いた ${work.me}`);
  assert.ok(work.deskN === 24, `机の人数 ${work.deskN}`);
  assert.ok(work.deskAlive >= 18, `勤務中に机の住民が動かない ${work.deskAlive}/${work.deskN}`);
  assert.ok(work.alive >= 28, `動いた住民が少ない ${work.alive}/${work.residents}`);
  assert.ok(work.seenIn.filter((k) => k !== 'me').length >= 6, `建物に入った人数 ${work.seenIn.length}`);
  assert.ok(work.seenOutAfterIn.length >= 2, `建物から出た人数 ${work.seenOutAfterIn.length}`);
  const movedN = Number((work.self.match(/moved=(\d+)/) || [])[1]);
  assert.ok(movedN >= 20, `selftest ${work.self}`);
  assert.ok(work.extras >= 6 && work.extraMoved >= 3, `企業区画の歩行 ${work.extraMoved}/${work.extras}`);
  assert.ok(work.extraIn >= 1, '企業区画の住民が建物に入らない');

  const settle = await evalJs(`(() => { const A=window.__agents.cfo; return {x:A.g.position.x,z:A.g.position.z,vis:A.g.visible,state:A.state}; })()`);
  await evalJs(`(() => { const A=window.__agents.cfo; A.called=Date.now()+20000; if(A.state==='inside'){A.g.visible=true;A.state='pause'} })()`);
  await sleep(300);
  const mid = await evalJs(`(() => { const A=window.__agents.cfo; return {x:A.g.position.x,z:A.g.position.z,vis:A.g.visible}; })()`);
  await sleep(1200);
  const end = await evalJs(`(() => { const A=window.__agents.cfo; return {x:A.g.position.x,z:A.g.position.z,vis:A.g.visible,called:A.called>Date.now()}; })()`);
  assert.equal(end.vis, true);
  assert.equal(end.called, true);
  assert.ok(Math.hypot(end.x - mid.x, end.z - mid.z) < 0.2, `呼びかけ中に歩き続けた ${JSON.stringify({ mid, end, settle })}`);
  await evalJs(`(() => { const to=document.getElementById('to'); const msg=document.getElementById('msg'); to.value='cfo'; msg.value='聞こえますか'; document.getElementById('send').click(); return true; })()`);
  let bub = { text: '', st: '' };
  for (let i = 0; i < 12; i++) {
    await sleep(200);
    bub = await evalJs(`(() => { const A=window.__agents.cfo; return {text: String(A && A.bub ? A.bub.textContent : ''), st: String(document.getElementById('st').textContent||'')}; })()`);
    if (bub && (String(bub.text).includes('歩いて') || String(bub.text).includes('なんでしょう'))) break;
  }
  assert.ok(bub && (String(bub.text).includes('歩いて') || String(bub.text).includes('なんでしょう')), `吹き出しが無い: ${JSON.stringify(bub)}`);

  const night = await watch(23, 16000);
  console.log('browser night', JSON.stringify({ ...night, seenIn: night.seenIn.length, seenOutAfterIn: night.seenOutAfterIn.length }));
  assert.ok(night.me < 0.05, '夜に CEO が動いた');
  assert.ok(night.seenIn.length >= 10, `夜に入った人数 ${night.seenIn.length}`);
  assert.ok(night.seenOutAfterIn.length >= 4, `夜に出た人数 ${night.seenOutAfterIn.length}`);
  const shotN = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/opt/cursor/artifacts/village-night-after.png', Buffer.from(shotN.result.data, 'base64'));
  console.log('browser ok');
  ws.close();
} finally {
  chrome.kill('SIGKILL');
  server.close();
}
