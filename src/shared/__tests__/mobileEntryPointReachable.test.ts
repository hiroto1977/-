import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readOriginalSource } from './originalSource';

/*
 * **公開した成果物は、公開した入口から辿れる。** (2026-09-26 · パス 480)
 *
 * `pages.yml` は 3 つのアプリ HTML を publish する:
 *
 * ```
 *   _site/app.html         フル版           gzip 4,056,514 B
 *   _site/standalone.html  同じ byte の別名  (app.html と同一内容)
 *   _site/lite.html        軽量版           gzip   982,003 B   ← 4.13 倍の差
 * ```
 *
 * そして**同じ workflow が軽量版を publish する理由を自分で書いている** ——
 * 「スマホ用ライト版: /lite.html (10MB のフル版はスマホ回線で開けないため)」。
 *
 * ところが 2026-09-26 に組んだランディング (= 公開サイトの根) を実測すると:
 *
 * ```
 *   href 合計                    81 件
 *   うち app.html を指す         76 件 (見出しの 2 つ + 74 枚のカード)
 *   lite の言及                   0 件
 *   manifest の start_url        ./app.html
 *   sw.js の precache           ./app.html を含む (lite.html は含まない)
 * ```
 *
 * つまり**「開けない」と自分で書いた版しか差し出していなかった**。軽量版は
 * publish されていて、実機の E2E も同じ件数を通しているのに、URL を知って
 * 打ち込む以外に届く道が 1 つも無い —— 逃げ口が「壊れている」のではなく
 * **最初から扉が無い**形 (パス 364 と同じ側)。
 *
 * ★ **なぜ既存の機械が見なかったか。** `artifactCspCensus` は「台帳の pages 行が
 *   CSP ステップに在る」を見る (= 出す物に門が掛かっているか) し、
 *   `distributedArtifactNoPwa` は「配布物が SW を撒かないか」を見る。
 *   **どちらも「出した物へ利用者が辿れるか」は問わない。** 門と到達性は別の軸である。
 *
 * この検査は母集団を `pages.yml` から導き (手で並べない)、行ごとに
 * **どうやって辿れるか** を名乗らせ、`entry-link` の行については
 * **実際に組んだランディング**にリンクが在ることを見る。
 */

const REPO = path.resolve(__dirname, '../../..');
const req = createRequire(import.meta.url);

interface LandingModule {
  readonly parseServices: () => { readonly id: string; readonly category: string }[];
  readonly buildHtml: (services: unknown[], tests: number) => string;
  readonly buildChoiceNote: (total: number) => string;
}
const landing = req('../../../scripts/build-landing.cjs') as LandingModule;

function readRepo(rel: string): string {
  return readOriginalSource(path.join(REPO, rel));
}

