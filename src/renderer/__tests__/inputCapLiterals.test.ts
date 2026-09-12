/**
 * **入力欄の天井を、字面で持たない** (2026-09-12 · パス 167)。
 *
 * ## 実測した欠陥
 *
 * パス 110/111 は「画面の `maxLength` は台帳の値を読む (数を写さない)」を
 * `writeFieldLimits.test.ts` の関門にした。だがその関門は**手で並べた 12 画面の
 * 12 欄**しか見ない。母集団を数えていないので、その外は 1 件も見ていなかった。
 *
 * 母集団を数えた (2026-09-12 · パス 167 の時点): renderer の `.tsx` に `maxLength` は
 * **59 件**、そのうち**字面の数**を持つのは **12 件**。うち 8 件は検証側にも同じ数が別に在り、
 * **1 組は既にずれていた**:
 *
 * | 画面 | 字面 | 検証側 | |
 * | --- | --- | --- | --- |
 * | `ServiceActionPanel.tsx` | `2000` | `MAX_RECORD_NOTE_CHARS` (定数は在った) | 画面だけが写し |
 * | `SettingsPage.tsx` 資格情報 | `8192` | `vault.ts` の条件と文面 (字面 ×2) | 3 か所 |
 * | `SettingsPage.tsx` 貼る欄 | `2048` | `pkce.ts` の `code` の天井 | **別の量**に同じ天井 |
 * | `SettingsPage.tsx` client ID / redirect | `256` ×2 | 無し | 画面だけ |
 * | `TeamRadarPage.tsx` チャート名 | `64` | `main/clients/teamradar.ts` は `<= 120` | **既にずれていた** |
 * | `TeamRadarPage.tsx` 部署 / 評価時点 / 氏名 / 付箋 | `64` `32` `64` `200` | `teamRadarState.ts` の条件と文面 | 各 3 か所 |
 * | `TeamRadarPage.tsx` 軸名 | `24` | 無し (保存する状態に入らない) | 画面だけ |
 * | `TemplatesPage.tsx` 色 | `7` | 無し (`#rrggbb` の書式の長さ) | 台帳の免除 |
 *
 * 貼る欄は特に厄介で、`maxLength={2048}` は `code` 1 本の天井の写しなのに、
 * **この欄が受け取るのは `?code=…&state=…` を含む URL 全体**である。最大長の code を
 * 含む URL は必ず 2048 字を超えるので、貼った URL の**末尾から** `state` が落ち、
 * 「state が読めません」だけが出て理由は誰も言えない
 * (パス 57「関門が値と別の量で規則を再導出していた」の家系)。
 *
 * **この 59 は当時の実測で、今は違う** (同日 12:45 再測で **41 件**)。パス 167 / 172 / 174 / 175 が
 * 「貼る欄は打ち止めではなく**断る**」へ移すたびに減っており、**下の検査はこの数を見ていない** ——
 * 見ているのは (a) 字面の天井を持つ画面が台帳の物だけであること、(b) 台帳に現物が在ること、
 * (c) `maxLength` が 1 件でも在ること (走査の生死) である。ここに数を書き続けると
 * 「数を 2 か所に書くと必ず食い違う」を自分でやることになるので、**日付つきの実測**として残す。
 *
 * ## この検査が持つもの
 *
 * 1. **母集団は走査で数える** —— 手で並べた一覧は手で並べた分しか見つけない。
 * 2. 字面の天井は**台帳に理由つきで載っている物だけ**許す (今は 1 件)。
 * 3. 台帳は**双方向** —— 現物が無くなった行も落とす。
 * 4. 走査の**生死**を見る床 (`maxLength` が 0 件なら走査が死んでいる)。
 * 5. 規則が**実際に当たる**ことを、同じ検査の中で標本に対して確かめる
 *    (CLAUDE.md:「不在を主張する検査には、標本を添える」)。
 */
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'tinyglobby';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import {
  MAX_AXIS_LABEL_CHARS,
  MAX_CHART_TITLE_CHARS,
  MAX_DEPARTMENT_CHARS,
  MAX_EVALUATED_AT_CHARS,
  MAX_MEMBER_NAME_CHARS,
  MAX_MEMBER_NOTE_CHARS,
} from '../../shared/teamRadarState';
import { MAX_TOKEN_CHARS } from '../security/vault';
import { MAX_AUTH_CODE_CHARS } from '../oauth/pkce';
import {
  MAX_CALLBACK_PASTE_CHARS,
  MAX_OAUTH_CLIENT_ID_CHARS,
  MAX_OAUTH_REDIRECT_URI_CHARS,
} from '../oauth/callbackPaste';

const REPO = join(__dirname, '..', '..', '..');

