import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as API from '../index';

/*
 * **「資格情報が無いまま通信しない」を、名前の一覧ではなく総当たりで確かめる。**
 *
 * CLAUDE.md は API クライアントの約束をこう書いている ——
 * 「Credentialed methods must guard with `if (!this.isConfigured())
 * throw new NotConfiguredError(this.id);` before any network call」。
 *
 * `clients.test.ts` はこれを `expectGuard(new GithubClient().listRepos(), …)`
 * のように **手書きで 23 行**並べて確かめている。行そのものは正しいが、
 * **一覧を作っているのは人**なので、新しいメソッドが増えても誰も鳴らさない。
 * `credentialed` の申告で同じ形を踏んだところ (`ai/__tests__/providers.test.ts`)
 * なので、こちらも**境界の側から数え直す**。
 *
 * ## 数え方
 *
 * 守りたいのは「メソッドの名前」ではなく **`fetch` に到達したかどうか**。
 * だから各クライアントに**偽の fetch を挿して**、資格情報ゼロのまま
 * プロトタイプ鎖の全メソッドを呼び、**1 回でも fetch が呼ばれたら失敗**とする。
 *
 * 引数は 2 通り (無し / それらしい文字列 3 つ) の両方で呼ぶ。片方だけだと、
 * 引数の型エラーで先に落ちるメソッドが「守られている」ように見える ——
 * 実測: `DriveClient.search` は引数無しだと `query.replace` で TypeError に
 * なり、**関門に届く前に落ちていた**。引数を渡すと正しく NotConfiguredError。
 *
 * 例外表は置かない。`ctx()` のような補助メソッドは通信しないので自然に通る。
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const API_DIR = path.join(REPO_ROOT, 'src/shared/api');

type AnyClient = Record<string, unknown>;

/** index.ts が公開しているクライアント クラス。 */
function exportedClientClasses(): [string, new (c?: unknown, f?: unknown) => object][] {
  const out: [string, new (c?: unknown, f?: unknown) => object][] = [];
  for (const [name, val] of Object.entries(API)) {
    if (typeof val === 'function' && /Client$/.test(name)) {
      out.push([name, val as new (c?: unknown, f?: unknown) => object]);
    }
  }
  return out;
}

/** プロトタイプ鎖をたどって、呼べるメソッド名を全部集める。 */
function methodNames(inst: AnyClient): string[] {
  const names = new Set<string>();
  for (let p = Object.getPrototypeOf(inst) as object | null; p && p !== Object.prototype; p = Object.getPrototypeOf(p) as object | null) {
    for (const k of Object.getOwnPropertyNames(p)) if (k !== 'constructor') names.add(k);
  }
  return [...names].filter((k) => typeof inst[k] === 'function').sort();
}

interface Outcome {
  readonly label: string;
  readonly fetched: number;
  readonly threw: string;
}

async function sweep(): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const [name, Ctor] of exportedClientClasses()) {
    const seen: string[] = [];
    const spy = ((input: unknown) => {
      seen.push(String(input));
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }) as unknown as typeof fetch;
    // 資格情報ゼロ。第 2 引数の fetch は「通信に届いたか」を見るためだけの罠。
    const inst = new Ctor({}, spy) as AnyClient;
    for (const k of methodNames(inst)) {
      for (const args of [[], ['x', 'x', 'x']]) {
        seen.length = 0;
        let threw = '';
        try {
          await (inst[k] as (...a: unknown[]) => unknown)(...args);
        } catch (e) {
          threw = (e as Error).constructor.name;
        }
        out.push({ label: `${name}.${k}(${args.length})`, fetched: seen.length, threw });
      }
    }
  }
  return out;
}

describe('資格情報が無いクライアントは、1 バイトも送らない', () => {
  it('走査が実物に届いている (空撃ちでない)', async () => {
    const classes = exportedClientClasses();
    expect(classes.length, 'クライアント クラスを 1 つも拾えていない').toBeGreaterThanOrEqual(9);
    const outcomes = await sweep();
    expect(outcomes.length, 'メソッドを拾えていない — 走査が的を外している').toBeGreaterThanOrEqual(80);
    // 関門が実際に働いていること。全部が「引数エラーで落ちた」だけなら、
    // fetched=0 は守りの証拠にならない。
    const guarded = outcomes.filter((o) => o.threw === 'NotConfiguredError');
    expect(guarded.length, 'NotConfiguredError が 1 度も出ていない').toBeGreaterThanOrEqual(20);
  });

  it('資格情報ゼロのまま fetch に到達するメソッドが 1 つも無い', async () => {
    const reached = (await sweep())
      .filter((o) => o.fetched > 0)
      .map((o) => `${o.label} threw=${o.threw || 'なし'}`);
    expect(reached, '資格情報なしで通信に到達したメソッドがあります').toEqual([]);
  });

  /*
   * index.ts に載せ忘れたクライアントは、上の走査から丸ごと消える ——
   * 「見えない物は数えられない」形なので、原文の側からも数えて突き合わせる。
   */
  it('index.ts が全クライアント クラスを公開している', () => {
    const declared: string[] = [];
    for (const f of readdirSync(API_DIR)) {
      if (!f.endsWith('.ts') || f === 'index.ts') continue;
      const text = readFileSync(path.join(API_DIR, f), 'utf8');
      for (const m of text.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*Client)\b/g)) declared.push(m[1]!);
    }
    expect(declared.length, 'クラス宣言を 1 つも拾えていない').toBeGreaterThanOrEqual(9);
    const exported = exportedClientClasses().map(([n]) => n);
    expect([...declared].sort(), 'index.ts から公開されていないクライアントがあります').toEqual(
      [...exported].sort(),
    );
  });
});