/** 注記を落とした pages.yml。注記の中の `_site/...` を publish と数えないため。 */
function workflowBody(): string {
  return readRepo('.github/workflows/pages.yml')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/**
 * **母集団は「CSP ゲートが `--app` として当てている物」から導く。**
 * そこがアプリ本体の権威ある一覧で、ランディングやデモ (`--document`) とは別物である。
 */
function publishedAppBuilds(): string[] {
  const body = workflowBody();
  const step = body.slice(body.indexOf('lint-artifact-csp.cjs'));
  const cut = step.indexOf('- uses:');
  const args = cut >= 0 ? step.slice(0, cut) : step;
  const apps = [...args.matchAll(/--app\s+_site\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]!);
  return [...new Set(apps)].sort();
}

/** `cp ... _site/<name>` で実際に置かれる HTML (逆向きの床に使う)。 */
function copiedHtml(): string[] {
  const names = [...workflowBody().matchAll(/_site\/([A-Za-z0-9._-]+\.html)/g)].map((m) => m[1]!);
  return [...new Set(names)].sort();
}

type Reach = 'entry-link' | 'alias';

interface Row {
  readonly file: string;
  readonly reach: Reach;
  readonly why: string;
}

/**
 * publish するアプリ本体ごとの**辿り方**。
 *
 * `entry-link` … ランディングが名前つきで link する (見出しとフッターの 2 か所)。
 * `alias`      … 別の行と byte が同一で、名前だけが違う。2 つ並べて link すると
 *                「別のビルドが 2 つある」と読めてしまうので link しない。
 */
/** 保留の決まり文句。標本つきで下の it が的に当たることを確かめる。 */
const PLACEHOLDER_WHY = /^(同上|同じ|TBD|後で)/;

const ROWS: readonly Row[] = [
  {
    file: 'app.html',
    reach: 'entry-link',
    why: 'フル版。ランディングの主要アクションとフッターが名指しする。',
  },
  {
    file: 'lite.html',
    reach: 'entry-link',
    why:
      '軽量版 (学術コーパス非搭載)。pages.yml が「10MB のフル版はスマホ回線で開けないため」と'
      + ' publish の理由を書いている当の版で、2026-09-26 まで入口から辿れなかった。',
  },
  {
    file: 'standalone.html',
    reach: 'alias',
    why:
      'app.html と同じ byte (pages.yml が同じ dist/standalone.html を 2 つの名前へ cp する)。'
      + '配布物の名前をそのまま公開しているので、保存済みの URL が生き続ける。'
      + '別のビルドとして link はしない。',
  },
];

/** 実際に組んだランディング (写しではなく builder の出力)。 */
function landingHtml(): string {
  const services = landing.parseServices();
  return landing.buildHtml(services, 1);
}

function linkCount(html: string, file: string): number {
  return html.split(`href="./${file}"`).length - 1;
}

describe('公開したアプリ本体は入口から辿れる (パス 480)', () => {
  const published = publishedAppBuilds();
  const html = landingHtml();

  it('★ 走査が死んでいない (pages.yml から 3 本以上を読めている)', () => {
    expect(published.length, 'CSP ステップの --app が読めていない').toBeGreaterThanOrEqual(3);
    expect(published).toContain('app.html');
    expect(published).toContain('lite.html');
  });

  it('★ 母集団と台帳が両方向に一致する', () => {
    expect([...ROWS].map((r) => r.file).sort()).toEqual(published);
  });

  it('★ 台帳の理由が空でない (保留の決まり文句を置けない)', () => {
    // **不在の主張に標本を添える** (CLAUDE.md の規約) —— 針が綴り 1 つ違えば
    // 黙るので、禁じたい文面に**実際に当たる**ことを同じ it で示す。
    expect('同上。', 'この針が的に当たらない = 綴りがずれた').toMatch(PLACEHOLDER_WHY);
    expect('TBD', 'この針が的に当たらない').toMatch(PLACEHOLDER_WHY);
    expect(ROWS[0]!.why, '実物の理由が決まり文句として拾われる = 針が広すぎる').not.toMatch(
      PLACEHOLDER_WHY,
    );
    for (const r of ROWS) {
      expect(r.why.length, `${r.file} の理由が短すぎる`).toBeGreaterThanOrEqual(15);
      expect(r.why, `${r.file} の理由が省略形`).not.toMatch(PLACEHOLDER_WHY);
    }
  });

  it.each(ROWS.filter((r) => r.reach === 'entry-link'))(
    '★ $file はランディングが 2 か所で名指しする',
    ({ file }) => {
      expect(
        linkCount(html, file),
        `${file} への link が 2 未満 —— publish した版のうち入口から辿れない物を作らない`,
      ).toBeGreaterThanOrEqual(2);
    },
  );

  it('★ alias の行は link しない (同じ byte を 2 つの版に見せない)', () => {
    for (const r of ROWS.filter((x) => x.reach === 'alias')) {
      expect(linkCount(html, r.file), `${r.file} は alias なのに link されている`).toBe(0);
    }
  });

  it('★ 逆向き: _site へ置かれる HTML のうち、アプリ本体は全部この台帳に在る', () => {
    // publish される HTML には landing (index.html) とデモ 3 本も在る。
    // それらは `--document` 側なのでこの台帳の母集団ではない —— **母集団の定義が
    // 狭いことを明示する**ため、ここで差分を名前つきで確かめる。
    const docs = ['index.html', 'counseling-demo.html', 'deliberation-demo.html', 'research-demo.html'];
    const rest = copiedHtml().filter((f) => !docs.includes(f));
    expect(rest.sort(), '_site へ置かれるアプリ HTML が台帳とずれた').toEqual(published);
  });

  it('★ 選択の説明は「何が違うか」を述べる (大きさだけを並べない)', () => {
    const note = landing.buildChoiceNote(74);
    expect(note, '軽量版の違い (学術コーパス) を述べていない').toContain('学術コーパス');
    expect(note, 'サービス数を渡した値から出していない').toContain('74');
  });

  it('★ その説明が実際にランディングへ出ている (関数が在るだけでは足りない)', () => {
    /*
     * **対照 A を回して足した検査** (2026-09-26)。
     * 直す前の姿へ戻すと上の `it` は**通った** —— `buildChoiceNote` を関数として
     * 呼んでいるだけで、その出力が HTML へ入っているかを誰も見ていなかった
     * (法則 mention-vs-declaration の、自分の検査の中での現れ)。
     */
    expect(html, '説明の枠 (.build-note) がランディングに無い').toContain('class="note build-note"');
    expect(html, '説明の本文がランディングに描かれていない').toContain('学術コーパス');
  });

  it('★ 対照: 針が的に当たる (存在しない名前は 0 件と数える)', () => {
    expect(linkCount(html, 'nope-there-is-no-such-build.html')).toBe(0);
    expect(linkCount(html, 'app.html')).toBeGreaterThanOrEqual(2);
  });
});

/*
 * **precache は入口の版を選ばない。** (パス 480)
 *
 * `sw.js` の `install` が取る一覧は `serviceWorker.test.ts` が振る舞いで留めている。
 * ここで見るのは**その一覧と publish の母集団の関係**: アプリ本体はどれも
 * install の precache に入っていないこと。1 つでも入れば、ランディングを開いた
 * だけの訪問者が背景でそれを取る (実測 gzip 3.87 MiB / precache 全体の 99.76%)。
 */
describe('publish したアプリ本体は install の precache に入らない (パス 480)', () => {
  it('★ precache の一覧に publish するアプリ本体が 1 つも無い', () => {
    const sw = readRepo('assets/sw.js');
    const decl = /const PRECACHE = \[([^\]]*)\]/.exec(sw);
    expect(decl, 'sw.js の PRECACHE 宣言が読めない (走査が的を外した)').not.toBeNull();
    const urls = [...decl![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(urls.length, 'precache が空 = 走査の誤り').toBeGreaterThan(0);
    const offenders = urls.filter((u) => publishedAppBuilds().some((b) => u.endsWith(b)));
    expect(
      offenders,
      'アプリ本体を install で取ると、入口を開いただけの訪問者に転送量を負わせる',
    ).toEqual([]);
  });

  it('★ 対照: 針が的に当たる (app.html を足せば拾う)', () => {
    const urls = ['./index.html', './app.html'];
    const offenders = urls.filter((u) => publishedAppBuilds().some((b) => u.endsWith(b)));
    expect(offenders).toEqual(['./app.html']);
  });
});
