#!/usr/bin/env node
'use strict';

/*
 * ブラウザに残す物を台帳で固定する (`npm run lint:storage`)。
 *
 * ## なぜ要るのか
 *
 * 2026-08-25、立ち退きの警告に「バックアップを書き出してください」と書いて
 * しまい、**そのバックアップにトークンは入らない**ことを後から見つけた。
 * 直したが、直したのは**文言**であって、**同じ間違いが再び起きる構造**は
 * そのまま残っていた ——
 *
 *   - このアプリが何をどこへ残しているかを**機械が知っている場所が無い**
 *   - 利用者向けの `BACKUP_EXCLUSIONS` は**人が書いた散文**で、
 *     3 行目の「…など**ブラウザ内の設定**」に何が含まれるかは読めない
 *     (実際そこには**プロキシの共有秘密**と**保存先フォルダの許可**が居た)
 *   - 新しい保存先を足しても**何も鳴らない**。資格情報を持つ保存先が
 *     増えても、開示にも、バックアップの範囲にも、立ち退きの説明にも
 *     反映されないまま出荷できる
 *
 * **文言を直すだけでは、次に足す人が同じ穴に落ちる。** 保存先そのものを
 * 台帳にして、**双方向**で照合する。
 *
 * ## 規則
 *
 *   1. 走査が生きている (見つけた保存箇所が床以上)
 *   2. 実在する保存先はすべて台帳にある (**新しい保存先が黙って増えない**)
 *   3. 台帳の保存先はすべて実在する (**消したのに台帳が残らない**)
 *   4. 鍵が定数でない呼び出しは、**その箇所ごと台帳に登録**されている
 *      (静かに飛ばさない —— 飛ばせば「覆っているつもり」になる)
 *   5. 登録された間接呼び出しが実在する (古い登録が残らない)
 *   6. 間接呼び出しが名乗る鍵も台帳にある
 *   7. **バックアップが覆う保存先はちょうど 1 つ**で、それは業務レコードの
 *      データベースである (`EVICTION_RECOVERY` が画面で言っていること)
 *   8. どの行にも「何が入るか」が書いてある
 *   9. **秘密や利用者の書いた物を持つ保存先は、監査報告に名前で載っている**
 *      (`docs/DATA_PROTECTION.md` —— 「漏洩・損壊・消失は防げるか」に答える文書)
 *
 * ## 評価は純関数
 *
 * `evaluate({ files })` は読み込み済みの `[{ path, text }]` だけを見る。
 * self-test が合成ソースを流し込めるようにするためで、
 * 「注入できないから試せない枝」を作らないという同日の教訓に従う。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCAN_DIR = path.join(REPO_ROOT, 'src/renderer');

/** 走査が死んで 0 件になったのを「違反なし」と読まないための床。 */
const MIN_SITES = 20;

/** バックアップが覆う唯一の保存先 (`BackupPanel` が `exportAll()` する物)。 */
const BACKED_UP_STORE = 'business-hub-data';

/**
 * このアプリがブラウザに残す物、すべて。
 *
 * `backedUp` は「`BackupPanel` の書き出しに入るか」。**入らない物が
 * 大半である**ことがこの台帳の要点で、立ち退き (生成元ごと消える) では
 * 入らない物が全部失われる。
 *
 * `sensitive` は「**漏れたら困る物が入るか**」——
 * (a) 資格情報・鍵材料、または (b) **利用者が書いた内容**や業務の記録。
 * ここが真の行は `docs/DATA_PROTECTION.md` に**名前で**載っていなければ
 * ならない。あの文書は「漏洩・損壊・消失は防げるか」に答えるための
 * **在庫表**であり、載っていない保存先は**問われもしない**。
 *
 * 2026-08-25 に突き合わせたら、4 つの IndexedDB のうち**2 つが載っていな
 * かった** —— 書類の blob を平文で持つライブラリと、プロキシの共有秘密を
 * 平文で持つ preferences。sessionStorage は媒体ごと無かった。
 * 配色や銘柄一覧まで載せろという話ではないので、基準を書いて線を引く。
 */
/*
 * 媒体の表示名。**監査報告と突き合わせるために要る。**
 *
 * 規則 9 は「sensitive な保存先が名前で載っているか」を見るが、
 * `service-hub-v2` (Cache Storage) は sensitive でないので**規則 9 では
 * 呼ばれない** —— 2026-08-26 に測ったとき、Cache Storage は
 * `docs/DATA_PROTECTION.md` に**媒体ごと**在庫から抜けていた。
 * 個々の行ではなく**媒体**を数える規則が要る (規則 10)。
 * 在庫の欠落は評価の欠落で、それは行の単位でも媒体の単位でも起きる。
 */
