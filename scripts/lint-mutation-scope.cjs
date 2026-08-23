#!/usr/bin/env node
/**
 * lint:mutation-scope — 変異検査が「測っていない範囲」を台帳で固定する。
 *
 * ## 見つけた事故 (2026-08-18)
 *
 * `src/renderer/data/store.ts` は先頭で 13 種の mutator を **ファイル全体**に
 * 対して `Stryker disable` していた (末尾に restore はあるが実装全体が挟まれて
 * いた)。変異検査は **3 変異体・100%** と報告し、ゲートは緑を返し続けた。
 * 無効化を外して実測すると **256 変異体・71.09%・生存 44 / 未到達 30**。
 * 業務データの永続化層はほぼ測られておらず、実際に**接続リークが 11 箇所**
 * 潜んでいた (書き込みが失敗すると `db.close()` に到達しない)。
 *
 * **「測っていない」は「緑」ではない。** 100% という数字は、分母が小さければ
 * 何も言っていないのと同じになる。
 *
 * ## なぜ pragma を禁止しないのか
 *
 * 到達しない防御コードや、定義と参照が同時に置換される定数は、本当に
 * 観測できない等価変異を生む。問題は pragma そのものではなく**範囲**なので、
 * 範囲で線を引く:
 *
 *   - `Stryker disable next-line <Mutator>: <理由>` … 常に可 (1 行・理由を並記)
 *   - 範囲指定で restore までが MAX_SPAN 行以内 … 可
 *   - restore が無い / MAX_SPAN 行を超える … 台帳にある分だけ可
 *
 * ## 台帳は双方向
 *
 * 既存の広い無効化は 36 ファイル・46 箇所・5,189 行あり、一度には直せない。
 * そこで実測値を台帳に置き、**増えたら落ちる**ようにした。同時に**減っても
 * 落ちる** — 直したのに台帳が古いままだと、次に読む人が「まだ 5,189 行ある」
 * と誤解して同じ場所を調べ直す (このリポジトリで繰り返している形)。
 *
 * 台帳に載っているのは「許した」ではなく「まだ測っていないと分かっている」。
 * 内訳は docs/REMAINING_WORK.md に、なぜ危険かとあわせて書いてある。
 *
 * ## 見つけた事故 その 2 — 台帳をすり抜ける方法があった (2026-08-18)
 *
 * 上の検査は `stryker.config.json` の `mutate` に**載っている**ファイルしか
 * 見ない。裏を返すと、**載せなければ何も言われない**。
 *
 * `src/main/clients/exportPaths.ts` がそれだった。ここは 2026-07 監査で
 * 4 か所に散っていた書き出し先の検査を 1 つにまとめた関数で、
 * `business` / `stocks` / `templates` / `teamradar` の書き出しは全部ここを
 * 通る。レンダラーが乗っ取られたときに「どこへ書けるか」を決める最後の壁。
 * その中身には `Stryker disable ConditionalExpression,...` が掛かっていた
 * のに、ファイル自体が `mutate` に無いので**変異体が 1 つも作られず**、
 * この検査も無反応だった。pragma は飾りで、実測値はゼロ。
 *
 * そこで `MUST_MEASURE` を足した。**「探して無かったことも記録する」**の
 * 逆方向 — 測ると決めた壁が黙って一覧から外れたら落ちる。
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
/** これを超える行数を一度に無効化したら、それは「説明」ではなく「目隠し」。 */
const MAX_SPAN = 30;

/**
 * 既知の広い無効化 (2026-08-18 実測)。**減らすのが目的の台帳**。
 * ファイルを直したらこの行も直すこと (一致しないと落ちる)。
 * 0 になったらエントリごと消す。
 */
const KNOWN_BROAD = {
  'src/main/clients/templates.ts':               { regions: 1, lines:  139 },
};

/**
 * **必ず変異検査に載せるファイル。**
 *
 * 権限・資格情報・書き出し先を決める壁。ここが `mutate` から外れると、
 * 中の pragma も含めて何も測られていない状態が「緑」に見える。
 * 外すときは、なぜもう壁ではないのかを添えてこの表から消すこと。
 */
