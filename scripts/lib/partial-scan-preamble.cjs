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
 * 環境変数:
 *   AUDIT_PARTIAL_MODE   'ext' | 'root' | 'keep'   落とし方
 *   AUDIT_PARTIAL_ARG    '.tsx' | 'scripts' | '50' 対象 (keep は残す百分率)
 *   AUDIT_PARTIAL_OUT    書き出す先 (kept / dropped / 群ごとの件数)
 *
 * **答えは終了コードで、この前置きは 1 度も終了コードに触らない。** 報告が書けなくても
 * ゲートの答えは変えない (書けなかったことは呼ぶ側が「落とせていない」として扱う)。
 */

(() => {
  const fs = require('node:fs');
  const path = require('node:path');
  const MODE = process.env.AUDIT_PARTIAL_MODE || '';
  const ARG = process.env.AUDIT_PARTIAL_ARG || '';
  const OUT = process.env.AUDIT_PARTIAL_OUT || '';
  if (!MODE) return;
  const seen = { mode: MODE, arg: ARG, kept: 0, dropped: 0, exts: {}, roots: {} };
  const realRead = fs.readdirSync;
  fs.readdirSync = function auditPartialReaddirSync(dir, opts) {
    const res = realRead.call(fs, dir, opts);
    if (!Array.isArray(res)) return res;
    return res.filter((e) => {
      const name = typeof e === 'string' ? e : e.name;
      const isDir = (() => {
        if (typeof e !== 'string') return typeof e.isDirectory === 'function' && e.isDirectory();
        try { return fs.statSync(path.join(String(dir), name)).isDirectory(); } catch { return false; }
      })();
      if (isDir) return true;
      const ext = path.extname(name) || '(拡張子なし)';
      const rel = path.relative(process.cwd(), path.join(String(dir), name));
      const root = rel.split(path.sep)[0] || '(直下)';
      let keep = true;
      if (MODE === 'ext') keep = ext !== ARG;
      else if (MODE === 'root') keep = root !== ARG;
      else if (MODE === 'keep') keep = ((seen.kept + seen.dropped) % 100) < Number(ARG);
      if (keep) {
        seen.kept += 1;
        seen.exts[ext] = (seen.exts[ext] || 0) + 1;
        seen.roots[root] = (seen.roots[root] || 0) + 1;
      } else {
        seen.dropped += 1;
      }
      return keep;
    });
  };
  if (OUT) {
    process.on('exit', () => {
      try { fs.writeFileSync(OUT, JSON.stringify(seen)); } catch { /* 報告できなくても答えは変えない */ }
    });
  }
})();