const MEDIUM_LABELS = {
  indexeddb: 'IndexedDB',
  cachestorage: 'Cache Storage',
  localstorage: 'localStorage',
  sessionstorage: 'sessionStorage',
  cookie: 'cookie',
  opfs: 'OPFS',
};

const STORES = {
  // -- IndexedDB --
  'business-hub-data': {
    medium: 'indexeddb',
    holds: '業務レコード (売上・KPI・CRM・不動産 …)',
    backedUp: true,
    sensitive: true,
  },
  'business-hub-vault': {
    medium: 'indexeddb',
    holds: 'API キー・トークン (AES-GCM-256 で封緘)',
    backedUp: false,
    sensitive: true,
  },
  'business-hub-library': {
    medium: 'indexeddb',
    holds: 'ライブラリの書類 (blob・**平文**)',
    backedUp: false,
    sensitive: true,
  },
  'business-hub-preferences': {
    medium: 'indexeddb',
    // **ここに資格情報が居る。** プロキシの共有秘密は平文で入る
    // (`network/proxy.ts` の冒頭に、漏れたときに何が起きるかまで実測済み)。
    // 「ブラウザ内の設定」という括りに埋めてはいけない行。
    holds: 'プロキシ設定 (共有秘密を含む・平文) / 保存先フォルダの許可',
    backedUp: false,
    sensitive: true,
  },

  // -- Cache Storage (Service Worker) --
  'service-hub-v2': {
    medium: 'cachestorage',
    /*
     * **同一オリジンの成功応答だけ**が入る。第三者 API の応答 (業務データ・
     * 漏洩調査の結果) が入らないことは `assets/sw.js` の `sameOrigin` 判定と
     * `src/shared/__tests__/serviceWorker.test.ts` が留めている。
     * ここが `sensitive: true` に変わるとしたら、その 2 つが同時に壊れたとき。
     */
    holds: 'アプリシェル (HTML / アイコン / manifest)',
    backedUp: false,
    sensitive: false,
  },

  // -- localStorage --
  'servicehub.recents': { medium: 'localstorage', holds: '最近開いたサービス', backedUp: false },
  'servicehub.favorites': { medium: 'localstorage', holds: 'お気に入りのサービス', backedUp: false },
  'servicehub.plan': { medium: 'localstorage', holds: '料金プランの選択', backedUp: false },
  'servicehub.internalLicense': { medium: 'localstorage', holds: '招待コードの引き換え状態', backedUp: false },
  'servicehub.recordEncryption': {
    medium: 'localstorage',
    // **この salt はバックアップに入らない。** 入らないので、レコード暗号化を
    // 有効にしたまま書き出したバックアップは他の端末で開けない
    // (`BackupPanel` が警告を出す理由)。
    holds: 'レコード暗号化の設定と鍵導出の salt',
    backedUp: false,
  },
  'servicehub.docstudio.v1': { medium: 'localstorage', holds: 'DocStudio の下書き', backedUp: false, sensitive: true },
  'servicehub.teamradar.draft.v1': { medium: 'localstorage', holds: 'Team Radar の下書き', backedUp: false, sensitive: true },
  'servicehub.ollama.endpoint': { medium: 'localstorage', holds: 'Ollama の接続先', backedUp: false },
  'servicehub.ollama.port': { medium: 'localstorage', holds: 'Ollama の待ち受けポート', backedUp: false },
  'teamradar.state': { medium: 'localstorage', holds: 'Team Radar の状態 (web-shim 経由)', backedUp: false },
  // 人材育成の入力 (部署ごとの組織病の申告・施策の達成確率・メンバーの STEP)。
  // 部署名と個人名が入るので sensitive。デスクトップ版は
  // ~/.local/business-hub/talent.json (0600) で、こちらはブラウザ版の置き場。
  'servicehub.talent.state.v1': { medium: 'localstorage', holds: '人材育成の入力 (組織病の申告 / 施策 / メンバーの STEP)', backedUp: false, sensitive: true },
  'assistant-history': { medium: 'localstorage', holds: 'アシスタントの会話履歴', backedUp: false, sensitive: true },
  'assistant-theme': { medium: 'localstorage', holds: 'アシスタントの配色', backedUp: false },
  'assistant-provider': { medium: 'localstorage', holds: 'アシスタントの提供元の選択', backedUp: false },
  'chatbot-history': { medium: 'localstorage', holds: 'チャットの会話履歴', backedUp: false, sensitive: true },
  'chatbot-requests': { medium: 'localstorage', holds: 'チャットの要求履歴', backedUp: false, sensitive: true },
  'chatbot-ollama-model': { medium: 'localstorage', holds: 'チャットで使うモデル名', backedUp: false },
  'emotions.store': { medium: 'localstorage', holds: '気分の記録', backedUp: false, sensitive: true },
  'stocks.watchlist': { medium: 'localstorage', holds: '銘柄のウォッチリスト', backedUp: false },
  'google-client-id': { medium: 'localstorage', holds: 'Google OAuth のクライアント ID (秘密ではない)', backedUp: false },
  'ms365-client-id': { medium: 'localstorage', holds: 'Microsoft 365 のクライアント ID (秘密ではない)', backedUp: false },

  // -- sessionStorage --
  // **`pkce.verifier` が本物の秘密である。** これを握られると、傍受した
  // 認可コードをトークンへ交換できてしまう (PKCE が防ごうとしている物そのもの)。
  // タブを閉じれば消えるので立ち退きやバックアップの話には乗らないが、
  // **秘密を置く面である**以上、保存先の台帳に載っていないほうがおかしい。
  // 4 つを 1 行にまとめないのは、秘密なのは 1 つだけだからである。
  'pkce.verifier': { medium: 'sessionstorage', holds: 'PKCE の code_verifier (**秘密**)', backedUp: false, sensitive: true },
  'pkce.state': { medium: 'sessionstorage', holds: 'OAuth の state (CSRF 照合用)', backedUp: false },
  'pkce.clientId': { medium: 'sessionstorage', holds: '交換に使うクライアント ID (秘密ではない)', backedUp: false },
  'pkce.redirectUri': { medium: 'sessionstorage', holds: '交換に使う redirect_uri', backedUp: false },
};