const MUST_MEASURE = {
  'src/main/clients/exportPaths.ts': '書き出し先の唯一の関門 (4 サービスが通る)',
  'src/renderer/network/proxy.ts':   'BYO プロキシの送り先判定 (SSRF の関門)',
  'src/shared/ollama.ts':            'Ollama の接続先判定 (任意ホストへの http を許すと内部探索の踏み台になる)',
  'src/renderer/security/vault.ts':  'マスターパスワードから鍵を作る所',
  'src/renderer/security/autoLock.ts': '離席時の施錠',
  'src/renderer/oauth/pkce.ts':      'ブラウザ版 PKCE',
  // 2026-08-23 追加。PKCE の一時秘密 (`code_verifier`) を置く・読む・**消す**
  // 唯一の場所。掃除が効かなくなると、`state` 不一致 (CSRF の疑い) で
  // 失敗したときに秘密が sessionStorage へ残る。
  'src/renderer/oauth/pkceSession.ts': 'PKCE の一時秘密の置き場と消し方',
  // 同日追加。どちらも既に `mutate` には在ったが「必ず測る壁」の名簿には
  // 無く、**一覧から外しても誰も鳴らない**状態だった。
  'src/shared/externalUrlGate.ts':     'OS に URL を開かせてよいかの唯一の関門',
  'src/shared/httpLimits.ts':        '打ち切りと応答サイズの上限 (全通信が通る)',
  'src/main/oauth.ts':               '認可の送り先と PKCE',
  'src/shared/redact.ts':            'ログに載せる前の伏字',
  'src/shared/escape.ts':            'マークアップへ差し込む前のエスケープ',
  'src/renderer/fs/fsa.ts':          '「次にどこへ書くか」の記憶',
  // 2026-08-20 追加。前回 (2026-08-18) は「そのとき見つけた 9 つ」を並べただけで、
  // **同じ性質のモジュールが他に無いかを調べていなかった**。`mutate` 全 226 件の
  // 冒頭 30 行を「関門 / fail-closed / SSRF / 送り先 / 踏み台 / 絞る」で走査し、
  // **自分の説明文で門だと名乗っているもの**を全部拾った。7 件出た。
  // 6 件は既に `mutate` に在籍していた (= 測られていたが、外されても誰も気付かない
  // 状態だった)。webauthn.ts だけは `mutate` にも無く、実測 68 変異体 61.76% だった。
  'src/shared/proxyEndpoint.ts':     'BYO プロキシの送り先 URL の検証 (資格情報のほぼ全部が通る 1 本の口)',
  'src/shared/aiEndpoint.ts':        'AI プロバイダのベース URL の検証 (x-api-key / Bearer を載せる先)',
  'src/shared/atlassianSite.ts':     'Atlassian の site URL の検証 (SSRF の関門)',
  'src/shared/tokenInput.ts':        '資格情報の保存要求の検証 (main と renderer で同じ規則)',
  'src/shared/scanTarget.ts':        'VirusTotal へ投入する URL の検証 (取り消せない外部公開)',
  'src/renderer/network/liveRead.ts': 'ブラウザ版の読み取り経路 (資格情報を第三者のプロキシへ渡す)',
  'src/renderer/security/webauthn.ts': '生体認証ゲート (fail-closed。誤配線を throw で止める約束の置き場)',
  'src/shared/vaultToken.ts':        '保存値から Bearer を取り出す唯一の場所 (壊れた TokenSet を送らない)',
  // 2026-08-20 追加。変異検査 CI が赤だった件で見つけた — 整合性チェーンの保護
  // 対象なのに壁の一覧に無く、`assertKdfIterations` の「数値かどうか」を確かめる
  // 検査が 1 つも無いまま生存していた。反復回数は IndexedDB から来る。
  'src/renderer/security/dataCrypto.ts': 'レコード暗号化と KDF 反復回数の門 (保存領域から来た値を信用しない)',
  // 2026-08-22 追加。どちらも「同じ危険度の双子の片方だけが測られていない」形
  // だった。exportPaths.ts (書き出し側) は載っていたのに、開く側は main.ts の
  // 非公開関数でテストすら無し。secrets.ts は保護対象なのに `mutate` から漏れ、
  // 実測 42.27% (未到達 78) — 保存時に本当に暗号化されるかを誰も見ていなかった。
  'src/main/shellOpenGate.ts':       '「OS で開く」の唯一の関門 (Windows では拡張子の関連付け次第でそのまま実行される)',
  'src/main/secrets.ts':             '資格情報の暗号化と保存 (キーチェーンが使えるかの判定がここ 1 か所)',
  // preload は「レンダラーが main へ触れる面」そのもの。チャンネル名を呼び出し側に
  // 選ばせる形に一度でも変わると、contextIsolation を掛けている意味が消える。
  // main.ts と違って測れるのは、チャンネル名が**アロー関数の中**にあるため
  // (main.ts は `ipcMain.handle('名前', fn)` と**モジュール直下で呼ぶ**ので static)。
  'src/preload/preload.ts':          'レンダラーが main へ触れる唯一の面 (13 個の口だけを通す)',
  // 2026-08-22 追加。IPC ハンドラ 13 個・窓の隔離設定・遷移の番人がここに集まる。
  // 「モジュール直下の副作用ばかりで測れない」と一度は書いたが誤りで、
  // 毎テスト読み直せば普通に 100% まで測れた (pragma 0 個)。
  'src/main/main.ts':                'IPC の口と窓の隔離設定 (contextIsolation / 遷移の番人)',
};

