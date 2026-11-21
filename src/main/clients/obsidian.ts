import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FetchContext } from './types';

/**
 * Obsidian — ローカル知識ベース (Vault) の可視化 (Phase 6 で live 化)。
 *
 * Obsidian の Vault はローカルの Markdown ファイル群であり、クラウド API を
 * 持たない。本サービスは Electron main プロセスで実 Vault を読み取り専用で
 * 集計する:
 *
 * - Vault の特定: Obsidian 自身の設定 (`obsidian.json`) に登録された Vault
 *   一覧から、開いている物 (無ければ最近使った物) を選ぶ。設定が無い /
 *   フォルダが実在しない場合は「未検出」として正直に返す。
 * - 集計: `.md` ノートの数・語数 (空白区切りのトークン数)・タグ
 *   (frontmatter と本文の `#tag`)・内部リンク (`[[...]]`) の件数、最近のノート。
 * - Git: `.git/config` の origin を読み、連携の有無と最終 fetch 時刻を出す
 *   (サブプロセスは起動しない — リポジトリの不変条件)。
 * - 暗号化: git-crypt の痕跡があれば「検出」。無ければ「検出されず」と言い、
 *   OS のディスク暗号化までは主張しない。
 *
 * 値の整形 ({@link buildObsidianSnapshot}) と文字列の解析 (設定 / frontmatter /
 * タグ / リンク) は純関数として分離し、fs 依存の読み取り
 * ({@link readObsidianVault}) は薄く保つ。ブラウザ単体ビルドには本クライアント
 * はバンドルされず、web-shim が `not_implemented` を返す (linux と同じ扱い)。
 * セットアップ手順は docs/OBSIDIAN_DOCKER_SETUP.md を参照。
 */

export interface ObsidianNote {
  readonly id: string;
  readonly title: string;
  readonly folder: string;
  readonly tags: ReadonlyArray<string>;
  readonly updatedIso: string;
  readonly words: number;
}

export interface ObsidianSecurityCheck {
  readonly id: string;
  readonly item: string;
  /** ok = 達成 / warn = 要注意 / action = 要対応 */
  readonly status: 'ok' | 'warn' | 'action';
  readonly detail: string;
}

export interface ObsidianWorkflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** スクリプト/プラグインで自動化済みか (業務効率化の仕組み化) */
  readonly automated: boolean;
}

export interface ObsidianSnapshot {
  readonly vault: {
    readonly name: string;
    readonly path: string;
    readonly noteCount: number;
    readonly totalWords: number;
    /** Vault をバックアップする GitHub リモート (空文字 = 未連携) */
    readonly gitRemote: string;
    readonly lastSyncIso: string;
    /** Vault が保存時に暗号化されているか */
    readonly encrypted: boolean;
  };
  readonly notes: ReadonlyArray<ObsidianNote>;
  readonly security: ReadonlyArray<ObsidianSecurityCheck>;
  readonly workflows: ReadonlyArray<ObsidianWorkflow>;
}

/** obsidian.json の 1 Vault 分の登録情報。 */
export interface VaultCandidate {
  readonly path: string;
  readonly ts: number;
  readonly open: boolean;
}

/** 読み取り済みノート 1 件分。 */
export interface RawNoteReading {
  readonly relPath: string;
  readonly title: string;
  readonly folder: string;
  readonly tags: readonly string[];
  readonly updatedIso: string;
  readonly words: number;
  readonly links: number;
}

/** buildObsidianSnapshot への入力 (すべて読み取り済みの生データ)。 */
export interface RawObsidianReadings {
  readonly found: boolean;
  readonly vaultName: string;
  readonly vaultPath: string;
  readonly notes: readonly RawNoteReading[];
  /** 走査上限で一部のノートの集計を打ち切ったか。 */
  readonly truncated: boolean;
  readonly hasGit: boolean;
  /** origin の URL (資格情報は除去済み)。無ければ空文字。 */
  readonly gitRemote: string;
  /** 最終 fetch の時刻 (FETCH_HEAD の mtime)。分からなければ空文字。 */
  readonly lastSyncIso: string;
  readonly gitCrypt: boolean;
  readonly hasDotObsidian: boolean;
  readonly dailyNotesEnabled: boolean;
  readonly templatesEnabled: boolean;
  readonly gitPluginEnabled: boolean;
}

