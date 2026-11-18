/**
 * /api/state の service_state を機械室の直立ランプへ塗る。
 * 状態はサーバが既に出した healthy / degraded / down だけを見る。ここでは色と札を付ける。
 * boolean の true だけ healthy。文字列の "true" や 1 は down（degraded にはしない）。
 */
export const LAMP_COLOR = { healthy: 0x43a047, degraded: 0xffb300, down: 0xc62828 };
export const LAMP_EMISSIVE = { healthy: 0x2e7d32, degraded: 0xef6c00, down: 0x4a0000 };

export function lampState(value) {
  if (value === 'healthy' || value === 'degraded' || value === 'down') return value;
  if (value === true) return 'healthy';
  return 'down';
}

export function applyServiceHealth(agents, services, paint) {
  const table = services && typeof services === 'object' ? services : {};
  for (const [name, raw] of Object.entries(table)) {
    const A = agents['s:' + name];
    if (!A) continue;
    const state = lampState(raw);
    A.up = state === 'healthy';
    A.health = state;
    if (A.g) {
      A.g.rotation.z = 0;
      A.g.position.y = 0;
    }
    A.lab.classList.toggle('off', state === 'down');
    A.lab.classList.toggle('warn', state === 'degraded');
    const mark = state === 'healthy' ? '' : state === 'degraded' ? ' ⚠' : ' 💤';
    A.lab.textContent = name + mark;
    const color = LAMP_COLOR[state];
    const glow = LAMP_EMISSIVE[state];
    const matl = A.lamp && A.lamp.material;
    if (matl && matl.color && typeof matl.color.setHex === 'function') {
      matl.color.setHex(color);
      if (matl.emissive && typeof matl.emissive.setHex === 'function') matl.emissive.setHex(glow);
    } else if (typeof paint === 'function' && A.body) {
      A.body.material = paint(color);
    }
  }
}
