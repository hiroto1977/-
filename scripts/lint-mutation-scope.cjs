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
  // 2026-08-23 追加。**足した当人が名簿へ入れ忘れていた。** 枠 (iframe) の中では
  // 描画しない関門で、CSP では代替できない (`frame-ancestors` は meta では
  // 無視される)。判定できないときは「枠の中」に倒す fail-closed なので、
  // その倒し方が壊れても画面上は何も変わらない = 測っていないと気付けない。
  'src/renderer/security/frameGuard.ts': '枠 (iframe) の中では描画しない関門 (クリックジャッキング)',
  // 2026-08-23 追加。**名簿の作り方そのものを直した回。** 前回 (2026-08-20) の
  // 洗い出しは「`mutate` に載っている 226 件」の冒頭を走査したので、
  // **そもそも載っていないファイルは構造的に見えなかった** (frameGuard が
  // まさにそれ)。今回は `src/` 全体から「自分の説明文で門だと名乗るもの」を
  // 拾い直し、20 件中 9 件が漏れていた。うち門と呼べる 4 件を入れる
  // (残り 5 件は事業データの検証・座標計算・イベント名の統一で、壁ではない)。
  'src/renderer/security/lockWorkspace.ts': '施錠で鍵をメモリから落とす所 (画面を隠すことではなく、これが本体)',
  'src/shared/controlChars.ts':      'URL を解析する前に制御文字を落とす (atlassianSite / proxyEndpoint / aiEndpoint の 3 つが依存)',
  'src/shared/safeFilename.ts':      'ファイル名の唯一の関門 (ライブラリと実フォルダ書き出しが並んで受け取る)',
  'src/shared/updateCheck.ts':       '更新の案内先 URL の検証 (openExternal に渡る)',
  // 2026-08-24 追加。権限や資格情報の壁ではないが、**モデルの応答を構文解析して
  // 画面へ出す唯一の場所**で、しかも等価変異の pragma を 6 つ抱えている。
  // この表の言う「中の pragma も含めて何も測られていない状態が緑に見える」が
  // まさに当てはまる (載せる前は 67.30%・生存 66 で、誰も気付いていなかった)。
  'src/renderer/data/assistantMarkdown.ts': 'モデル応答を解析して画面へ出す唯一の場所 (等価変異の pragma を抱える)',
  'src/renderer/oauth/pkce.ts':      'ブラウザ版 PKCE',
  // 2026-08-23 追加。PKCE の一時秘密 (`code_verifier`) を置く・読む・**消す**
  // 唯一の場所。掃除が効かなくなると、`state` 不一致 (CSRF の疑い) で
  // 失敗したときに秘密が sessionStorage へ残る。
  'src/renderer/oauth/pkceSession.ts': 'PKCE の一時秘密の置き場と消し方',
  // 同日追加。どちらも既に `mutate` には在ったが「必ず測る壁」の名簿には
  // 無く、**一覧から外しても誰も鳴らない**状態だった。
  // 2026-08-24 追加。**同種の壁で唯一 `mutate` から外れていた。** R3-6 (2026-07 監査) が
  // 第三者由来の画像 URL を絞るために作った関門で、同日その予告どおり
  // CSS `url()` の抜けが実在した。`components/DataList.tsx` の中に置かれていたため
  // `mutate` に `.tsx` が 1 件も無い = 変異体が 1 つも作られない状態で、
  // この名簿にも載りようがなかった。**壁をコンポーネントから出して**載せる。
  'src/shared/imageUrlGate.ts':      '第三者由来の画像 URL のスキーム関門 (<img> と CSS url() の両方が通る)',
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
  // 2026-09-01 追加。`decorativeDisables` が掘り出した ——「広い無効化が在るのに
  // mutate に無い」形で、14 種を 205 行に理由なしで掛けていた。外して実測すると
  // 総合 70.73% (生存 38 / 未到達 10)。**送る量の上限が測られていなかった。**
  'src/main/clients/assistant.ts':   'AI 中継層 (課金される外部 API へ送る量の上限と、どの資格情報を使うかの解決)',
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

