/**
 * **預けられる資格情報には、消す口が在る —— 母集団の両方向。**
 *
 * ## 見つけ方 (2026-09-24 · パス 453)
 *
 * パス 452 は「宣言 (`SERVICE_CREDENTIAL_USE`) と実物の読みが合っているか」を数えた。
 * その裏返し —— **宣言が「預かる」と言うサービスの画面に、預ける欄と消す口が在るか** ——
 * を数えると **2 件**出た (実測):
 *
 * | サービス | 宣言 | `tokenSetup` | 書き手 | 消す口 |
 * | --- | --- | --- | --- | --- |
 * | **`assistant`** | `action` | **無し** | **在る** (`hub.setToken('assistant', …)`) | **0 件** ❌ |
 * | `teamradar` | `action` | 無し | **0 件** | 要らない |
 *
 * ★ `assistant` は **AI の API キーを預けた利用者に「すべてのデータを削除」以外の
 * 消す手段が 1 つも無い**状態だった (法則 `escape-hatch-stays-open`)。
 * 空のフォームで上書きする道も塞がっている (「少なくとも 1 つの API キー / URL を
 * 入力してください」で断られる) し、`collectsCredential('assistant')` が true なので
 * 設定画面の掃除の節 (`unusedStoredCredentials`) にも出ない。
 *
 * ★ `teamradar` は書き手が **0 件**なので、今日保存される道が無い —— **罠であって
 * 生きた欠陥ではない** (パス 452 が測った当のこと)。書き手が生えた日に
 * この検査が鳴る (下の 2 つの向きのどちらかで必ず母集団に入る)。
 *
 * ## 2 つの向き
 *
 *   A. **宣言の側から** —— `collectsCredential` が true のサービスは、
 *      `tokenSetup` を渡す (→ `StatusBar` の「削除」) か、台帳が自前の口を名乗る。
 *   B. **書き手の側から** —— 画面が字面のスロットへ書く所 (実測 **5 件**) は
 *      すべて台帳に在り、台帳の行はすべて実在する (両方向)。
 *
 * ## 針が受け手を要求する理由 (測った)
 *
 * `setToken\s*\(\s*'` だけで数えると **6 件**出るが、6 件目は
 * `components/StatusBar.tsx` の `setToken('')` —— **React の state setter** で、
 * 入力欄を空にしているだけである。受け手 (`hub.` / `v.`) を要求すると 5 件になる。
 *
 * ## `stripNonCode` を素で使えない (測った)
 *
 * このファイルが読みたいのは**文字列リテラルの中身** (スロットの名前) だが、
 * `stripNonCode` は設計どおりそれを落とす。だから
 *
 *   - **数える**のは `keepQuoteChars: true` を通した後 (注記の中の言及は数えない ——
 *     法則 `mention-vs-declaration`)
 *   - **名前の確認は肯定形** (「台帳の行の綴りが原文に在る」) で行う。
 *     肯定の検査は綴りが外れれば必ず鳴るので、6 つ目の注記除去器を作らずに済む
 *     (実測: `stripComments` の写しは検査ファイルに既に 5 つ在る)。
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { readOriginalSource, readOriginalDirEntries } from '../../shared/__tests__/originalSource';
import { stripNonCode } from '../../shared/__tests__/stripNonCode';
import { SERVICE_IDS, type ServiceId } from '../../shared/serviceId';
import { collectsCredential, credentialUseOf } from '../../shared/credentialUse';

const REPO = path.resolve(__dirname, '../../..');
const WRITER_ROOTS = ['src/renderer/pages', 'src/renderer/components'] as const;
/** 受け手つきの `setToken('…')`。受け手を外すと state setter を拾う (docblock の実測)。 */
const LITERAL_WRITE = /\.\s*setToken\s*\(\s*['"]/g;

function tsxFilesUnder(rel: string): string[] {
  return readOriginalDirEntries(path.join(REPO, rel))
    .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
    .map((e) => `${rel}/${e.name}`);
}

function code(rel: string, keepQuoteChars = false): string {
  return stripNonCode(readOriginalSource(path.join(REPO, rel)), { keepQuoteChars });
}

const SERVICES_SRC = readOriginalSource(path.join(REPO, 'src/renderer/services.ts'));

/** `services.ts` の 1 行 `{ id: 'x', … page: XPage }` から画面ファイルを引く。 */
function pageFileOf(id: ServiceId): string | null {
  const row = new RegExp(`id:\\s*'${id}',[\\s\\S]{0,800}?page:\\s*([A-Za-z0-9_]+)`).exec(SERVICES_SRC);
  if (!row) return null;
  const imp = new RegExp(`import\\s*\\{\\s*${row[1]}\\s*\\}\\s*from\\s*'([^']+)'`).exec(SERVICES_SRC);
  if (!imp) return null;
  return path.posix.join('src/renderer', `${imp[1]}.tsx`);
}

/** その画面が `StatusBar` に資格情報の欄を渡すか (= 「削除」も出る)。 */
function passesTokenSetup(id: ServiceId): boolean {
  const f = pageFileOf(id);
  if (f === null) return false;
  return /tokenSetup\s*=/.test(code(f));
}

/** 消す口の種類。 */
type DeleteKind =
  /** `StatusBar` の「削除」(`tokenSetup` を渡す画面)。 */
  | 'status-bar'
  /** 設定画面の掃除の節 (`unusedStoredCredentials` が拾う = 宣言が `none`)。 */
  | 'cleanup'
  /** その画面が自分で `clearToken` を持つ。 */
  | 'own-control'
  /** 書き手が 0 件なので消す物が生まれない。 */
  | 'no-writer';

interface Row {
  readonly slot: string;
  readonly kind: DeleteKind;
  readonly why: string;
}

/**
 * **宣言が「預かる」と言うサービスのうち、`tokenSetup` を渡さない物の台帳。**
 * `tokenSetup` を渡す 20 画面は `StatusBar` の「削除」が構造的に付くので載せない
 * (載せると 20 行の写しになり、画面が増えるたびに手で足すことになる)。
 */
const DECLARED_WITHOUT_FIELD: readonly Row[] = [
  {
    slot: 'assistant',
    kind: 'own-control',
    why:
      'この画面が自分で `clearToken(\'assistant\')` を持つ (パス 453 で足した)。'
      + '鍵は 1 つの JSON にまとめて `assistant` スロットへ入るので `StatusBar` の'
      + '1 本の欄には収まらず、`collectsCredential` が true なので掃除の節も拾わない。'
      + '**効くことは `pages/__tests__/assistantCredsDelete.test.ts` が実物を押して見る。**',
  },
  {
    slot: 'teamradar',
    kind: 'no-writer',
    why:
      '書き手が 0 件 (実測・パス 452)。`ctx.token` の 1 件は `exportTeamRadarSvgImpl` が'
      + '`fetchTeamRadarSnapshot` へ渡す本物の読みだが、渡す先の `fetchTeamRadarSnapshotImpl(_ctx)` は'
      + '明示的に無視するので、**この鍵を保存する道が画面にも出荷コードにも無い**。'
      + '罠であって生きた欠陥ではない —— 書き手が生えれば向き A / B のどちらかで鳴る。',
  },
];

/** **画面が字面のスロットへ書く所**の台帳 (向き B・実測 5 件)。 */
const LITERAL_WRITERS: readonly (Row & { readonly file: string })[] = [
  {
    file: 'src/renderer/pages/AssistantPage.tsx',
    slot: 'assistant',
    kind: 'own-control',
    why: '同じ画面の「API キーを削除」。上の台帳と同じ行。',
  },
  {
    file: 'src/renderer/pages/SettingsPage.tsx',
    slot: 'drive',
    kind: 'status-bar',
    why: 'Google の OAuth で取った access token を入れる。`DrivePage` が `tokenSetup` を渡すので「削除」が出る。',
  },
  {
    file: 'src/renderer/pages/SettingsPage.tsx',
    slot: 'calendar',
    kind: 'status-bar',
    why: '同上 (`CalendarPage`)。',
  },
  {
    file: 'src/renderer/pages/SettingsPage.tsx',
    slot: 'gmail',
    kind: 'status-bar',
    why: '同上 (`GmailPage`)。',
  },
  {
    file: 'src/renderer/pages/SettingsPage.tsx',
    slot: 'google-access',
    kind: 'cleanup',
    why:
      '`ServiceId` ではないので `credentialUseOf` が最も慎重な側 (`none`) へ倒し、'
      + '設定画面の掃除の節が拾って消せる。読み手は出荷コードに **0 件** (実測) で、'
      + '注記は「後方互換 / 単独参照用」と言う —— 読む物が増えるまでは掃除の対象で正しい。',
  },
];

describe('預けられる資格情報には消す口が在る', () => {
  it('★ 向き A: 宣言が「預かる」サービスは、欄を渡すか台帳に在る', () => {
    const declared = SERVICE_IDS.filter((id) => collectsCredential(credentialUseOf(id)));
    // 床: 母集団が空になったら (走査が死んだら) 鳴る。
    expect(declared.length).toBeGreaterThanOrEqual(20);
    const ledger = new Set(DECLARED_WITHOUT_FIELD.map((r) => r.slot));
    const missing = declared.filter((id) => !passesTokenSetup(id) && !ledger.has(id));
    expect(missing).toEqual([]);
  });

  it('★ 向き A の逆: 台帳の行は「欄を渡さない」物だけ', () => {
    const wrong = DECLARED_WITHOUT_FIELD.filter((r) => passesTokenSetup(r.slot as ServiceId));
    expect(wrong.map((r) => r.slot)).toEqual([]);
  });

  it('★ 欄を渡す画面が 20 枚以上あり、どれも宣言が「預かる」', () => {
    const withField = SERVICE_IDS.filter((id) => passesTokenSetup(id));
    expect(withField.length).toBeGreaterThanOrEqual(20);
    // 欄を渡すのに宣言が `none` だと、`StatusBar` のふるいが欄を落とすので
    // 「渡しているのに出ない」死んだ prop になる (パス 452 が shopify で外した形)。
    const dead = withField.filter((id) => !collectsCredential(credentialUseOf(id)));
    expect(dead).toEqual([]);
  });

  it('★ 向き B: 字面のスロットへ書く所は、すべて台帳に在る (件数)', () => {
    const sites: string[] = [];
    for (const r of WRITER_ROOTS) {
      for (const f of tsxFilesUnder(r)) {
        for (const m of code(f, true).matchAll(LITERAL_WRITE)) sites.push(`${f}@${m.index}`);
      }
    }
    expect(sites.length).toBe(LITERAL_WRITERS.length);
  });

  it('★ 向き B の逆: 台帳の行はすべて原文に在る (肯定形)', () => {
    for (const r of LITERAL_WRITERS) {
      const raw = readOriginalSource(path.join(REPO, r.file));
      expect(raw, `${r.file} に setToken('${r.slot}' が無い`).toContain(`setToken('${r.slot}'`);
    }
  });

  it('★ 受け手を要求する針でなければ state setter を拾う (標本)', () => {
    const bar = code('src/renderer/components/StatusBar.tsx', true);
    // `setToken('')` は入力欄を空にする React の setter で、保管層へは書かない。
    expect(bar).toMatch(/[^.]\bsetToken\s*\(\s*''/);
    expect([...bar.matchAll(LITERAL_WRITE)]).toEqual([]);
  });

  it('★ 消す口の 3 つは実在する (どれも出荷コードの中)', () => {
    const statusBar = code('src/renderer/components/StatusBar.tsx');
    const settings = code('src/renderer/pages/SettingsPage.tsx');
    // `StatusBar` の「削除」・掃除の節は識別子で渡すので注記を落とした後でも見える。
    expect(statusBar).toMatch(/clearToken\s*\(\s*serviceId\s*\)/);
    expect(settings).toMatch(/clearToken\s*\(\s*id\s*\)/);
    /*
     * アシスタントの自前の口は**字面のスロット**を渡すので、`stripNonCode` を通した
     * 原文では見えない (中身を落とすのがこの道具の契約である —— 上の docblock の当のこと。
     * 私はそれを書いた直後に `stripNonCode` へ当てて 1 度落ちた)。**肯定形で原文を見る。**
     */
    const assistantRaw = readOriginalSource(path.join(REPO, 'src/renderer/pages/AssistantPage.tsx'));
    expect(assistantRaw).toContain("clearToken('assistant')");
    /*
     * ★ **口が在ることは、押せることではない** (法則 `mention-vs-declaration`)。
     * 対照 A (JSX のボタンだけを消す) を回すと、上の `clearToken` の主張は**通ったまま**
     * 振る舞いの 5 件が落ちた —— つまりこの census は「誰も辿れない handler」で
     * 満たせてしまう。押す所の印も見て、いちばん安い退行 (JSX を消す) を 2 層で塞ぐ。
     */
    expect(assistantRaw).toContain('data-clear-agent-creds');
  });

  it('★ 台帳の理由は省略しない', () => {
    for (const r of [...DECLARED_WITHOUT_FIELD, ...LITERAL_WRITERS]) {
      expect(r.why.length, `${r.slot} の理由が短い`).toBeGreaterThanOrEqual(15);
      expect(r.why, `${r.slot} の理由が省略形`).not.toMatch(/^同上[。）)]?$/);
    }
    // 標本: 上の針が実際に省略形へ当たること。
    expect('同上。').toMatch(/^同上[。）)]?$/);
  });
});
