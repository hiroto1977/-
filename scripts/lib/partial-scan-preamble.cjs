'use strict';

/**
 * **走査を「一部だけ」殺す前置き** (2026-09-25 · パス 469)。
 *
 * `audit:gate-floors --partial` が、隔離した写しの上でゲートの入口に `require` させる。
 * `fs.readdirSync` を包んで**ファイルの項目だけ**を落とす —— ディレクトリは落とさない
 * (落とすと部分木ごと消えて、どれだけ死んだのかが読めなくなる)。
 *
 * ★ **木は無傷で、走査だけが壊れる** —— これが模したい失敗である。実際に起きるのは
 * 「拡張子のふるいが 1 つ落ちる」「根が 1 つ歩かれない」で、ファイルが消えることではない。
 * 木の側を消すと、ゲートは床とは別の理由 (参照が解けない・生成物と合わない) で鳴りうるので、
 * 「床が捕まえた」と読み違える (パス 468 の忠実さの教訓)。
 *
 * ## 2 つ目の出どころ: `git ls-files` (2026-09-25 · パス 470)
 *
 * 母集団を `readdirSync` で歩かないゲートが 2 本ある (`lint:shell` / `lint:repo-size`)。
 * どちらも `git ls-files` の出力を母集団にするので、この前置きでは 1 件も落とせなかった
 * (パス 469 が「測っていない」として残した所)。`child_process` の同期実行を包んで
 * **同じ述語で**一覧を間引く。
 *
 * ★ **間引くのは「広い一覧」だけ** —— 引数に `--` (pathspec) を持つ呼び出しは
 * そのまま通す。模したい失敗は「git が嘘をつく」ことではなく
 * **「ゲートが使う広い一覧が narrow された」**ことで、そのとき狙いを定めた問い合わせは
 * 今も正しく答える。だから「権威に 2 度訊いて食い違いを見る」検査は、この前置きの下で
 * ちゃんと鳴る (全部の呼び出しを間引くと、その検査は永久に観測できなくなる)。
 *
 * 環境変数:
 *   AUDIT_PARTIAL_MODE   'ext' | 'root' | 'keep'   落とし方
 *   AUDIT_PARTIAL_ARG    '.tsx' | 'scripts' | '50' 対象 (keep は**群ごとに**残す百分率)
 *   AUDIT_PARTIAL_OUT    報告を書く**ディレクトリ** (`<pid>.json` を置く)
 *   AUDIT_PARTIAL_TARGET 'all' | 'git' | 'fs'      どの数え方を殺すか (既定 all)
 *
 * **答えは終了コードで、この前置きは 1 度も終了コードに触らない。** 報告が書けなくても
 * ゲートの答えは変えない (書けなかったことは呼ぶ側が「落とせていない」として扱う)。
 *
 * ## 報告は**プロセスごと** (2026-09-26 · パス 474)
 *
 * パス 473 までは原文の行 0 に `require` を差し込んでいたので、instrument されるのは
 * **親だけ**だった。パス 474 で `NODE_OPTIONS=--require` へ移したら**子プロセスも**前置きを
 * 読むようになり、**同じ 1 つのファイルへ書くと最後に終わったプロセスが上書きする** ——
 * 実測 (2026-09-26): `verify:arch` (子を 6 回 spawn する) の報告が `kept: 0, dropped: 0` になり、
 * 親が落とした件数が**丸ごと消えた**。それを「落とせていない」と読むと、鳴った理由が
 * すり替わる (パス 470 の忠実さの教訓と同じ形)。
 *
 * だから `AUDIT_PARTIAL_OUT` は**ディレクトリ**で、各プロセスが `<pid>.json` を置く。
 * 合計は呼ぶ側が足す —— 親と子は同じ木を歩くので、**どちらの走査が死んだかではなく
 * 「合わせてどれだけ死んだか」**が測りたい量である。
 */

