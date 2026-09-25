/** @vitest-environment jsdom */
/**
 * **名指しした操作子は、その綴りで画面に在る** (2026-09-23 · パス 426)。
 *
 * パス 425 は「「X」の画面」の X が `SERVICES` のラベルであることを留めた ——
 * *画面の名前*の側である。同じ家系の**画面の中の操作子の名前**は測っていなかった。
 *
 * ## 実測 (2026-09-23)
 *
 * 利用者へ出す文が `「X」ボタン / タブ / 欄 / を押 / から消せ` の形で名指しする物は
 * **14 件**。実物を当たると **13 件は在り、1 件だけ無かった**:
 *
 * | 名指し | 実物 |
 * | --- | --- |
 * | 「形式の合わない**記録**」から消せます (`sales.ts` ×2) | 点検パネルは「形式の合わない**レコード**の点検」—— **その綴りは設定画面 15,725 字のどこにも無い** |
 *
 * 逃げ口そのものは在る (パス 425 が確かめた) ので、これは**探せるか**の側の欠陥である ——
 * 利用者が設定画面でその語を探しても当たらない。**指さす先は利用者が探せる綴りで。**
 *
 * ## 直す向き
 *
 * **文を実物へ寄せた** (レコード) —— パネルは 6 か所で「レコード」と綴り、確認の
 * ダイアログもそうなので、そちらを 6 か所直すほうが面が広い。**名乗られる側ではなく
 * 名乗る側を直す**のが最小で、しかも利用者が読むのは名乗る文のほうである。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import { SERVICES } from '../../services';
import { settleUntil } from '../../__tests__/jsdomWait';

/** `「X」` のあとが UI 要素を名乗る語。 */
const NAMED = /「([^」]{1,24})」(ボタン|タブ|欄|パネル|の画面|を押|から消せ|で消)/g;

type Kind =
  /** 設定画面の中の操作子 —— 実物の設定画面を描いて綴りを探す。 */
  | 'settings-control'
  /** その画面 (か、その画面が載せる部品) の操作子 —— 宣言のファイルに綴りが在る。 */
  | 'same-screen-control'
  /**
   * **別の画面**の操作子 (2026-09-25 · パス 454)。綴りが描画元のファイルに在ることに加え、
   * **そのファイルを実際に載せている画面が 1 枚以上在る**ことも要る ——
   * 部品だけ在って誰も載せていなければ、利用者はその操作子へ辿り着けない。
   */
  | 'other-screen-control'
  /** 画面の名前 —— `namedEscapeHatchReachable` が `SERVICES` と突き合わせる。 */
  | 'screen-label'
  /** このアプリの外の UI (第三者の管理画面)。 */
  | 'third-party'
  /**
   * **サービスの画面そのものが持つ操作子** (2026-09-25 · パス 455)。
   * `StatusBar` の `tokenSetup` のように、部品ではなく**画面のファイル**が
   * 綴りを持つ形。綴りを持つ画面が 1 枚以上在り、**その画面が `services.ts` から
   * 辿れる** (= 利用者が行ける) ことを要求する —— `other-screen-control` の
   * 「載せている画面が在るか」は、載せているのが画面自身のときは問えない。
   */
  | 'service-page-control'
  /** 実行時に値が入るので綴りが固定されない。 */
  | 'runtime-label';

interface Row {
  readonly name: string;
  readonly kind: Kind;
  /** `same-screen-control` / `other-screen-control` のとき、その綴りを描いているファイル。 */
  readonly renderedIn?: string;
  readonly why: string;
}

/** 理由の欄に置いてはいけない省略形 (何について同じなのかを次に読む人が確かめ直すことになる)。 */
const SHORTHAND = /^同上[。）)]?$/;

