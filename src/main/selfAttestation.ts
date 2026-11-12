/**
 * **起動時の自己検算** —— 梱包した実物が、組んだときの物と 1 byte も違わないことを、窓を作る前に確かめる
 * (2026-10-29 · パス 553 · threat: T-218)。
 *
 * ## なぜ要るか (癌細胞の比喩で言えば「DNA 修復機構」)
 *
 * 正常な細胞は分裂の前に自分の DNA を検算し、直せない損傷が在れば自死する。癌細胞はその検算を失った細胞で、
 * 壊れたまま増える。マルウェアが「正規のアプリに擬態する」最も安い道は、**インストール先のファイルを書き換える**
 * ことである (`app.asar` の中の `main.js` に 1 行足せば、署名の無い Linux の AppImage / deb では誰も気付かない)。
 *
 * 出荷設定の fuse (`electron-builder.json`) が持つのは `onlyLoadAppFromAsar` —— `app.asar` を消して
 * `resources/app/` に別のコードを置く形を塞ぐ (T-166) —— だけで、Electron 自身の asar のハッシュ照合
 * (`enableEmbeddedAsarIntegrityValidation`) は**意図して未設定**である (T-166 の判断: electron-builder は
 * macOS / Windows だけ値を実行ファイルへ埋め、署名と対で効く —— この環境では効きも壊れ方も測れない)。
 *
 * そして **Linux ではその fuse は何も照合しない** (実測 2026-10-29: fuse を true にして
 * `electron-builder --linux dir` で組んだ物は、`app.asar` を書き換えても起動して UI を出す —— Electron の
 * asar integrity は macOS の Info.plist / Windows のリソースにしか埋められない)。Linux のインストーラは
 * 署名も持たないので、**このファイルが Linux における唯一の自己検算**になる。macOS / Windows で署名つきの
 * 梱包を測れる日が来れば、fuse はこの検算の 1 段目として重なる (別の算法・別の置き場)。
 *
 * ## 何をするか
 *
 * ビルドが `scripts/build-integrity-manifest.cjs` で **出荷する全ファイル (package.json を除く —— 下) の sha256** を
 * `dist-electron/integrity.json` に書く (manifest)。梱包版の主プロセスは `app.whenReady()` の**窓を作る前**に {@link verifyShippedFiles} で
 * ① manifest が読めて形が正しい ② 出荷物の全ファイルが manifest に在り、manifest の全ファイルが出荷物に在る
 * (**両方向** —— 足された物も消された物も鳴る・容器の根に表の外の物が無い) ③ 1 つずつの sha256 が一致する
 * ④ manifest の root が一致する、を確かめ、**1 つでも外れれば起動しない** (`main.ts` が `dialog.showErrorBox` → `app.exit(1)`)。
 *
 * ## 限界を正直に書く
 *
 * manifest は出荷物と**同じ容器** (`app.asar`) に居る。asar を丸ごと書き換えられる相手は manifest も書き換えられる
 * ので、これが止めるのは ① 部分的な破損・差し替え (出荷物のファイルを触る・足す形 —— 実際の改竄の大半) ②
 * manifest の存在を知らない相手、である。**容器ごと差し替える相手を止めるのは OS の署名** (macOS の公証 /
 * Windows の Authenticode · `release.yml` の `CSC_LINK`) と fuse の asar integrity で、Linux にはそれが無い ——
 * だからこの検算を「Linux は守られている」と読んではいけない。
 *
 * ★ **入口の構造上の穴 (2026-10-30 · パス 566 · 赤対青の演習の M1 / S2 で測った)**: この検算は `main.js` の
 *   中に在るので、**入口そのものをすげ替えられると走らない**。塞いだのは 2 つ —— ① 同梱できる根の
 *   ディレクトリ (`build/` を含む) を実行時に**丸ごと歩く** ({@link listFilesUnderRoots}) ので、`build/evil.js`
 *   のような「許された根の中へ足した物」は `file-unlisted` で鳴る (以前は根の名前 `build` だけ許して中は
 *   見ていなかった)。② package.json の `main` が {@link ENTRY_POINT} ちょうどであることを確かめる
 *   (`bad-entry-point`) ので、`main` を別の既存の出荷物へすげ替える形は鳴る。**残る穴**: `main` を
 *   新しいファイルへ向け、そのファイルを実際の入口にする相手は、`main.js` (= この検算) を走らせないので
 *   止められない —— それは「入口を入口の中から検める」ことが構造上できないため。だから正しいのは
 *   「Linux は、入口の `main.js` が走る限り、出荷物への 1〜複数ファイルの改竄・追加・入口のすげ替えに気付く」。
 *
 * ## 契約
 *
 * - 梱包版 (`app.isPackaged`) だけで走る。開発中 (`electron .`) は dist が変わるたびに manifest が古びるので走らせない
 *   (`main.ts` の配線が決める —— ここは純関数)。
 * - **読めない = 通さない** (fail closed): manifest が無い・読めない・形が違う・大きすぎる・ファイルが多すぎる、は
 *   どれも「安全」ではなく断る理由。
 * - 断りの文は**ファイルの道と理由だけ**を言う。中身・ハッシュ・推測は言わない (読んだ人が直せる最小の情報)。
 * - 読みは `fs.stat` で大きさを見てから (`MAX_SHIPPED_FILE_BYTES`) —— 出荷物に 16 MiB を超えるファイルは無い
 *   (CI の単一 HTML の天井と同じ数)。超えていれば読まずに断る。
 * - 算法は `scripts/build-integrity-manifest.cjs` と**同じ 1 つ** (`.cjs` は `.ts` を require できないので写し)。
 *   同じ標本で 1 字も違わないことは `selfAttestationParity.test.ts` が留める (法則 `copy-pinned-by-parity`)。
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

/** manifest の置き場 (アプリの根からの相対)。出荷物の歩きからは**この 1 つだけ**を外す。 */
export const MANIFEST_FILE = 'dist-electron/integrity.json';
/**
 * 出荷物の入口 (package.json の `main`)。梱包版の package.json はこれを指し、この検算はこの main.js の中に在る
 * (2026-10-30 · パス 566 · threat: T-228)。package.json は manifest に載せられない (builder が
 * 梱包時に書き換える) が、`main` が**この値ちょうど**であることは確かめられる —— `main` を別の既存の出荷物へ
 * すげ替える 2 ファイル改竄を断る。限界は docblock 参照 (入口を入口の中から検める構造上の穴)。
 */