/**
 * **壁を含むのに `mutate` に載っていないファイルの台帳。**
 *
 * `MUST_MEASURE` の裏返し。あちらは「必ず測る」で、こちらは
 * **「測っていないと分かっている」**。何も書かないと、載っていないことが
 * ただ見えないだけになる —— それがこのファイルの冒頭に書いてある事故
 * (`exportPaths.ts` が `mutate` に無く、pragma が飾りだった) の本体である。
 *
 * 双方向: ここに在るのに `mutate` へ載ったら落ちる (台帳を消し忘れると、
 * 次に読む人が「まだ測っていない」と誤解する)。
 */
const KNOWN_UNMEASURED = {

  // 2026-09-01 追加。**新しい検査 `decorativeDisables` が形から掘り出した 9 件。**
  // どれも「広い Stryker disable が書いてあるのに mutate に無い」= pragma が
  // 飾りの状態だった。8 つは確証済みデータの表で、判断が無いので測る価値も無い
  // (ただし**書いていなければ「たまたま漏れている」と区別が付かない**)。
  //
  // データの表 8 件 —— いずれも出典つきの定数で、値を 1 つ変える変異体は
  // 「別のデータになる」だけ。中身の正しさは出典側の検査
  // (`lint:citations` / `lint:doi-prefix` / `vault:check`) が見る。
  'src/renderer/data/academicKnowledge.ts': '学術概念の確証済みデータ (49,692 行)。判断が無い。',
  'src/renderer/data/complianceKnowledge.ts': '税務・労務・法務の確証済みデータ。判断が無い。',
  'src/renderer/data/counselorKnowledge.ts': '相談窓口の確証済みデータ。判断が無い。',
  'src/renderer/data/economicHistoryKnowledge.ts': '経済史の確証済みデータ。判断が無い。',
  'src/renderer/data/subsidyKnowledge.ts': '補助金の確証済みデータ。判断が無い。',
  'src/shared/connectors/pluginCatalog.ts': 'プラグインの宣言的カタログ (表示文字列と識別子の転記)。判断が無い。',
  'src/shared/connectors/freeConnectors.ts':
    'コネクタの宣言的カタログ。**厳密には純データではない** — 項目の `transform` に'
    + '小さなアロー関数が在り、ファイル名や表題を組み立てる。ただしファイル名の関門は'
    + '`safeFilename.ts` (測っている) 側に在り、ここは表示用の文字列組み立てに留まる。',
  'src/shared/connectors/mcpConnectors.ts':
    'MCP コネクタの宣言的カタログ。**`findMcpConnector` / `mcpConnectorCounts` の 2 関数を含む**(id の一致で引く・数える、だけ)。壁ではないので据え置くが、判断をここへ書き足すなら mutate に載せること。',

  // 2026-08-25 追加。**保護対象なのに mutate に無い 2 件**を明示する
  // (逆向きの突き合わせで出てきた)。どちらも意図的だが、書いていなければ
  // 「たまたま漏れている」と区別が付かない。
  'src/renderer/security/LockScreen.tsx':
    '解錠・初回設定・復旧の画面。**`mutate` に `.tsx` は 1 件も無い** '
    + '(JSX の変異体が大量に出て信号が埋もれるため)。ここに在るのは保管庫呼び出しの'
    + '段取りで、判断そのものは `vault.ts` / `mnemonic.ts` (どちらも測っている) に在る。'
    + '唯一この画面が持つ決定はクリップボード消去の番人 (コピーした時のままなら消す) で、'
    + 'それは `LockScreen.test.ts` が振る舞いで留めてある。'
    + '**判断をこの画面へ書き足すなら、共有側へ出すこと。**',
  'src/renderer/security/bip39-wordlist.ts':
    'BIP-39 の 2048 語。**データであって判断ではない** — 語を 1 つ変える変異体は'
    + '「別の語表になる」だけで、検査すべき性質が無い。語表の正しさは'
    + '`mnemonic.ts` (測っている) の検査が符号・復号の往復で留めている。',

  'src/renderer/web-shim.ts':
    'ブラウザ版の main 代替。**壁の判断そのものは測られている共有実装に在る** '
    + '(externalUrlGate / redact / httpLimits / tokenInput / ai.chat)。'
    + 'ここに在るのは「どの呼び出し口がどの壁を通るか」の配線で、'
    + '配線は変異検査ではなく振る舞いの検査で留めてある: '
    + 'webShimInvokeNeverRejects / webShimPayloadRedaction / webShimTimeouts / '
    + 'dualBuildActionSurface / webShimBridge / webShimCredentials。'
    + '**判断そのものをこのファイルへ書き足すなら、共有側へ出すか mutate に載せること。**'
    + ' なお **`mutate` に載せると dry run で落ちる** (2026-08-31 実測): '
    + '`webShimCredentials.test.ts` の「鍵を載せて直接叩く送り先は、字面で 1 つだけ」は'
    + '**このファイルを本文として走査する**ので、Stryker が計装した源を読むと'
    + '`timedFetchAi` が 0 件になる。載せたい日は、字面の検査を先に'
    + '「字面ではない形」へ書き換えること。',
};

