/**
 * 村の住民の移動（清継さん / 機械室は呼ばない）。
 * 勤務中に机へ張り付く、夜に家へ入ったまま出ない、入口の混雑で止まる、を避ける。
 * 呼び出し中の停止と会議席への移動はページ側が先に決める。
 */

export function phaseOf(hour) {
  const h = +hour;
  if (h >= 22 || h < 6) return 'night';
  if (h >= 9 && h < 18) return 'work';
  return 'free';
}

export function hashKey(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function jitter(v, r, rng) {
  return { x: v.x + (rng() * 2 - 1) * r, z: v.z + (rng() * 2 - 1) * r };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function doorPoint(A, doors) {
  if (A.dept && doors[A.dept]) return doors[A.dept];
  return doors.coo || Object.values(doors)[0] || A.home;
}

function strollTarget(A, pose, ctx) {
  const rng = ctx.rng;
  const plazas = ctx.plazas || [];
  const nodes = ctx.nodes || [];
  for (let i = 0; i < 6; i++) {
    const r = rng();
    let t;
    if (r < 0.5 && plazas.length) t = jitter(pick(plazas, rng), 2.2, rng);
    else if (r < 0.85 && nodes.length) t = jitter(pick(nodes, rng), 0.8, rng);
    else t = jitter(A.home, 6, rng);
    if (Math.hypot(t.x - pose.x, t.z - pose.z) > 4) return t;
  }
  return { x: pose.x + 8, z: pose.z + (rng() * 4 - 2) };
}

export function goTo(A, pose, to, goal, route) {
  const pts = route({ x: pose.x, z: pose.z }, { x: to.x, z: to.z }) || [];
  A.path = pts.map((p) => ({ x: p.x, z: p.z }));
  A.goal = goal;
  A.state = 'walk';
  A.stuck = 0;
}

export function decide(A, pose, ctx) {
  const rng = ctx.rng;
  const r = rng();
  const doors = ctx.doors || {};
  const phase = ctx.phase;
  const forceOut = !!A.outdoorsNext;
  if (forceOut) A.outdoorsNext = false;
  if (!forceOut && phase === 'night') {
    if (pose.visible && r < 0.62) return goTo(A, pose, doorPoint(A, doors), 'door', ctx.route);
    return goTo(A, pose, strollTarget(A, pose, ctx), 'stroll', ctx.route);
  }
  if (!forceOut && phase === 'work' && A.desk && r < 0.22) {
    return goTo(A, pose, { x: A.home.x, z: A.home.z }, 'work', ctx.route);
  }
  const ids = Object.keys(doors);
  const doorBias = forceOut ? 0.6 : phase === 'work' ? 0.58 : phase === 'night' ? 0.62 : 0.4;
  if (ids.length && r < doorBias) {
    const own = A.dept && doors[A.dept] ? A.dept : ids[0];
    const id = !forceOut && r < doorBias * 0.55 ? own : ids[Math.floor(rng() * ids.length)];
    return goTo(A, pose, doors[id], 'door', ctx.route);
  }
  return goTo(A, pose, strollTarget(A, pose, ctx), 'stroll', ctx.route);
}

export function arrive(A, pose, ctx) {
  const phase = ctx.phase;
  const rng = ctx.rng;
  if (A.goal === 'door') {
    pose.visible = false;
    A.inside = phase === 'night' ? 6 + rng() * 6 : phase === 'work' ? 3.5 + rng() * 4.5 : 3 + rng() * 4;
    A.state = 'inside';
    A.stuck = 0;
    return;
  }
  if (A.goal === 'work') {
    A.state = 'work';
    A.timer = 4 + rng() * 4;
    if (A.face != null) pose.rot = A.face;
    A.stuck = 0;
    return;
  }
  if (A.goal === 'seat') {
    A.state = 'seat';
    A.stuck = 0;
    return;
  }
  A.state = 'pause';
  A.timer = 0.4 + rng() * 1.4;
  A.stuck = 0;
}

function bodyOf(B) {
  if (B && B.g && B.g.position) {
    return { key: B.key, svc: !!B.svc, x: B.g.position.x, z: B.g.position.z, visible: B.g.visible !== false };
  }
  return { key: B.key, svc: !!B.svc, x: B.x, z: B.z, visible: B.visible !== false };
}

function separate(pose, A, others, dt, waypoint) {
  let ox = 0;
  let oz = 0;
  for (const raw of others) {
    const B = bodyOf(raw);
    if (B.key === A.key || B.svc || !B.visible) continue;
    const dx = pose.x - B.x;
    const dz = pose.z - B.z;
    const q = dx * dx + dz * dz;
    if (q >= 1.1 || q < 1e-8) continue;
    const dist = Math.sqrt(q);
    const push = Math.min(0.22, (dt * 1.1) / dist);
    let nx = (dx / dist) * push;
    let nz = (dz / dist) * push;
    if (waypoint) {
      const wx = waypoint.x - pose.x;
      const wz = waypoint.z - pose.z;
      if (nx * wx + nz * wz < 0) {
        const wlen = Math.hypot(wx, wz) || 1;
        const px = -wz / wlen;
        const pz = wx / wlen;
        const along = nx * px + nz * pz;
        nx = px * along;
        nz = pz * along;
      }
    }
    ox += nx;
    oz += nz;
  }
  const mag = Math.hypot(ox, oz);
  const cap = 0.28;
  if (mag > cap) {
    ox = (ox / mag) * cap;
    oz = (oz / mag) * cap;
  }
  pose.x += ox;
  pose.z += oz;
}

export function tickResident(A, pose, dt, ctx, others) {
  if (A.state === 'inside') {
    A.inside -= dt;
    pose.visible = false;
    if (A.inside > 0) return false;
    const door = doorPoint(A, ctx.doors || {});
    const ang = (hashKey(A.key) % 628) / 100;
    pose.visible = true;
    pose.x = door.x + Math.cos(ang) * 0.9;
    pose.z = door.z + Math.sin(ang) * 0.9;
    A.state = 'idle';
    A.goal = null;
    A.path = [];
  }
  if (A.state === 'idle') decide(A, pose, ctx);
  if ((A.state === 'pause' || A.state === 'work') && (A.timer -= dt) <= 0) {
    if (A.state === 'work' || A.goal === 'work') A.outdoorsNext = true;
    A.state = 'idle';
  }
  if (A.state === 'idle') decide(A, pose, ctx);

  let moving = false;
  let aim = null;
  if (A.state === 'walk') {
    if (!A.path || !A.path.length) arrive(A, pose, ctx);
    else {
      const tgt = A.path[0];
      const dx = tgt.x - pose.x;
      const dz = tgt.z - pose.z;
      const L = Math.hypot(dx, dz);
      const close = L < 0.45 || (A.goal === 'door' && L < 1.8 && (A.stuck || 0) > 0.6);
      if (close) {
        A.path.shift();
        A.stuck = 0;
        if (!A.path.length) arrive(A, pose, ctx);
      } else {
        const step = Math.min(L, dt * (A.speed || 2.2) * (A.speaking ? 1.8 : 1));
        const nx = dx / (L || 1);
        const nz = dz / (L || 1);
        pose.x += nx * step;
        pose.z += nz * step;
        const ry = Math.atan2(nx, nz);
        const turn = Math.atan2(Math.sin(ry - (pose.rot || 0)), Math.cos(ry - (pose.rot || 0)));
        pose.rot = (pose.rot || 0) + turn * Math.min(1, dt * 10);
        moving = step > 0.0001;
        aim = { x: tgt.x, z: tgt.z, before: L };
      }
    }
  }
  if (pose.visible !== false) separate(pose, A, others || [], dt, A.state === 'walk' && A.path && A.path[0]);
  if (aim && A.state === 'walk' && A.path && A.path.length) {
    const now = Math.hypot(aim.x - pose.x, aim.z - pose.z);
    if (now > aim.before - 0.02) A.stuck = (A.stuck || 0) + dt;
    else A.stuck = 0;
    if ((A.stuck || 0) > 0.9) {
      A.path.shift();
      A.stuck = 0;
      if (!A.path.length) arrive(A, pose, ctx);
    }
  }
  return moving;
}

/** 企業区画の住人。家の座標へ歩き、入って（非表示）から外へ出る。 */
export function tickExtraResident(u, pose, dt, env) {
  const rng = env.rng;
  if (u.inside > 0) {
    u.inside -= dt;
    pose.visible = false;
    if (u.inside > 0) return;
    pose.visible = true;
    const h = u.spot;
    if (h) {
      pose.x = h.x + 1.3;
      pose.z = h.z;
    }
    const out = env.pickOutdoor();
    u.tx = out.x;
    u.tz = out.z;
    u.mode = 'wander';
    u.wait = 0.4 + rng() * 1.2;
    return;
  }
  pose.visible = true;
  const dx = u.tx - pose.x;
  const dz = u.tz - pose.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.45) {
    if (u.mode === 'door') {
      u.inside = 3 + rng() * 4;
      pose.visible = false;
      return;
    }
    u.wait = (u.wait ?? 0) - dt;
    if (u.wait < 0) {
      const houses = env.houses || [];
      if (houses.length && rng() < 0.7) {
        let h = houses[0];
        let best = Infinity;
        for (const cand of houses) {
          const dd = Math.hypot(cand.x - pose.x, cand.z - pose.z);
          if (dd < best) { best = dd; h = cand; }
        }
        u.tx = h.x;
        u.tz = h.z;
        u.mode = 'door';
        u.spot = h;
        u.wait = 0.2;
      } else {
        const p = env.pickOutdoor();
        u.tx = p.x;
        u.tz = p.z;
        u.mode = 'wander';
        u.wait = 0.6 + rng() * 1.6;
      }
    }
  } else {
    const sp = Math.min(d, dt * 1.8);
    pose.x += (dx / d) * sp;
    pose.z += (dz / d) * sp;
    pose.rot = Math.atan2(dx, dz);
  }
}