/** 最近のノートとして表示する件数。 */
export const RECENT_NOTES_N = 10;

/** obsidian.json の本文から Vault 候補を取り出す (純粋)。壊れた JSON は空。 */
export function parseObsidianConfig(text: string): VaultCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const vaults = (parsed as { vaults?: unknown } | null)?.vaults;
  if (vaults === null || typeof vaults !== 'object') return [];
  const out: VaultCandidate[] = [];
  for (const v of Object.values(vaults as Record<string, unknown>)) {
    if (v === null || typeof v !== 'object') continue;
    const rec = v as { path?: unknown; ts?: unknown; open?: unknown };
    if (typeof rec.path !== 'string' || rec.path === '') continue;
    out.push({
      path: rec.path,
      ts: typeof rec.ts === 'number' && Number.isFinite(rec.ts) ? rec.ts : 0,
      open: rec.open === true,
    });
  }
  return out;
}

/** 候補から対象 Vault を 1 つ選ぶ: 開いている物 → 最近使った物 → 先頭 (純粋)。 */
export function chooseVault(candidates: readonly VaultCandidate[]): VaultCandidate | null {
  if (candidates.length === 0) return null;
  const open = candidates.find((c) => c.open);
  if (open !== undefined) return open;
  return candidates.reduce((a, b) => (b.ts > a.ts ? b : a));
}

/** `.git/config` の本文から origin の URL を取り出す (純粋)。 */
export function parseGitRemote(configText: string): string {
  const section = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(configText);
  if (section === null) return '';
  const url = /^\s*url\s*=\s*(\S+)\s*$/m.exec(section[1] ?? '');
  return url === null ? '' : (url[1] ?? '');
}

/** リモート URL から資格情報 (userinfo) を除く (純粋)。表示に資格情報を出さない。 */
export function redactRemoteUrl(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@]+@/, '$1');
}

/** コードフェンスを取り除く (タグ・リンク・語数の集計対象から外す)。 */
function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, ' ');
}

/** frontmatter の `tags` を取り出す (純粋)。対応形式: 配列 / カンマ区切り / リスト。 */
export function parseFrontmatterTags(text: string): string[] {
  if (!text.startsWith('---')) return [];
  const end = text.indexOf('\n---', 3);
  if (end < 0) return [];
  const block = text.slice(3, end);
  const tags: string[] = [];
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = /^\s*tags\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const rest = (m[1] ?? '').trim();
    if (rest.startsWith('[')) {
      for (const part of rest.replace(/^\[|\]$/g, '').split(',')) {
        const t = part.trim().replace(/^["']|["']$/g, '');
        if (t !== '') tags.push(t);
      }
    } else if (rest !== '') {
      for (const part of rest.split(',')) {
        const t = part.trim();
        if (t !== '') tags.push(t);
      }
    } else {
      // `tags:` の後に続く `- item` 行を読む
      for (let j = i + 1; j < lines.length; j += 1) {
        const item = /^\s*-\s+(.+)$/.exec(lines[j] ?? '');
        if (item === null) break;
        tags.push((item[1] ?? '').trim());
      }
    }
  }
  return tags;
}

/** 本文中の `#tag` を取り出す (純粋)。見出し (`# ` / `##`) はタグではない。 */
export function extractInlineTags(text: string): string[] {
  const out: string[] = [];
  for (const m of stripCodeFences(text).matchAll(/(?:^|\s)#([^\s#]+)/g)) {
    const tag = (m[1] ?? '').replace(/[.,、。）)」』]+$/u, '');
    if (tag !== '') out.push(tag);
  }
  return out;
}

/** 内部リンク `[[...]]` の件数 (純粋)。 */
export function countWikiLinks(text: string): number {
  return (stripCodeFences(text).match(/\[\[[^\]]+\]\]/g) ?? []).length;
}

