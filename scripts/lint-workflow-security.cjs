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
 * Run: node scripts/lint-workflow-security.cjs [--self-test]
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const WF_DIR = path.join(REPO_ROOT, '.github', 'workflows');

/**
 * SHA 固定されていない第三者 action の台帳。**減らすのが目的**。
 * 消せない理由と、消し方を書くこと。
 */
const UNPINNED_ALLOW = {
  'softprops/action-gh-release@v2': {
    workflow: 'release.yml',
    why:
      'このセッションからは SHA を解決できない。**当てずっぽうの SHA を書くと ' +
      'リリースが壊れる**ので、タグのまま残して台帳に載せた。' +
      ' 2026-08-22 に 3 通り試して全部塞がっていることを確認済み: ' +
      '(1) GitHub MCP —— セッションのリポジトリ範囲が hiroto1977/- に限られる、' +
      '(2) curl で api.github.com —— プロキシが 403 で「Use add_repo to request ' +
      'access」と返す、(3) WebFetch —— 同じく 403。' +
      ' **同じ 3 つを試し直さないこと。** 解決には人手 (または範囲を広げた ' +
      'セッション) が要る。',
    howToFix:
      'gh api repos/softprops/action-gh-release/git/ref/tags/v2 --jq .object.sha ' +
      'で取得し、`softprops/action-gh-release@<sha> # v2` に置き換えてこの項目を消す',
  },
};

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

function workflows() {
  if (!fs.existsSync(WF_DIR)) return [];
  return fs
    .readdirSync(WF_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(WF_DIR, f), 'utf8') }));
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

/*
 * `allow` は既定で実物の台帳。**差し替えられるのは self-test のため**である ——
 * 台帳の掃除を見る枝は「台帳に載っているものが使われなくなった」状態でしか
 * 動かず、実物では今その項目が使用中なので、**production では一度も通らない道**
 * だった (2026-08-25 の実測: この枝を潰しても本番スキャンも self-test も鳴らない)。
 */
function check(list, allow = UNPINNED_ALLOW) {
  const problems = [];
  const seenUnpinned = new Set();
  for (const { name, text } of list) {
    if (!/^permissions:/m.test(text)) {
      problems.push({
        file: name,
        why: '`permissions:` が未宣言 — 既定 (環境によっては contents: write) を継ぐ',
      });
    }
    if (/^\s*pull_request_target:/m.test(text)) {
      problems.push({
        file: name,
        why: 'pull_request_target — fork の PR が secrets 付きで走る',
      });
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(lines[i]);
      if (!m) continue;
      const ref = m[1];
      if (ref.startsWith('./') || ref.startsWith('docker://')) continue;
      if (ref.startsWith('actions/')) continue; // GitHub 自身
      if (/@[0-9a-f]{40}$/.test(ref)) continue; // SHA 固定済み
      seenUnpinned.add(ref);
      // `in` / 素の添字はプロトタイプ鎖まで辿るので、`uses: constructor` の
      // ような名前が台帳に載っていることになり、**未固定の検査ごと飛ばされる**。
      if (Object.hasOwn(allow, ref)) continue;
      problems.push({
        file: `${name}:${i + 1}`,
        why: `第三者 action がタグ固定 (${ref}) — SHA で固定するか台帳へ`,
      });
    }
    for (const [ln, line] of runBlockLines(text)) {
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
    }
  }
  // 台帳の掃除: 直したのに項目が残っていたら落とす。
  for (const ref of Object.keys(allow)) {
    if (!seenUnpinned.has(ref)) {
      problems.push({ file: '(台帳)', why: `${ref} はもう使われていない — 台帳から消すこと` });
    }
  }
  return problems;
}

function selfTest() {
  const cases = [
    ['permissions 未宣言を落とす', [{ name: 'x.yml', text: 'name: x\non:\n  push:\n' }], 1],
    ['permissions があれば通す', [{ name: 'x.yml', text: 'name: x\npermissions:\n  contents: read\n' }], 0],
    [
      'pull_request_target を落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\non:\n  pull_request_target:\n' }],
      1,
    ],
    [
      '第三者 action のタグ固定を落とす',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: evil/thing@v1\n' }],
      1,
    ],
    [
      '第三者 action の SHA 固定は通す',
      [{ name: 'x.yml', text: `permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: evil/thing@${'a'.repeat(40)}\n` }],
      0,
    ],
    [
      'actions/* のタグ固定は通す',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n' }],
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
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - uses: actions/x@v1\n        with:\n          t: ${{ github.event.pull_request.title }}\n' }],
      0,
    ],
    [
      'if: / key: の式は見ない',
      [{ name: 'x.yml', text: 'permissions:\n  contents: read\njobs:\n  a:\n    steps:\n      - if: steps.scope.outputs.mode == \'some\'\n        uses: actions/cache@v4\n        with:\n          key: stryker-${{ github.ref_name }}\n' }],
      0,
    ],
    // 許可台帳をプロトタイプ鎖経由ですり抜けられないこと。`UNPINNED_ALLOW[ref]`
    // と素で引いていた頃は `uses: constructor` が `Object` を返して truthy に
    // なり、**未固定の検査ごと飛ばされていた** (2026-08-22)。
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
    const n = check(list, allow).filter((p) => p.file === '(台帳)').length;
    const ok = n === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} 台帳の掃除: ${label}: ${n} 件 (期待 ${expected})`);
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
  const problems = check(list);
  const ledger = Object.keys(UNPINNED_ALLOW).length;
  console.log(
    `Checked ${list.length} workflow(s): permissions / 第三者 action の SHA 固定 / ` +
      `pull_request_target / run: への ${'$'}{{ }} 展開 (台帳: ${ledger} 件)`,
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

process.exit(main());