/** `maxLength={<数字>}` —— 字面の天井。 */
const LITERAL_RE = /maxLength=\{\s*\d/;

/**
 * コメントを落とす (`desktopPathClaims.test.ts` と同じ理由・同じ形)。
 *
 * **これを付けるまで、この検査は自分の説明文を掴んで落ちた** —— 直した形を説明する
 * ために `ServiceActionPanel.tsx` の注記が古い書き方 (`maxLength={2000}`) を引用して
 * おり、走査はそれを現物として数えた (パス 161 で同じことを 1 度やっている:
 * 「規則について書いた文書は、規則そのものと見分けられなければならない」)。
 *
 * 落とし過ぎは**見逃す向き**なので、下の「対照」が規則が実際に当たることを標本で
 * 確かめる (落とし過ぎて何も見えなくなったら、床の検査が鳴る)。
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** `maxLength` そのもの (走査の生死を見る床に使う)。 */
const ANY_RE = /maxLength\s*=/;

interface Site {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function screens(): string[] {
  return globSync('src/renderer/**/*.tsx', { cwd: REPO, absolute: true }).filter(
    (f) => !f.includes('__tests__'),
  );
}

function findSites(re: RegExp): Site[] {
  const out: Site[] = [];
  for (const abs of screens()) {
    // 行番号を保つため、コメントは**空白に置き換える** (行を消さない)。
    stripComments(readOriginalSource(abs))
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line)) {
          out.push({ file: relative(REPO, abs).replace(/\\/g, '/'), line: i + 1, text: line.trim() });
        }
      });
  }
  return out;
}

/**
 * 字面の天井が許される欄 —— **理由つきで 1 行ずつ**。
 *
 * ここに載せるのは「名前を付ける先が無い / 書式そのものの長さ」だけ。
 * 検証側に同じ数が在るなら、それは定数にする側である (台帳ではなく実装を直す)。
 */
const LITERAL_ALLOWED: readonly { readonly file: string; readonly why: string }[] = [
  {
    file: 'src/renderer/pages/TemplatesPage.tsx',
    why:
      '色の欄の `maxLength={7}` は `#rrggbb` という書式そのものの長さ (政策の天井ではない)。'
      + '検証側に同じ数の写しは無く、走査でも 1 件だけ。名前を付ける先 (色の検証) が'
      + 'リポジトリに無いので、定数を置くと読む所が 1 つしか無い名前になる。',
  },
];

describe('入力欄の天井は名前で持つ (パス 167)', () => {
  it('★ 字面の `maxLength={<数字>}` は台帳に載っている画面だけ', () => {
    const sites = findSites(LITERAL_RE);
    const allowed = new Set(LITERAL_ALLOWED.map((r) => r.file));
    const stray = sites.filter((s) => !allowed.has(s.file));
    expect(
      stray.map((s) => `${s.file}:${s.line} ${s.text}`),
      '入力欄の天井を字面で持っている。定数を 1 つ置いて画面と検証の両方が読むこと'
        + ' (書式そのものの長さなら台帳に理由つきで載せる)',
    ).toEqual([]);
  });

  it('★ 台帳は双方向 — 現物の無い行は落とす', () => {
    const sites = findSites(LITERAL_RE);
    for (const row of LITERAL_ALLOWED) {
      expect(
        sites.some((s) => s.file === row.file),
        `${row.file} に字面の maxLength はもう無い — 台帳から外す`,
      ).toBe(true);
      expect(row.why.length, `${row.file} の理由が空`).toBeGreaterThan(20);
    }
  });

  it('走査が死んでいない (maxLength そのものは在る)', () => {
    /*
     * 2026-09-12 実測 **16 件**。同日の朝は 59 件で床は 25 だったが、パス 183 が
     * 台帳 (writeFieldLimits.ts) の欄 24 個から `maxLength` を外した
     * (切らずに断る形へ) ので、床のほうが実測を上回って**この検査が鳴った** ——
     * 床は正しく働いた。残る 16 件は台帳の外の欄 (トークン・ティッカー・
     * 軸ラベルなど) で、こちらは切っても外へ出ない。床は実測の半分に置き直す。
     */
    expect(findSites(ANY_RE).length).toBeGreaterThanOrEqual(8);
  });

  /**
   * **規則が実際に当たることを、標本で確かめる。** 綴りが 1 つ違えば
   * 上の 2 件はどの木でも通る空の検査になる。
   */
  it('★ 対照: 規則は字面の書き方に当たり、定数の書き方には当たらない', () => {
    for (const sample of ['maxLength={2000}', 'maxLength={ 64 }', 'maxLength={7}']) {
      expect(LITERAL_RE.test(sample), sample).toBe(true);
    }
    for (const sample of [
      'maxLength={MAX_RECORD_NOTE_CHARS}',
      'maxLength={GMAIL_DRAFT_FIELDS.body.max}',
      'maxLength={max}',
    ]) {
      expect(LITERAL_RE.test(sample), sample).toBe(false);
      expect(ANY_RE.test(sample), sample).toBe(true);
    }
  });
});

