import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * **主プロセスがディスクへ書くものは、すべて 0600 で閉じる。**
 *
 * ## なぜ検査が要るか (2026-08-25)
 *
 * `fs.writeFile(path, data, { mode })` の `mode` は**新規作成のときしか
 * 効かない**。このリポジトリはこの形を **3 度**踏んでいる:
 *
 *   - `emotions.ts` (2026-08-13) —— 既存 644 が直らない
 *   - `exportPaths.ts` (2026-08-25) —— 状態は 600 なのに書き出しが 644
 *   - `stocks.ts` / `teamradar.ts` (2026-08-25) —— **固定名の `.tmp` が
 *     644 で残っていると、それがそのまま本体へ被さる**
 *
 * 3 度目のとき、`stocks` / `teamradar` の既存 **420 件**は全部緑のままだった。
 * **書いた場所ごとに人が気を付ける**形では、4 度目が来る。
 *
 * ## 規則
 *
 * `src/main` の中で実際にファイルを書く呼び出しは、**同じ関数の中で
 * `chmod(…, 0o600)` を続ける**こと。唯一の例外は下の台帳に書く。
 */

const MAIN = join(__dirname, '..');

/** 例外。**理由を書く欄がある**ので、黙って増やせない。 */
const EXEMPT: Readonly<Record<string, string>> = {
  'atomicWrite.ts':
    '書き先は `${target}.tmp-${pid}-${Date.now()}-${乱数}` で毎回一意な新規ファイルなので、' +
    '`fs.open(tmp, "w", mode)` の mode が必ず効く (既存の権限を継ぐ経路が無い)。' +
    '控え (`.prev`) は copyFile が複製元の mode を継ぐため、別途 chmod している。',
};

interface Source {
  readonly rel: string;
  readonly text: string;
}

function sources(dir: string, prefix = '', out: Source[] = []): Source[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__') sources(full, `${prefix}${name}/`, out);
      continue;
    }
    if (/\.tsx?$/.test(name)) out.push({ rel: prefix + name, text: readFileSync(full, 'utf8') });
  }
  return out;
}

/** 行コメント・ブロックコメントを落とす —— 注記に書いた字面を呼び出しと読み違えない。 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const WRITE_CALL = /\bfs\.(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(\s*([A-Za-z_$][\w$.]*)/g;

export interface Offence {
  readonly rel: string;
  readonly call: string;
  readonly target: string;
}

/** 純関数 —— 実ファイルを触らずに壊せるようにしてある。 */
export function findUnclosedWrites(files: readonly Source[]): Offence[] {
  const out: Offence[] = [];
  for (const { rel, text } of files) {
    const base = rel.split('/').pop()!;
    if (Object.hasOwn(EXEMPT, base)) continue;
    const src = code(text);
    for (const m of src.matchAll(WRITE_CALL)) {
      const target = m[2]!;
      // 同じ引数に対する chmod が、呼び出しより後ろの近い位置にあること。
      const after = src.slice(m.index, m.index + 600);
      const chmod = new RegExp(
        String.raw`fs\.chmod(?:Sync)?\s*\(\s*` + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`\s*,\s*0o600`,
      );
      if (!chmod.test(after)) out.push({ rel, call: m[1]!, target });
    }
  }
  return out;
}

describe('主プロセスの書き込みは 0600 で閉じる', () => {
  const files = sources(MAIN);

  it('走査が生きている (主プロセスのソースを読めている)', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((f) => f.rel)).toContain('clients/exportPaths.ts');
  });

  it('★ 書き込みのあとに chmod(0o600) が続いている', () => {
    expect(
      findUnclosedWrites(files).map((o) => `${o.rel}: fs.${o.call}(${o.target}, …)`),
      'mode は新規作成のときしか効きません。書いた後に chmod してください ' +
        '(既存ファイル・古い .tmp の権限は mode では直りません)',
    ).toEqual([]);
  });

  /* 台帳の掃除 —— 実在しない例外が残らないこと。 */
  it('例外台帳の項目は実在し、理由が書いてある', () => {
    const names = new Set(files.map((f) => f.rel.split('/').pop()!));
    for (const [base, why] of Object.entries(EXEMPT)) {
      expect(names, `${base} は src/main に無い — 台帳から外すこと`).toContain(base);
      expect(why.trim().length, `${base} の理由が空`).toBeGreaterThan(30);
    }
  });

  /*
   * **鳴らない検査を「合格」と読まない。** 合成した違反で実際に鳴ることと、
   * 閉じてある形は鳴らないことを、同じ検査で見る。
   */
  it('★ 対照: 閉じていない書き込みは鳴り、閉じてあるものは鳴らない', () => {
    const bare = { rel: 'x.ts', text: 'await fs.writeFile(p, c, { mode: 0o600 });' };
    expect(findUnclosedWrites([bare]), '閉じていない書き込みで鳴っていない').toHaveLength(1);

    const closed = {
      rel: 'y.ts',
      text: 'await fs.writeFile(p, c, { mode: 0o600 });\nawait fs.chmod(p, 0o600);',
    };
    expect(findUnclosedWrites([closed]), '閉じてあるのに鳴った').toEqual([]);

    // 別の引数を締めても駄目 (取り違えを許さない)。
    const wrongTarget = {
      rel: 'z.ts',
      text: 'await fs.writeFile(p, c, { mode: 0o600 });\nawait fs.chmod(other, 0o600);',
    };
    expect(findUnclosedWrites([wrongTarget]), '別の引数の chmod を数えている').toHaveLength(1);

    // 注記に書いた字面は呼び出しとして数えない (囮に当たらない)。
    const comment = { rel: 'c.ts', text: '// await fs.writeFile(p, c);\n/* fs.writeFile(q, c) */' };
    expect(findUnclosedWrites([comment]), '注記を呼び出しとして数えた').toEqual([]);

    // 例外台帳のファイルは見ない。
    const exempt = { rel: 'atomicWrite.ts', text: 'await fs.writeFile(p, c);' };
    expect(findUnclosedWrites([exempt]), '例外が効いていない').toEqual([]);
  });
});
