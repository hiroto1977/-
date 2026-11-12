/**
 * **ブラウザ版でプロキシが要る書き込みは、押す前にそう言う** (2026-09-25 · パス 459)。
 *
 * ## 実測した欠陥 (2026-09-25 · 直す前)
 *
 * 実物の `web-shim.ts` を読み込み、保管庫に本物のトークンを入れ、プロキシだけ
 * 未登録にして **15 の書き込み action を実際に叩いた**:
 *
 * | 道 | 件数 | 実測 |
 * | --- | ---: | --- |
 * | プロキシが要る | **13** | 「この連携はブラウザの制約 (CORS) でプロキシが必要です…」 |
 * | 直接つながる | **1** | `github/create-issue` は api.github.com へ**実際に届いた** |
 * | 別の理由で先に断る | **1** | `security/scan-url` は VirusTotal の鍵が未設定 |
 *
 * 断りは正しく、働く道 (設定ページ) も名指しする。**偽だったのは時機**である ——
 * そこへ辿り着くまでに利用者は**本物の API トークンを保管庫へ貼り付け**、
 * フォームを埋めている。パス 454 / 455 / 456 / 457 と同じ判断で、**断りは押す前に言う。**
 *
 * ★ **アプリ自身が正しい文を別の場所で持っていた** —— `Microsoft365Page` と
 * (パス 457 が直した) `googleLiveScopeNote` は「プロキシ設定が要ります（設定ページ）」と
 * **前提として**述べる。実測すると、プロキシを要する 11 サービスのうちその前提を
 * 名乗るのは **ms365 と Google の 3 画面だけ**だった (パス 398 / 408 / 451 / 457 / 458 と
 * 同じ非対称)。
 *
 * ★ **`SecurityPage` は「経由する」と述べるが「要る」とは述べていなかった** ——
 * 「設定したプロキシ (Cloudflare Worker) を経由するため、その運用者からも見えます」は
 * *経路の開示*であって前提ではない。未登録の利用者はそこから「登録が要る」を読み取れない。
 *
 * ## この検査が持つ物
 *
 * 1. **母集団は実装から導く** —— `proxyRoutedActions` (パス 154 が置いた走査) が
 *    `web-shim.ts` から「プロキシを通る action」を数える。台帳と**両方向**。
 * 2. 行ごとに、断りの**出どころ** (`shared` = 共有の部品 / `own` = その画面の文) を名乗り、
 *    種類ごとに要求を掛ける。
 * 3. **逃げ口** —— 断りはフォームを隠さない (既にプロキシを登録している人から
 *    送る口を奪わない · 法則 `escape-hatch-stays-open`)。振る舞いは
 *    `pages/__tests__/proxyRequiredOnScreen.test.ts` が実物の画面で見る。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { proxyRoutedActions } from './webShimScan';
import { proxyRequiredNote } from '../../shared/buildDestinations';
import { stripNonCode } from '../../shared/__tests__/stripNonCode';
import { readOriginalDirEntries } from '../../shared/__tests__/originalSource';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string): string => readOriginalSource(path.join(REPO_ROOT, rel));

/** その画面が断りをどう出すか。 */
type Via = 'shared' | 'own';

interface Row {
  /** `<service>/<action>` —— `proxyRoutedActions` が返す鍵と同じ綴り。 */
  readonly key: string;
  /** 断りを描くファイル (リポジトリ相対)。 */
  readonly rendered: string;
  readonly via: Via;
  readonly why: string;
}

/**
 * **プロキシを通る 14 の書き込みと、その断りの出どころ。**
 *
 * `own` の 5 行は自前の文を持つ (どちらも「プロキシ設定が要ります」と**前提として**述べる)。
 * 揃えて共有の部品へ寄せないのは、この 2 つの文が**取得と送信を言い分ける**という
 * 別の仕事も同時にしているため —— 差し替えるとパス 457 が直した非対称が戻る。
 */
