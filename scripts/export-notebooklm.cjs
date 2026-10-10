/**
 * export-notebooklm.cjs — knowledge-vault を NotebookLM 取込用に再パッケージする。
 *
 *   node scripts/export-notebooklm.cjs            # → <os.tmpdir>/notebooklm-export/
 *   OUT_DIR=/path/to/dir node scripts/export-notebooklm.cjs
 *
 * 各ノートから Obsidian 定型（frontmatter / wikilink / ## 関連 / フッタ）を除去し、
 * 分野ごとに ~880KB 以下のパートへ連結する（NotebookLM の 1 ノートブック 50 ソース・
 * 1 ソース語数上限に収まる分割）。決定論: パス昇順・時刻/乱数不使用（ヘッダの基準日は
 * ノート由来の asOf ではなく「生成時点の知識セット」を示す固定文言のみ）。
 *
 * マスター記憶（開発史・組織・パターン）はセッションが手書きする 00 番として別管理 —
 * 本スクリプトは知識本文 01〜10 のみを再生成する。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const VAULT = path.join(ROOT, 'knowledge-vault');
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), 'notebooklm-export');
const MAX_PART = 880_000; // bytes/part

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function strip(md) {
  let s = md;
  s = s.replace(/^---\n[\s\S]*?\n---\n/, ''); // frontmatter
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1'); // wikilinks
  s = s.replace(/\n## 関連\n[\s\S]*$/, '\n'); // 関連セクション以降（フッタ含む）
  s = s.replace(/\n---\n\*この[^*]*\*\s*$/, '\n'); // 素のフッタ（関連なしのファイル用）
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 1 ファイルが MAX を超えるとき行単位で分割（MOC の巨大目録用）。 */
function splitOversized(text) {
  if (Buffer.byteLength(text) <= MAX_PART) return [text];
  const chunks = [];
  let buf = [];
  let size = 0;
  for (const ln of text.split('\n')) {
    const b = Buffer.byteLength(ln) + 1;
    if (size + b > MAX_PART && buf.length > 0) {
      chunks.push(buf.join('\n'));
      buf = [];
      size = 0;
    }
    buf.push(ln);
    size += b;
  }
  if (buf.length) chunks.push(buf.join('\n'));
  return chunks;
}

/** files を strip→連結し MAX_PART 以下のチャンク配列へ。 */
function chunkFiles(files) {
  const pieces = files.flatMap((f) => splitOversized(strip(fs.readFileSync(f, 'utf8'))));
  const chunks = [];
  let buf = [];
  let size = 0;
  for (const p of pieces) {
    const b = Buffer.byteLength(p) + 10;
    if (size + b > MAX_PART && buf.length > 0) {
      chunks.push(buf);
      buf = [];
      size = 0;
    }
    buf.push(p);
    size += b;
  }
  if (buf.length) chunks.push(buf);
  return chunks;
}

/**
 * 巻の定義。**ファイルの収集は分けてある** (`buildVolumes`)。
 *
 * `nn` / `slug` は書き出し名の頭になるので、読み込みだけで確定していないと
 * 「前回の書き出しだけを消す」判定 (`isOwnExport`) が vault を読まないと
 * できなくなる。表は 1 つ、使い道が 2 つ。
 */