export const ENTRY_POINT = 'dist-electron/main.js';
/** manifest の形の版。形を変えたら上げる (古い版は「読めない」として断る)。 */
export const MANIFEST_VERSION = 1;
/** ハッシュの算法 (Node の `createHash` の名前)。 */
export const HASH_ALGORITHM = 'sha256';
/** 出荷物の根 (再帰で歩く)。`electron-builder.json` の `files` と同じ 2 つ。 */
export const SHIPPED_DIRS: readonly string[] = ['dist', 'dist-electron'];
/**
 * 出荷物の単独のファイル。`electron-builder.json` の `files` は `package.json` も挙げるが、**表には載せない** ——
 * electron-builder は梱包時に package.json を書き換える (scripts / devDependencies を落とした 503 byte の物を入れる ·
 * 実測 2026-10-29: 木の 12,941 byte と一致せず、梱包版が `hash-mismatch: package.json` で止まった)。
 * package.json が決めるのは `main` (= この検算を持つ `dist-electron/main.js`) で、そこを差し替えられた時点でこの検算は
 * 走らない —— 容器の中から容器の入口を検めることは構造上できない (docblock の「限界」)。根の一覧には居てよい。
 */
export const SHIPPED_FILES: readonly string[] = ['build/icon.png'];
/**
 * 容器 (app.asar) の根に居てよい物。これ以外が根に在れば断る —— 表に載らない場所へ置いた物も「同梱できない」。
 * `electron-builder.json` は `!node_modules/**` で依存を外している (主プロセスも preload も node の組み込みと
 * `electron` しか require しない —— `selfAttestationWiring.test.ts` が束を読んで留める)。
 */
export const ALLOWED_ROOT_ENTRIES: readonly string[] = ['build', 'dist', 'dist-electron', 'package.json'];
/** 1 ファイルの大きさの天井 (byte)。超えていれば読まずに断る。 */
export const MAX_SHIPPED_FILE_BYTES = 16 * 1024 * 1024;
/** manifest そのものの天井 (byte)。出荷物は 10 件台なので 1 MiB は 1 万件分の余裕。 */
export const MAX_MANIFEST_BYTES = 1024 * 1024;
/** 出荷物の件数の天井。歩きが暴走しない床 (asar に 1 万件が入る形は出荷の形ではない)。 */
export const MAX_SHIPPED_FILES = 10_000;

export interface IntegrityManifest {
  readonly version: number;
  readonly algorithm: string;
  /** アプリの根からの相対パス (posix の `/`) → 16 進の sha256。鍵は昇順。 */
  readonly files: Readonly<Record<string, string>>;
  /** `files` を正規化して繋いだ物の sha256 ({@link manifestRoot})。 */
  readonly root: string;
}