const LEDGER: readonly Row[] = [
  { key: 'notion/create-page', rendered: 'src/renderer/pages/NotionPage.tsx', via: 'shared', why: '作成フォームの先頭。直す前は 1 文も述べていなかった' },
  { key: 'slack/send-message', rendered: 'src/renderer/pages/SlackPage.tsx', via: 'shared', why: '送信フォームの先頭。直す前は 1 文も述べていなかった' },
  { key: 'atlassian/create-issue', rendered: 'src/renderer/pages/AtlassianPage.tsx', via: 'shared', why: '課題作成フォームの先頭。直す前は 1 文も述べていなかった' },
  { key: 'canva/create-folder', rendered: 'src/renderer/pages/CanvaPage.tsx', via: 'shared', why: 'フォルダ作成フォームの先頭。直す前は 1 文も述べていなかった' },
  { key: 'wordpress/create-post-draft', rendered: 'src/renderer/pages/WordPressPage.tsx', via: 'shared', why: '下書き作成フォームの先頭。直す前は 1 文も述べていなかった' },
  { key: 'cloudflare/create-dns-record', rendered: 'src/renderer/pages/CloudflarePage.tsx', via: 'shared', why: 'DNS 作成フォームの先頭。同じ画面の「Cloudflare プロキシを通す（オレンジ雲）」は別物 (DNS レコードの旗) なので、綴りが在っても前提を述べたことにならない' },
  { key: 'cloudflare/purge-cache', rendered: 'src/renderer/pages/CloudflarePage.tsx', via: 'shared', why: 'パージフォームの先頭。同上の理由で自前の文では満たせない' },
  { key: 'security/check-email-breach', rendered: 'src/renderer/pages/SecurityPage.tsx', via: 'shared', why: '既存の開示 (経路に誰が居るか) の直後・入力欄の前。開示は「経由する」で、前提の「要る」は別に要る' },
  { key: 'security/scan-url', rendered: 'src/renderer/pages/SecurityPage.tsx', via: 'shared', why: '同上。実測ではこの action だけ VirusTotal の鍵が先に断るが、鍵を入れればプロキシの壁に当たる' },
  { key: 'calendar/create-event', rendered: 'src/shared/buildDestinations.ts', via: 'own', why: 'パス 457 の `googleLiveScopeNote` が取得と送信を言い分けたうえで前提を述べる (Drive / Calendar / Gmail の 3 画面が共有するカード)' },
  { key: 'gmail/create-draft', rendered: 'src/shared/buildDestinations.ts', via: 'own', why: '同じカード (`googleLiveScopeNote`)' },
  { key: 'drive/create-folder', rendered: 'src/shared/buildDestinations.ts', via: 'own', why: '同じカード (`googleLiveScopeNote`)' },
  { key: 'microsoft-365/send-mail', rendered: 'src/renderer/pages/Microsoft365Page.tsx', via: 'own', why: '2026-08 から「メール送信と予定作成はブラウザ版でも動きます —— プロキシ設定が要ります（設定ページ）」と述べる。直す向きをアプリ自身が持っていた当の文' },
  { key: 'microsoft-365/create-event', rendered: 'src/renderer/pages/Microsoft365Page.tsx', via: 'own', why: '同じ 1 文が両方の action を覆う' },
];

/** 自前の文が名乗るべき前提の綴り。 */
const OWN_NEEDLE = 'プロキシ設定が要ります';

describe('プロキシが要る書き込みの断り (母集団は実装から導く)', () => {
  it('★ 母集団と台帳が一致する (両方向)', () => {
    const measured = proxyRoutedActions(read('src/renderer/web-shim.ts')).sort();
    expect(measured.length, '走査が死んでいる').toBeGreaterThanOrEqual(10);
    expect(measured).toEqual([...LEDGER].map((r) => r.key).sort());
  });

  it('★ `shared` の行は共有の部品を描いている (画面ごとに行の数だけ)', () => {
    /*
     * **数える** —— `CloudflarePage` と `SecurityPage` は台帳に 2 行ずつ持つので、
     * 「1 つでも在れば良い」にすると**片方を外しても黙る**。対照 D (2 つのうち
     * 1 つを外す) を 1 度その形で回して、鳴ったのが振る舞いの 1 件だけだった
     * —— 綴りの層でも鳴るようにこの形にした。
     */
    const need = new Map<string, number>();
    for (const r of LEDGER.filter((x) => x.via === 'shared')) {
      need.set(r.rendered, (need.get(r.rendered) ?? 0) + 1);
    }
    for (const [file, n] of need) {
      const src = read(file);
      expect(src, `${file} が ProxyRequiredNote を import していない`)
        .toMatch(/import\s*\{[^}]*ProxyRequiredNote[^}]*\}\s*from/);
      expect(
        (src.match(/<ProxyRequiredNote /g) ?? []).length,
        `${file}: 断りの数が台帳の行数に足りない`,
      ).toBeGreaterThanOrEqual(n);
    }
  });

  it('★ `own` の行は自前の文で前提を名乗る', () => {
    for (const r of LEDGER.filter((x) => x.via === 'own')) {
      expect(read(r.rendered), `${r.key}: ${r.rendered} が「${OWN_NEEDLE}」と述べていない`)
        .toContain(OWN_NEEDLE);
    }
  });

  it('★ 針の標本: この綴りは「経由する」だけの開示には当たらない', () => {
    // 直す前の `SecurityPage` の開示そのもの —— 経路は述べるが前提は述べない。
    const disclosureOnly = 'ブラウザ版では、設定したプロキシ (Cloudflare Worker) を経由するため、その運用者からも見えます。';
    expect(disclosureOnly).not.toContain(OWN_NEEDLE);
    // 肯定側 —— 実物の ms365 の文には当たる。
    expect('メール送信と予定作成はブラウザ版でも動きます —— プロキシ設定が要ります（設定ページ）。')
      .toContain(OWN_NEEDLE);
  });

  it('台帳の理由が省略形でない', () => {
    for (const r of LEDGER) expect(r.why.length, r.key).toBeGreaterThan(15);
  });

  it('★ 断りはフォームを隠さない (描く物を消していない)', () => {
    // 共有の部品は `null` を返すだけで、周りの JSX を条件に取らない。
    const src = read('src/renderer/components/ProxyRequiredNote.tsx');
    expect(src).toContain('if (note === null) return null;');
    // 画面側は**自己完結のタグ**として置く —— 閉じタグを持つと入力欄を子に取れて、
    // 断りが出ない実行形態でフォームごと消える形が作れる。
    for (const r of LEDGER.filter((x) => x.via === 'shared')) {
      const body = read(r.rendered);
      expect(body, `${r.key}: 断りが閉じタグを持つ (何かを囲っている)`).not.toContain('</ProxyRequiredNote>');
      expect(body, `${r.key}: 自己完結のタグで置かれていない`).toMatch(/<ProxyRequiredNote what="[^"]+" \/>/);
    }
  });
});

