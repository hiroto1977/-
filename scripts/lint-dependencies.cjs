#!/usr/bin/env node
'use strict';

/*
 * 依存の供給網を台帳で固定する (`npm run lint:deps`)。
 *
 * ## なぜ要るのか
 *
 * このアプリの出荷物は**単一の HTML ファイル**である。`dependencies` に
 * 入った物は 1 つ残らずそこへ畳み込まれ、**保管庫と同じオリジンで走る** ——
 * IndexedDB の暗号化トークンにも、メモリ上のマスター鍵にも手が届く位置。
 * 依存が 1 つ乗っ取られれば、全サービスの資格情報が失われる。
 *
 * 2026-08-25 に測ったところ **本番依存は 5 つだけ**だった
 * (react / react-dom と、その推移的依存 3 つ)。74 サービスを持つアプリの
 * 実行時表面としては極端に小さく、これは設計の結果である
 * (図は外部ライブラリを入れず SVG を自前で組む —— docs/ARCHITECTURE.md)。
 *
 * **ところが、これを守っている物が 1 つも無かった。** 依存を見るゲートは
 * ゼロで、`dependencies` に何を足しても緑のまま通った。小さいことは
 * 偶然ではなく方針なので、方針を機械の主張にする。
 *
 * ## 規則
 *
 *   1. lockfile が読め、パッケージ数が床以上 (走査が死んでいないこと)
 *   2. **本番依存の閉包**が台帳と一致 (双方向・理由つき)
 *   3. **インストール時にコードを走らせる依存**が台帳と一致 (双方向・理由つき)
 *      かつ本番依存でないこと
 *   4. 取得元はすべて registry.npmjs.org
 *   5. integrity ハッシュが全件にあること
 *
 * 4 と 5 は「lockfile を書き換えて別の場所から引く」形を塞ぐ。
 * git 参照や tarball の URL は、レジストリと違って**後から中身を差し替えられる**。
 *
 * ## 評価は純関数
 *
 * `evaluate({ lock, pkg })` は読み込み済みの値だけを見る。self-test が
 * 合成 lockfile を流し込めるようにするためで、今日 `lint:workflow-security` と
 * `lint:ipc-handlers` で「注入できないから試せない枝」を 2 つ踏んだ教訓から、
 * 最初からこの形で書く。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 走査が死んで「0 件だから健全」にならないための床。実測 647 (2026-08-25)。 */
const MIN_PACKAGES = 400;

/**
 * **本番依存の閉包** (dev でないもの)。出荷物へ畳み込まれ、保管庫と同じ
 * オリジンで走る物だけがここに載る。足すときは理由を書くこと ——
 * 理由が書けないなら、それは足してはいけない依存である。
 */
const PROD_ALLOW = {
  react: '画面の描画そのもの。単一 HTML へ同梱される',
  'react-dom': '同上 (DOM への描画)',
  scheduler: 'react-dom の推移的依存',
  'loose-envify': 'react / react-dom の推移的依存 (NODE_ENV の畳み込み)',
  'js-tokens': 'loose-envify の推移的依存',
};

/**
 * **インストール時にコードを走らせる依存** (`hasInstallScript`)。
 * `npm ci` の時点で任意のコードが動くので、本番依存でなくても危険度は高い。
 * すべて dev でなければならない (規則 3 が強制する)。
 */
const INSTALL_SCRIPT_ALLOW = {
  esbuild: 'vite のバンドラ。プラットフォーム別バイナリを配置する (dev のみ)',
  fsevents: 'macOS のファイル監視 (dev のみ・optional)',
  'electron-winstaller': 'Windows インストーラの生成 (dev のみ)',
};

/** lockfile の `node_modules/a/node_modules/b` → `b`。 */
function bareName(lockPath) {
  const i = lockPath.lastIndexOf('node_modules/');
  return i === -1 ? lockPath : lockPath.slice(i + 'node_modules/'.length);
}

