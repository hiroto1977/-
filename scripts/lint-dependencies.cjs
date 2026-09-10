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
 *   6. 台帳の理由が空でないこと
 *   7. **セキュリティの床**が、道 (overrides / devDependencies) を問わず台帳と一致
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

/**
 * **自分で押さえた「これより下へ落とさない」版の台帳 (セキュリティの床)。**
 *
 * 2026-08-17 に `qs` の DoS を `overrides` で押さえたとき、
 * `src/shared/__tests__/dependencyOverrides.test.ts` に理由の台帳を作った。
 * その台帳の散文はこう書いてある —— 「`overrides` は**上流が直るまで自分で
 * 押さえている脆弱性**の記録である」。
 *
 * **ところが走査していたのは `package.json` の `overrides` の鍵だけだった。**
 * この repo が床を作る道は 3 本あり、台帳が見ていたのは 1 本しかない:
 *
 *   1. `overrides`      —— 推移的依存を強制的に上げる (qs / js-yaml)
 *   2. `devDependencies` の範囲 —— 直接依存の下限を上げる (vitest 系)
 *   3. lockfile だけ    —— どこにも宣言が無く、解決結果としてだけ存在する
 *
 * 2026-09-10 に実際に 2 と 3 を踏んだ。`vitest` の
 * **パストラバーサル / 任意ファイル読み出し** (GHSA-82fw-gwwq-j7x9) を
 * `^4.1.10` → `^4.1.11` で塞ぎ、`js-yaml` の DoS (GHSA-2883-xcg3-v3hh・high) は
 * `electron-builder` の `^4.1.0` の内側だったので `npm update` だけで 4.3.2 に
 * 上がった —— **どちらも「なぜその数字なのか」がどこにも残らない**。
 * caret を `^4.1` へ揃える整理も、lockfile の衝突を相手側で解決するのも、
 * 型検査も単体テストも通る。気付くのは誰かが手で `npm audit` を走らせたときだけ。
 *
 * だから 3 を 1 に寄せ (js-yaml も `overrides` で宣言する)、
 * **道が何であれ床は 1 つの台帳に載せる**。
 *
 * 見るのは**ネットワークに出ずに確かめられること**だけ:
 *
 *   - 床ごとに、宣言 (`overrides` / `devDependencies`) が実在すること
 *   - その宣言が許す**最小の版**が床を下回らないこと (指定の緩み)
 *   - lockfile の**すべての解決版** (入れ子の複製も) が床以上であること
 *   - `overrides` の鍵は 1 つ残らず台帳に在ること (双方向)
 *
 * 勧告の**件数**はここでは数えない。新しいアドバイザリで日々変わるので、
 * 鳴らしても中身が無い日がある (`docs/REMAINING_WORK.md`)。
 * **変わらないのは「自分で押さえたことを忘れない」の方**である。
 */