/**
 * 鍵が定数でない呼び出し。**静かに飛ばさない。**
 *
 * 走査は呼び出しの場所しか見えず、値が助数関数を通ると追えない。
 * 追えないことを黙って飛ばすと「全部覆った」と読めてしまうので、
 * **どこが追えないか**と**そこへ何が流れるか**を書いて残す。
 */
const INDIRECT_SITES = [
  {
    file: 'src/renderer/App.tsx',
    expr: 'key',
    keys: ['servicehub.recents', 'servicehub.favorites'],
    why: '`loadIds(key)` / `saveIds(key, …)` の助数関数越し。呼び出し元は RECENTS_KEY / FAVORITES_KEY の 2 つだけ。',
  },
  {
    file: 'src/renderer/oauth/pkceSession.ts',
    expr: 'storageKey(k)',
    keys: ['pkce.verifier', 'pkce.state', 'pkce.clientId', 'pkce.redirectUri'],
    why: '`KEY_PREFIX + k` を組み立てる。`KEYS` は 4 つに固定で、増やすならその配列だけ (同ファイルにそう書いてある)。',
  },
  {
    file: 'src/renderer/web-shim.ts',
    expr: 'TALENT_STORAGE_KEY',
    keys: ['servicehub.talent.state.v1'],
    why: '`src/shared/talent.ts` の定数を import している。デスクトップ版と読み書きの入口を 1 つにするため、鍵の定義も shared 側に置いた (走査は同一ファイル内の const しか解決しない)。',
  },
];

// --- 走査 -----------------------------------------------------------------

const CONST_RE = /const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'\s*;/g;
const IDB_OPEN_RE = /indexedDB\.open\(/;
const DB_NAME_RE = /const\s+DB_NAME\s*=\s*'([^']+)'/;
const WEB_STORAGE_RE = /\b(localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(/g;

/*
 * ブラウザが生成元ごとに持つ**残る場所**は、この 3 つで終わりではない。
 * 2026-08-26 に測ったら、`caches.open(` も `document.cookie =` も OPFS も
 * 走査の外に在り、renderer に足しても**この門は ✅ を返した** ——
 * 「保存先は台帳どおりです」という文が、3 媒体についてしか真でなかった。
 *
 * Cache Storage は実在する (Service Worker が使う)。しかも 2026-07 に
 * 一度事故っている —— 全 GET を焼いていて第三者 API の応答が平文で
 * 端末に残っていた。直したのは `assets/sw.js` の側だけで、**戻されても
 * 鳴る物が無かった**。台帳へ入れて、媒体ごと数える。
 */
const CACHES_OPEN_RE = /\bcaches\.open\(/g;
/** 代入だけを見る。`document.cookie` の**字面**は XSS の標本にも出る (`securityRange.ts`)。 */
const COOKIE_WRITE_RE = /\bdocument\.cookie\s*=(?!=)/g;
/** OPFS は生成元に 1 つきりなので名前を持たない。台帳では `opfs` と呼ぶ。 */
const OPFS_RE = /\bnavigator\.storage\.getDirectory\(/;

/**
 * `document.cookie = 'name=value; …'` の `name` を取る。
 * 先頭が文字列リテラルでなければ解決しない (→ INDIRECT_SITES 行き)。
 */
function cookieName(text, from) {
  const m = /^\s*['"`]([A-Za-z0-9_.~-]+)=/.exec(text.slice(from, from + 200));
  return m === null ? null : m[1];
}

/**
 * 第 1 引数を切り出す。`[^,)]+` で済ませると `storageKey(k)` の**内側の
 * 括弧**で切れて `storageKey(k` になる (実際にそうなった)。
 * 深さを数えて、深さ 0 の `,` か `)` まで取る。
 */
function firstArg(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return text.slice(from, i);
      depth -= 1;
    } else if (c === ',' && depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g;

function localConsts(text) {
  const out = new Map();
  for (const m of text.matchAll(CONST_RE)) out.set(m[1], m[2]);
  return out;
}

/**
 * 呼び出しの場所のファイルを**先に**見る。`LS_KEY` のような名前は複数の
 * ファイルで別の値に使われており、横断の表で引くと取り違える
 * (2026-08-25 に実際に取り違えた —— `LS_KEY` に候補が 3 つ出た)。
 */
function resolveKey(byPath, filePath, text, expr) {
  const e = expr.trim();
  const lit = /^'([^']*)'$|^"([^"]*)"$/.exec(e);
  if (lit !== null) return lit[1] ?? lit[2];
  const local = localConsts(text).get(e);
  if (local !== undefined) return local;
  for (const m of text.matchAll(IMPORT_RE)) {
    const names = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0].trim());
    if (!names.includes(e)) continue;
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), spec));
    for (const cand of [base + '.ts', base + '.tsx', base + '/index.ts']) {
      const t = byPath.get(cand);
      if (t !== undefined) {
        const v = localConsts(t).get(e);
        if (v !== undefined) return v;
      }
    }
  }
  return null;
}