/**
 * **台帳の項目に理由が書いてあるか。**
 *
 * どちらの台帳も「載せれば通る」形なので、理由を空にすれば黙らせられる。
 * `integrity-chain.cjs` が `DEP_EXCLUSIONS` に同じ検査を持っている
 * (「除外の理由が空でない」) ので、こちらも同じ強さに揃える。
 *
 * **長さの下限は置かない。** 実在する理由の最短は 6 文字
 * (`autoLock.ts` の「離席時の施錠」) で、これは短いが**良い理由**である。
 * 文字数を要求すると、良い理由を水増しさせるだけになる。
 */
function ledgerEntriesWithoutReason(ledgers) {
  const out = [];
  for (const [name, ledger] of Object.entries(ledgers)) {
    for (const [rel, why] of Object.entries(ledger)) {
      if (String(why ?? '').trim().length === 0) {
        out.push(`${rel}: ${name} に在りますが理由が空です — なぜ測る / 測らないのかを書いてください`);
      }
    }
  }
  return out;
}

/** `KNOWN_UNMEASURED` に載っているのに `mutate` へ入ったものを返す (台帳の消し忘れ)。 */
function staleUnmeasured(mutateList, ledger) {
  const set = new Set(mutateList);
  return Object.keys(ledger).filter((f) => set.has(f));
}

/** `KNOWN_UNMEASURED` に載っているが実在しないものを返す (古い項目)。 */
function missingUnmeasured(ledger, exists) {
  return Object.keys(ledger).filter((f) => !exists(f));
}

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
 * **飾りの pragma を、名指しではなく形で見つける。**
 *
 * 冒頭の「事故 その 2」(`exportPaths.ts`) の直しは `MUST_MEASURE` ——
 * 「これは壁だ」と**人が思い付いて名簿へ書いた**ものだけを見る。だから
 * 同じ事故がもう一度起きても、書き忘れれば同じだけ黙る。
 *
 * 同じ事故は**形で見つかる**: 広い `Stryker disable` が書いてあるのに
 * ファイルが `mutate` に無ければ、その pragma は 1 つも変異体を黙らせて
 * いない (= 飾り)。そして `mutate` へ載せた日に、**中身を全部黙らせた
 * まま 100% を報告する**。exportPaths.ts はこの形で、名簿を一切見なくても
 * 引っ掛かっていた。
 *
 * 初回の実測 (2026-09-01) は 9 ファイル。8 つは確証済みデータの表 (判断が無い)
 * で台帳へ載せ、残る 1 つ `src/main/clients/assistant.ts` は**判断を持っていた**
 * ので測るほうへ回した —— 14 種の無効化を外すと 164 変異体 / 生存 38 / 未到達 10
 * (総合 70.73%) で、送る量の上限も資格情報の解決もほとんど測られていなかった。
 * テストを足して 100% にし、`mutate` と `MUST_MEASURE` へ移した。
 *
 * 逃げ道は 1 つだけ: `KNOWN_UNMEASURED` に**理由つきで**載せること。
 * (`mutate` へ載せれば、上の `KNOWN_BROAD` 側の規則が代わりに掛かる。)
 */