const SECURITY_FLOORS = [
  {
    package: 'qs',
    atLeast: '6.16.0',
    mechanism: 'overrides',
    checkedOn: '2026-09-10',
    advisories: ['GHSA-q8mj-m7cp-5q26', 'GHSA-x5fp-wj9c-mxmx', 'GHSA-4mjr-xmp4-gh2g'],
    why:
      '2026-08-17 に qs.stringify の DoS (GHSA-q8mj-m7cp-5q26 / <=6.15.1) を @stryker-mutator/core → '
      + 'typed-rest-client → qs@6.15.1 に対して ^6.15.2 で押さえた。**2026-09-10 に測ったらその床は'
      + '既に低すぎた** —— 後から出た GHSA-x5fp-wj9c-mxmx (<=6.15.3) と GHSA-4mjr-xmp4-gh2g (<6.16.0) が'
      + '6.15.2 / 6.15.3 を覆っており、床が許す版が脆弱なままだった (lockfile はたまたま 6.16.0 に'
      + '解決されていたので npm audit は緑だった)。床は 6.16.0。typed-rest-client の API は変わらない',
  },
  {
    package: 'js-yaml',
    atLeast: '4.3.2',
    mechanism: 'overrides',
    checkedOn: '2026-09-10',
    advisories: ['GHSA-2883-xcg3-v3hh'],
    why:
      '2026-09-10: js-yaml の DoS (high・maxTotalMergeKeys が空のマージ元に対して CPU を制限しない)。'
      + 'electron-builder 26.15.3 → app-builder-lib / builder-util / dmg-builder が ^4.1.0 で引き、'
      + '4.3.1 が固まっていた。4.3.2 はその範囲の内側なので上流の更新を待たずに宣言できる —— '
      + '宣言しないと lockfile の解決結果としてしか存在せず、衝突の解決ひとつで黙って戻る',
  },
  {
    package: 'vitest',
    atLeast: '4.1.11',
    mechanism: 'devDependency',
    checkedOn: '2026-09-10',
    advisories: ['GHSA-82fw-gwwq-j7x9'],
    why:
      '2026-09-10: @vitest/mocker の redirect mock を経由したパストラバーサル / 任意ファイル読み出し'
      + ' (>=2.1.0 <4.1.11)。検査を走らせる道具そのものなので、開発機と CI の両方で毎回動く。'
      + '4.1.11 は patch なので API は変わらない',
  },
  {
    package: '@vitest/coverage-v8',
    atLeast: '4.1.11',
    mechanism: 'devDependency',
    checkedOn: '2026-09-10',
    advisories: ['GHSA-82fw-gwwq-j7x9'],
    why:
      '2026-09-10: 同上。vitest は @vitest/coverage-v8 を厳密一致 (peerOptional) で見るので、'
      + '片方だけ上げると解決できない。床は 2 つで 1 組',
  },
];

/** `4.1.11` / `4.1.11-beta.2` → `[4, 1, 11]`。読めなければ null。 */
function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 版の大小。等値と大小を 1 か所で見る 3 分岐 (`>` だけだと等値の変異が守れない)。 */
function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * 範囲が**許す最小の版**。`^4.1.11` / `~4.1.11` / `>=4.1.11` / `4.1.11` はどれも 4.1.11。
 * `^4.1` のように patch を書かない形は 4.1.0 になる —— そこが要点で、
 * 「揃えるつもりで緩めた」を拾う。読めない形は null (規則 7 が落とす)。
 */