/** 語数 = 空白区切りのトークン数 (純粋)。コードフェンス内は数えない。 */
export function countWords(text: string): number {
  return stripCodeFences(text)
    .split(/\s+/)
    .filter((t) => t !== '').length;
}

/** ノート 1 件分の集計 (純粋)。 */
export function summarizeNote(relPath: string, content: string, updatedIso: string): RawNoteReading {
  const segments = relPath.split('/');
  const file = segments[segments.length - 1] ?? relPath;
  const tags = [...new Set([...parseFrontmatterTags(content), ...extractInlineTags(content)])];
  return {
    relPath,
    title: file.replace(/\.md$/i, ''),
    folder: segments.slice(0, -1).join('/'),
    tags,
    updatedIso,
    words: countWords(content),
    links: countWikiLinks(content),
  };
}

/** 生の読み取り値から表示用スナップショットを組み立てる (純粋・決定論的)。 */
export function buildObsidianSnapshot(r: RawObsidianReadings): ObsidianSnapshot {
  if (!r.found) {
    return {
      vault: {
        name: '未検出',
        path: '',
        noteCount: 0,
        totalWords: 0,
        gitRemote: '',
        lastSyncIso: '',
        encrypted: false,
      },
      notes: [],
      security: [
        {
          id: 'vault-missing',
          item: 'Vault が見つかりません',
          status: 'action',
          detail:
            'Obsidian の設定 (obsidian.json) が無いか、登録された Vault のフォルダが存在しません。Obsidian で Vault を開くと検出できます',
        },
      ],
      workflows: [],
    };
  }

  const totalWords = r.notes.reduce((sum, n) => sum + n.words, 0);
  const totalLinks = r.notes.reduce((sum, n) => sum + n.links, 0);
  const recent = [...r.notes]
    .sort((a, b) =>
      a.updatedIso === b.updatedIso
        ? a.relPath < b.relPath
          ? -1
          : 1
        : a.updatedIso < b.updatedIso
          ? 1
          : -1,
    )
    .slice(0, RECENT_NOTES_N)
    .map((n) => ({
      id: n.relPath,
      title: n.title,
      folder: n.folder,
      tags: n.tags,
      updatedIso: n.updatedIso,
      words: n.words,
    }));

  const security: ObsidianSecurityCheck[] = [];
  if (r.gitRemote !== '') {
    security.push({
      id: 'git-remote',
      item: 'Vault を Git でバージョン管理',
      status: 'ok',
      detail: `リモート: ${r.gitRemote}`,
    });
  } else if (r.hasGit) {
    security.push({
      id: 'git-remote',
      item: 'Vault を Git でバージョン管理',
      status: 'warn',
      detail: 'Git 管理はされていますが、リモートが設定されていません (バックアップ先なし)',
    });
  } else {
    security.push({
      id: 'git-remote',
      item: 'Vault を Git でバージョン管理',
      status: 'action',
      detail: 'Git で管理されていません。バックアップと履歴のために Git 管理を推奨します',
    });
  }
  security.push(
    r.gitCrypt
      ? {
          id: 'encryption',
          item: '保存時の暗号化',
          status: 'ok' as const,
          detail: 'git-crypt による暗号化が検出されました',
        }
      : {
          id: 'encryption',
          item: '保存時の暗号化',
          status: 'warn' as const,
          detail:
            'git-crypt 等の暗号化は検出されませんでした。ディスク暗号化の有無は OS の設定を確認してください',
        },
  );
  security.push(
    r.hasDotObsidian
      ? {
          id: 'vault-config',
          item: 'Vault の構成',
          status: 'ok' as const,
          detail: `.obsidian 設定フォルダを確認しました (内部リンク ${totalLinks} 件)`,
        }
      : {
          id: 'vault-config',
          item: 'Vault の構成',
          status: 'warn' as const,
          detail: '.obsidian フォルダが見つかりません。Obsidian で開いたことのある Vault か確認してください',
        },
  );
  if (r.truncated) {
    security.push({
      id: 'scan-cap',
      item: '集計の範囲',
      status: 'warn',
      detail: 'ノート数が走査上限を超えたため、語数・タグ・リンクの集計は一部のノート分です',
    });
  }

  const workflows: ObsidianWorkflow[] = [
    {
      id: 'daily-notes',
      name: 'デイリーノート',
      description: r.dailyNotesEnabled
        ? 'コアプラグイン「daily-notes」が有効です'
        : 'コアプラグイン「daily-notes」は無効です',
      automated: r.dailyNotesEnabled,
    },
    {
      id: 'templates',
      name: 'テンプレート',
      description: r.templatesEnabled
        ? 'コアプラグイン「templates」が有効です'
        : 'コアプラグイン「templates」は無効です',
      automated: r.templatesEnabled,
    },
    {
      id: 'git-sync',
      name: 'Git 同期 (obsidian-git)',
      description: !r.gitPluginEnabled
        ? 'obsidian-git プラグインは検出されませんでした'
        : r.gitRemote !== ''
          ? 'obsidian-git プラグインとリモートが確認できました'
          : 'obsidian-git プラグインはありますが、リモートが未設定です',
      automated: r.gitPluginEnabled && r.gitRemote !== '',
    },
  ];

  return {
    vault: {
      name: r.vaultName,
      path: r.vaultPath,
      noteCount: r.notes.length,
      totalWords,
      gitRemote: r.gitRemote,
      lastSyncIso: r.lastSyncIso,
      encrypted: r.gitCrypt,
    },
    notes: recent,
    security,
    workflows,
  };
}

