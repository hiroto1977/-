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

const N = (dir) => walk(path.join(VAULT, dir));

const VOLUMES = [
  { nn: '01', slug: 'economics', label: '学術知識【経済学】', files: N('notes/academic/economics'), unit: '概念' },
  { nn: '02', slug: 'management', label: '学術知識【経営学】', files: N('notes/academic/management'), unit: '概念' },
  { nn: '03', slug: 'business-law', label: '学術知識【ビジネス法務】', files: N('notes/academic/business-law'), unit: '概念' },
  { nn: '04', slug: 'human-science', label: '学術知識【人間科学】', files: N('notes/academic/human-science'), unit: '概念' },
  { nn: '05', slug: 'information-sociology', label: '学術知識【情報社会学】', files: N('notes/academic/information-sociology'), unit: '概念' },
  { nn: '06', slug: 'compliance', label: '法令実務（税務・労務・法務）', files: N('notes/compliance'), unit: '項目' },
  { nn: '07', slug: 'subsidy-support', label: '補助金・助成金＋相談窓口', files: [...N('notes/subsidy'), ...N('notes/support')], unit: '件' },
  { nn: '08', slug: 'econ-history', label: '経済史（バブル・恐慌・危機）', files: N('notes/econ-history'), unit: '件' },
  {
    nn: '09',
    slug: 'org-orchestration',
    label: 'AI組織・オーケストレーション',
    files: [path.join(VAULT, 'Organization.md'), path.join(VAULT, 'AI_ORCHESTRATION_CONTEXT.md'), ...N('org'), ...N('methodology')],
    unit: 'ノート',
  },
  { nn: '10', slug: 'catalog', label: '全知識目録（MOC）', files: N('MOC'), unit: '目録' },
];

fs.rmSync(OUT, { recursive: true, force: true });
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
    const fname = chunks.length > 1 ? `${v.nn}-${v.slug}-p${i + 1}of${chunks.length}.md` : `${v.nn}-${v.slug}.md`;
    fs.writeFileSync(path.join(OUT, fname), body);
    total += Buffer.byteLength(body);
    count++;
    console.log(`${String(Buffer.byteLength(body)).padStart(8)} B  ${fname}`);
  });
}
console.log(`✅ NotebookLM エクスポート: ${count} ファイル / ${(total / 1024 / 1024).toFixed(1)} MB → ${OUT}`);
