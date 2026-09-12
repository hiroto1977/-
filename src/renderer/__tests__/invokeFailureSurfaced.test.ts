/**
 * **`invoke` の失敗を画面に出さない呼びは在ってはならない (母集団は実装から導く)。**
 * (2026-09-12 · パス 176)
 *
 * ## 実測した欠陥
 *
 * パス 175 で村の AI 応答を読んでいて気付いた: `if (res.ok && res.data.text)` に **else が無く**、
 * `catch` は空コメントだけだった。つまり鍵未設定・通信断・天井超えの断り (パス 175 で足した物も含む)
 * はどれも**誰にも届かない**。利用者から見えるのは「AI を入れているのに、いつも簡易応答しか
 * 返らない」で、原因を知る手が 1 つも無い。
 *
 * そこで母集団を数えた (走査): renderer で `invoke` を呼ぶのは **42 か所**、うち失敗を
 * 画面へ出していないのは **3 か所**。1 つは偽陽性 (下の台帳)、残り 2 つが本物だった:
 *
 * | 場所 | 直す前 | 利用者に見えること |
 * | --- | --- | --- |
 * | `VillagePage` の `assistant/chat` | `if (res.ok && …)` に else 無し・空の `catch` | 端末内の簡易応答だけが返り続ける |
 * | `TalentPage` の `talent/judge-leader` | `if (res.ok) setVerdict(…)` に else 無し | 「判定中…」から戻るだけで何も変わらない (= 押せていないと読める) |
 *
 * 2 つ目はパス 169 が直した形と同じ ——「押しても何も起きないボタン」。
 *
 * ## この関門が持つもの
 *
 * 1. **母集団は走査で数える** (`invoke` の呼びを 1 つずつ)。手で並べた一覧は手で並べた分しか
 *    見つけない (パス 106 → 107 で 5 → 8 に動いたのと同じ理由)。
 * 2. 失敗を出していない呼びは**理由つきの台帳の物だけ**。
 * 3. 台帳は**双方向** —— 台帳の行が実際には失敗を出すようになっていたら、その行は古い。
 * 4. 走査の印が実物に当たることを、同じ検査の中で標本に対して確かめる。
 *
 * ## 走査で踏んだ偽陽性 (記録)
 *
 * 最初の版は呼びの後ろ **900 字**を見ていて、`ServiceActionPanel` と `AssistantPage` の
 * 失敗の扱い (もっと後ろに在る) を見落として「4 件」と言った。囲っている塊の終わりまでを
 * インデントで区切る形に直したら 3 件になった。**窓の幅を当てる走査は、窓の外を見ない。**
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalSource, readOriginalDirEntries } from '../../shared/__tests__/originalSource';

const RENDERER = path.resolve(__dirname, '..');

/** コメントを落とす (説明の中の綴りを配線と読まない。行数は保つ)。 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

/** renderer の実装ファイル (検査は除く)。 */
function implFiles(dir: string = RENDERER): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === '__tests__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...implFiles(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

export interface InvokeSite {
  /** `RENDERER` からの相対パス。 */
  readonly file: string;
  readonly line: number;
  /** 呼びから、囲っている塊の終わりまで。 */
  readonly blob: string;
}

/**
 * `invoke` の呼びと、その**囲っている塊**を取る。
 *
 * 塊の終わりはインデントで区切る —— 呼びの行より浅い `}` が来たところ。
 * 固定幅の窓にすると窓の外の扱いを見落とす (上の「踏んだ偽陽性」)。
 */
export function invokeSites(): InvokeSite[] {
  const out: InvokeSite[] = [];
  for (const full of implFiles()) {
    const lines = code(readOriginalSource(full)).split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i]!;
      if (!l.includes('.invoke<') && !l.includes('.invoke(')) continue;
      const indent = l.length - l.trimStart().length;
      const body: string[] = [l];
      for (let j = i + 1; j < Math.min(i + 80, lines.length); j += 1) {
        const nxt = lines[j]!;
        const st = nxt.trim();
        if (st.length > 0 && nxt.length - nxt.trimStart().length < indent && st.startsWith('}')) break;
        body.push(nxt);
      }
      out.push({ file: path.relative(RENDERER, full), line: i + 1, blob: body.join('\n') });
    }
  }
  return out;
}

/**
 * 失敗が**どこかへ出ている**印。
 *
 * 綴りで当てられるのはここまで —— 「画面に出ている」ことは各画面の jsdom 検査が持つ
 * (`pages/__tests__/invokeFailureOnScreen.test.ts` ほか)。ここが見るのは
 * 「失敗の枝が書かれているか」である。
 */