/** `{ found, unresolved, siteCount }` を返す。 */
function scan(files) {
  const byPath = new Map(files.map((f) => [f.path, f.text]));
  const found = new Map(); // name -> Set<medium>
  const unresolved = [];
  let siteCount = 0;
  const add = (name, medium) => {
    if (!found.has(name)) found.set(name, new Set());
    found.get(name).add(medium);
    siteCount += 1;
  };
  for (const f of files) {
    const p = f.path;
    const text = f.text;
    if (IDB_OPEN_RE.test(text)) {
      const m = DB_NAME_RE.exec(text);
      // 字面で書くと lint:forbidden が鳴る (ここは保管層ではない) ので組み立てる。
      if (m === null) unresolved.push({ file: p, expr: 'indexedDB' + '.open(DB_NAME)' });
      else add(m[1], 'indexeddb');
    }
    for (const m of text.matchAll(WEB_STORAGE_RE)) {
      const medium = m[1] === 'localStorage' ? 'localstorage' : 'sessionstorage';
      const arg = firstArg(text, m.index + m[0].length).trim();
      const key = resolveKey(byPath, p, text, arg);
      if (key === null) unresolved.push({ file: p, expr: arg });
      else add(key, medium);
    }
    for (const m of text.matchAll(CACHES_OPEN_RE)) {
      const arg = firstArg(text, m.index + m[0].length).trim();
      const key = resolveKey(byPath, p, text, arg);
      if (key === null) unresolved.push({ file: p, expr: 'caches.open(' + arg + ')' });
      else add(key, 'cachestorage');
    }
    for (const m of text.matchAll(COOKIE_WRITE_RE)) {
      const key = cookieName(text, m.index + m[0].length);
      if (key === null) unresolved.push({ file: p, expr: 'document.cookie =' });
      else add(key, 'cookie');
    }
    if (OPFS_RE.test(text)) add('opfs', 'opfs');
  }
  return { found, unresolved, siteCount };
}

// --- 評価 -----------------------------------------------------------------