function decorativeDisables(mutateOverride, ledgerOverride, filesOverride, readOverride) {
  const mutate = new Set(mutateOverride ?? mutateList());
  const ledger = new Set(Object.keys(ledgerOverride ?? KNOWN_UNMEASURED));
  const files = filesOverride ?? sourceFiles();
  // 読み取りを差し替えられるようにしてある —— 自己検査が実ファイルを
  // 作らずに済む。**`??` ではなく `undefined` 比較**にするのは、
  // 「読めない」を表す null を潰さないため (同じ罠を cross-doc 側で踏んでいる)。
  const readText =
    readOverride === undefined
      ? (rel) => { try { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); } catch { return null; } }
      : readOverride;
  const problems = [];
  for (const rel of files) {
    if (mutate.has(rel) || ledger.has(rel)) continue;
    const text = readText(rel);
    if (text === null || text === undefined) continue;
    const broad = broadRegionsOf(text);
    if (broad.length === 0) continue;
    problems.push(
      `${rel}: 広い Stryker disable (${broad.length} 箇所) が在りますが mutate に載っていません` +
      ` — pragma は飾りで、載せた日に「中身を全部黙らせたまま 100%」になります。` +
      ` 測るか、KNOWN_UNMEASURED に理由つきで載せてください` +
      `\n      内訳: ` + broad.map((r) => `L${r.start}-L${r.end} (${r.span}行) ${r.mutators}`).join(' / '),
    );
  }
  return problems;
}

