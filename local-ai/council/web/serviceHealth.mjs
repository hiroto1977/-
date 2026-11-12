/**
 * /api/state の services を村の機械室ラベルへ反映する。
 * 塗ってよいのは JSON の boolean true だけ。ポートの開閉も、文字列の "true" も稼働にしない。
 */
export function applyServiceHealth(agents, services, paint) {
  const table = services && typeof services === 'object' ? services : {};
  for (const [name, up] of Object.entries(table)) {
    const A = agents['s:' + name];
    if (!A) continue;
    const on = up === true;
    A.up = on;
    A.lab.classList.toggle('off', !on);
    A.lab.textContent = name + (on ? '' : ' 💤');
    if (typeof paint === 'function' && A.body) A.body.material = paint(on ? 0x90a4ae : 0x616161);
  }
}
