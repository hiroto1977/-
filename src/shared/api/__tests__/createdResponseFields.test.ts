/**
 * **書き込みの結果に載る第三者の文字列は、天井を通る。** (2026-09-22 · パス 414)
 *
 * パス 411 / 413 が閉じたのは**読み取り** (`fetchSnapshot`) の側だった。
 * 同じ形が**書き込みの結果**にも在り、そちらは `shared/api/*.ts` の
 * `parseCreated*` が漏斗である (パス 321 で両ビルドが 1 つを通るようにした当の所)。
 *
 * 実測 (2026-09-22 ・ 直す前・実物の handler に 200,000 字を 1 欄ぶん食わせる):
 *
 * | 画面 | 操作 | 画面の総文字数 |
 * | --- | --- | ---: |
 * | **Canva** | フォルダ作成 | **400,451** |
 * | **GitHub** | Issue を作成 | **200,338** |
 * | Cloudflare | DNS レコード作成 | `name` 200,000 / `type` 200,000 |
 * | Drive | フォルダ作成 | `name` 200,000 |
 *
 * 型は 2026-09-14 (パス 262) から `requireString` で見ていたので**投げない** ——
 * 空いていたのは**長さ**だけだった (法則 `mention-vs-declaration` の形:
 * 型を見ていることは天井が在ることではない)。
 *
 * ★ **URL の欄には天井を通さない。** 256 字で切った URL は**別の頁を指す**ので、
 *   切るより型で落とすほうが正しい (外側の関門は `externalUrlOrNull`)。
 *   その 6 欄は下の台帳に理由つきで載る —— **両方向**なので、天井を通した日にも
 *   台帳から消せと鳴る。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDir, readOriginalSource } from '../../__tests__/originalSource';
import { MAX_DISPLAY_FIELD_CHARS } from '../../apiResponse';
import { parseCreatedDriveFolder } from '../google';
import { parseCreatedGraphEvent } from '../microsoft365';
import { stripComments } from '../../__tests__/stripNonCode';

const API_DIR = path.resolve(__dirname, '..');

/** 注記と文字列の中の綴りは数えない (法則 `mention-vs-declaration`)。 */
/** `export function <name>(` から対応する閉じ括弧までの本体。 */
function functionBody(src: string, name: string): string {
  const head = src.indexOf(`export function ${name}(`);
  if (head < 0) throw new Error(`${name} が見つからない`);
  const open = src.indexOf('{', src.indexOf(')', head));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`${name} の本体が閉じていない`);
}

/**
 * `return { … }` の欄を `{ 欄名, 式 }` で返す。
 *
 * ★ **1 行の形も複数行の形も同じに扱う** —— パス 411 で、`欄: displayField(` だけを
 *   見る針が複数行の式を見落とした。だから括弧・波括弧・角括弧の深さを数え、
 *   **深さ 0 のコンマ**でだけ切る。
 * ★ **短縮形 (`{ id, … }`) は宣言まで辿る** —— `const id = displayField(…)` の形が
 *   atlassian と drive に在り、辿らないと「天井を通っていない」と誤って鳴る。
 */