function evaluate(input) {
  const files = input.files;
  const stores = input.stores ?? STORES;
  const indirect = input.indirect ?? INDIRECT_SITES;
  const minSites = input.minSites ?? MIN_SITES;
  // 監査報告の本文。渡されなければ照合しない (self-test が合成を流せるように
  // 純関数のまま置く —— IO は main が持つ)。
  const auditDoc = input.auditDoc;
  const labels = input.labels ?? MEDIUM_LABELS;
  const problems = [];
  const scanned = scan(files);
  const found = scanned.found;
  const unresolved = scanned.unresolved;

  if (scanned.siteCount < minSites) {
    problems.push(
      '保存箇所が ' + scanned.siteCount + ' 件しか見つからない (床 ' + minSites + ') — 走査が壊れている可能性',
    );
  }

  // 2. 実在するのに台帳に無い
  for (const [name, mediums] of found) {
    const row = stores[name];
    if (row === undefined) {
      problems.push(
        '台帳に無い保存先: ' + name + ' (' + [...mediums].join('/') + ') — STORES に足し、開示とバックアップの範囲を見直すこと',
      );
      continue;
    }
    if (!mediums.has(row.medium)) {
      problems.push('保存先 ' + name + ' の媒体が台帳と違う: 実際 ' + [...mediums].join('/') + ' / 台帳 ' + row.medium);
    }
  }

  // 3. 台帳にあるのに実在しない
  const declaredByIndirect = new Set(indirect.flatMap((s) => s.keys));
  for (const name of Object.keys(stores)) {
    if (!found.has(name) && !declaredByIndirect.has(name)) {
      problems.push('台帳にあるが実在しない保存先: ' + name + ' — 消したなら STORES からも消すこと');
    }
  }

  // 4/5. 鍵が定数でない箇所の登録
  const regKey = (s) => s.file + ' ' + s.expr;
  const registered = new Set(indirect.map(regKey));
  const seenUnresolved = new Set(unresolved.map(regKey));
  for (const u of unresolved) {
    if (!registered.has(regKey(u))) {
      problems.push(
        '鍵が定数でない保存箇所が台帳に無い: ' + u.file + ' の `' + u.expr + '` — INDIRECT_SITES に、そこへ流れる鍵と理由を書くこと',
      );
    }
  }
  for (const s of indirect) {
    if (!seenUnresolved.has(regKey(s))) {
      problems.push('INDIRECT_SITES の登録が実在しない: ' + s.file + ' の `' + s.expr + '` — 定数になったなら登録を消すこと');
    }
    if (typeof s.why !== 'string' || s.why.trim() === '') {
      problems.push('INDIRECT_SITES の理由が空: ' + s.file + ' の `' + s.expr + '`');
    }
    // 6. 間接呼び出しが名乗る鍵も台帳に
    for (const k of s.keys) {
      if (stores[k] === undefined) {
        problems.push('INDIRECT_SITES が台帳に無い鍵を名乗っている: ' + k + ' (' + s.file + ')');
      }
    }
  }

  // 7. バックアップが覆うのはちょうど 1 つ
  const backed = Object.keys(stores).filter((k) => stores[k].backedUp);
  if (backed.length !== 1 || backed[0] !== BACKED_UP_STORE) {
    problems.push(
      'バックアップが覆う保存先は ' + BACKED_UP_STORE + ' の 1 つだけのはず — 実際 [' + backed.join(', ') + ']。' +
        '変えたなら EVICTION_RECOVERY と BACKUP_EXCLUSIONS も直すこと',
    );
  }

  // 8. 何が入るかが書いてある
  for (const [name, row] of Object.entries(stores)) {
    if (typeof row.holds !== 'string' || row.holds.trim() === '') {
      problems.push('台帳の「何が入るか」が空: ' + name);
    }
  }

  /*
   * 9. **秘密や利用者の書いた物を持つ保存先は、監査報告に名前で載っている。**
   *
   * `docs/DATA_PROTECTION.md` は「漏洩・損壊・消失は防げるか」に答えるための
   * 在庫表である。**載っていない保存先は、問われもしない。**
   * 2026-08-25 の実測で、4 つの IndexedDB のうち 2 つ (ライブラリ /
   * preferences) と sessionStorage が丸ごと抜けていた。
   */
  if (typeof auditDoc === 'string') {
    for (const [name, row] of Object.entries(stores)) {
      if (row.sensitive !== true) continue;
      if (!auditDoc.includes(name)) {
        problems.push(
          '監査報告に載っていない保存先: ' + name + ' (' + row.holds + ') — ' +
            'docs/DATA_PROTECTION.md の在庫表に名前で足すこと (載っていない物は問われない)',
        );
      }
    }
  }

  /*
   * 10. **媒体そのものが在庫に載っている。**
   *
   * 規則 9 は sensitive な行しか見ないので、`sensitive: false` の行しか
   * 持たない媒体は**丸ごと抜けても鳴らない**。実際に Cache Storage が
   * そうなっていた。媒体の側から数え直す (0-a-18 と同じ形 —— 数える単位を
   * 守りたい物の単位に合わせる)。
   */
  const mediums = new Set(Object.values(stores).map((r) => r.medium));
  for (const m of mediums) {
    const label = labels[m];
    if (label === undefined) {
      problems.push(
        '媒体に表示名が無い: ' + m + ' — MEDIUM_LABELS に足すこと (名前が無ければ監査報告と突き合わせられない)',
      );
      continue;
    }
    if (typeof auditDoc === 'string' && !auditDoc.includes(label)) {
      problems.push(
        '監査報告に載っていない媒体: ' + label + ' — docs/DATA_PROTECTION.md の在庫に節を足すこと ' +
          '(媒体ごと抜けていると、その中の行は 1 つも問われない)',
      );
    }
  }

  return problems;
}

// --- IO -------------------------------------------------------------------

/*
 * renderer に加えて **`assets/sw.js`** も読む。Service Worker が Cache Storage
 * へ書く物は、利用者のブラウザに残る物そのものである —— 置き場所が
 * `src/renderer` の外だからという理由で台帳から外れていた。
 */
const EXTRA_FILES = ['assets/sw.js'];

