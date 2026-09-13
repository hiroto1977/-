import { promises as fs } from 'node:fs';
import { clampToCeiling, countChars } from '../../shared/inputCeiling';
import os from 'node:os';
import path from 'node:path';
import { AI_PROVIDERS } from '../../shared/ai/providers';
import { MAX_ASSISTANT_CONTENT_CHARS, capAssistantReply, inputTooLongMessage } from '../../shared/assistantLimits';
import { shadowedSkillIdNote, unsafeSkillIdNote } from '../../shared/skillIdentity';
import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';
import type { ActionData } from '../../shared/actionData';

export interface SkillEntry {
  /**
   * **実行するときの鍵** —— フォルダ名 (`<id>/SKILL.md`) かファイル名 (`<id>.md`)。
   *
   * パス 179 までこれと `label` が 1 つの欄 (`name`) を兼ねており、frontmatter の
   * `name:` がフォルダ名と違うスキルは**実行できない・別の物が走る**という
   * 3 通りの壊れ方をした (`shared/skillIdentity.ts` の冒頭に実測の表)。
   */
  id: string;
  /** 画面に出す題 (frontmatter の `name:`、無ければ `id`)。**鍵には使わない。** */
  label: string;
  description: string;
  source: 'user' | 'project' | 'plugin';
  path: string;
  /** `id` で実行できるか。false のときだけ `unrunnableReason` に理由が入る。 */
  runnable: boolean;
  /** 実行できない理由 (実行できるときは空文字)。文面は `shared/skillIdentity.ts`。 */
  unrunnableReason: string;
}

export interface SkillsSnapshot {
  items: SkillEntry[];
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/** Parse a SKILL.md / *.md frontmatter block. Only handles `name:` and
 *  `description:` since that's all we surface in the UI. */
/** Parse a SKILL.md / *.md frontmatter block. Only handles `name:` and
 *  `description:` since that's all we surface in the UI.
 *
 *  The `^` / `$` anchor-drop Regex mutants on name/description regexes
 *  are equivalent: with `m` flag every line position is line-start, and
 *  `.+` never spans newlines so `$` is redundant. Suppressed inline. */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  // The regex's `([\s\S]*?)` capture group always matches a string
  // (possibly empty), so match[1] is never undefined when match is
  // truthy. The `?? ''` fallback is type-narrowing only.
  // Stryker disable next-line StringLiteral
  const fm = match[1] ?? '';
  // Stryker disable next-line Regex
  // Stryker disable next-line OptionalChaining
  const name = stripBalancedQuotes(fm.match(/^name:\s*(.+)$/m)?.[1]?.trim());
  // Stryker disable next-line Regex
  const descMatch = fm.match(/^description:\s*(.+(?:\n[ \t]+.+)*)/m);
  // Equivalent: when the outer ?. yields a defined array, [1] is always
  // a string (the capture group `(.+)` matches at least one char), so
  // the inner ?. is unreachable-on-undefined.
  // Stryker disable next-line OptionalChaining
  const description = stripBalancedQuotes(descMatch?.[1]?.trim());
  return { name, description };
}

/** Remove a *matched pair* of surrounding quotes (e.g. "hello" → hello)
 *  but leave a single unbalanced quote alone (e.g. `"` stays `"`).
 *
 *  Stryker reports the `^`/`$` anchor-drop variants as survivors; both
 *  are equivalent because callers always pass a value that has been
 *  `.trim()`ed first, so the anchor-less variant would still only match
 *  full-string quote pairs. */
// Stryker disable Regex
function stripBalancedQuotes(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const m = s.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : s;
}
// Stryker restore Regex

/** A minimal Dirent-shaped object for the readdir injection point.
 *  Lets tests fake the directory contents without touching the disk. */
export interface DirentLike {
  name: string;
  isDirectory: () => boolean;
}

/** Default readdir wrapper — passes through to fs.promises with the
 *  `withFileTypes` option. Injectable so tests can simulate errors
 *  (EACCES, EBADF, etc.) without filesystem manipulation. */
export type ReadDirFn = (dir: string) => Promise<DirentLike[]>;

const defaultReadDir: ReadDirFn = (dir) => fs.readdir(dir, { withFileTypes: true });

/** Scan a single skills directory. Handles two shapes:
 *  - `<dir>/<name>/SKILL.md` (preferred, name == dir name)
 *  - `<dir>/<name>.md`       (flat file)
 *
 *  Returns [] for missing directories (ENOENT). Other errors throw,
 *  so the caller can surface them. `readDir` is injectable so the
 *  ENOENT-vs-other-error branch can be exhaustively unit-tested. */
