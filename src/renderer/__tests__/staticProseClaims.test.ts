/**
 * **画面の固定文が、取得した payload について事実を主張していないか。**
 * (2026-09-12 · パス 177)
 *
 * ## 実測した欠陥
 *
 * `WordPressPage` の「MCP Access」は**補間を 1 つも持たない散文**だった:
 *
 * > すべてのサイトが free プラン（mcp_access: `wpcom_paid_plan_required`）。…
 * > WordPress.com 有料プランへのアップグレードが必要。
 *
 * ところが同じ画面の一覧は、サイトごとに `paidPlan` から `paid` / `free` のバッジを刷る。
 * つまり**有料プランを持つ利用者の画面に、`paid` のバッジと「すべて free」が同時に出て**、
 * しかも既に払っている人へアップグレードを要求していた (パス 119 の
 * 「payload を読まない固定文が、同じ画面の数字と矛盾する」の家系)。
 *
 * ## この関門が持つもの
 *
 * 補間を持たない散文ブロックを走査し、**理由つきの台帳に在る物だけ**を許す。
 * 許されるのは「取得した payload について何も主張していない」散文 ——
 * この app が何を実装しているか (能力の説明)・法令の一般論・操作の案内である。
 *
 * 実測 (2026-09-12): 2 件。1 件が上の欠陥、1 件 (`AtlassianPage`) は
 * **この app が Jira だけを実装している**という能力の説明で、payload に依らない
 * (`main/clients/atlassian.ts` に Confluence の呼びは無い —— 出てくる `/wiki/rest/api/3/search`
 * は「site に `/wiki` を貼ると 404 になっていた」という過去の欠陥の**注記の中**である。
 * 当たって確かめた)。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource, readOriginalDirEntries } from '../../shared/__tests__/originalSource';

const PAGES = path.resolve(__dirname, '../pages');

/** 補間 (`{…}`) を持たない `className="empty"` の散文。短い案内 (「まだありません」) は除く。 */
export interface StaticProse {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

const MIN_CHARS = 25;

/**
 * コメントを落とす (行数は保つ)。**これを忘れると散文の引用を配線と読む** ——
 * パス 174 の census が `stocks.ts` のコメント内の `slice(0, 200)` を掴んだのと同じ罠で、
 * この検査でも 1 度踏んだ (`WordPressPage` の注記が直す前の文を引用しているため)。
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

export function staticProse(): StaticProse[] {
  const out: StaticProse[] = [];
  for (const e of readOriginalDirEntries(PAGES)) {
    if (!e.isFile() || !e.name.endsWith('.tsx')) continue;
    const src = code(readOriginalSource(path.join(PAGES, e.name)));
    for (const m of src.matchAll(/<div className="empty"[^>]*>([\s\S]*?)<\/div>/g)) {
      const body = m[1] ?? '';
      if (body.includes('{')) continue; // payload を読んでいる
      const text = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text.length < MIN_CHARS) continue;
      out.push({ file: e.name, line: src.slice(0, m.index).split('\n').length, text });
    }
  }
  return out;
}

/**
 * 固定文でよい散文と、その理由。**「取得した payload について主張していない」に限る。**
 * 台帳が古くなったら鳴る (現物が消えた行は落とす)。
 */
const STATIC_ALLOWED: Readonly<Record<string, string>> = {
  'AtlassianPage.tsx':
    'この app が何を実装しているかの説明 (Jira のみ・Confluence と Compass は未実装) で、'
    + '利用者の payload に依らない。実装を当たって確かめた —— `main/clients/atlassian.ts` に'
    + 'Confluence の呼びは無く、`/wiki/rest/api/3/search` は過去の欠陥の注記の中に在るだけ',
};

describe('画面の固定文は payload について事実を主張しない (パス 177)', () => {
  const prose = staticProse();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(prose.length, '補間の無い散文が 1 件も見つからない = 走査が死んでいる').toBeGreaterThanOrEqual(1);
    expect(prose.map((p) => p.file)).toContain('AtlassianPage.tsx');
  });

  it('★ 固定文は理由つきの台帳の物だけ', () => {
    const rogue = prose.filter((p) => !(p.file in STATIC_ALLOWED)).map((p) => `${p.file}:${p.line}`);
    expect(rogue, '払っている人に「すべて free」と言う形が増えている').toEqual([]);
  });

  it('★ 台帳は双方向 (行が古くなっていない・理由が在る)', () => {
    for (const [file, why] of Object.entries(STATIC_ALLOWED)) {
      expect(prose.some((p) => p.file === file), `${file}: 台帳に在るが固定文が無い (古い行)`).toBe(true);
      expect(why.length, `${file}: 理由が無い`).toBeGreaterThan(30);
    }
  });

  it('★ 対照: 直した側は走査に掛からない (payload を読んでいる)', () => {
    // `WordPressPage` は `{access.text}` になったので、補間を持つ = 母集団の外。
    expect(prose.map((p) => p.file), 'WordPress が固定文に戻っている').not.toContain('WordPressPage.tsx');
    const wp = code(readOriginalSource(path.join(PAGES, 'WordPressPage.tsx')));
    expect(wp, 'MCP Access が payload を読んでいない').toContain('mcpAccessNote(sites)');
    expect(wp, '固定文が残っている').not.toContain('すべてのサイトが free プラン');
    // 不在の主張に標本を添える —— コメント落としが効いていること (注記はその文を引用している)。
    expect(
      readOriginalSource(path.join(PAGES, 'WordPressPage.tsx')),
      '注記が直す前の文を引用していない = 標本が無い',
    ).toContain('すべてのサイトが free プラン');
  });
});