/** **今日の全量。** 走査が見つけた名前と 1 件ずつ対応する (両方向)。 */
const LEDGER: readonly Row[] = [
  {
    name: '形式の合わないレコード',
    kind: 'settings-control',
    why: '設定の点検パネルの見出し。2026-09-23 まで文は「形式の合わない記録」と綴っており、その語は設定画面に 1 度も出なかった。',
  },
  { name: 'Canva で編集する', kind: 'same-screen-control', renderedIn: 'src/renderer/pages/HomePage.tsx', why: '同じホーム画面の書き出しボタン (文も HomePage に在る)。' },
  { name: 'ファイルを開く', kind: 'same-screen-control', renderedIn: 'src/renderer/components/ExportActions.tsx', why: 'ホームが載せる書き出し部品のボタン。文はホームに在り、部品はその画面の中に描かれる。' },
  { name: '今すぐ作る', kind: 'same-screen-control', renderedIn: 'src/renderer/pages/HomePage.tsx', why: 'ライブラリの空状態が名指しする —— 文は**画面名も一緒に**述べる (「ホーム」ページの…) ので迷わない。' },
  { name: 'SVG を保存', kind: 'same-screen-control', renderedIn: 'src/renderer/pages/TeamRadarPage.tsx', why: 'チームレーダーの書き出しボタン (実物の label は「SVG を保存 (Canva 用)」で、名指しはその前方一致)。' },
  { name: 'チーム情報を保存', kind: 'same-screen-control', renderedIn: 'src/renderer/pages/TeamRadarPage.tsx', why: '同じ画面の保存ボタン。文は shared の状態モジュールが組むが、出る先はこの画面である。' },
  { name: 'もう一度確認', kind: 'same-screen-control', renderedIn: 'src/renderer/security/LockScreen.tsx', why: '24 語の控えを確かめ直すボタン。文は保管庫が組み、押す所は施錠画面に在る。' },
  { name: '接続テスト', kind: 'same-screen-control', renderedIn: 'src/renderer/pages/OllamaPage.tsx', why: '同じ Ollama 画面の疎通確認ボタン —— 文も同じ画面の案内文なので、押す所は目の前に在る。' },
  { name: '暗号化パスワード', kind: 'same-screen-control', renderedIn: 'src/renderer/components/BackupPanel.tsx', why: '同じ部品の入力欄 (placeholder がその綴りを出す)。' },
  { name: '更新', kind: 'same-screen-control', renderedIn: 'src/renderer/components/StatusBar.tsx', why: '全サービス画面が載せる共通の取得ボタン —— freee の空状態がそれを名指しする。' },
  {
    name: '削除',
    kind: 'same-screen-control',
    renderedIn: 'src/renderer/components/ManualDataSection.tsx',
    why: '効かない上書きを消すボタン (2026-09-24 · パス 447)。文は `manualData.ts` が組むが、押す所は同じ欄の同じ行に在る —— その行を見せる面はここだけなので、別の画面へ送ってはいけない。',
  },
  {
    name: 'Google でサインイン',
    kind: 'other-screen-control',
    renderedIn: 'src/renderer/components/GoogleConnectCard.tsx',
    why:
      'Drive / カレンダー / Gmail の 3 画面が載せる認証ボタン (2026-09-25 · パス 454)。'
      + '設定画面の貼り付け式 PKCE はデスクトップ版が読まない保管庫へ書くので、書く前に断って'
      + '**働く道**を名指しする —— そちらは `authorize()` → main の `setOAuthTokens` で'
      + '更新トークンつきの TokenSet を書く。**別の画面**なので、下の ★ は綴りだけでなく'
      + '「その部品を載せている画面が在るか」も見る。',
  },
  { name: 'KPI / BEP', kind: 'screen-label', why: '画面の名前。`namedEscapeHatchReachable.test.ts` が `SERVICES` のラベルと突き合わせる。' },
  {
    name: 'Ollama',
    kind: 'screen-label',
    why:
      '画面の名前 (2026-09-24 · パス 449)。AI コンシェルジュの自由質問にモデルを選ぶ口は無いので、' +
      '導入済みの一覧が出るこの画面を名乗る —— 下の ★ がこの綴りを `SERVICES` のラベルと突き合わせる。',
  },
  { name: '売上集計', kind: 'screen-label', why: '同じく画面の名前で、同じ検査が `SERVICES` と突き合わせる。' },
  {
    name: 'ライブラリ',
    kind: 'screen-label',
    why:
      '画面の名前 (2026-09-24 · パス 448)。コネクタの実行結果は `storage` と `library` に半分ずつ行くので、' +
      '`storage` の面がもう半分の行き先を名指しする —— 下の ★ がこの綴りを `SERVICES` のラベルと突き合わせる。',
  },
  { name: 'Access token', kind: 'third-party', why: 'Azure ポータル側のタブで、このアプリの画面ではない —— 実物の綴りを当てに行けない (相手が変えたら文も古びるが、それは相手の UI の話である)。' },
  { name: '{this.props.label}', kind: 'runtime-label', why: '描画の時点で画面のラベルが入る補間で、綴りは固定されない (入る値は `SERVICES` のラベルそのもの)。' },
  {
    name: 'Anthropic API キー',
    kind: 'service-page-control',
    why:
      'デスクトップ版で AI の鍵を入れる欄 (2026-09-25 · パス 455)。設定画面の `anthropic` スロットは'
      + '保管庫 (ブラウザ版だけが読む) へ書くので、デスクトップ版では断って働く道を名指しする —— '
      + 'ところが `anthropic` は `ServiceId` ではなく、デスクトップ版の鍵は skills / emotions / '
      + 'business / stocks / assistant の**サービスごとのスロット**に分かれるので、1 枚の画面では'
      + '名乗れない。だから「使う画面それぞれの欄」と述べ、下の ★ がその綴りを持つ画面を数える。',
  },
  {
    name: '${screen}',
    kind: 'runtime-label',
    why:
      'スロットごとの行き先 (2026-09-25 · パス 455)。入る値は `CredentialSlot.desktopScreen` の 8 つで、'
      + '**それが `SERVICES` のラベルであること**と**その画面に働く資格情報欄が在ること**は'
      + '`pages/__tests__/credentialSlotBuildGate.test.ts` が両方向で持つ (この走査は綴りしか見られない)。',
  },
];