function returnedFields(body: string): { name: string; expr: string }[] {
  const at = body.indexOf('return {');
  if (at < 0) return [];
  const open = body.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (let i = open; i < body.length; i++) {
    if ('{(['.includes(body[i]!)) depth++;
    else if ('})]'.includes(body[i]!)) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('return の物が閉じていない');
  const inner = body.slice(open + 1, end);
  const parts: string[] = [];
  let depth2 = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if ('{(['.includes(c)) depth2++;
    else if ('})]'.includes(c)) depth2--;
    else if (c === ',' && depth2 === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  const out: { name: string; expr: string }[] = [];
  for (const raw of parts) {
    const part = raw.trim();
    if (part === '') continue;
    const withColon = /^(\w+)\s*:\s*([\s\S]+)$/.exec(part);
    if (withColon !== null) {
      out.push({ name: withColon[1]!, expr: withColon[2]! });
      continue;
    }
    // 短縮形 —— 同じ本体の `const <name> = …;` を式として使う。
    const decl = new RegExp(`const\\s+${part}\\s*=\\s*([\\s\\S]*?);`).exec(body);
    out.push({ name: part, expr: decl === null ? '' : decl[1]! });
  }
  return out;
}

/** `shared/api/*.ts` の `export function parse…` を全部数える (母集団は走査で導く)。 */
function parseFunctions(): { file: string; name: string; body: string }[] {
  const out: { file: string; name: string; body: string }[] = [];
  for (const f of readOriginalDir(API_DIR).filter((n) => n.endsWith('.ts')).sort()) {
    const src = stripComments(readOriginalSource(path.join(API_DIR, f)));
    for (const m of src.matchAll(/^export function (parse\w+)\(/gm)) {
      out.push({ file: f, name: m[1]!, body: functionBody(src, m[1]!) });
    }
  }
  return out;
}

/**
 * 役目の台帳 —— **新しい読み手が生えたら「どちらか書け」と鳴る**。
 *
 * `created-response` = 書き込みの結果を第三者から読む (下の天井の規則が掛かる)。
 * `own-input`        = 自分たちが保管した文字列を読む (第三者ではない)。
 */
const ROLE: Readonly<Record<string, 'created-response' | 'own-input'>> = {
  'atlassian.ts parseCreatedJiraIssue': 'created-response',
  'canva.ts parseCreatedFolder': 'created-response',
  'cloudflare.ts parseCreatedDnsRecord': 'created-response',
  'cloudflare.ts parsePurgeResult': 'created-response',
  'github.ts parseCreatedIssue': 'created-response',
  'google.ts parseCreatedDriveFolder': 'created-response',
  'google.ts parseCreatedEvent': 'created-response',
  'google.ts parseCreatedDraft': 'created-response',
  'microsoft365.ts parseCreatedGraphEvent': 'created-response',
  'notion.ts parseCreatedPage': 'created-response',
  'security.ts parseSecurityKeys': 'own-input',
  'wordpress.ts parseCreatedPost': 'created-response',
};

/**
 * 天井を通さない欄と、その理由。**URL だけ**である。
 *
 * 256 字で切った URL は別の頁を指すので、`…` を足して見せるより
 * **型で落とし、外側の関門 (`externalUrlOrNull`) に渡す**ほうが正しい。
 */
const NO_CEILING: Readonly<Record<string, string>> = {
  'github.ts parseCreatedIssue.url': 'URL。切ると別の頁を指す',
  'google.ts parseCreatedDriveFolder.url': 'URL。切ると別の頁を指す',
  'google.ts parseCreatedEvent.htmlLink': 'URL。切ると別の頁を指す',
  'microsoft365.ts parseCreatedGraphEvent.webLink': 'URL。切ると別の頁を指す',
  'notion.ts parseCreatedPage.url': 'URL。切ると別の頁を指す',
  'wordpress.ts parseCreatedPost.url': 'URL。切ると別の頁を指す',
};

/** 第三者の文字列を取り出す読み手 (数は別 —— 長さの話ではない)。 */
const READS_STRING = /\b(?:requireString|optionalString)\s*\(/;

describe('書き込みの結果の欄 (パス 414)', () => {
  const fns = parseFunctions();

  it('★ 走査が生きている (読み手が母集団の床を満たす)', () => {
    expect(fns.length).toBeGreaterThanOrEqual(10);
  });

  it('★ 読み手の母集団と役目の台帳は一致する (両方向)', () => {
    const found = fns.map((f) => `${f.file} ${f.name}`).sort();
    expect(found).toEqual(Object.keys(ROLE).sort());
  });

  const created = fns.filter((f) => ROLE[`${f.file} ${f.name}`] === 'created-response');
  const fields = created.flatMap((f) =>
    returnedFields(f.body)
      .filter((x) => READS_STRING.test(x.expr))
      .map((x) => ({ key: `${f.file} ${f.name}.${x.name}`, expr: x.expr })),
  );

  it('★ 第三者の文字列の欄が母集団の床を満たす', () => {
    expect(fields.length).toBeGreaterThanOrEqual(14);
    expect(fields.filter((x) => x.expr.includes('displayField(')).length).toBeGreaterThanOrEqual(8);
  });

  it('★ 天井を通らない欄は、理由つきの台帳に在る欄だけ (両方向)', () => {
    const uncapped = fields.filter((x) => !x.expr.includes('displayField(')).map((x) => x.key).sort();
    expect(uncapped).toEqual(Object.keys(NO_CEILING).sort());
  });

  it('★ 台帳の理由は空でない', () => {
    for (const [k, why] of Object.entries(NO_CEILING)) expect(why.trim(), k).not.toBe('');
  });

  it('★ 標本: 針は「欄: displayField(…)」の 1 行の形にも複数行の形にも当たる', () => {
    const body = `
      const id = displayField(requireString(o, 'id', 'X'));
      return {
        id,
        name: displayField(
          requireString(o, 'name', 'X'),
        ),
        url: optionalString(o, 'link') ?? make(id),
        n: requireNumber(o, 'n', 'X'),
      };
    `;
    const got = returnedFields(body).filter((x) => READS_STRING.test(x.expr));
    expect(got.map((x) => x.name)).toEqual(['id', 'name', 'url']);
    expect(got.filter((x) => x.expr.includes('displayField(')).map((x) => x.name)).toEqual(['id', 'name']);
  });
});

describe('作成された予定の読みは両ビルドで 1 つ (パス 414)', () => {
  it('★ 非文字列の subject / webLink は落ちる (直す前は物と数がそのまま渡っていた)', () => {
    const got = parseCreatedGraphEvent({ id: 'i', subject: { a: 1 }, webLink: 42 }, '会議');
    expect(got).toEqual({ id: 'i', subject: '会議', webLink: '' });
  });

  it('★ id が無ければ投げる (「作成しました」と言わない)', () => {
    expect(() => parseCreatedGraphEvent({ subject: 's' }, 'f')).toThrow(/Microsoft Graph/);
  });

  it('★ subject の天井', () => {
    const got = parseCreatedGraphEvent({ id: 'i', subject: 'x'.repeat(200_000) }, 'f');
    expect(got.subject.length).toBe(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(got.subject.endsWith('…')).toBe(true);
  });

  it('★ 両ビルドが同じ関数を通る', () => {
    for (const rel of ['../../../main/clients/microsoft-365.ts', '../../../renderer/data/saasWriteWeb.ts']) {
      const src = stripComments(readOriginalSource(path.resolve(__dirname, rel)));
      expect(src, rel).toContain('parseCreatedGraphEvent(');
    }
  });
});

describe('Drive のフォルダ URL は符号化する (パス 414)', () => {
  it('★ 応答の id は /drive/folders/ の外へ出られない', () => {
    for (const id of ['x/../../../evil', '../../../evil', 'x?next=1', 'x#frag', 'x/settings']) {
      const url = new URL(parseCreatedDriveFolder({ id, name: 'n' }).url);
      expect(url.origin, id).toBe('https://drive.google.com');
      expect(url.pathname.startsWith('/drive/folders/'), id).toBe(true);
      expect(url.search, id).toBe('');
      expect(url.hash, id).toBe('');
    }
  });

  it('★ 正当な id の答えは 1 つも変わらない', () => {
    const id = '1a2B-_cD3eF4gH5iJ6kL';
    expect(parseCreatedDriveFolder({ id, name: 'n' }).url).toBe(
      `https://drive.google.com/drive/folders/${id}`,
    );
  });

  it('★ webViewLink が在ればそちらを使う', () => {
    const url = parseCreatedDriveFolder({ id: 'i', name: 'n', webViewLink: 'https://x.example/a' }).url;
    expect(url).toBe('https://x.example/a');
  });
});