/** 台帳と実物の差。`extra` = 実物にあるが台帳に無い / `stale` = その逆。 */
function diff(actual, ledger) {
  const known = new Set(Object.keys(ledger));
  return {
    extra: [...actual].filter((n) => !known.has(n)).sort(),
    stale: [...known].filter((n) => !actual.has(n)).sort(),
  };
}

function evaluate({ lock, pkg }) {
  const problems = [];
  const packages = lock?.packages;
  if (packages === null || typeof packages !== 'object') {
    return ['package-lock.json に packages がありません (読み方が壊れている可能性)'];
  }
  const entries = Object.entries(packages).filter(([name]) => name !== '');

  // 1. 空撃ち検査。
  if (entries.length < MIN_PACKAGES) {
    problems.push(
      `lockfile から ${entries.length} 件しか読めませんでした (${MIN_PACKAGES} 件以上を期待) — ` +
        '走査が壊れている可能性があります',
    );
  }

  // 2. 本番依存の閉包。
  const prod = new Set(entries.filter(([, m]) => !m.dev).map(([n]) => bareName(n)));
  const d2 = diff(prod, PROD_ALLOW);
  for (const n of d2.extra) {
    problems.push(
      `本番依存 ${n} が台帳にありません — 出荷する単一 HTML へ畳み込まれ、` +
        '保管庫と同じオリジンで走ります。理由を添えて PROD_ALLOW へ',
    );
  }
  for (const n of d2.stale) {
    problems.push(`台帳の本番依存 ${n} はもう使われていません — PROD_ALLOW から消すこと`);
  }

  // 3. インストール時にコードを走らせる依存。
  const scripted = new Set(entries.filter(([, m]) => m.hasInstallScript).map(([n]) => bareName(n)));
  const d3 = diff(scripted, INSTALL_SCRIPT_ALLOW);
  for (const n of d3.extra) {
    problems.push(
      `${n} は npm ci の時点でコードを走らせます — 理由を添えて INSTALL_SCRIPT_ALLOW へ`,
    );
  }
  for (const n of d3.stale) {
    problems.push(`台帳の ${n} はもうインストール時コードを持ちません — INSTALL_SCRIPT_ALLOW から消すこと`);
  }
  for (const n of scripted) {
    if (prod.has(n)) {
      problems.push(`${n} は本番依存でありながらインストール時コードを走らせます — dev へ移すこと`);
    }
  }

  // 4 / 5. 取得元と integrity。
  for (const [name, meta] of entries) {
    if (meta.link) continue;
    const res = meta.resolved;
    if (typeof res === 'string' && !res.startsWith('https://registry.npmjs.org/')) {
      problems.push(
        `${name} の取得元が registry.npmjs.org ではありません (${res}) — ` +
          'レジストリ以外は後から中身を差し替えられます',
      );
    }
    if (typeof res === 'string' && typeof meta.integrity !== 'string') {
      problems.push(`${name} に integrity ハッシュがありません`);
    }
  }

  // 6. 台帳の理由。
  for (const [ledgerName, ledger] of [['PROD_ALLOW', PROD_ALLOW], ['INSTALL_SCRIPT_ALLOW', INSTALL_SCRIPT_ALLOW]]) {
    for (const [n, why] of Object.entries(ledger)) {
      if (typeof why !== 'string' || why.trim() === '') {
        problems.push(`${ledgerName} の ${n} に理由がありません`);
      }
    }
  }

  // package.json の宣言と閉包の食い違い (宣言だけ消して lockfile に残る形)。
  const declared = Object.keys(pkg?.dependencies ?? {});
  for (const n of declared) {
    if (!prod.has(n)) {
      problems.push(`package.json の dependencies にある ${n} が lockfile の本番閉包にありません`);
    }
  }

  return problems;
}