/** 注記を落として**コードだけ**にする (**行番号は保つ**)。文字列は落とさない —— 数えたいのは利用者が読む文である。 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const full = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== '__tests__') walk(full, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function scanNames(): { name: string; at: string }[] {
  const hits: { name: string; at: string }[] = [];
  for (const dir of ['src/renderer', 'src/shared']) {
    for (const file of walk(dir)) {
      codeOnly(readOriginalSource(file)).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(new RegExp(NAMED.source, 'g'))) {
          if (!hits.some((h) => h.name === m[1])) hits.push({ name: m[1]!, at: `${file}:${i + 1}` });
        }
      });
    }
  }
  return hits;
}

/** `「…」` で囲まれた**言及**を落とす —— 描いている綴りだけを残す。 */
const withoutMentions = (src: string): string => src.replace(/「[^」]*」/g, '');

let container: HTMLDivElement;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([]),
    fetchSnapshot: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    invoke: () => Promise.resolve({ ok: false, code: 'x', message: 'x' }),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
    storageProtection: () => Promise.resolve({ mechanism: 'none', counts: {} }),
    eraseAll: () => Promise.resolve(),
  };
});

/** 実物の設定画面を描いて全文を返す (**綴りが在るかは描かないと分からない**)。 */
async function settingsText(): Promise<string> {
  const def = SERVICES.find((s) => s.id === 'settings');
  if (!def) throw new Error('settings service missing');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(def.page)); });
  await settleUntil(() => (container.textContent ?? '').length > 500, '設定画面が描かれる');
  const t = (container.textContent ?? '').replace(/\s+/g, ' ');
  await act(async () => { root!.unmount(); });
  root = null;
  container.remove();
  return t;
}