export async function scanSkills(
  dir: string,
  source: SkillEntry['source'],
  readDir: ReadDirFn = defaultReadDir,
): Promise<SkillEntry[]> {
  let entries: DirentLike[];
  try {
    entries = await readDir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  /*
   * **読む前に、根の中かどうかを実体で見る。**
   *
   * `readSkillContent` は 2026-08-23 に同じ手当てを入れている
   * (symlink を辿ると根の外が読め、その中身が Anthropic API へ送られた)。
   * **ところが列挙側には入っていなかった。** 同じ根を扱う 2 つの関数で、
   * 片方だけが守られている —— 今日何度も見た形である。
   *
   * 列挙側の穴は `entry.isDirectory()` が **symlink では false** になること。
   * そこで下の `.md` 判定 (**名前しか見ない**) に落ち、`fs.readFile` が
   * symlink を辿って外を読む。実測 (2026-08-25、`scanSkills` 直接呼び出し):
   *
   * ```
   *   skills/evil.md -> /tmp/…/OUTSIDE-SECRET.md
   *   → {"name":"LEAKED-NAME","description":"TOP-SECRET-DESCRIPTION", …}
   * ```
   *
   * 送られるのは frontmatter の 2 欄だけなので `readSkillContent` ほど重くない。
   * だが**前提条件は同じ** (細工した symlink を含む配布物) で、
   * あちらを塞いだ理由がそのままこちらにも当てはまる。
   *
   * 根の側も実体に直す —— ホームや `.claude` が symlink 越しにあると
   * (実体だけ直したのでは) **正当なスキルまで弾く**ため。
   */
  // Stryker disable next-line ArrowFunction: この `.catch` へは到達しない ——
  // 直前の `readdir(dir)` が成功しているので `dir` は実在し、`realpath` は
  // 失敗しない (読み取りの合間に消された場合だけで、検査から作れない)。
  // 退避を残すのはその競合で落とさないため。
  const baseReal = await fs.realpath(dir).catch(() => path.resolve(dir));
  const baseResolved = baseReal + path.sep;

  const results: SkillEntry[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    let skillFile: string | null = null;
    let fallbackName = entry.name;
    if (entry.isDirectory()) {
      const candidate = path.join(entryPath, 'SKILL.md');
      // Equivalent mutant: deleting `continue` in the catch leaves
      // skillFile null, which gets caught by `if (!skillFile) continue;`
      // below. Both paths produce identical observable behavior for
      // "directory without SKILL.md".
      // Stryker disable BlockStatement
      try {
        await fs.access(candidate);
        skillFile = candidate;
      } catch {
        continue;
      }
      // Stryker restore BlockStatement
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      skillFile = entryPath;
      fallbackName = entry.name.replace(/\.md$/, '');
    }
    // Equivalent mutant: when skillFile is null we reach this guard;
    // mutating the condition to `false` lets execution fall through to
    // `fs.readFile(null, 'utf8')` which throws → caught by the inner
    // try/catch → continue. Same observable behavior.
    // Stryker disable next-line ConditionalExpression
    if (!skillFile) continue;

    // Equivalent mutant on initializer: the value is either overwritten by
    // readFile or skipped by `continue` in the catch — the initial '' is
    // never observable.
    // Stryker disable next-line StringLiteral
    // 実体に直せない = 壊れた symlink 等。読まない。
    const realFile = await fs.realpath(skillFile).catch(() => null);
    if (realFile === null || !realFile.startsWith(baseResolved)) continue;

    // 初期値を置かない —— `catch` が `continue` するので、ここから先へ進む道は
    // 「代入が成功した」場合しかない (TS の確定代入解析もそれを認める)。
    // 初期値 `''` は**一度も観測されず**、変異検査で生き残っていた
    // (実測 2026-08-31)。読まれない値を置かない。
    let content: string;
    try {
      content = await fs.readFile(realFile, 'utf8');
    } catch {
      continue;
    }
    const fm = parseFrontmatter(content);
    /*
     * **鍵は実体 (フォルダ名・ファイル名) から、題は frontmatter から。**
     * `fallbackName` がそのまま鍵 —— `readSkillBody` が組む候補
     * (`<id>/SKILL.md` / `<id>.md`) と同じ字を持つのはこちらだけである。
     */
    results.push({
      id: fallbackName,
      /*
       * `??` ではなく `||` —— `name: ""` は `''` を返し、`''` は nullish ではないので
       * `??` だと**題が空の行**が一覧に出る (選択肢も空欄になり、どれを選んだか読めない)。
       */
      label: fm.name || fallbackName,
      description: fm.description ?? '',
      source,
      path: skillFile,
      // 実行できるかは下でまとめて決める (同じ鍵の重なりを見るため)。
      runnable: false,
      unrunnableReason: '',
    });
  }

  markRunnable(results);
  results.sort((a, b) => a.label.localeCompare(b.label));
  return results;
}

/**
 * **押して動く物だけを `runnable` にする。**
 *
 * 2 つの理由で動かない:
 *
 * 1. 鍵に `isSafeSkillName` が通さない字が入っている (日本語のフォルダ名など)。
 * 2. 同じ鍵を 2 つの項目が持っている —— `readSkillBody` は `<id>/SKILL.md` を
 *    先に見るので**フォルダ側が勝ち**、`<id>.md` 側を押すと別の定義が走る。
 *
 * どちらも走査した実物から決める (台帳を手で書かない)。
 */
function markRunnable(entries: SkillEntry[]): void {
  const byId = new Map<string, SkillEntry[]>();
  for (const e of entries) {
    const group = byId.get(e.id);
    if (group) group.push(e);
    else byId.set(e.id, [e]);
  }
  for (const e of entries) {
    if (!isSafeSkillName(e.id)) {
      e.runnable = false;
      e.unrunnableReason = unsafeSkillIdNote(e.id);
      continue;
    }
    const group = byId.get(e.id) ?? [e];
    // `readSkillBody` の候補順と同じ —— フォルダ形式が先。
    const winner = group.find((g) => g.path.endsWith(`${path.sep}SKILL.md`)) ?? group[0];
    if (winner !== e) {
      e.runnable = false;
      e.unrunnableReason = shadowedSkillIdNote(e.id, winner?.path ?? e.path);
      continue;
    }
    e.runnable = true;
    e.unrunnableReason = '';
  }
}

export async function fetchSkillsSnapshot(_ctx: FetchContext): Promise<SkillsSnapshot> {
  const dir = path.join(os.homedir(), '.claude', 'skills');
  const items = await scanSkills(dir, 'user');
  return { items };
}

// --- write-side actions --------------------------------------------------
// run-skill invokes a skill via the Anthropic Messages API: the skill's
// SKILL.md body is sent as the `system` prompt; the user's prompt as the
// turn input. Token = ANTHROPIC_API_KEY (saved via the same secrets
// mechanism as the other service tokens).

interface RunSkillPayload {
  /**
   * **一覧が出した `SkillEntry.id`** (フォルダ名・ファイル名) —— 画面に出ている題
   * (`label`) ではない。パス 179 まで題を受け取っており、frontmatter の `name:` が
   * フォルダ名と違うスキルは実行できなかった / 別の物が走った。
   */
  id: string;
  prompt: string;
}

/**
 * この呼び出しの `max_tokens`。**レンダラーからは変えられない。**
 *
 * 2026-08-22 まで payload の `maxTokens` をそのまま送っていた
 * (`maxTokens ?? 2048` —— 型検査も有限性検査も無し)。同じ判断が 4 か所に
 * あって、厳しさが 3 段階に割れていた:
 *
 *     assistant.ts  定数 (レンダラーは触れない)          ← いちばん安全
 *     business.ts   typeof number && isFinite && > 0
 *     stocks.ts     typeof number && isFinite && > 0
 *     skills.ts     `?? 2048` のみ                        ← 何でも通る
 *
 * 実測すると、**UI はこの値を一度も渡していない** (`invoke` の payload に
 * `maxTokens` を入れている画面コードは 0 件)。使われていない受け口が、
 * 有料 API のパラメータをレンダラーに握らせているだけだった。
 * `assistant.ts` と同じ形 —— 定数 —— に寄せる。
 *
 * `model` も同じ理由で payload から外した。モデルの選択は保存済みの
 * プロバイダ設定 (`providers.ts` の `cfg.model`) 側の口である。
 */
export const SKILLS_MAX_TOKENS = 2048;

interface AnthropicMessagesResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

async function readSkillBody(id: string): Promise<string> {
  if (!isSafeSkillName(id)) {
    // 断りに載せる id も文字の境界で切る (パス 196)。
    const safe = clampToCeiling(String(id as unknown), 32);
    throw new Error(`skill "${safe}" has an unsafe name`);
  }
  const base = path.join(os.homedir(), '.claude', 'skills');
  const candidates = [path.join(base, id, 'SKILL.md'), path.join(base, `${id}.md`)];
  /*
   * **閉じ込めを見る前に symlink を実体まで辿る。**
   *
   * `isSafeSkillName` は `/` も `\` も `..` も弾くので、**字面では**外へ出られない。
   * だが `path.resolve` は symlink を辿らないので、`~/.claude/skills/evil.md` を
   * 外へ向けた symlink にすると素通りする。実測 (2026-08-23):
   *
   * ```
   *   isSafeSkillName : true
   *   封じ込めの判定  : true      ← 通る
   *   読めた中身      : "TOP-SECRET-FILE-CONTENTS"   ← 根の外
   * ```
   *
   * **ここで読んだ中身は Anthropic API へ system として送られる。** つまり
   * 任意ファイルの中身が第三者のサービスへ出ていく。スキルは利用者が
   * **配布物として入れる**もので、細工した symlink を同梱するのは現実的な経路。
   *
   * 根の側も実体に直す —— ホームや `.claude` が symlink 越しにあると
   * (実体だけ直したのでは) **正当なスキルまで弾く**ため。
   * 同じ手当ては `shellOpenGate.ts` が先に入れている (あちらの注記参照)。
   */
  // Stryker disable next-line ArrowFunction: `base` が実体に直せないのは
  // `~/.claude/skills` 自体が無いときで、そのとき**候補も 1 つも実在しない**
  // ので、退避の値が何であっても全候補が `realpath` で落ちて「見つからない」に
  // なる —— 観測できる差が無い (等価変異)。
  const baseReal = await fs.realpath(base).catch(() => path.resolve(base));
  const baseResolved = baseReal + path.sep;
  for (const c of candidates) {
    // 実体に直せない = その候補は存在しない。次の候補へ。
    const real = await fs.realpath(c).catch(() => null);
    if (real === null) continue;
    if (!real.startsWith(baseResolved)) continue;
    try {
      return await fs.readFile(real, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(`skill "${id}" not found in ~/.claude/skills`);
}

/** A skill name is a single path segment used to locate
 *  `~/.claude/skills/<name>/SKILL.md` or `~/.claude/skills/<name>.md`.
 *  Reject anything that could escape that directory or introduce
 *  filesystem foot-guns: `..`, `/`, `\`, NUL, leading dot, whitespace,
 *  shell metachars. Mirrors the Ollama isSafeModelName approach. */
export function isSafeSkillName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  // Equivalent mutant on `name.length === 0`: dropping the empty-string
  // short-circuit lets execution fall through to the regex, which itself
  // requires at least one char (`^[A-Za-z0-9_-]`). Empty strings get
  // rejected either way.
  // Stryker disable next-line ConditionalExpression
  if (name.length === 0 || name.length > 128) return false;
  if (name.includes('..')) return false;
  // Allow letters, digits, dot, underscore, hyphen. No `/`, `\`, NUL,
  // whitespace, `:` (Windows drive letters), or other shell-meaningful
  // characters. Leading dot is rejected (no hidden files).
  return /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name);
}

async function runSkill(ctx: ActionContext): Promise<ActionData<'skills/run-skill'>> {
  const { id, prompt } = ctx.payload as unknown as Partial<RunSkillPayload>;
  if (typeof id !== 'string' || id.length === 0 || typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error('id and prompt are required');
  }
  // 指示文の天井 (パス 112)。それまで prompt に天井が無く、貼り付けた物が丸ごと有料 API へ
  // 出ていた。1 発話の天井はアシスタントと同じ 1 つ (`MAX_ASSISTANT_CONTENT_CHARS`)。
  if (countChars(prompt) > MAX_ASSISTANT_CONTENT_CHARS) throw new Error(inputTooLongMessage('プロンプト'));

  const body = await readSkillBody(id);

  const res = await jsonFetch<AnthropicMessagesResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': ctx.token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_PROVIDERS.anthropic.defaultModel,
        max_tokens: SKILLS_MAX_TOKENS,
        system: body,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    { fetch: ctx.fetch, serviceId: 'skills' },
  );

  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  // 応答の天井 (パス 113)。`runAiChat` を通らないので、同じ判断をここで読む ——
  // それまで 10 MiB (byte の天井) までの本文がそのまま画面の <pre> へ出ていた。
  return { text: capAssistantReply(text), stopReason: res.stop_reason ?? '' };
}

export const ACTIONS: ActionMap = {
  'run-skill': runSkill,
};