function selfTest() {
  const mk = (packages) => ({ lock: { packages }, pkg: { dependencies: {} } });
  const full = () => {
    const out = { '': {} };
    for (let i = 0; i < MIN_PACKAGES; i++) out[`node_modules/dev${i}`] = { dev: true, resolved: `https://registry.npmjs.org/dev${i}`, integrity: 'sha512-x' };
    for (const n of Object.keys(PROD_ALLOW)) out[`node_modules/${n}`] = { resolved: `https://registry.npmjs.org/${n}`, integrity: 'sha512-x' };
    for (const n of Object.keys(INSTALL_SCRIPT_ALLOW)) out[`node_modules/${n}`] = { dev: true, hasInstallScript: true, resolved: `https://registry.npmjs.org/${n}`, integrity: 'sha512-x' };
    return out;
  };
  const cases = [
    ['台帳どおりなら何も出ない', mk(full()), 0],
    ['packages が無ければ鳴る', { lock: {}, pkg: {} }, 1],
    ['パッケージ数が床未満なら鳴る (空撃ち)', mk({ '': {}, 'node_modules/react': {} }), 1 + Object.keys(PROD_ALLOW).length - 1 + Object.keys(INSTALL_SCRIPT_ALLOW).length],
    [
      '台帳に無い本番依存が鳴る',
      (() => { const p = full(); p['node_modules/evil-chart'] = { resolved: 'https://registry.npmjs.org/evil-chart', integrity: 'sha512-x' }; return mk(p); })(),
      1,
    ],
    [
      '入れ子の node_modules でも名前で見る',
      (() => { const p = full(); p['node_modules/a/node_modules/evil-chart'] = { resolved: 'https://registry.npmjs.org/evil-chart', integrity: 'sha512-x' }; return mk(p); })(),
      1,
    ],
    [
      '台帳にあるのに実物から消えたら鳴る',
      (() => { const p = full(); delete p['node_modules/scheduler']; return mk(p); })(),
      1,
    ],
    [
      '台帳に無いインストール時コードが鳴る',
      (() => { const p = full(); p['node_modules/hooky'] = { dev: true, hasInstallScript: true, resolved: 'https://registry.npmjs.org/hooky', integrity: 'sha512-x' }; return mk(p); })(),
      1,
    ],
    [
      '本番依存がインストール時コードを持てば鳴る',
      (() => { const p = full(); p['node_modules/react'].hasInstallScript = true; return mk(p); })(),
      2, // 台帳に無い install script + 本番依存である
    ],
    [
      'registry 以外から引いていれば鳴る',
      (() => { const p = full(); p['node_modules/react'].resolved = 'https://evil.test/react.tgz'; return mk(p); })(),
      1,
    ],
    [
      'integrity が無ければ鳴る',
      (() => { const p = full(); delete p['node_modules/react'].integrity; return mk(p); })(),
      1,
    ],
    [
      'link (workspace) は取得元を問わない',
      (() => { const p = full(); p['node_modules/local'] = { dev: true, link: true, resolved: '../local' }; return mk(p); })(),
      0,
    ],
    [
      'package.json の宣言が閉包に無ければ鳴る',
      (() => ({ lock: { packages: full() }, pkg: { dependencies: { 'ghost-lib': '^1.0.0' } } }))(),
      1,
    ],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, input, want] of cases) {
    const n = evaluate(input).length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${want})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — ゲートが鳴らない / 鳴りすぎている`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const lock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const problems = evaluate({ lock, pkg });
  const total = Object.keys(lock.packages ?? {}).length - 1;
  const prod = Object.keys(PROD_ALLOW).length;
  const scripted = Object.keys(INSTALL_SCRIPT_ALLOW).length;
  console.log(
    `Checked ${total} locked package(s): 本番依存 ${prod} 件 / インストール時コード ${scripted} 件 (いずれも台帳) / 取得元と integrity`,
  );
  if (problems.length === 0) {
    console.log('✅ 依存の供給網は台帳どおりです');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { evaluate, PROD_ALLOW, INSTALL_SCRIPT_ALLOW };