const SURFACED: readonly RegExp[] = [
  /!\s*\w+\.ok\b/,
  /\belse\b/,
  /\.message\b/,
  /\bclassifyActionResult\s*\(/,
  /\.ok\s*\?/,
];

export function surfacesFailure(blob: string): boolean {
  return SURFACED.some((re) => re.test(blob));
}

/**
 * 失敗の枝を持たない呼びと、その理由。**画面に何も出さないことが正しい場合に限る。**
 * 台帳が古くなったら鳴る (印に当たるようになった行は消す)。
 */
const SILENT_ALLOWED: Readonly<Record<string, string>> = {
  'data/assistantProviders.ts':
    '失敗は捨てずに `unknown: true` として返し、画面が「確認できません」と刷る (パス 107 ——'
    + '「未設定」と「読めなかった」を混ぜないために作った関数そのもの)。'
    + '`res.ok` の枝を通らなければ `unknown` になるので、`else` を書く必要が無い',
};

describe('invoke の失敗を画面に出さない呼びは、理由つきの台帳の物だけ (パス 176)', () => {
  const sites = invokeSites();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    const files = new Set(sites.map((s) => s.file));
    expect(files).toContain('pages/VillagePage.tsx');
    expect(files).toContain('pages/TalentPage.tsx');
    expect(files).toContain('components/ServiceActionPanel.tsx');
    expect(files).toContain('data/assistantProviders.ts');
    // 実測 42 件。床は「欠陥の数」ではなく走査そのものに置く (直すたびに壊れないように)。
    expect(sites.length).toBeGreaterThanOrEqual(35);
  });

  it('★ 失敗の枝を持たない呼びが 0 件 (台帳の物を除く)', () => {
    const silent = sites
      .filter((s) => !surfacesFailure(s.blob))
      .filter((s) => !(s.file in SILENT_ALLOWED))
      .map((s) => `${s.file}:${s.line}`);
    expect(silent, 'invoke の失敗を黙って捨てている呼びがある').toEqual([]);
  });

  it('★ 台帳は双方向 (行が古くなっていない・理由が在る)', () => {
    for (const [file, why] of Object.entries(SILENT_ALLOWED)) {
      const rows = sites.filter((s) => s.file === file);
      expect(rows.length, `${file}: 台帳に在るが invoke を呼んでいない (古い行)`).toBeGreaterThan(0);
      expect(
        rows.some((s) => !surfacesFailure(s.blob)),
        `${file}: もう失敗の枝を持っているので台帳から外す`,
      ).toBe(true);
      expect(why.length, `${file}: 理由が無い`).toBeGreaterThan(20);
    }
  });

  it('★ 対照: 印が実物に当たり、黙っている形では当たらない', () => {
    const silent = [
      "      const res = await hub.invoke<X>('a', 'b', {});",
      '      if (res.ok) setVerdict(res.data.fitness);',
    ].join('\n');
    expect(surfacesFailure(silent), '黙っている形を「出している」と読んでいる').toBe(false);
    expect(surfacesFailure(`${silent}\n      else setErr(res.message);`)).toBe(true);
    expect(surfacesFailure("      if (!r.ok) { dispatch({ type: 'error' }); return; }")).toBe(true);
    expect(surfacesFailure('      const c = classifyActionResult(r);')).toBe(true);
    expect(surfacesFailure('      setText(r.ok ? r.data.text : r.message);')).toBe(true);
    /*
     * 塊の切り出しが窓ではなくインデントで決まる (固定幅の窓で踏んだ偽陽性・上の注記)。
     * **証人はその窓が実際に見落とした呼び**でなければならない —— 最初はここに
     * `ServiceActionPanel` を書いたが、あの呼びは 900 字でも扱いが窓に入るので
     * 対照が鳴らなかった。実測で窓から外れるのは `AssistantPage` の `chatAll`
     * (失敗の扱いが約 30 行下に在る)。**鳴らない対照は検査についての報せ**だった。
     */
    const site = invokeSites().find((s) => s.file === 'pages/AssistantPage.tsx' && s.blob.includes('chatAll'));
    expect(site, 'AssistantPage の chatAll の呼びが見つからない').toBeDefined();
    expect(surfacesFailure(site!.blob), '固定幅の窓では見落とす扱いを拾えていない').toBe(true);
    expect(site!.blob.length, '塊が 900 字で切れている (窓に戻っている)').toBeGreaterThan(900);
  });
});