/**
 * fs から実 Vault を読み取る (薄いアダプタ)。値は実行ホストによって変わるため
 * linux.ts の readSystem と同じ理由で、整形・解析は純関数側に寄せてある。
 */
// Stryker disable all
const MAX_WALK_ENTRIES = 20_000;
const MAX_NOTES_READ = 5_000;
const MAX_NOTE_BYTES = 1024 * 1024;
/** 設定系ファイル (obsidian.json / プラグイン一覧 / .git/config / .gitattributes) の読みの上限。 */
const MAX_OBSIDIAN_CONFIG_BYTES = 1 * 1024 * 1024;
const SKIP_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules']);

function obsidianConfigPath(platform: string, home: string): string {
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'obsidian', 'obsidian.json');
  }
  return path.join(home, '.config', 'obsidian', 'obsidian.json');
}

/**
 * 読む前に `stat` で断る (法則 `size-gate-before-parse` · devEnv の `readFileOrNull`
 * と同じ形で、設定系の 4 読みをこの 1 関数に集約する)。ここが読むのはアプリが
 * 書いていないファイル (Obsidian / Git が書く) なので大きさの保証は無い。
 * 上限を超えた物と `stat` が答えられない物は読まず、呼び出し側の「無かった」と
 * 同じ `null` に倒す (呼び出し側はどれも `null` を「取れなかった」として扱う)。
 */