/** 検算が使う最小のファイル API (Electron の asar も Node の `fs/promises` もこの形を持つ)。 */
export interface AttestationFs {
  readFile(p: string): Promise<Uint8Array>;
  stat(p: string): Promise<{ readonly size: number; isFile(): boolean; isDirectory(): boolean }>;
  readdir(p: string): Promise<string[]>;
}

export type AttestationReason =
  | 'manifest-missing'
  | 'manifest-too-large'
  | 'manifest-malformed'
  | 'file-missing'
  | 'file-unlisted'
  | 'file-too-large'
  | 'too-many-files'
  | 'hash-mismatch'
  | 'bad-entry-point'
  | 'unreadable';

export type AttestationVerdict =
  | { readonly ok: true; readonly checked: number; readonly root: string }
  | { readonly ok: false; readonly reason: AttestationReason; readonly detail: string };

const HEX_SHA256 = /^[0-9a-f]{64}$/;
/** manifest の鍵に許す綴り (posix の相対パス・`..` と先頭の `/` は形で落ちる)。 */
const SAFE_REL_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_.-]+)*$/;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash(HASH_ALGORITHM).update(bytes).digest('hex');
}

/** `files` の root: 鍵を昇順に並べ `path\nhash\n` で繋いだ文字列の sha256。 */
export function manifestRoot(files: Readonly<Record<string, string>>): string {
  const lines = Object.keys(files)
    .sort()
    .map((p) => `${p}\n${files[p]}\n`)
    .join('');
  return sha256Hex(new TextEncoder().encode(lines));
}

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}

/**
 * 出荷物の全ファイルを歩き、根からの相対パス (posix・昇順) を返す。manifest 自身は外す。
 * 根が無ければその根は空 (ビルド前の木でも歩ける —— 無いことは manifest との突き合わせで鳴る)。
 */
export async function listShippedFiles(appRoot: string, fs: AttestationFs): Promise<string[]> {
  const out: string[] = [];
  for (const d of SHIPPED_DIRS) {
    const abs = path.join(appRoot, d);
    if (await exists(fs, abs)) await walkFiles(abs, appRoot, fs, out);
  }
  for (const f of SHIPPED_FILES) {
    if (await exists(fs, path.join(appRoot, f))) out.push(f);
  }
  return out.filter((p) => p !== MANIFEST_FILE).sort();
}

/**
 * **実行時**に、同梱できる根 (`ALLOWED_ROOT_ENTRIES`) の**ディレクトリを丸ごと**歩いて全ファイルを返す
 * (2026-10-30 · パス 566 · threat: T-228)。
 *
 * ★ `listShippedFiles` (ビルドが manifest を組むのに使う) は electron-builder の `files` の glob を**写して**
 *   `build/icon.png` だけを明示で足す —— ビルド時の木 (repo) の `build/` には `icon.svg` も居るが、梱包物
 *   (asar) には `build/icon.png` しか入らないので、`build/` を丸ごと歩くと manifest に icon.svg が入って
 *   梱包版が `file-missing` で止まる。だからビルド側は明示のままにする。
 *
 * ★ ところがその明示のせいで、**`build/` の中へ置かれた物は検算に 1 度も見られなかった** (根の一覧は
 *   `build` を許すが、中は歩かない)。梱包物では `build/` に `icon.png` しか居ないので、歩いて見つかる物は
 *   すべて manifest に在るはず —— 1 つでも無ければ (`build/evil.js` を足すなど) tamper である。
 *   実行時はこの全歩きで「同梱できる根の下に、manifest に無いファイルは 1 つも無い」を確かめる。
 */
export async function listFilesUnderRoots(appRoot: string, fs: AttestationFs): Promise<string[]> {
  const out: string[] = [];
  for (const entry of ALLOWED_ROOT_ENTRIES) {
    const abs = path.join(appRoot, entry);
    if (!(await exists(fs, abs))) continue;
    const st = await fs.stat(abs);
    // 根に居てよい**ファイル** (package.json) は manifest に載らない (builder が書き換える) ので歩かない ——
    // その代わり `main` の値だけを verifyShippedFiles が別に検める。ディレクトリだけを丸ごと歩く。
    if (st.isDirectory()) await walkFiles(abs, appRoot, fs, out);
  }
  return out.filter((p) => p !== MANIFEST_FILE).sort();
}