function rangeFloor(range) {
  if (typeof range !== 'string') return null;
  const cleaned = range.trim().replace(/^(\^|~|>=|=|v)+/, '');
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(cleaned);
  if (m === null) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** 規則 7: セキュリティの床。戻り値は問題の一覧。 */
function checkSecurityFloors({ lock, pkg }, floors = SECURITY_FLOORS) {
  const problems = [];
  const packages = lock?.packages ?? {};
  const declaredOverrides = pkg?.overrides ?? {};

  for (const floor of floors) {
    const { package: name, atLeast, mechanism, why, advisories, checkedOn } = floor;
    const advisory = Array.isArray(advisories) ? advisories.join(' / ') : '';
    const want = parseVersion(atLeast);
    if (want === null) {
      problems.push(`床の台帳 ${name} の atLeast (${String(atLeast)}) が版として読めません`);
      continue;
    }
    if (typeof why !== 'string' || why.trim() === '') {
      problems.push(`床の台帳 ${name} に理由がありません — 理由が書けない床は守れません`);
    }
    if (!Array.isArray(advisories) || advisories.length === 0) {
      problems.push(`床の台帳 ${name} に勧告 ID がありません — どの勧告に対する床かが残らない`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(checkedOn))) {
      problems.push(
        `床の台帳 ${name} に checkedOn (勧告データベースと突き合わせた日) がありません — `
          + '床は据えた日の勧告に対してしか正しくない',
      );
    }

    // 宣言が実在するか (整理のときに黙って消える 1 行)。
    const declared =
      mechanism === 'overrides' ? declaredOverrides[name] : (pkg?.devDependencies ?? {})[name];
    if (typeof declared !== 'string') {
      problems.push(
        `${name} の床 ${atLeast} (${advisory}) を宣言している ${mechanism} がありません — `
          + `${mechanism === 'overrides' ? 'package.json の overrides' : 'devDependencies'} に戻すこと`,
      );
      continue;
    }

    // 宣言が許す最小の版が床を下回っていないか (「揃えるつもりで緩めた」)。
    const got = rangeFloor(declared);
    if (got === null) {
      problems.push(`${name} の指定 "${declared}" から下限を読めません`);
    } else if (cmpVersion(got, want) < 0) {
      problems.push(
        `${name} の指定 "${declared}" は ${got.join('.')} まで下がれます (床 ${atLeast} / ${advisory}) — `
          + '指定が緩んでいます',
      );
    }

    // lockfile の解決版。**入れ子の複製も含めて全部**見る (1 本だけ古い形を拾う)。
    const resolved = Object.entries(packages).filter(([p]) => bareName(p) === name);
    if (resolved.length === 0) {
      problems.push(`${name} が lockfile にありません (床 ${atLeast} / ${advisory})`);
      continue;
    }
    for (const [p, meta] of resolved) {
      const v = parseVersion(meta?.version);
      if (v === null) {
        problems.push(`${p} の版 (${String(meta?.version)}) を読めません`);
      } else if (cmpVersion(v, want) < 0) {
        problems.push(
          `${p} が ${meta.version} まで落ちています (床 ${atLeast} / ${advisory}) — ${why}`,
        );
      }
    }
  }

  // 双方向: overrides の鍵は 1 つ残らず台帳に在ること。
  const known = new Set(floors.map((f) => f.package));
  for (const name of Object.keys(declaredOverrides)) {
    if (!known.has(name)) {
      problems.push(
        `overrides の ${name} が床の台帳にありません — override は「上流が直るまで自分で押さえて`
          + 'いる脆弱性」の記録なので、理由と勧告 ID を添えて SECURITY_FLOORS へ',
      );
    }
  }
  return problems;
}

/**
 * **床が古びていないか。** 床は据えた日の勧告に対してしか正しくない ——
 * 実際 `qs` の床 6.15.2 は据えた 24 日後に低すぎになった (後から出た 2 件が
 * 6.15.2 / 6.15.3 を覆った)。lockfile がたまたま上の版に解決されていたので
 * `npm audit` は緑のままで、**気付いたのは床そのものを測り直したとき**だった。
 *
 * ここは**ネットワークに出ない**ので「低すぎるか」は判定できない。判定できるのは
 * 「いつ測ったか」だけなので、古びた床を**警告**で名指しする。測り直す道具は
 * `npm run audit:floors` (勧告データベースに出る・CI では走らせない)。
 */
function staleFloors(floors = SECURITY_FLOORS, now = new Date(), withinDays = 180) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out = [];
  for (const f of floors) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f.checkedOn));
    if (m === null) continue; // 形の不備は checkSecurityFloors が落とす
    const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const days = Math.floor((today - at) / 86_400_000);
    if (days >= withinDays) out.push({ package: f.package, checkedOn: f.checkedOn, days });
  }
  return out;
}

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

  // 7. セキュリティの床 (道を問わず)。
  problems.push(...checkSecurityFloors({ lock, pkg }));

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
  // 床の台帳を満たす合成の宣言。規則 7 が既存の case を汚さないための下地で、
  // 床そのものの対照は下の floorCases が持つ。
  const okPkg = () => ({
    dependencies: {},
    overrides: Object.fromEntries(
      SECURITY_FLOORS.filter((f) => f.mechanism === 'overrides').map((f) => [f.package, `^${f.atLeast}`]),
    ),
    devDependencies: Object.fromEntries(
      SECURITY_FLOORS.filter((f) => f.mechanism === 'devDependency').map((f) => [f.package, `^${f.atLeast}`]),
    ),
  });
  const mk = (packages, pkg = okPkg()) => ({ lock: { packages }, pkg });
  const full = () => {
    const out = { '': {} };
    for (let i = 0; i < MIN_PACKAGES; i++) out[`node_modules/dev${i}`] = { dev: true, resolved: `https://registry.npmjs.org/dev${i}`, integrity: 'sha512-x' };
    for (const n of Object.keys(PROD_ALLOW)) out[`node_modules/${n}`] = { resolved: `https://registry.npmjs.org/${n}`, integrity: 'sha512-x' };
    for (const n of Object.keys(INSTALL_SCRIPT_ALLOW)) out[`node_modules/${n}`] = { dev: true, hasInstallScript: true, resolved: `https://registry.npmjs.org/${n}`, integrity: 'sha512-x' };
    for (const f of SECURITY_FLOORS) out[`node_modules/${f.package}`] = { dev: true, version: f.atLeast, resolved: `https://registry.npmjs.org/${f.package}`, integrity: 'sha512-x' };
    return out;
  };
  const cases = [
    ['台帳どおりなら何も出ない', mk(full()), 0],
    ['packages が無ければ鳴る', { lock: {}, pkg: {} }, 1],
    ['パッケージ数が床未満なら鳴る (空撃ち)', mk({ '': {}, 'node_modules/react': {} }), 1 + Object.keys(PROD_ALLOW).length - 1 + Object.keys(INSTALL_SCRIPT_ALLOW).length + SECURITY_FLOORS.length],
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
      mk(full(), { ...okPkg(), dependencies: { 'ghost-lib': '^1.0.0' } }),
      1,
    ],
  ];
  // --- 規則 7 の対照 (合成の台帳) ---
  // 守っている物を実際に壊し、狙った項目が落ちることを見る。
  // **鳴らない対照は「合格」ではなく、その検査についての報せ** (CLAUDE.md)。
  const tinyFloor = [
    { package: 'left-pad', atLeast: '2.3.4', mechanism: 'overrides', advisories: ['GHSA-xxxx-test'], checkedOn: '2026-09-10', why: '対照用' },
    { package: 'tape', atLeast: '5.0.0', mechanism: 'devDependency', advisories: ['GHSA-xxxx-test'], checkedOn: '2026-09-10', why: '対照用' },
  ];
  const floorInput = (mutate = () => {}) => {
    const input = {
      lock: {
        packages: {
          '': {},
          'node_modules/left-pad': { version: '2.3.4' },
          'node_modules/tape': { version: '5.0.0' },
        },
      },
      pkg: { overrides: { 'left-pad': '^2.3.4' }, devDependencies: { tape: '^5.0.0' } },
    };
    mutate(input);
    return input;
  };
  const floorCases = [
    ['床どおりなら何も出ない', () => {}, 0],
    ['overrides の 1 行が消えたら鳴る (依存整理で黙って消える形)', (i) => { delete i.pkg.overrides['left-pad']; }, 1],
    ['devDependencies の宣言が消えたら鳴る (2 本目の道)', (i) => { delete i.pkg.devDependencies.tape; }, 1],
    ['指定を ^2.3 へ緩めたら鳴る (揃えるつもりの緩み)', (i) => { i.pkg.overrides['left-pad'] = '^2.3'; }, 1],
    ['指定を ^2 へ緩めたら鳴る', (i) => { i.pkg.overrides['left-pad'] = '^2'; }, 1],
    ['~ と >= も下限として読む', (i) => { i.pkg.overrides['left-pad'] = '>=2.3.4'; }, 0],
    ['読めない指定は鳴る', (i) => { i.pkg.overrides['left-pad'] = 'latest'; }, 1],
    ['床ちょうどは通す (境界)', (i) => { i.lock.packages['node_modules/left-pad'].version = '2.3.4'; }, 0],
    ['床より上は通す', (i) => { i.lock.packages['node_modules/left-pad'].version = '2.4.0'; }, 0],
    ['lockfile が床を 1 patch 下回ったら鳴る (境界)', (i) => { i.lock.packages['node_modules/left-pad'].version = '2.3.3'; }, 1],
    ['入れ子の複製だけが古くても鳴る', (i) => { i.lock.packages['node_modules/x/node_modules/tape'] = { version: '4.9.9' }; }, 1],
    ['lockfile に無ければ鳴る', (i) => { delete i.lock.packages['node_modules/tape']; }, 1],
    ['版が読めなければ鳴る', (i) => { i.lock.packages['node_modules/tape'].version = 'latest'; }, 1],
    ['台帳に無い override が鳴る (双方向)', (i) => { i.pkg.overrides.evil = '^1.0.0'; }, 1],
  ];
  const ledgerCases = [
    ['理由が空なら鳴る', { why: '  ' }, 1],
    ['勧告 ID が無ければ鳴る', { advisories: [] }, 1],
    ['checkedOn が無ければ鳴る', { checkedOn: undefined }, 1],
    ['checkedOn が日付の形でなければ鳴る', { checkedOn: '2026-09' }, 1],
    ['atLeast が版として読めなければ鳴る', { atLeast: 'latest' }, 1],
  ];

  let bad = 0;
  console.log('self-test:');
  for (const [label, input, want] of cases) {
    const n = evaluate(input).length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${want})`);
  }
  for (const [label, mutate, want] of floorCases) {
    const n = checkSecurityFloors(floorInput(mutate), tinyFloor).length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 床: ${label}: ${n} 件 (期待 ${want})`);
  }
  for (const [label, patch, want] of ledgerCases) {
    const n = checkSecurityFloors(floorInput(), [{ ...tinyFloor[0], ...patch }]).length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 床の台帳: ${label}: ${n} 件 (期待 ${want})`);
  }
  // 床の古びの対照。境界の両側を見る (「180 日ちょうど」で鳴ること)。
  const staleCases = [
    ['据えた日は鳴らない', '2026-09-10', '2026-09-10', 0],
    ['179 日は鳴らない (境界の手前)', '2026-01-01', '2026-06-29', 0],
    ['180 日ちょうどで鳴る (境界)', '2026-01-01', '2026-06-30', 1],
    ['1 年放置は鳴る', '2025-09-10', '2026-09-10', 1],
    ['日付が読めない行は staleFloors では拾わない (形は上の規則が落とす)', 'いつか', '2026-09-10', 0],
  ];
  for (const [label, checkedOn, todayStr, want] of staleCases) {
    const n = staleFloors([{ package: 'x', checkedOn }], new Date(`${todayStr}T00:00:00Z`)).length;
    const ok = n === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 床の古び: ${label}: ${n} 件 (期待 ${want})`);
  }
  // 合成だけで緑になる形を避ける —— **実物の package.json / lockfile に当てる**。
  {
    const realPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const realLock = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package-lock.json'), 'utf8'));
    const live = checkSecurityFloors({ lock: realLock, pkg: realPkg });
    const ok = live.length === 0 && SECURITY_FLOORS.length > 0;
    if (!ok) bad += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} 床 ${SECURITY_FLOORS.length} 件が実物の package.json / lockfile を満たす` +
        (live.length === 0 ? '' : `: ${live.join(' / ')}`),
    );
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
    `Checked ${total} locked package(s): 本番依存 ${prod} 件 / インストール時コード ${scripted} 件 / ` +
      `セキュリティの床 ${SECURITY_FLOORS.length} 件 (いずれも台帳) / 取得元と integrity`,
  );
  for (const f of staleFloors()) {
    console.warn(
      `::warning::セキュリティの床 ${f.package} を勧告データベースと突き合わせたのは ${f.checkedOn} ` +
        `(${f.days} 日前) です。床は据えた日の勧告に対してしか正しくありません — ` +
        '`npm run audit:floors` で測り直してください',
    );
  }
  if (problems.length === 0) {
    console.log('✅ 依存の供給網は台帳どおりです');
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p}`);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = {
  evaluate,
  PROD_ALLOW,
  INSTALL_SCRIPT_ALLOW,
  SECURITY_FLOORS,
  checkSecurityFloors,
  staleFloors,
  parseVersion,
  cmpVersion,
  rangeFloor,
};
