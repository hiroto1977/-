/**
 * **作った物が一覧に出る画面は、成功したら取り直す** (2026-09-12 · パス 173)。
 *
 * ## 実測 (2026-09-12)
 *
 * 書く action を呼ぶ画面は**走査で 16** (手で並べたら 11 で、5 つ落としていた ——
 * パス 107 と同じ形)。そのうち成功後に `refresh()` を呼んでいたのは
 * **2 つだけ** (`Microsoft365Page` と `EmotionsPage`)。`NotionPage` を駆動して気付いた ——
 * 「作成成功」と出るのに一覧は `ページ 0` のままで、**作った物が画面に出ない**。
 * 利用者からは出来たのか分からず、押し直して 2 つ作る形になる (パス 124 / 126 の家系)。
 *
 * ## ただし「10 画面の欠陥」ではなかった
 *
 * 数えただけでは 14/16 だが、**その画面が並べている物**を見ると話が変わる:
 *
 * | 画面 | 並べている物 | 作る物 | 一覧に出るか |
 * | --- | --- | --- | --- |
 * | Notion | 検索結果 (最近のページ) | ページ | **出る** |
 * | Calendar | Upcoming Events | 予定 | **出る** |
 * | Drive | Recent Files (種別で絞らない) | フォルダ | **出る** |
 * | Slack | チャンネル | メッセージ | 出ない |
 * | GitHub | Pull Requests | issue | 出ない |
 * | Gmail | 受信トレイ | 下書き | 出ない |
 * | Atlassian | サイト / Jira プロジェクト | issue | 出ない |
 * | WordPress | サイト | 投稿の下書き | 出ない |
 * | Canva | デザイン / ブランドキット | フォルダ | 出ない |
 * | Cloudflare | ゾーン | DNS レコード / パージ | 出ない |
 *
 * **出ない画面で取り直すのは無駄な通信**なので、直したのは 3 画面
 (Notion / Calendar / Drive) だけ。「数えた」と「効く」は別である ——
 14/16 を一律に直すと、**11 画面に意味の無い通信を足して**「直した」と言うことになる。
 *
 * ## 台帳は双方向
 *
 * 「出る」の行は `refresh()` を**呼ぶ**こと、「出ない」の行は**呼ばない**ことを見る。
 * 片方向だと、後から一覧の中身が変わったとき (例: Gmail が下書きも並べる) に
 * 気付けない。母集団は「書く action を invoke する画面」を走査で数える。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const PAGES = path.resolve(__dirname, '../pages');

/** 書く action を呼ぶ画面 (成功の枝を持つ物) を走査で数える。 */
function writingPages(): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(PAGES)) {
    if (e.isDirectory() || !e.name.endsWith('.tsx')) continue;
    const src = readOriginalSource(path.join(PAGES, e.name));
    if (/serviceHub[?.]*\.invoke</.test(src) && /if \(res\.ok\)/.test(src)) out.push(e.name);
  }
  return out;
}

/** 成功の枝の中で `refresh()` を呼んでいるか。 */
function refreshesOnSuccess(src: string): boolean {
  // `if (res.ok) {` から対応する `} else` / 閉じ括弧までを見る (成功の枝だけ)。
  const at = src.indexOf('if (res.ok)');
  if (at < 0) return false;
  const open = src.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (; end < src.length; end += 1) {
    if (src[end] === '{') depth += 1;
    else if (src[end] === '}') { depth -= 1; if (depth === 0) break; }
  }
  return /\brefresh\(\)/.test(src.slice(open, end));
}