/** 1 つのディレクトリを再帰で歩き、ファイルの相対パス (posix) を `out` に積む。件数の天井で暴走を止める。 */
async function walkFiles(dir: string, appRoot: string, fs: AttestationFs, out: string[]): Promise<void> {
  // 歩く順は呼び手の `.sort()` が決めるので、ここでは並べない (並べても答えは変わらない —— 等価の形は持たない)
  for (const name of await fs.readdir(dir)) {
    const abs = path.join(dir, name);
    const st = await fs.stat(abs);
    if (st.isDirectory()) {
      await walkFiles(abs, appRoot, fs, out);
    } else if (st.isFile()) {
      out.push(toPosix(path.relative(appRoot, abs)));
      if (out.length > MAX_SHIPPED_FILES) throw new TooManyFilesError();
    }
  }
}

class TooManyFilesError extends Error {}

function exists(fs: AttestationFs, abs: string): Promise<boolean> {
  const present = fs.stat(abs).then(() => true);
  // Stryker disable next-line ArrowFunction: 無い根は偽 —— undefined も偽で、呼び手は if で読む (等価)
  return present.catch(() => false);
}

/** 大きさを見てから読んでハッシュする。天井を超えていれば読まない。 */
export async function hashShippedFile(abs: string, fs: AttestationFs): Promise<{ hash: string } | { tooLarge: number }> {
  const st = await fs.stat(abs);
  if (st.size > MAX_SHIPPED_FILE_BYTES) return { tooLarge: st.size };
  return { hash: sha256Hex(await fs.readFile(abs)) };
}

/** ビルドが書く manifest を組む (出荷物を歩いて 1 つずつハッシュ)。天井を超えるファイルが在れば投げる。 */
export async function buildManifest(appRoot: string, fs: AttestationFs): Promise<IntegrityManifest> {
  const files: Record<string, string> = {};
  for (const rel of await listShippedFiles(appRoot, fs)) {
    const r = await hashShippedFile(path.join(appRoot, rel), fs);
    if ('tooLarge' in r) throw new Error(`${rel} は ${r.tooLarge} byte で天井 ${MAX_SHIPPED_FILE_BYTES} を超えている`);
    files[rel] = r.hash;
  }
  return { version: MANIFEST_VERSION, algorithm: HASH_ALGORITHM, files, root: manifestRoot(files) };
}

/** manifest の文字列表現 (鍵を昇順・2 空白・末尾改行)。`.cjs` の書き手と 1 字も違わない形。 */
export function serializeManifest(m: IntegrityManifest): string {
  const files: Record<string, string> = {};
  for (const k of Object.keys(m.files).sort()) files[k] = m.files[k]!;
  return `${JSON.stringify({ version: m.version, algorithm: m.algorithm, files, root: m.root }, null, 2)}\n`;
}

/** 鍵を数え上げてよい物か (null でも配列でもないオブジェクト)。 */
function isRecord(v: unknown): v is Record<string, unknown> {
  if (v === null || Array.isArray(v)) return false;
  // Stryker disable next-line ConditionalExpression: 原始値の property 読みは undefined で、次の門が同じ null を返す —— 型の絞り込みのためだけに在る (等価)
  return typeof v === 'object';
}

/** manifest の文字列を読む。形が 1 つでも違えば `null` (版・算法・鍵の綴り・16 進・root の一致)。 */
export function parseManifest(text: string): IntegrityManifest | null {
  let v: unknown;
  // Stryker disable next-line BlockStatement: 投げた (読めない) 後の器は undefined のままで、次の門が同じ null を返す (等価)
  try { v = JSON.parse(text); } catch { return null; }
  if (!isRecord(v)) return null;
  if (v.version !== MANIFEST_VERSION || v.algorithm !== HASH_ALGORITHM) return null;
  const rawFiles = v.files;
  if (!isRecord(rawFiles)) return null;
  const files: Record<string, string> = {};
  for (const k of Object.keys(rawFiles)) {
    const h = rawFiles[k];
    if (!SAFE_REL_PATH.test(k) || typeof h !== 'string' || !HEX_SHA256.test(h)) return null;
    files[k] = h;
  }
  // root は厳密な不等号で比べる (文字列でない root は文字列と等しくなれないので、型の門は要らない)
  const root = manifestRoot(files);
  if (v.root !== root) return null;
  return { version: MANIFEST_VERSION, algorithm: HASH_ALGORITHM, files, root };
}

/**
 * 出荷物を manifest と突き合わせる。**どの失敗も `ok: false`** で、理由と道だけを返す。
 * 順序: manifest を読む → 出荷物を歩く → 両方向の差 → 1 つずつのハッシュ。先に当たった 1 件で止まる。
 */