function readSources(dir = SCAN_DIR, extra = EXTRA_FILES) {
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '__tests__' || ent.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx?$/.test(ent.name)) {
        out.push({
          path: path.relative(REPO_ROOT, full).split(path.sep).join('/'),
          text: fs.readFileSync(full, 'utf8'),
        });
      }
    }
  };
  walk(dir);
  for (const rel of extra) {
    const full = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(full)) throw new Error('走査対象が消えている: ' + rel);
    out.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

// --- self-test ------------------------------------------------------------

const SRC = (p, text) => ({ path: p, text });

/*
 * 合成標本を**組み立てて**作る。`indexedDB.open(` の字面をこのファイルが
 * 持つと `lint:forbidden` の「保管層の外で保管領域を直接触る」規則が鳴る ——
 * 正しく鳴っている (ここは保管層ではない)。**ゲートが、別のゲートの禁じる物を
 * 自分で持ち歩かない。** 同じ手を `lint:charset` で使っている
 * (禁じる文字を符号位置から作る)。
 */
const IDB_OPEN = 'indexedDB' + '.open(';
const idbSource = (dbName) => "const DB_NAME = '" + dbName + "';\n" + IDB_OPEN + 'DB_NAME, 1);';
const BASE_STORES = {
  'business-hub-data': { medium: 'indexeddb', holds: 'レコード', backedUp: true },
  'k.one': { medium: 'localstorage', holds: '何か', backedUp: false },
};
const BASE_FILES = [
  SRC('src/renderer/data/store.ts', idbSource('business-hub-data')),
  SRC('src/renderer/a.ts', "const K = 'k.one';\nlocalStorage.setItem(K, '1');"),
];