/** 走査対象 — `src/` 配下の TypeScript (テストと型宣言は除く)。 */
function sourceFiles(dir = path.join(REPO_ROOT, 'src'), out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(path.relative(REPO_ROOT, full));
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
  // ── 名簿どうしの突き合わせ ──
  {
    const chain = (prot, exc) => ({ PROTECTED: prot, DEP_EXCLUSIONS: exc });
    const cases = [
      ['壁が保護対象なら通る', { 'a/w.ts': 'wall' }, chain(['a/w.ts'], {}), 0],
      ['壁が除外台帳なら通る', { 'a/w.ts': 'wall' }, chain([], { 'a/w.ts': '理由' }), 0],
      ['★ どちらにも無ければ鳴る', { 'a/w.ts': 'wall' }, chain([], {}), 1],
      ['複数の壁それぞれで鳴る', { 'a/w.ts': 'w', 'b/x.ts': 'w' }, chain([], {}), 2],
      ['名簿が読めなければ鳴る', { 'a/w.ts': 'w' }, null, 1],
      ['PROTECTED が配列でなければ鳴る', { 'a/w.ts': 'w' }, { PROTECTED: 'x' }, 1],
    ];
    for (const [label, must, chainData, expected] of cases) {
      const n = checkWallsAreProtected(must, chainData).length;
      const ok = n === expected;
      if (!ok) failed += 1;
      console.log(`  ${ok ? '✓' : '✗'} 名簿: ${label}: ${n} 件 (期待 ${expected})`);
    }
  }

  // ── 逆向き: 守る壁が測られているか ──
  {
    const cases = [
      ['mutate に在れば通る', ['src/a.ts'], ['src/a.ts'], {}, 0],
      ['台帳に在れば通る', ['src/a.ts'], [], { 'src/a.ts': '理由' }, 0],
      ['★ どちらにも無ければ鳴る', ['src/a.ts'], [], {}, 1],
      ['src 以外は見ない (scripts/*.cjs 等)', ['scripts/x.cjs'], [], {}, 0],
      ['.md や .json も見ない', ['security/x.md'], [], {}, 0],
      ['複数の壁それぞれで鳴る', ['src/a.ts', 'src/b.tsx'], [], {}, 2],
      ['PROTECTED が配列でなければ鳴る', 'not-an-array', [], {}, 1],
    ];
    for (const [label, prot, mut, led, expected] of cases) {
      const n = checkProtectedAreMeasured(prot, mut, led).length;
      const ok = n === expected;
      if (!ok) failed += 1;
      console.log(`  ${ok ? '✓' : '✗'} 逆向き: ${label}: ${n} 件 (期待 ${expected})`);
    }
  }
  console.log('self-test:');
  for (const [label, text, want] of cases) {
    const got = broadRegionsOf(text).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  /*
   * 飾りの pragma。**最初のケースは 2026-08-18 に実在した形**
   * (`exportPaths.ts` に広い無効化が在り、ファイルは `mutate` に無い)。
   * これが鳴るということは、名簿 `MUST_MEASURE` に誰かが書き足さなくても
   * 同じ事故が捕まる、ということ。
   *
   * 逆向きも同じ強さで見る —— `mutate` に在る / 台帳に在る / そもそも
   * 広い無効化が無い、のいずれでも鳴ってはいけない。誤爆する検査は
   * 正常な日に赤を出して信用を失う。
   */
  {
    const BROAD = '// Stryker disable ConditionalExpression\n' + body(50);
    const NARROW = '// Stryker disable next-line ConditionalExpression: 到達不能\n' + body(50);
    const CLOSED = '// Stryker disable all\n' + body(5) + '\n// Stryker restore all\n' + body(50);
    const dcases = [
      [
        '★ 実在した形 (広い無効化 + mutate に無い) で鳴る',
        [], {}, ['src/main/clients/exportPaths.ts'], () => BROAD, 1,
      ],
      ['mutate に在れば鳴らない', ['src/a.ts'], {}, ['src/a.ts'], () => BROAD, 0],
      ['台帳に在れば鳴らない', [], { 'src/a.ts': '理由' }, ['src/a.ts'], () => BROAD, 0],
      ['1 行 pragma は広くないので鳴らない', [], {}, ['src/a.ts'], () => NARROW, 0],
      ['restore で閉じた短い範囲も鳴らない', [], {}, ['src/a.ts'], () => CLOSED, 0],
      ['pragma が無ければ鳴らない', [], {}, ['src/a.ts'], () => body(50), 0],
      ['読めないファイルは飛ばす (ここでは鳴らせない)', [], {}, ['src/gone.ts'], () => null, 0],
      ['複数あればその数だけ鳴る', [], {}, ['src/a.ts', 'src/b.ts'], () => BROAD, 2],
    ];
    for (const [label, mut, led, files, read, want] of dcases) {
      const got = decorativeDisables(mut, led, files, read).length;
      const ok = got === want;
      if (!ok) failed += 1;
      console.log(`  ${ok ? '✓' : '✗'} 飾りの pragma: ${label}: ${got} 件 (期待 ${want})`);
    }
  }

  // 台帳の理由欄。**実物の 2 台帳が空を持っていないこと**も同じ場で見る
  // (規則だけ足して実物を見ないと、次に足す人が空で通せる)。
  for (const [label, ledgers, want] of [
    ['理由が空なら鳴る', { L: { 'a.ts': '' } }, 1],
    ['空白だけでも鳴る', { L: { 'a.ts': '   \n ' } }, 1],
    ['undefined でも鳴る', { L: { 'a.ts': undefined } }, 1],
    ['短くても理由が在れば鳴らない (実在の最短は 6 文字)', { L: { 'a.ts': '離席時の施錠' } }, 0],
    ['台帳が 2 つでもそれぞれ数える', { A: { 'a.ts': '' }, B: { 'b.ts': '' } }, 2],
    [
      '★ 実物の 2 台帳に空は無い',
      { MUST_MEASURE, KNOWN_UNMEASURED },
      0,
    ],
  ]) {
    const got = ledgerEntriesWithoutReason(ledgers).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} 台帳の理由: ${label}: ${got} 件 (期待 ${want})`);
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

  // KNOWN_UNMEASURED 側 — 台帳の消し忘れ / 古い項目のどちらでも鳴るか
  const ledger = { 'x/web.ts': '理由' };
  const unmeasuredCases = [
    ['mutate に無ければ 0 件 (台帳どおり)', [], 0],
    ['mutate に載ったら 1 件 (消し忘れ)', ['x/web.ts'], 1],
    ['無関係なファイルは数えない', ['y/other.ts'], 0],
  ];
  for (const [label, files, want] of unmeasuredCases) {
    const got = staleUnmeasured(files, ledger).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  const missCases = [
    ['実在すれば 0 件', () => true, 0],
    ['消えていれば 1 件 (古い項目)', () => false, 1],
  ];
  for (const [label, exists, want] of missCases) {
    const got = missingUnmeasured(ledger, exists).length;
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

  // 名簿どうしの突き合わせ。**「測る壁」は「改竄検知で守る壁」でもあるはず。**
  // 片方だけ見ている限り、ずれても誰も気付かない (実際 14 件ずれていた)。
  failures.push(...checkWallsAreProtected());
  failures.push(...checkProtectedAreMeasured());

  // 飾りの pragma —— 広い無効化が在るのに mutate に無いファイル。
  // 名指しの名簿 (MUST_MEASURE) と違い、**形から見つける**ので書き忘れが効かない。
  failures.push(...decorativeDisables());

  // 台帳は「載せれば通る」ので、理由の欄が空なら鳴らす (両方の台帳)。
  failures.push(...ledgerEntriesWithoutReason({ MUST_MEASURE, KNOWN_UNMEASURED }));

  // 「測っていないと分かっている」台帳の双方向。載ったのに消し忘れる /
  // ファイルが消えたのに残る、のどちらでも落とす。
  for (const rel of staleUnmeasured(files, KNOWN_UNMEASURED)) {
    failures.push(
      `${rel}: KNOWN_UNMEASURED に在りますが mutate へ載りました。台帳から消してください`,
    );
  }
  for (const rel of missingUnmeasured(KNOWN_UNMEASURED, (f) => fs.existsSync(path.join(REPO_ROOT, f)))) {
    failures.push(`${rel}: KNOWN_UNMEASURED に在りますがファイルがありません (古い項目)`);
  }

  console.log(`Scanned ${scanned} mutate-listed file(s); span limit ${MAX_SPAN} lines`);
  console.log(`必ず測る壁: ${Object.keys(MUST_MEASURE).length} ファイル (全て mutate に在籍)`);
  console.log(
    `測っていないと分かっている壁: ${Object.keys(KNOWN_UNMEASURED).length} ファイル (mutate 外・理由つき)`,
  );
  console.log(`広い無効化: ${seen.size} ファイル / ${broadRegions} 箇所 / ${broadLines} 行 (台帳: ${Object.keys(KNOWN_BROAD).length} ファイル)`);
  console.log(`mutate 外の src ファイル: ${sourceFiles().filter((f) => !mutateList().includes(f)).length} 件 — うち広い無効化を持つものは全て KNOWN_UNMEASURED に在ること`);

  if (failures.length === 0) {
    console.log('✅ 測っていない範囲は台帳どおり (増えても減ってもいません)');
    return 0;
  }
  console.error(`❌ ${failures.length} 件:`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

/**
 * **逆向き — 「守る壁」は測られているか。**
 *
 * `checkWallsAreProtected` は「測る壁が守られているか」を見る。その裏返しが
 * 要るのは、**保護対象でも `mutate` に無ければ変異体が 1 つも作られない**から
 * である (`exportPaths.ts` がまさにそれだった —— 中の pragma まで含めて
 * 何も測られていない状態が「緑」に見えていた)。
 *
 * 採掘は「変わったこと」を検知するが、**変わった中身が正しいか**は測らない。
 * 保護と計測は別の保証で、両方要る。
 *
 * 測らない判断は `KNOWN_UNMEASURED` に理由つきで載せること (双方向)。
 */
function checkProtectedAreMeasured(protectedOverride, mutateOverride, ledgerOverride) {
  let list = protectedOverride;
  if (list === undefined) {
    try {
      list = require('./integrity-chain.cjs').PROTECTED;
    } catch {
      return ['integrity-chain.cjs から PROTECTED を読めない'];
    }
  }
  if (!Array.isArray(list)) return ['PROTECTED が配列ではない'];
  const mutate = new Set(mutateOverride ?? mutateList());
  const ledger = new Set(Object.keys(ledgerOverride ?? KNOWN_UNMEASURED));
  const problems = [];
  for (const file of list) {
    if (!/^src\/.*\.tsx?$/.test(file)) continue; // 走査対象は src の TypeScript のみ
    if (mutate.has(file) || ledger.has(file)) continue;
    problems.push(
      `${file} は改竄検知の保護対象なのに変異検査に載っていない ` +
        '(stryker.config.json の mutate へ足すか、KNOWN_UNMEASURED に理由つきで載せること)',
    );
  }
  return problems;
}

/**
 * **2 つの台帳が同じことを言っているか。**
 *
 * `MUST_MEASURE` (必ず変異検査に載せる壁) と `integrity-chain.cjs` の
 * `PROTECTED` (改竄検知の保護対象) は、どちらも「これは壁だ」と言う名簿である。
 * にもかかわらず 2026-08-25 に突き合わせたら **14 件ずれていた** ——
 * 13 件は保護されておらず、1 件は両方に載って二重管理になっていた。
 *
 * 片方だけ見ている限り気付けない。`frameGuard.ts` は
 * 「足した当人が名簿へ入れ忘れていた」と `MUST_MEASURE` に書いてあるのに、
 * **同じ file が鎖の名簿からも漏れていた**。名簿は増やすほど、
 * 名簿どうしの食い違いが見えなくなる。
 *
 * 除外は `DEP_EXCLUSIONS` (理由必須・双方向) に載っていればよい ——
 * 「測る壁だが鎖では守らない」という判断自体は在りうる
 * (`updateCheck.ts` がそれで、理由が書いてある)。
 *
 * @param mustOverride / @param chainOverride self-test の差し込み口。
 */
function checkWallsAreProtected(mustOverride, chainOverride) {
  const must = mustOverride ?? MUST_MEASURE;
  const chain =
    chainOverride ??
    (() => {
      try {
        return require('./integrity-chain.cjs');
      } catch {
        return null;
      }
    })();
  if (chain === null || !Array.isArray(chain.PROTECTED)) {
    return ['integrity-chain.cjs から PROTECTED を読めない (名簿の突き合わせができない)'];
  }
  const protectedSet = new Set(chain.PROTECTED);
  const excluded = new Set(Object.keys(chain.DEP_EXCLUSIONS ?? {}));
  const problems = [];
  for (const file of Object.keys(must)) {
    if (protectedSet.has(file) || excluded.has(file)) continue;
    problems.push(
      `${file} は「必ず測る壁」なのに改竄検知の保護対象でも除外台帳でもない ` +
        '(integrity-chain.cjs の PROTECTED へ足すか、DEP_EXCLUSIONS に理由つきで載せること)',
    );
  }
  return problems;
}

module.exports = {
  scanSource,
  checkWallsAreProtected,
  checkProtectedAreMeasured,
  decorativeDisables,
  ledgerEntriesWithoutReason,
  broadRegionsOf,
  missingWalls,
  staleUnmeasured,
  missingUnmeasured,
  MAX_SPAN,
  MUST_MEASURE,
  KNOWN_UNMEASURED,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