export async function verifyShippedFiles(appRoot: string, fs: AttestationFs): Promise<AttestationVerdict> {
  const manifestAbs = path.join(appRoot, MANIFEST_FILE);
  let manifest: IntegrityManifest | null;
  try {
    const st = await fs.stat(manifestAbs);
    if (st.size > MAX_MANIFEST_BYTES) return { ok: false, reason: 'manifest-too-large', detail: MANIFEST_FILE };
    manifest = parseManifest(new TextDecoder().decode(await fs.readFile(manifestAbs)));
  } catch {
    return { ok: false, reason: 'manifest-missing', detail: MANIFEST_FILE };
  }
  if (manifest === null) return { ok: false, reason: 'manifest-malformed', detail: MANIFEST_FILE };

  let rootEntries: string[];
  try {
    rootEntries = await fs.readdir(appRoot);
  } catch {
    return { ok: false, reason: 'unreadable', detail: '.' };
  }
  const allowedRoot = new Set(ALLOWED_ROOT_ENTRIES);
  for (const name of [...rootEntries].sort()) {
    if (!allowedRoot.has(name)) return { ok: false, reason: 'file-unlisted', detail: name };
  }

  // 入口 (package.json の `main`) が、この検算を持つ main.js を指しているか (threat: T-228 の S2)。
  // package.json は manifest に載らない (builder が書き換える) ので、`main` の値だけをここで検める ——
  // `main` を別の既存の出荷物へすげ替える 2 ファイル改竄を断る。入口を新しいファイルへ向けて
  // そこを実際の入口にする相手はこの検算を走らせないので止められない (docblock の構造上の限界)。
  try {
    const pkgAbs = path.join(appRoot, 'package.json');
    const st = await fs.stat(pkgAbs);
    if (st.size > MAX_MANIFEST_BYTES) return { ok: false, reason: 'bad-entry-point', detail: 'package.json' };
    const pkg: unknown = JSON.parse(new TextDecoder().decode(await fs.readFile(pkgAbs)));
    const main = isRecord(pkg) ? pkg.main : undefined;
    if (main !== ENTRY_POINT) return { ok: false, reason: 'bad-entry-point', detail: 'package.json' };
  } catch {
    return { ok: false, reason: 'bad-entry-point', detail: 'package.json' };
  }

  let actual: string[];
  try {
    // 実行時は同梱できる根のディレクトリを**丸ごと**歩く (build/ の中も) —— manifest に無い物は tamper。
    actual = await listFilesUnderRoots(appRoot, fs);
  } catch (e) {
    return e instanceof TooManyFilesError
      ? { ok: false, reason: 'too-many-files', detail: String(MAX_SHIPPED_FILES) }
      : { ok: false, reason: 'unreadable', detail: SHIPPED_DIRS.join(', ') };
  }
  const listed = new Set(Object.keys(manifest.files));
  for (const rel of actual) {
    if (!listed.has(rel)) return { ok: false, reason: 'file-unlisted', detail: rel };
  }
  const present = new Set(actual);
  for (const rel of listed) {
    if (!present.has(rel)) return { ok: false, reason: 'file-missing', detail: rel };
  }
  for (const rel of actual) {
    let r: Awaited<ReturnType<typeof hashShippedFile>>;
    try {
      r = await hashShippedFile(path.join(appRoot, rel), fs);
    } catch {
      return { ok: false, reason: 'unreadable', detail: rel };
    }
    if ('tooLarge' in r) return { ok: false, reason: 'file-too-large', detail: rel };
    if (r.hash !== manifest.files[rel]) return { ok: false, reason: 'hash-mismatch', detail: rel };
  }
  return { ok: true, checked: actual.length, root: manifest.root };
}

const REASON_TEXT: Readonly<Record<AttestationReason, string>> = {
  'manifest-missing': '検算表が見つからないか読めません',
  'manifest-too-large': '検算表が大きすぎます',
  'manifest-malformed': '検算表の形が正しくありません',
  'file-missing': '検算表に在るファイルが見つかりません',
  'file-unlisted': '検算表に無いファイルが同梱されています',
  'file-too-large': 'ファイルが大きすぎて検算できません',
  'too-many-files': '同梱されたファイルが多すぎます',
  'hash-mismatch': 'ファイルの中身が組んだときと違います',
  'bad-entry-point': 'アプリの入口 (package.json の main) が組んだときと違います',
  unreadable: 'ファイルを読めません',
};

/** 利用者へ出す文。理由と道だけ (中身・ハッシュ・推測は言わない)。直す手は 1 つ: 配布元から入れ直す。 */
export function attestationMessage(v: Extract<AttestationVerdict, { ok: false }>): string {
  return `アプリのファイルが組んだときと違うため、安全のため起動しません。\n理由: ${REASON_TEXT[v.reason]} (${v.detail})\n配布元からインストールし直してください。`;
}