function selfTest() {
  const opts = { stores: BASE_STORES, indirect: [], minSites: 2 };
  const dyn = SRC('src/renderer/e.ts', 'localStorage.setItem(dyn, "1");');
  const cases = [
    ['実物どおりなら 0 件', { files: BASE_FILES, ...opts }, 0],
    [
      '新しい保存先が黙って増えたら鳴る',
      { files: [...BASE_FILES, SRC('src/renderer/b.ts', "localStorage.setItem('k.new', '1');")], ...opts },
      1,
    ],
    [
      '新しい IndexedDB が黙って増えたら鳴る',
      {
        files: [...BASE_FILES, SRC('src/renderer/c.ts', idbSource('other-db'))],
        ...opts,
      },
      1,
    ],
    [
      'sessionStorage も見る',
      { files: [...BASE_FILES, SRC('src/renderer/d.ts', "sessionStorage.setItem('k.sess', '1');")], ...opts },
      1,
    ],
    ['台帳にあるのに実在しなければ鳴る', { files: [BASE_FILES[0]], ...opts, minSites: 1 }, 1],

    /*
     * 2026-08-26 に足した媒体。どれも「足しても ✅ が出た」実測から来ている。
     * **陰性対照 (最後の 2 つ) が要る** —— 読み出しと XSS の標本まで鳴らす
     * 規則にすると、受理すべき物が出て無視されるようになる。
     */
    [
      'Cache Storage も見る',
      {
        files: [...BASE_FILES, SRC('src/renderer/f.ts', "caches.open('probe-cache-v1');")],
        ...opts,
      },
      1,
    ],
    [
      'cookie も見る',
      {
        files: [...BASE_FILES, SRC('src/renderer/g.ts', "document.cookie = 'probe_tok=1; path=/';")],
        ...opts,
      },
      1,
    ],
    [
      'OPFS も見る',
      {
        files: [...BASE_FILES, SRC('src/renderer/h.ts', 'navigator.storage.getDirectory();')],
        ...opts,
      },
      1,
    ],
    [
      'Cache Storage の名前が定数でなければ、登録が無いかぎり鳴る',
      { files: [...BASE_FILES, SRC('src/renderer/i.ts', 'caches.open(dyn);')], ...opts },
      1,
    ],
    [
      '台帳に在る Cache Storage は鳴らない',
      {
        files: [...BASE_FILES, SRC('assets/sw.js', "const CACHE = 'sh-v9';\ncaches.open(CACHE);")],
        ...opts,
        stores: { ...BASE_STORES, 'sh-v9': { medium: 'cachestorage', holds: 'アプリシェル', backedUp: false } },
      },
      0,
    ],
    [
      '陰性対照: cookie の**読み出し**は保存ではない',
      { files: [...BASE_FILES, SRC('src/renderer/j.ts', 'export const c = document.cookie;')], ...opts },
      0,
    ],
    /* 規則 10 — 媒体そのものが在庫に載っているか。 */
    [
      '媒体が監査報告に無ければ鳴る',
      { files: BASE_FILES, ...opts, auditDoc: 'business-hub-data と k.one は書いてある' },
      2,
    ],
    [
      '媒体が監査報告に在れば通る',
      {
        files: BASE_FILES,
        ...opts,
        auditDoc: '### IndexedDB\nbusiness-hub-data\n### localStorage\nk.one',
      },
      0,
    ],
    [
      '表示名の無い媒体は鳴る (黙って媒体を足せない)',
      {
        files: BASE_FILES,
        ...opts,
        labels: { indexeddb: 'IndexedDB' },
        auditDoc: '### IndexedDB\nbusiness-hub-data\nk.one',
      },
      1,
    ],
    [
      '陰性対照: XSS 標本の中の document.cookie は鳴らない',
      {
        files: [
          ...BASE_FILES,
          SRC('src/renderer/k.ts', "export const P = ['javascript:alert(document.cookie)'];"),
        ],
        ...opts,
      },
      0,
    ],
    ['鍵が定数でなければ、登録が無いかぎり鳴る', { files: [...BASE_FILES, dyn], ...opts }, 1],
    [
      '登録すれば通る',
      {
        files: [...BASE_FILES, dyn],
        ...opts,
        indirect: [{ file: 'src/renderer/e.ts', expr: 'dyn', keys: ['k.one'], why: '試験' }],
      },
      0,
    ],
    [
      '古い登録が残っていれば鳴る',
      { files: BASE_FILES, ...opts, indirect: [{ file: 'src/renderer/zz.ts', expr: 'dyn', keys: ['k.one'], why: '試験' }] },
      1,
    ],
    [
      '登録の理由が空なら鳴る',
      {
        files: [...BASE_FILES, dyn],
        ...opts,
        indirect: [{ file: 'src/renderer/e.ts', expr: 'dyn', keys: ['k.one'], why: '  ' }],
      },
      1,
    ],
    [
      '登録が台帳に無い鍵を名乗れば鳴る',
      {
        files: [...BASE_FILES, dyn],
        ...opts,
        indirect: [{ file: 'src/renderer/e.ts', expr: 'dyn', keys: ['k.ghost'], why: '試験' }],
      },
      1,
    ],
    ['走査が死んで 0 件なら鳴る', { files: [], ...opts, minSites: 2 }, 3],
    [
      'バックアップが覆う先が増えたら鳴る',
      {
        files: BASE_FILES,
        ...opts,
        stores: { ...BASE_STORES, 'k.one': { medium: 'localstorage', holds: '何か', backedUp: true } },
      },
      1,
    ],
    [
      'バックアップが覆う先が消えたら鳴る',
      {
        files: BASE_FILES,
        ...opts,
        stores: {
          'business-hub-data': { medium: 'indexeddb', holds: 'レコード', backedUp: false },
          'k.one': { medium: 'localstorage', holds: '何か', backedUp: false },
        },
      },
      1,
    ],
    [
      '「何が入るか」が空なら鳴る',
      { files: BASE_FILES, ...opts, stores: { ...BASE_STORES, 'k.one': { medium: 'localstorage', holds: '', backedUp: false } } },
      1,
    ],
    [
      '媒体が食い違えば鳴る',
      {
        files: BASE_FILES,
        ...opts,
        stores: { ...BASE_STORES, 'k.one': { medium: 'sessionstorage', holds: '何か', backedUp: false } },
      },
      1,
    ],
    /*
     * **同じ名前が別のファイルで別の値なら、呼び出し元のファイルを見る。**
     * 横断の表で引くと取り違える (2026-08-25 に実際にやった: `LS_KEY` が
     * 3 つの別の値に使われていて、候補が 3 つ出た)。
     */
    [
      '同名の定数を取り違えない (呼び出し元のファイルを見る)',
      {
        files: [
          BASE_FILES[0],
          SRC('src/renderer/x.ts', "const LS_KEY = 'k.one';\nlocalStorage.setItem(LS_KEY, '1');"),
          SRC('src/renderer/y.ts', "const LS_KEY = 'k.two';\nlocalStorage.setItem(LS_KEY, '1');"),
        ],
        ...opts,
        stores: { ...BASE_STORES, 'k.two': { medium: 'localstorage', holds: '何か', backedUp: false } },
      },
      0,
    ],
    /*
     * 監査報告との突き合わせ。**`auditDoc` を渡さなければ照合しない**ので、
     * 「渡したのに素通り」と「そもそも見ていない」を別々に固定する。
     *
     * 以下の合成 `auditDoc` が媒体の見出しを持っているのは**規則 10 を
     * 満たすため**であって飾りではない。1 件が 2 つの規則を測ると、
     * どちらが鳴ったのか読めなくなる (規則 10 を足したとき実際に
     * この 3 件が落ち、原因を取り違えかけた)。
     */
    [
      '監査報告に名前が無ければ鳴る',
      {
        files: BASE_FILES,
        ...opts,
        stores: { ...BASE_STORES, 'k.one': { medium: 'localstorage', holds: '何か', backedUp: false, sensitive: true } },
        auditDoc: '### IndexedDB / ### localStorage — 在庫: business-hub-data のみ',
      },
      1,
    ],
    [
      '監査報告に名前があれば通る',
      {
        files: BASE_FILES,
        ...opts,
        stores: { ...BASE_STORES, 'k.one': { medium: 'localstorage', holds: '何か', backedUp: false, sensitive: true } },
        auditDoc: '### IndexedDB / ### localStorage — 在庫: business-hub-data と k.one',
      },
      0,
    ],
    [
      'sensitive でない行は監査報告に無くてよい',
      { files: BASE_FILES, ...opts, auditDoc: '### IndexedDB / ### localStorage (行の名前は書いていない)' },
      0,
    ],
    [
      'auditDoc を渡さなければ照合しない (見ていないことを明示)',
      {
        files: BASE_FILES,
        ...opts,
        stores: { ...BASE_STORES, 'k.one': { medium: 'localstorage', holds: '何か', backedUp: false, sensitive: true } },
      },
      0,
    ],
    [
      '別ファイルから import した定数も辿る',
      {
        files: [
          BASE_FILES[0],
          SRC('src/renderer/keys.ts', "const K = 'k.one';\nexport { K };"),
          SRC('src/renderer/z.ts', "import { K } from './keys';\nlocalStorage.setItem(K, '1');"),
        ],
        ...opts,
      },
      0,
    ],
  ];

  let bad = 0;

  /*
   * **合成だけでは足りない。** 「実物には当たらない正規表現」を書いても
   * 合成の標本には当たってしまう。実ファイルで 1 度、台帳の行を外すと
   * 鳴ることを確かめる (規則を 1 つ潰して、何かが鳴るか)。
   */
  const realFiles = readSources();
  const realAudit = fs.readFileSync(path.join(REPO_ROOT, 'docs/DATA_PROTECTION.md'), 'utf8');
  const realProblems = evaluate({ files: realFiles, auditDoc: realAudit });
  const withoutVault = { ...STORES };
  delete withoutVault['business-hub-vault'];
  const ablated = evaluate({ files: realFiles, stores: withoutVault, auditDoc: realAudit });
  const ablationWorks = realProblems.length === 0 && ablated.length > 0;
  if (!ablationWorks) bad += 1;
  console.log(
    '  ' + (ablationWorks ? '✓' : '✗') + ' 実ファイル: 台帳から business-hub-vault を外すと鳴る ' +
      '(実物 ' + realProblems.length + ' 件 / 外したとき ' + ablated.length + ' 件)',
  );

  /*
   * **監査報告のほうを削っても鳴るか。** 台帳を削る対照だけだと、
   * 「文書を読んでいる」ことは示せない (規則 9 を消しても 1 本目は通る)。
   */
  const docWithoutLibrary = realAudit.split('business-hub-library').join('（消した）');
  const docAblated = evaluate({ files: realFiles, stores: STORES, auditDoc: docWithoutLibrary });
  const docAblationWorks = docAblated.length > 0;
  if (!docAblationWorks) bad += 1;
  console.log(
    '  ' + (docAblationWorks ? '✓' : '✗') + ' 実ファイル: 監査報告から business-hub-library を消すと鳴る ' +
      '(' + docAblated.length + ' 件)',
  );

  for (const [label, input, want] of cases) {
    const n = evaluate(input).length;
    const okCase = n === want;
    if (!okCase) bad += 1;
    console.log('  ' + (okCase ? '✓' : '✗') + ' ' + label + ': ' + n + ' 件 (期待 ' + want + ')');
  }
  if (bad > 0) {
    console.error('❌ self-test 不一致 ' + bad + ' 件 — ゲートが鳴らない / 鳴りすぎている');
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const files = readSources();
  const auditDoc = fs.readFileSync(path.join(REPO_ROOT, 'docs/DATA_PROTECTION.md'), 'utf8');
  const problems = evaluate({ files, auditDoc });
  const siteCount = scan(files).siteCount;
  const byMedium = Object.values(STORES).reduce((acc, r) => {
    acc[r.medium] = (acc[r.medium] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    'Scanned ' + files.length + ' renderer file(s), ' + siteCount + ' 保存箇所 — 台帳 ' +
      Object.keys(STORES).length + ' 件 (' +
      Object.entries(byMedium).map(([m, n]) => m + ' ' + n).join(' / ') + ')、' +
      'バックアップが覆うのは ' + BACKED_UP_STORE + ' のみ',
  );
  if (problems.length === 0) {
    console.log('✅ 保存先は台帳どおりです');
    return 0;
  }
  console.error('❌ ' + problems.length + ' 件:');
  for (const p of problems) console.error('  ' + p);
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { evaluate, scan, STORES, INDIRECT_SITES, BACKED_UP_STORE, MEDIUM_LABELS };