const VOLUME_SPECS = [
  { nn: '01', slug: 'economics', label: '学術知識【経済学】', unit: '概念', dirs: ['notes/academic/economics'] },
  { nn: '02', slug: 'management', label: '学術知識【経営学】', unit: '概念', dirs: ['notes/academic/management'] },
  { nn: '03', slug: 'business-law', label: '学術知識【ビジネス法務】', unit: '概念', dirs: ['notes/academic/business-law'] },
  { nn: '04', slug: 'human-science', label: '学術知識【人間科学】', unit: '概念', dirs: ['notes/academic/human-science'] },
  { nn: '05', slug: 'information-sociology', label: '学術知識【情報社会学】', unit: '概念', dirs: ['notes/academic/information-sociology'] },
  { nn: '06', slug: 'compliance', label: '法令実務（税務・労務・法務）', unit: '項目', dirs: ['notes/compliance'] },
  { nn: '07', slug: 'subsidy-support', label: '補助金・助成金＋相談窓口', unit: '件', dirs: ['notes/subsidy', 'notes/support'] },
  { nn: '08', slug: 'econ-history', label: '経済史（バブル・恐慌・危機）', unit: '件', dirs: ['notes/econ-history'] },
  {
    nn: '09',
    slug: 'org-orchestration',
    label: 'AI組織・オーケストレーション',
    unit: 'ノート',
    extra: ['Organization.md', 'AI_ORCHESTRATION_CONTEXT.md'],
    dirs: ['org', 'methodology'],
  },
  { nn: '10', slug: 'catalog', label: '全知識目録（MOC）', unit: '目録', dirs: ['MOC'] },
];

/** 仕様表に vault の実ファイルを結び付ける (ここで初めてディスクを読む)。 */
function buildVolumes() {
  const N = (dir) => walk(path.join(VAULT, dir));
  return VOLUME_SPECS.map((v) => ({
    ...v,
    files: [...(v.extra ?? []).map((f) => path.join(VAULT, f)), ...v.dirs.flatMap(N)],
  }));
}

/** 巻とパートから書き出し名を決める。消す側と作る側で同じ関数を使う。 */
function exportFileName(v, i, partCount) {
  return partCount > 1 ? `${v.nn}-${v.slug}-p${i + 1}of${partCount}.md` : `${v.nn}-${v.slug}.md`;
}

/**
 * その名前は**この書き出しが作ったもの**か。
 *
 * 巻の頭 (`01-economics` など) と完全一致するか、そこに `-p<数>of<数>` が
 * 続く形だけを自分のものと見なす。`\d\d-.+\.md` のような形で判定すると、
 * 利用者が置いた `01-はじめに.md` まで自分のものに見えてしまう。
 */
function isOwnExport(name) {
  if (!name.endsWith('.md')) return false;
  const base = name.slice(0, -3);
  return VOLUME_SPECS.some((v) => {
    const head = `${v.nn}-${v.slug}`;
    if (base === head) return true;
    if (!base.startsWith(head)) return false;
    return /^-p\d+of\d+$/.test(base.slice(head.length));
  });
}

/**
 * 前回の書き出しだけを消す。**`rmSync(OUT, {recursive:true})` はしない。**
 *
 * 以前はここが `fs.rmSync(OUT, { recursive: true, force: true })` だった。
 * `OUT` は `OUT_DIR` 環境変数そのもので、冒頭の使い方が
 * `OUT_DIR=/path/to/dir` と**利用者に場所を指定させている**。書き出し先に
 * 関連資料を置いている人がそこを指すのは自然で、そのとき中身は
 * **警告も確認もなく丸ごと消えて、終了コードは 0** だった (2026-08-24 に実測。
 * 置いておいた原稿とサブディレクトリが消えることを確かめた)。
 *
 * 8 行隣の `build-knowledge-vault.cjs` は「**消す前に確かめる**」を既にやって
 * いる。データ由来の**名前**は定数だから安全、と以前の点検が結論したのは
 * 正しかったが、見ていたのは書く側で、**消す側の宛先**は誰も見ていなかった。
 *
 * 古いパート (`p1of3` → `p1of2` で余る) を残さないために消す必要はあるので、
 * **自分が作った名前だけ**消す。それ以外が 1 つでもあれば、何も消さずに断る。
 * ドットファイル (`.DS_Store` など) は数にも入れないし消さない。
 */