describe('画面と検証が同じ天井を読む (パス 167)', () => {
  const read = (rel: string): string => readOriginalSource(join(REPO, rel));

  /**
   * 天井ごとに「定数の名前」「その名前を読む場所 (画面と検証)」を並べる。
   * **名前で突き合わせる** —— 値で突き合わせると、たまたま同じ数の別の天井を
   * 通してしまう (64 が 2 つ在る)。
   */
  const PAIRS: readonly { readonly name: string; readonly files: readonly string[] }[] = [
    {
      name: 'MAX_RECORD_NOTE_CHARS',
      files: [
        'src/renderer/components/ServiceActionPanel.tsx',
        'src/renderer/components/serviceActionUtils.ts',
        'src/main/clients/uber-eats.ts',
        'src/main/clients/demae-can.ts',
        'src/main/clients/real-estate.ts',
        'src/main/clients/mutual-funds.ts',
        'src/renderer/web-shim.ts',
      ],
    },
    {
      name: 'MAX_CHART_TITLE_CHARS',
      files: ['src/renderer/pages/TeamRadarPage.tsx', 'src/main/clients/teamradar.ts'],
    },
    {
      name: 'MAX_MEMBER_NAME_CHARS',
      files: ['src/renderer/pages/TeamRadarPage.tsx', 'src/shared/teamRadarState.ts'],
    },
    {
      name: 'MAX_DEPARTMENT_CHARS',
      files: ['src/renderer/pages/TeamRadarPage.tsx', 'src/shared/teamRadarState.ts'],
    },
    {
      name: 'MAX_EVALUATED_AT_CHARS',
      files: ['src/renderer/pages/TeamRadarPage.tsx', 'src/shared/teamRadarState.ts'],
    },
    {
      name: 'MAX_MEMBER_NOTE_CHARS',
      files: ['src/renderer/pages/TeamRadarPage.tsx', 'src/shared/teamRadarState.ts'],
    },
    {
      name: 'MAX_TOKEN_CHARS',
      files: ['src/renderer/pages/SettingsPage.tsx', 'src/renderer/security/vault.ts'],
    },
    {
      name: 'MAX_CALLBACK_PASTE_CHARS',
      files: ['src/renderer/pages/SettingsPage.tsx', 'src/renderer/oauth/callbackPaste.ts'],
    },
  ];

  it('★ 同じ天井を読む所がすべて名前で読んでいる', () => {
    for (const pair of PAIRS) {
      for (const f of pair.files) {
        expect(read(f).includes(pair.name), `${f} が ${pair.name} を読んでいない`).toBe(true);
      }
    }
  });

  it('★ チャート名の天井は画面と書き出しで一致する (2026-09-12 まで 64 / 120 でずれていた)', () => {
    // 画面だけが狭いと「打ち込めない題名を、別の入口は受ける」ことになる。
    const page = read('src/renderer/pages/TeamRadarPage.tsx');
    const main = read('src/main/clients/teamradar.ts');
    expect(page).toContain('maxLength={MAX_CHART_TITLE_CHARS}');
    expect(main).toContain('title.length <= MAX_CHART_TITLE_CHARS');
    // 字面が戻っていないこと (対照: この 2 つの綴りが実際に在ったので、当たる規則である)。
    expect(page, '画面が字面の 64 に戻っている').not.toContain('maxLength={64}');
    expect(main, '書き出しが字面の 120 に戻っている').not.toContain('title.length <= 120');
  });

  it('★ 貼る欄の天井は code の天井より広い (量が違うので別の名前で持つ)', () => {
    // `?code=…&state=…` を含む URL は、最大長の code より必ず長い。
    expect(MAX_CALLBACK_PASTE_CHARS).toBeGreaterThan(MAX_AUTH_CODE_CHARS);
  });

  it('天井はすべて正の整数 (名前を付けても値が壊れていないこと)', () => {
    const values = [
      MAX_RECORD_NOTE_CHARS,
      MAX_MEMBER_NAME_CHARS,
      MAX_DEPARTMENT_CHARS,
      MAX_EVALUATED_AT_CHARS,
      MAX_MEMBER_NOTE_CHARS,
      MAX_AXIS_LABEL_CHARS,
      MAX_CHART_TITLE_CHARS,
      MAX_TOKEN_CHARS,
      MAX_AUTH_CODE_CHARS,
      MAX_CALLBACK_PASTE_CHARS,
      MAX_OAUTH_CLIENT_ID_CHARS,
      MAX_OAUTH_REDIRECT_URI_CHARS,
    ];
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