describe('文そのもの (共有の判定)', () => {
  it('★ ブラウザ版でだけ言う', () => {
    expect(proxyRequiredNote('browser', 'ページの作成')).toContain('プロキシ (Cloudflare Worker) の登録が要ります');
    expect(proxyRequiredNote('desktop', 'ページの作成')).toBeNull();
    expect(proxyRequiredNote(null, 'ページの作成')).toBeNull();
  });

  it('★ 押した後に出る断りと同じ語を先に見せる', () => {
    const note = proxyRequiredNote('browser', 'ページの作成')!;
    // `web-shim.ts` の `getProxyTransport()` が実際に返す文の一部。
    expect(read('src/renderer/web-shim.ts')).toContain('プロキシが必要です');
    expect(note).toContain('「プロキシが必要です」と断られます');
  });

  it('★ 働く道を名指しする (設定ページの節の見出し)', () => {
    const note = proxyRequiredNote('browser', 'X')!;
    expect(note).toContain('BYO プロキシ');
    expect(read('src/renderer/pages/SettingsPage.tsx'), '設定画面にその節が無い').toContain('BYO プロキシ');
  });

  it('何を送るかは呼び手が名乗る (文が主語を持つ)', () => {
    expect(proxyRequiredNote('browser', 'キャッシュのパージ')).toContain('キャッシュのパージは、');
  });
});

/*
 * **画面に星印を出さない** (2026-09-25 · パス 459)。
 *
 * `Microsoft365Page.tsx` は 2026-08 から
 * 「実データの`**`取得`**`はデスクトップ版の機能です…」と**JSX の素のテキストに**
 * Markdown の強調記法を書いており、React はそれを解釈しないので
 * **画面に `**取得**` と星印が出ていた**。直す前の実測で、出荷される `.tsx` の
 * JSX テキストに `**` を持つ行は**この 1 行だけ**だった (走査で確かめた)。
 *
 * 走査は `stripNonCode` を通す —— 注記と文字列の中の `**` は画面に出ないし、
 * このリポジトリの docblock は強調記法を多用する
 * (通さないと**自分の説明文で落ちる** · 法則 `mention-vs-declaration`)。
 * べき乗演算子 `**` も残るが、出荷 `.tsx` の実測は 0 件なので床は要らない。
 */
describe('JSX の素のテキストに Markdown の強調記法を書かない', () => {
  function tsxFiles(dir: string, out: string[] = []): string[] {
    for (const e of readOriginalDirEntries(path.join(REPO_ROOT, dir))) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== '__tests__') tsxFiles(rel, out);
      } else if (e.name.endsWith('.tsx')) {
        out.push(rel);
      }
    }
    return out;
  }

  it('★ 出荷される .tsx に、描かれる `**` が 1 つも無い', () => {
    const files = tsxFiles('src/renderer');
    expect(files.length, '走査が死んでいる').toBeGreaterThanOrEqual(50);
    const hits: string[] = [];
    for (const f of files) {
      stripNonCode(read(f), { keepQuoteChars: true })
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('**')) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
        });
    }
    expect(hits, '画面に星印が出る').toEqual([]);
  });

  it('★ 針の標本: 直す前の行に当たり、注記の中では当たらない', () => {
    const before = '            ※ 実データの**取得**はデスクトップ版の機能です。\n';
    expect(stripNonCode(before, { keepQuoteChars: true })).toContain('**');
    // 同じ綴りを注記に書いても数えない (この検査の docblock がそうしている)。
    expect(stripNonCode('/** ここは **取得** と書いていた */\n', { keepQuoteChars: true }))
      .not.toContain('**');
  });
});
