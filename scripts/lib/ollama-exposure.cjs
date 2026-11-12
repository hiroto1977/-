'use strict';
/*
 * Ollama が **この PC の外から届く形で待ち受けていないか** を測る (2026-10-20 · パス 542 · threat: T-129)。
 *
 * Ollama には認証が無い。`OLLAMA_HOST` を 127.0.0.1 以外にした (あるいは 0.0.0.0 にした) ままだと、
 * 同じ網の誰でもこの PC の GPU でモデルを動かし、取得・削除でき、古い版は任意コード実行に至る。
 * アプリは 127.0.0.1 にしかつながないので、利用者は**公開されていても気付かない**。
 *
 * 測り方: この PC の外向きの IPv4 アドレス (`os.networkInterfaces()` の internal でない物) ごとに、
 * 同じポートへ TCP で繋がるかを見る。繋がれば、そのアドレスから他の端末も繋がれる。
 * **外へは 1 バイトも送らない** (自分のアドレスへの接続確認だけ・HTTP の中身は読まない)。
 *
 * 判定は純関数 `candidateAddresses` と、接続を注入できる `findExposed` に分けてある
 * (`ollamaExposure.test.ts` が実際に待ち受けて確かめる)。
 */
const net = require('node:net');

const CONNECT_TIMEOUT_MS = 1500;
/** 検査するアドレス数の上限 (多数の仮想 NIC を持つ環境で長く止まらないため)。 */
const MAX_ADDRESSES = 16;

/** 外向きの IPv4 アドレスだけを重複なしで返す (loopback・IPv6 のリンクローカルは対象外)。 */
function candidateAddresses(ifaces) {
  const out = [];
  if (ifaces === null || typeof ifaces !== 'object') return out;
  for (const list of Object.values(ifaces)) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      if (a === null || typeof a !== 'object') continue;
      if (a.internal === true) continue;
      const family = a.family === 4 ? 'IPv4' : a.family;
      if (family !== 'IPv4' || typeof a.address !== 'string') continue;
      if (a.address.startsWith('127.') || a.address.startsWith('169.254.')) continue;
      if (!out.includes(a.address)) out.push(a.address);
      if (out.length >= MAX_ADDRESSES) return out;
    }
  }
  return out;
}

/** host:port へ TCP で繋がるか (繋がったらすぐ閉じる。何も送らない)。 */
function tcpConnects(host, port, timeoutMs = CONNECT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * 外向きのどのアドレスでポートが開いているかを返す。
 * `connect` を差し替えられる (検査用)。既定は実際の TCP 接続。
 */
async function findExposed(ifaces, port, connect = tcpConnects) {
  const addrs = candidateAddresses(ifaces);
  const results = await Promise.all(addrs.map(async (addr) => ((await connect(addr, port)) ? addr : null)));
  return results.filter((a) => a !== null);
}

/** 利用者へ見せる警告文 (見つからなければ null)。 */
function exposureWarning(exposed, port) {
  if (exposed.length === 0) return null;
  return (
    `⚠ Ollama (ポート ${port}) がこの PC の外から届くアドレスで待ち受けています: ${exposed.join(', ')}。` +
    'Ollama には認証が無いので、同じ網の誰でもこの PC でモデルを動かし、取得・削除できます。' +
    '使わないなら OLLAMA_HOST を外す (127.0.0.1 に戻す)。LAN で使うなら信頼できる網だけにし、' +
    '公共の Wi-Fi・ポート開放・公開トンネルは避けてください (docs/OLLAMA_SECURITY.md)。'
  );
}

module.exports = { candidateAddresses, tcpConnects, findExposed, exposureWarning, CONNECT_TIMEOUT_MS, MAX_ADDRESSES };