function readTextWithinCap(file: string, maxBytes: number = MAX_OBSIDIAN_CONFIG_BYTES): string | null {
  try {
    if (fs.statSync(file).size > maxBytes) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readNoteContent(file: string, size: number): string {
  if (size <= MAX_NOTE_BYTES) return fs.readFileSync(file, 'utf8');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(MAX_NOTE_BYTES);
    const read = fs.readSync(fd, buf, 0, MAX_NOTE_BYTES, 0);
    return buf.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function readPluginList(file: string): string[] {
  try {
    const text = readTextWithinCap(file);
    if (text === null) return [];
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    if (parsed !== null && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
    }
  } catch {
    /* 読めなければ無効として扱う */
  }
  return [];
}

export function readObsidianVault(): RawObsidianReadings {
  const notFound: RawObsidianReadings = {
    found: false,
    vaultName: '',
    vaultPath: '',
    notes: [],
    truncated: false,
    hasGit: false,
    gitRemote: '',
    lastSyncIso: '',
    gitCrypt: false,
    hasDotObsidian: false,
    dailyNotesEnabled: false,
    templatesEnabled: false,
    gitPluginEnabled: false,
  };
  const home = os.homedir();
  const configText = readTextWithinCap(obsidianConfigPath(os.platform(), home));
  if (configText === null) return notFound;
  const candidates = parseObsidianConfig(configText);
  const chosen = chooseVault(candidates);
  if (chosen === null) return notFound;
  const vaultPath = chosen.path;
  let isDir = false;
  try {
    isDir = fs.statSync(vaultPath).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return notFound;

  // .md ファイルの列挙 (上限つき)
  const mdFiles: string[] = [];
  let entriesSeen = 0;
  let truncated = false;
  const stack: string[] = [vaultPath];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > MAX_WALK_ENTRIES) {
        truncated = true;
        break;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        mdFiles.push(full);
      }
    }
    if (truncated) break;
  }
  mdFiles.sort();

  const notes: RawNoteReading[] = [];
  for (const file of mdFiles.slice(0, MAX_NOTES_READ)) {
    try {
      const st = fs.statSync(file);
      const rel = path.relative(vaultPath, file).split(path.sep).join('/');
      notes.push(summarizeNote(rel, readNoteContent(file, st.size), st.mtime.toISOString()));
    } catch {
      /* 読めないノートは数えない */
    }
  }
  if (mdFiles.length > MAX_NOTES_READ) truncated = true;

  // Git の痕跡 (サブプロセスは起動しない)
  const gitDir = path.join(vaultPath, '.git');
  let hasGit = false;
  try {
    hasGit = fs.statSync(gitDir).isDirectory();
  } catch {
    hasGit = false;
  }
  let gitRemote = '';
  let lastSyncIso = '';
  let gitCrypt = false;
  if (hasGit) {
    const gitConfigText = readTextWithinCap(path.join(gitDir, 'config'));
    gitRemote = gitConfigText === null ? '' : redactRemoteUrl(parseGitRemote(gitConfigText));
    try {
      lastSyncIso = fs.statSync(path.join(gitDir, 'FETCH_HEAD')).mtime.toISOString();
    } catch {
      lastSyncIso = '';
    }
    // existsSync と readTextWithinCap はどちらも例外を投げない (門の中で倒す)
    gitCrypt =
      fs.existsSync(path.join(gitDir, 'git-crypt')) ||
      (readTextWithinCap(path.join(vaultPath, '.gitattributes')) ?? '').includes('git-crypt');
  }

  const dotObsidian = path.join(vaultPath, '.obsidian');
  const hasDotObsidian = fs.existsSync(dotObsidian);
  const corePlugins = readPluginList(path.join(dotObsidian, 'core-plugins.json'));
  const communityPlugins = readPluginList(path.join(dotObsidian, 'community-plugins.json'));

  return {
    found: true,
    vaultName: path.basename(vaultPath),
    vaultPath,
    notes,
    truncated,
    hasGit,
    gitRemote,
    lastSyncIso,
    gitCrypt,
    hasDotObsidian,
    dailyNotesEnabled: corePlugins.includes('daily-notes'),
    templatesEnabled: corePlugins.includes('templates'),
    gitPluginEnabled: communityPlugins.includes('obsidian-git'),
  };
}
// Stryker restore all

export async function fetchObsidianSnapshot(_ctx: FetchContext): Promise<ObsidianSnapshot> {
  return buildObsidianSnapshot(readObsidianVault());
}