function clearPreviousExport(dir, listDir = fs.readdirSync, remove = fs.unlinkSync) {
  // 「在るか」を別に問わない。`existsSync` → `readdirSync` の二度読みは、
  // 間に消えた場合に例外へ落ちるうえ、読み取り側を差し替えても
  // **本物の fs を先に見てしまう**ので検査から隠れる。
  let entries;
  try {
    entries = listDir(dir, { withFileTypes: true });
  } catch (e) {
    if (e && e.code === 'ENOENT') return { removed: 0 };
    throw e;
  }
  const visible = entries.filter((e) => !e.name.startsWith('.'));
  const foreign = visible.filter((e) => !(e.isFile() && isOwnExport(e.name)));
  if (foreign.length > 0) {
    const names = foreign.slice(0, 5).map((e) => e.name + (e.isFile() ? '' : '/'));
    throw new Error(
      `書き出し先 ${dir} に、この書き出しが作ったものではないファイルが ${foreign.length} 件あります: `
        + `${names.join(', ')}${foreign.length > 5 ? ' …' : ''}\n`
        + '空のディレクトリか、前回の書き出し先を OUT_DIR に指定してください (中身は消しません)。',
    );
  }
  for (const e of visible) remove(path.join(dir, e.name));
  return { removed: visible.length };
}

function main() {
  const VOLUMES = buildVolumes();

  /*
   * 網羅の関門 (2026-08-22 に足した)。
   *
   * `VOLUME_SPECS` は学術 5 分野を**名指しで**並べている。分野が 1 つ増えても
   * ここに書き足さない限り、その分野は NotebookLM 用の書き出しから
   * **黙って丸ごと落ちる**。書き出しは週次のオートパイロットが回して
   * commit するので、落ちたことに気づく機会が無い。
   *
   * 一覧の側を直すのではなく、**取りこぼしを検出して落とす**。こうすると
   * 分野が増えたとき「VOLUME_SPECS に足してください」と名指しで言える。
   */
  {
    const allNotes = new Set(walk(path.join(VAULT, 'notes')));
    const covered = new Set(VOLUMES.flatMap((v) => v.files));
    const missed = [...allNotes].filter((f) => !covered.has(f));
    if (missed.length > 0) {
      console.error(
        `❌ どの巻にも入らないノートが ${missed.length} 件あります。`
          + ' VOLUME_SPECS に足してください:',
      );
      for (const m of missed.slice(0, 10)) console.error(`  - ${path.relative(VAULT, m)}`);
      if (missed.length > 10) console.error(`  …ほか ${missed.length - 10} 件`);
      return 1;
    }
  }

  let cleared;
  try {
    cleared = clearPreviousExport(OUT);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    return 1;
  }
  if (cleared.removed > 0) console.log(`前回の書き出し ${cleared.removed} 件を削除しました`);
  fs.mkdirSync(OUT, { recursive: true });

  let total = 0;
  let count = 0;
  for (const v of VOLUMES) {
    const chunks = chunkFiles(v.files);
    chunks.forEach((chunk, i) => {
      const partName = chunks.length > 1 ? `${v.label}（第${i + 1}部・全${chunks.length}部）` : v.label;
      const header =
        `# Service Hub 学習記憶 ${v.nn} — ${partName}\n\n` +
        `Service Hub（日本語ビジネスダッシュボード）が学習・検証済みの知識ベースの一部。` +
        `対象: ${v.label} ${v.files.length} ${v.unit}。全項目が確証ゲート` +
        `（出典 2 件以上・うち権威ある出典 1 件以上）を通過済み。\n\n---\n\n`;
      const body = header + chunk.join('\n\n---\n\n') + '\n';
      const fname = exportFileName(v, i, chunks.length);
      fs.writeFileSync(path.join(OUT, fname), body);
      total += Buffer.byteLength(body);
      count++;
      console.log(`${String(Buffer.byteLength(body)).padStart(8)} B  ${fname}`);
    });
  }
  console.log(`✅ NotebookLM エクスポート: ${count} ファイル / ${(total / 1024 / 1024).toFixed(1)} MB → ${OUT}`);
  return 0;
}

module.exports = { VOLUME_SPECS, isOwnExport, exportFileName, clearPreviousExport };

if (require.main === module) {
  process.exit(main());
}