/** 作った物がこの画面の一覧に出るか + その理由。 */
const SHOWS_WHAT_IT_CREATED: Readonly<Record<string, { readonly shows: boolean; readonly why: string }>> = {
  'NotionPage.tsx': { shows: true, why: '並べるのは Notion の検索結果 (最近のページ)。作ったページはそこに入る' },
  'CalendarPage.tsx': { shows: true, why: '並べるのは Upcoming Events (timeMin=now の 10 件)。作った予定はそこに入る' },
  'DrivePage.tsx': { shows: true, why: '並べるのは Recent Files (modifiedTime 降順・種別で絞っていない)。フォルダも file なので先頭に入る' },
  'Microsoft365Page.tsx': { shows: true, why: 'メール送信・予定作成の後に一覧を取り直す (2026-09-12 以前から呼んでいた唯一の画面)' },
  'SlackPage.tsx': { shows: false, why: '並べるのはチャンネル。送ったメッセージはチャンネルの一覧を変えない' },
  'GithubPage.tsx': { shows: false, why: '並べるのは Pull Requests。作るのは issue で、PR の一覧には出ない' },
  'GmailPage.tsx': { shows: false, why: '並べるのは受信トレイのスレッド。作るのは下書きで、受信トレイには出ない' },
  'AtlassianPage.tsx': { shows: false, why: '並べるのはサイトと Jira プロジェクト。作るのは issue で、どちらの一覧にも出ない' },
  'WordPressPage.tsx': { shows: false, why: '並べるのはサイト。作るのは投稿の下書きで、サイトの一覧を変えない' },
  'CanvaPage.tsx': { shows: false, why: '並べるのはデザインとブランドキット。作るのはフォルダで、どちらにも出ない' },
  'CloudflarePage.tsx': { shows: false, why: '並べるのはゾーン。作る / 消すのは DNS レコードとキャッシュで、ゾーンの一覧を変えない' },
  /*
   * **走査が手書きより 5 件多かった** (2026-09-12 実測)。最初は「外部サービスへ書く 11 画面」と
   * 手で並べていたが、走査は 16 画面を返した —— 落としていた 5 つのうち `EmotionsPage` は
   * **既に取り直していた** (気分の記録と分析の 2 か所)。つまり直す前の実測は 1/11 ではなく
   * **2/16** である (パス 107 で母集団を手書きして 3 画面落としたのと同じ形)。
   */
  'EmotionsPage.tsx': { shows: true, why: '並べるのは気分の記録と分析の一覧。記録も分析もそこに入る (2026-09-12 以前から 2 か所で取り直していた)' },
  'TalentPage.tsx': { shows: false, why: '登用判定の結果は画面の state に出る (一覧ではない)。保存した申告は自分で state を持つ' },
  'SecurityPage.tsx': { shows: false, why: '漏洩確認と URL 走査の結果は画面の state に出る。並べる Norton の状態は変わらない' },
  'SkillsPage.tsx': { shows: false, why: 'skill の出力は画面の state に出る。並べるのは skill の一覧で、走らせても増減しない' },
  'OllamaPage.tsx': { shows: false, why: '応答は画面の state に出る。並べるのは起動状態とモデルの一覧で、1 往復では変わらない' },
};

describe('書いたら取り直す — 一覧に出る画面だけ (パス 173)', () => {
  const pages = writingPages();

  it('★ 走査が実物に当たる (書く画面が集まっている)', () => {
    expect(pages.length, '書く画面が見つからない (走査が死んでいる)').toBeGreaterThanOrEqual(10);
    expect(pages).toContain('NotionPage.tsx');
  });

  it('★ どの書く画面も台帳に在る (足した人が気付く)', () => {
    const orphans = pages.filter((p) => !(p in SHOWS_WHAT_IT_CREATED));
    expect(orphans, '台帳に無い書く画面 — 一覧に出るかを判断して載せる').toEqual([]);
  });

  it('★ 台帳の行はすべて現物 (消えた画面が残っていない)', () => {
    const stale = Object.keys(SHOWS_WHAT_IT_CREATED).filter((p) => !pages.includes(p));
    expect(stale, '台帳の古い行').toEqual([]);
  });

  it('★ 一覧に出る画面は、成功したら取り直す', () => {
    const missing = Object.entries(SHOWS_WHAT_IT_CREATED)
      .filter(([, row]) => row.shows)
      .filter(([p]) => !refreshesOnSuccess(readOriginalSource(path.join(PAGES, p))))
      .map(([p]) => p);
    expect(missing, '作った物が一覧に出るのに取り直していない画面').toEqual([]);
  });

  it('★ 一覧に出ない画面は取り直さない (無駄な通信を足さない)', () => {
    const wasteful = Object.entries(SHOWS_WHAT_IT_CREATED)
      .filter(([, row]) => !row.shows)
      .filter(([p]) => refreshesOnSuccess(readOriginalSource(path.join(PAGES, p))))
      .map(([p]) => p);
    expect(wasteful, '一覧が変わらないのに取り直している画面 — 台帳の判断が古いなら直す').toEqual([]);
  });

  it('★ 台帳の理由が空でない', () => {
    for (const [p, row] of Object.entries(SHOWS_WHAT_IT_CREATED)) {
      expect(row.why.length, `${p}: 理由が無い`).toBeGreaterThan(15);
    }
  });

  it('★ 対照: 成功の枝の中と外を取り違えない', () => {
    const inside = "const f = async () => {\n  if (res.ok) {\n    setX(1);\n    refresh();\n  } else {\n    setY(2);\n  }\n};";
    const outside = "const f = async () => {\n  if (res.ok) {\n    setX(1);\n  } else {\n    setY(2);\n  }\n  refresh();\n};";
    const neither = "const f = async () => {\n  if (res.ok) {\n    setX(1);\n  } else {\n    setY(2);\n  }\n};";
    expect(refreshesOnSuccess(inside), '成功の枝の中の refresh を拾えていない').toBe(true);
    expect(refreshesOnSuccess(outside), '枝の外の refresh を「中」と読んでいる').toBe(false);
    expect(refreshesOnSuccess(neither)).toBe(false);
  });
});