const DISABLE_RE = /^\s*(?:\/\/|\/\*)\s*Stryker\s+disable\s+(?!next-line)(\S+)/;
const RESTORE_RE = /^\s*(?:\/\/|\/\*)\s*Stryker\s+restore\s+(\S+)/;

function mutateList() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/** ソース文字列から範囲指定 disable を数える。span は disable 行から restore 行まで。 */
function scanSource(text) {
  const lines = text.split('\n');
  const open = [];
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    const d = DISABLE_RE.exec(lines[i]);
    if (d) { open.push({ start: i + 1, mutators: d[1] }); continue; }
    if (RESTORE_RE.test(lines[i]) && open.length > 0) {
      const o = open.pop();
      regions.push({ start: o.start, end: i + 1, span: i + 1 - o.start, mutators: o.mutators, closed: true });
    }
  }
  // 閉じていない disable は EOF まで効く。
  for (const o of open) {
    regions.push({ start: o.start, end: lines.length, span: lines.length - o.start, mutators: o.mutators, closed: false });
  }
  return { regions, total: lines.length };
}

/** 広いと見なす範囲だけを返す (restore 無し、または MAX_SPAN 超え)。 */
function broadRegionsOf(text) {
  return scanSource(text).regions.filter((r) => !r.closed || r.span > MAX_SPAN);
}

function scanFile(rel) {
  const full = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return scanSource(fs.readFileSync(full, 'utf8'));
}

/**
 * `MUST_MEASURE` の壁のうち、変異検査の対象一覧から外れているものを返す。
 * `files` を引数にしてあるのは、自己検査で偽の一覧を渡せるようにするため。
 */
function missingWalls(files, walls = MUST_MEASURE, checkExists = true) {
  const out = [];
  for (const [rel, why] of Object.entries(walls)) {
    if (!files.includes(rel)) {
      out.push(
        `${rel}: ${why}。stryker.config.json の mutate に載っていません` +
        ` — 載せないと変異体が 1 つも作られず、中の pragma ごと「測っていない」が見えなくなります`,
      );
    } else if (checkExists && !fs.existsSync(path.join(REPO_ROOT, rel))) {
      out.push(`${rel}: ${why}。MUST_MEASURE にありますがファイルがありません`);
    }
  }
  return out;
}

/**
 * 自己検査 — 「常に緑を返すゲートは無いより悪い」。
 * 検出器そのものが壊れていないかを、毎回の実行で確かめる。
 */