describe('名指しした操作子は、その綴りで実在する (パス 426)', () => {
  const hits = scanNames();

  it('走査が空虚でない (針が死んでいれば鳴る)', () => {
    expect(hits.length).toBeGreaterThanOrEqual(14);
  });

  it('★ 針は実物の文に当たり、注記の中の言及には当たらない (mention-vs-declaration)', () => {
    const grab = (s: string): string[] => [...codeOnly(s).matchAll(new RegExp(NAMED.source, 'g'))].map((m) => m[1]!);
    expect(grab('  return `…（設定の「形式の合わないレコード」から消せます）。`;')).toEqual(['形式の合わないレコード']);
    expect(grab('            「ホーム」ページの「今すぐ作る」を押すと、ここに保存されます')).toEqual(['今すぐ作る']);
    expect(grab(' * 逃げ口 (設定の「形式の合わないレコード」) はこの文が')).toEqual([]);
    expect(grab('/* 「接続テスト」を押す */')).toEqual([]);
  });

  it('★ 走査が見つけた名前は全部台帳に在る', () => {
    const missing = hits.filter((h) => !LEDGER.some((r) => r.name === h.name));
    expect(missing.map((h) => `${h.at} 「${h.name}」`)).toEqual([]);
  });

  it('★ 台帳の行は全部走査で見つかる (消えた名指しが台帳に残らない)', () => {
    const stale = LEDGER.filter((r) => !hits.some((h) => h.name === r.name));
    expect(stale.map((r) => `「${r.name}」`)).toEqual([]);
  });

  it('理由は省略形でない', () => {
    // **不在の主張に標本を添える** (CLAUDE.md の規約)。
    expect(SHORTHAND.test('同上。')).toBe(true);
    expect(SHORTHAND.test('同じ画面の疎通確認ボタン。')).toBe(false);
    for (const r of LEDGER) {
      expect(r.why.length, `「${r.name}」の理由が短すぎる`).toBeGreaterThanOrEqual(15);
      expect(r.why, `「${r.name}」の理由が省略形`).not.toMatch(SHORTHAND);
    }
  });

  it('★ settings-control の綴りは、実物の設定画面に在る', async () => {
    const rows = LEDGER.filter((r) => r.kind === 'settings-control');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const t = await settingsText();
    expect(t.length, '設定画面が描けていない').toBeGreaterThan(5_000);
    for (const r of rows) {
      expect(t, `文は設定の「${r.name}」を名指しするが、設定画面にその綴りが無い (利用者が探しても当たらない)`)
        .toContain(r.name);
    }
    // **対照の標本** —— 2026-09-23 まで名指ししていた綴りは今日も設定画面に無い。
    expect(t).not.toContain('形式の合わない記録');
  }, 40_000);

  it('★ same-screen-control の綴りは、描いているファイルに在る (言及ではなく)', () => {
    const rows = LEDGER.filter((r) => r.kind === 'same-screen-control');
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const r of rows) {
      expect(r.renderedIn, `「${r.name}」に描画元が書かれていない`).toBeDefined();
      expect(
        withoutMentions(readOriginalSource(r.renderedIn!)),
        `「${r.name}」を名指しするが、${r.renderedIn} がその綴りを描いていない`,
      ).toContain(r.name);
    }
  });

  it('★ service-page-control は、綴りを持つ画面が在り、そこへ利用者が行ける', () => {
    const rows = LEDGER.filter((r) => r.kind === 'service-page-control');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const services = readOriginalSource('src/renderer/services.ts');
    for (const r of rows) {
      const pages = walk('src/renderer/pages').filter(
        (f) => f.endsWith('.tsx') && withoutMentions(readOriginalSource(f)).includes(r.name),
      );
      expect(pages.length, `「${r.name}」を描く画面が 0 枚`).toBeGreaterThanOrEqual(1);
      for (const f of pages) {
        // その画面が `services.ts` から辿れる (= サイドバーから行ける)。
        const base = f.split('/').pop()!.replace(/\.tsx$/, '');
        expect(
          services.includes(`pages/${base}`),
          `${base} は services.ts から辿れない —— 名指ししても利用者が行けない`,
        ).toBe(true);
      }
    }
  });

  it('★ other-screen-control は綴りが在り、しかもその部品を載せる画面が在る', () => {
    const rows = LEDGER.filter((r) => r.kind === 'other-screen-control');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.renderedIn, `「${r.name}」に描画元が書かれていない`).toBeDefined();
      const src = withoutMentions(readOriginalSource(r.renderedIn!));
      expect(src, `「${r.name}」を名指しするが、${r.renderedIn} がその綴りを描いていない`).toContain(r.name);
      /*
       * **載せている画面を数える。** 部品のファイルに綴りが在っても、誰も描いていなければ
       * 利用者はその操作子へ辿り着けない —— `same-screen-control` は文と同じ画面なので
       * この問いが自明に真だが、別の画面を指すときは自明ではない。
       */
      const tag = `<${r.renderedIn!.split('/').pop()!.replace(/\.tsx?$/, '')}`;
      const hosts = walk('src/renderer/pages').filter((f) => codeOnly(readOriginalSource(f)).includes(tag));
      expect(hosts.length, `${r.renderedIn} を載せている画面が 0 枚 (${tag} を描く画面が無い)`).toBeGreaterThanOrEqual(1);
    }
  });

  it('★ screen-label は別の検査が SERVICES と突き合わせている (swept-elsewhere)', () => {
    const rows = LEDGER.filter((r) => r.kind === 'screen-label');
    const labels = new Set(SERVICES.map((s) => s.label));
    for (const r of rows) expect(labels, `「${r.name}」は SERVICES のラベルではない`).toContain(r.name);
    const holder = readOriginalSource('src/renderer/data/__tests__/namedEscapeHatchReachable.test.ts');
    expect(holder, '画面名を突き合わせる検査が消えている').toContain('「X」の画面 の X は実在するラベル');
  });
});