(() => {
  const fs = require('node:fs');
  const path = require('node:path');
  const MODE = process.env.AUDIT_PARTIAL_MODE || '';
  const ARG = process.env.AUDIT_PARTIAL_ARG || '';
  const OUT = process.env.AUDIT_PARTIAL_OUT || '';
  /*
   * **どの数え方を殺すか** (2026-09-25 · パス 470)。
   *
   * 既定は両方 (`all`)。ところが `lint:shell` は「git の一覧 → 空なら `scripts/` 直下」の
   * 2 段構えなので、両方を殺すと**フォールバックも一緒に死ぬ** —— ゲートは鳴るが、
   * 鳴った理由は「一覧が narrow された」ではなく「木ごと消えた」になる。
   * それを「床が捕まえた」と読むと、**フォールバックが詰め直す欠陥が永久に見えない**
   * (実測: 直す前のこのゲートは、git の一覧だけを殺すと ✅ exit 0 で
   * 「Checked 9 (追跡ファイル全体から収集)」と刷った · パス 469 の忠実さの教訓)。
   */
  const TARGET = process.env.AUDIT_PARTIAL_TARGET || 'all';
  if (!MODE) return;
  const seen = { mode: MODE, arg: ARG, kept: 0, dropped: 0, exts: {}, roots: {} };

  /*
   * `keep` は**群ごとに**割合で間引く (2026-09-25 · パス 470 で直した)。
   *
   * 最初の実装は「通し番号 % 100 < N」だった。**それは一様な間引きではなく、
   * 走査順のかたまりを落とす形** —— 1 件しか無い群 (`lint:charset` の `.html` /
   * `.css` / `.webmanifest`) は番号の位置で丸ごと消えるので、群ごとの床が
   * *偶然* 鳴る。実測 (2026-09-25): その形だと 6 本のうち 5 本が `rings` になり、
   * しかもファイルを 1 つ足せば番号がずれて答えが変わる —— **台帳に書けない
   * 揺れる測定**だった。
   *
   * 群ごとの計数器にすると ① どの群も空にならない (1 件の群は必ず残る)
   * ② 他の群にファイルが増えても答えが動かない。これで測れるのは
   * **「群ごとの床では構造的に見えない部分的な死」**だけになり、問いが尖る。
   *
   * ★★ **歩幅は逆数しか表せなかった** (2026-09-25 · パス 471 で直した)。
   * パス 470 の実装は `i % round(100 / pct) === 0` で、`pct` が 99 / 90 / 75 だと
   * `round(100 / pct)` がどれも **1** になる —— つまり**全部残す**。それでも報告は
   * 「kept 530/530」と刷るので、呼ぶ側が `KEEP_PCT = 90` と書けば
   * **「1 割落として鳴らなかった」と読める記録が、1 件も落とさずに出る**。
   * 鳴らない対照を合格と読む形そのもの (パス 468 / 469 の自戒と同じ家系) で、
   * しかも**この道具の 4 つ目の忠実さの罠**だった。
   *
   * 直しは「群の 1 件目は必ず残し、2 件目から本当の割合で間引く」——
   * `floor(i·pct/100) > floor((i−1)·pct/100)` は 100 件あたりちょうど `pct` 件を残す。
   * 1 件の群は今までどおり残る (揺れない) が、任意の割合を表せるようになった。
   */
  const bucket = new Map();

  /** 1 件を残すか。落とし方は 1 つだけ定義し、`readdirSync` と `git ls-files` が共有する。 */
  const keepEntry = (rel) => {
    const ext = path.extname(rel) || '(拡張子なし)';
    const root = rel.split(path.sep)[0] || '(直下)';
    let keep = true;
    if (MODE === 'ext') keep = ext !== ARG;
    else if (MODE === 'root') keep = root !== ARG;
    else if (MODE === 'keep') {
      // 群の中で **歩幅** で間引く (`(i % 100) < N` だと 4 件の群が 4 件とも残る)。
      // 50 → 2 件に 1 件・20 → 5 件に 1 件。0 は「何も残さない」。
      const pct = Number(ARG);
      const key = `${root}|${ext}`;
      const i = bucket.get(key) ?? 0;
      bucket.set(key, i + 1);
      // 群の 1 件目は必ず残し、2 件目から割合で間引く。
      keep = pct <= 0 ? false
        : i === 0 ? true
        : Math.floor((i * pct) / 100) > Math.floor(((i - 1) * pct) / 100);
    }
    if (keep) {
      seen.kept += 1;
      seen.exts[ext] = (seen.exts[ext] || 0) + 1;
      seen.roots[root] = (seen.roots[root] || 0) + 1;
    } else {
      seen.dropped += 1;
    }
    return keep;
  };

  const realRead = fs.readdirSync;
  if (TARGET !== 'git') fs.readdirSync = function auditPartialReaddirSync(dir, opts) {
    const res = realRead.call(fs, dir, opts);
    if (!Array.isArray(res)) return res;
    return res.filter((e) => {
      // ★ 名前が読めない項目 (Buffer で返る・独自の形) は**そのまま通す**。
      //   触ると呼び手が壊れ、その落ち方を「床が鳴った」と読み違える
      //   (実測: `fs.rmSync` の内部が読む一覧でここが投げた · パス 470)。
      const name = typeof e === 'string' ? e : (e && typeof e.name === 'string' ? e.name : null);
      if (name === null) return true;
      const isDir = (() => {
        if (typeof e !== 'string') return typeof e.isDirectory === 'function' && e.isDirectory();
        try { return fs.statSync(path.join(String(dir), name)).isDirectory(); } catch { return false; }
      })();
      if (isDir) return true;
      return keepEntry(path.relative(process.cwd(), path.join(String(dir), name)));
    });
  };

  /*
   * **`git ls-files` の出力を包む。** 追跡ファイルの一覧を母集団にするゲート
   * (`lint:shell` / `lint:repo-size`) は `readdirSync` を通らないので、こちらが要る。
   */
  const cp = require('node:child_process');
  const isBroadLsFiles = (file, args) => {
    if (!/(^|[\\/])git(\.exe)?$/.test(String(file))) return false;
    if (!Array.isArray(args) || !args.includes('ls-files')) return false;
    return !args.includes('--'); // pathspec つきは「狙いを定めた問い合わせ」なので通す
  };
  const thin = (text) => {
    const sep = text.includes('\0') ? '\0' : '\n';
    return text
      .split(sep)
      .filter((rel) => rel.length === 0 || keepEntry(rel))
      .join(sep);
  };
  const realExecFile = cp.execFileSync;
  if (TARGET !== 'fs') cp.execFileSync = function auditPartialExecFileSync(file, args, opts) {
    const res = realExecFile.call(cp, file, args, opts);
    if (!isBroadLsFiles(file, args)) return res;
    if (typeof res === 'string') return thin(res);
    if (Buffer.isBuffer(res)) return Buffer.from(thin(res.toString('utf8')), 'utf8');
    return res;
  };
  const realExec = cp.execSync;
  if (TARGET !== 'fs') cp.execSync = function auditPartialExecSync(cmd, opts) {
    const res = realExec.call(cp, cmd, opts);
    const words = String(cmd).split(/\s+/);
    if (!isBroadLsFiles(words[0], words.slice(1))) return res;
    if (typeof res === 'string') return thin(res);
    if (Buffer.isBuffer(res)) return Buffer.from(thin(res.toString('utf8')), 'utf8');
    return res;
  };
  if (OUT) {
    process.on('exit', () => {
      // **プロセスごとに別のファイル** —— 1 つに書くと最後に終わった子が親を上書きする。
      try { fs.writeFileSync(path.join(OUT, `${process.pid}.json`), JSON.stringify(seen)); } catch { /* 報告できなくても答えは変えない */ }
    });
  }
})();