function selfTest() {
  const body = (n) => Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join('\n');
  const cases = [
    ['pragma 無し', body(50), 0],
    ['next-line だけ', '// Stryker disable next-line StringLiteral: 理由\n' + body(50), 0],
    ['狭い範囲 (10 行) は許す', '// Stryker disable all\n' + body(9) + '\n// Stryker restore all\n' + body(20), 0],
    ['上限ちょうど (30 行) は許す', '// Stryker disable all\n' + body(29) + '\n// Stryker restore all', 0],
    ['上限 +1 (31 行) は広い', '// Stryker disable all\n' + body(30) + '\n// Stryker restore all', 1],
    ['restore が無ければ EOF まで広い', '// Stryker disable all\n' + body(50), 1],
    ['ブロックコメント形式も見る', '/* Stryker disable all */\n' + body(50), 1],
    ['restore があっても離れていれば広い', '// Stryker disable StringLiteral\n' + body(100) + '\n// Stryker restore StringLiteral', 1],
    ['広い範囲が 2 つなら 2 件', '// Stryker disable all\n' + body(40) + '\n// Stryker restore all\n// Stryker disable all\n' + body(40) + '\n// Stryker restore all', 2],
  ];
  let failed = 0;
  console.log('self-test:');
  for (const [label, text, want] of cases) {
    const got = broadRegionsOf(text).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  // MUST_MEASURE 側 — 「載せなければ無反応」を塞げているか
  const walls = { 'a/guard.ts': '壁 A', 'b/guard.ts': '壁 B' };
  const wallCases = [
    ['壁が両方載っていれば 0 件', ['a/guard.ts', 'b/guard.ts', 'c/other.ts'], 0],
    ['壁が 1 つ外れたら 1 件', ['a/guard.ts'], 1],
    ['一覧が空なら全部 (2 件)', [], 2],
  ];
  for (const [label, files, want] of wallCases) {
    const got = missingWalls(files, walls, false).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 検出器が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const files = mutateList();
  const failures = [];
  const seen = new Set();
  let scanned = 0;
  let broadRegions = 0;
  let broadLines = 0;

  for (const rel of files) {
    const res = scanFile(rel);
    if (!res) {
      failures.push(`${rel}: stryker.config.json の mutate に載っているがファイルが存在しません`);
      continue;
    }
    scanned++;
    const broad = res.regions.filter((r) => !r.closed || r.span > MAX_SPAN);
    const actual = { regions: broad.length, lines: broad.reduce((s, r) => s + r.span, 0) };
    broadRegions += actual.regions;
    broadLines += actual.lines;

    const known = KNOWN_BROAD[rel];
    if (actual.regions === 0) {
      if (known) {
        failures.push(
          `${rel}: 広い無効化は無くなっていますが台帳に残っています (台帳 ${known.regions} 箇所 / ${known.lines} 行)。` +
          ` KNOWN_BROAD からこの行を削除してください — 直った場所を「未着手」に見せると、次の人が調べ直します`,
        );
      }
      continue;
    }
    seen.add(rel);
    if (!known) {
      failures.push(
        `${rel}: 広い Stryker disable が新規に増えました (${actual.regions} 箇所 / ${actual.lines} 行)。` +
        ` 1 行ごとの \`Stryker disable next-line <Mutator>: <理由>\` に置き換えてください` +
        ` — 広い範囲を黙らせると「測っていない」が「100%」として報告されます` +
        `\n      内訳: ` + broad.map((r) => `L${r.start}-L${r.end} (${r.span}行) ${r.mutators}`).join(' / '),
      );
      continue;
    }
    if (actual.regions > known.regions || actual.lines > known.lines) {
      failures.push(
        `${rel}: 測っていない範囲が広がりました — 台帳 ${known.regions} 箇所 / ${known.lines} 行 → 実際 ${actual.regions} 箇所 / ${actual.lines} 行`,
      );
    } else if (actual.regions < known.regions || actual.lines < known.lines) {
      failures.push(
        `${rel}: 測っていない範囲が狭まりました (台帳 ${known.regions} 箇所 / ${known.lines} 行 → 実際 ${actual.regions} 箇所 / ${actual.lines} 行)。` +
        ` KNOWN_BROAD をこの実測値に更新してください`,
      );
    }
  }

  for (const rel of Object.keys(KNOWN_BROAD)) {
    if (!files.includes(rel)) {
      failures.push(`${rel}: 台帳にありますが stryker.config.json の mutate に載っていません (行を削除してください)`);
    }
  }

  // 測ると決めた壁が黙って一覧から外れていないか (載せなければ無反応、を塞ぐ)
  failures.push(...missingWalls(files));

  console.log(`Scanned ${scanned} mutate-listed file(s); span limit ${MAX_SPAN} lines`);
  console.log(`必ず測る壁: ${Object.keys(MUST_MEASURE).length} ファイル (全て mutate に在籍)`);
  console.log(`広い無効化: ${seen.size} ファイル / ${broadRegions} 箇所 / ${broadLines} 行 (台帳: ${Object.keys(KNOWN_BROAD).length} ファイル)`);

  if (failures.length === 0) {
    console.log('✅ 測っていない範囲は台帳どおり (増えても減ってもいません)');
    return 0;
  }
  console.error(`❌ ${failures.length} 件:`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

module.exports = { scanSource, broadRegionsOf, missingWalls, MAX_SPAN, MUST_MEASURE };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
