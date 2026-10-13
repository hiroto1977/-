/**
 * **資格情報を書く出荷コードは、この端末が読む保管先へ書く** (2026-09-25 · パス 454)。
 *
 * ## 実測 (2026-09-25)
 *
 * renderer の保管先は **2 つ**在り、どちらが生きているかは実行形態で決まる:
 *
 * | 保管先 | 書く口 | 読む口 | 生きている実行形態 |
 * | --- | --- | --- | --- |
 * | main の保管ファイル | 橋 `window.serviceHub.setToken` | 橋 `listConfigured` / main の client | **デスクトップ版** |
 * | ブラウザ版の保管庫 (IndexedDB) | `getVault().setToken` | **`web-shim.ts` の 11 か所だけ** | **ブラウザ版** |
 *
 * `web-shim.ts:1966` は `if (typeof window !== 'undefined' && !window.serviceHub)` ——
 * つまり **shim はブラウザ版だけ据え付き、デスクトップ版では保管庫を読む物が 1 つも無い**。
 *
 * それなのに保管庫へ**直接**書く節が 2 つ在り、どちらも実行形態を問わずに描かれていた:
 *
 * - `SettingsPage.tsx` の `CredentialRow` (9 スロット) —— 読みと削除も保管庫なので
 *   **カードの中では整合**する (「設定済み」は真・「削除」は効く)。偽になるのは
 *   *説明文* (「AI 経営アドバイザー / Skills / Emotions で使用」) の側で、
 *   デスクトップ版のその 3 つは main の保管ファイルを読む。
 * - `SettingsPage.tsx` の `GoogleOAuthSection` (4 本) —— **読む物も消す物も無い**。
 *   9 スロットの固定鍵に無く、掃除の節は橋を読み、`StatusBar` の「削除」も橋を叩く。
 *   **生きた Google の access token が、誰も読まず誰も消せない場所に入る。**
 *
 * ## この検査が持つもの
 *
 * **母集団**である —— 走査が見つけた書き込み 1 件ずつに、保管先と実行形態の扱いを
 * 名乗らせる (両方向)。新しい書き込みが増えれば「どちらへ書くのか書け」と鳴り、
 * 消えた行が台帳に残っても鳴る。**判定そのものの正しさは振る舞いの検査が持つ**
 * (`pages/__tests__/googleOAuthPasteBuildGate.test.ts`)。
 *
 * ★ **2026-09-25 (パス 455) で `vault-ungated` は 0 件になった。**
 * パス 454 は `CredentialRow` をそこへ置き「消す口が在るので今日の穴は偽の保証だけ」
 * と書いたが、測り直すと**もっと単純に壊れていた** —— デスクトップ版の保管庫は
 * 施錠されたまま解錠できない (`unlock()` を呼ぶのは `LockScreen` だけ・その画面は
 * `browserMode` の下にしか描かれない) ので、**9 枚とも 1 枚も保存できない**。
 * 実測では利用者が本物の API キーを貼ってから「Vault がロックされています」を
 * 受け取り、その状態を動かす操作子がどこにも無かった。
 * **0 件は「要らない」ではない** —— 新しい書き込みが門を持たずに生えれば鳴る。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const ROOT = join(__dirname, '..');

/** 走査の根 (出荷コードだけ)。 */
const SCAN_DIRS = ['pages', 'components', 'data', 'hooks'] as const;

/**
 * **受け手つきの `setToken(`。** 受け手を外すと state setter (`setToken`) まで拾う ——
 * 実測 (2026-09-25): 受け手を要求すると `src/renderer` の一致は **5 件**、
 * 要求しないと `StatusBar.tsx` の `const [token, setToken] = useState('')` を含む
 * **6 件**になる (パス 453 で同じ針を測った)。
 */
const WRITE = /([A-Za-z_$][\w$]*(?:\(\))?|window\.serviceHub)\s*\.\s*setToken\s*\(/g;

type Store =
  /** 橋 (`window.serviceHub.setToken`) —— 実行形態ごとに main / 保管庫へ振り分く。 */
  | 'bridge'
  /** 保管庫へ直接。**デスクトップ版では誰も読まない**ので、書く前に実行形態を問う。 */
  | 'vault-gated'
  /** 保管庫へ直接・実行形態を問わない。理由つきで今日だけ残す。 */
  | 'vault-ungated';

interface Row {
  readonly file: string;
  /** 走査が掴んだ受け手の綴り。 */
  readonly receiver: string;
  readonly store: Store;
  readonly why: string;
  /**
   * `vault-gated` の行だけが持つ —— **この行が読むべき断りの文の名前**。
   * 名前を行ごとに持たせないと、同じファイルに 2 つの門が在るとき
   * **隣の門の名前で満たされてしまう** (実測: `SettingsPage.tsx` には
   * `GoogleOAuthSection` と `CredentialRow` の 2 つが在り、
   * ファイル単位の `toContain` では片方を外しても鳴らなかった)。
   */
  readonly note?: string;
}

/** 理由の欄に置いてはいけない省略形。 */
const SHORTHAND = /^同上[。）)]?$/;

/** **今日の全量。** 走査の一致と 1 件ずつ対応する (両方向)。 */
const LEDGER: readonly Row[] = [
  {
    file: 'components/StatusBar.tsx',
    receiver: 'window.serviceHub',
    store: 'bridge',
    why:
      '橋へ渡すので、デスクトップ版は main の保管ファイル・ブラウザ版は保管庫へ入る。'
      + 'どちらの実行形態でも「その端末が読む所」へ書くので、実行形態を問う必要が無い。',
  },
  {
    file: 'pages/AssistantPage.tsx',
    receiver: 'hub',
    store: 'bridge',
    why:
      '同じく橋 (`const hub = window.serviceHub`)。AI の API キーを 1 つの JSON にまとめて'
      + '`assistant` スロットへ入れる。消す口はパス 453 でこの画面に足した。',
  },
  {
    file: 'pages/SettingsPage.tsx',
    receiver: 'getVault()',
    store: 'vault-gated',
    note: 'credentialSlotUnreadNote',
    why:
      '`CredentialRow` の 9 スロット。デスクトップ版の保管庫は施錠されたまま解錠できないので'
      + '**1 枚も保存できない** (実測: 本物の鍵を貼ってから「Vault がロックされています」が出る)。'
      + '`useBuildKind()` で問い、デスクトップ版と分かったときだけ「設定する」を出さず'
      + '働く道 (`desktopScreen` = そのサービスの画面の資格情報欄) を名指しする。'
      + '`anthropic` だけは `ServiceId` ではなく 5 サービスに分かれるので、1 枚ではなく'
      + '使う画面それぞれの欄を述べる枝を `credentialSlotUnreadNote` が持つ。',
  },
  {
    file: 'pages/SettingsPage.tsx',
    receiver: 'v',
    store: 'vault-gated',
    note: 'pasteOAuthUnreadNote',
    why:
      '`GoogleOAuthSection` の 4 本 (`drive` / `calendar` / `gmail` / `google-access`)。'
      + 'デスクトップ版には読む物も消す物も無いので、`useBuildKind()` で問い、'
      + 'デスクトップ版と分かったときだけ `start()` が書く前に断り、働く道'
      + '(`GoogleConnectCard` の「Google でサインイン」) を名指しする。',
  },
];

/** 走査の一致 1 件。 */
interface Hit {
  readonly file: string;
  readonly receiver: string;
  /** 一致の位置。**門を「その書き手の関数の中で」探す**のに要る。 */
  readonly at: number;
}

/**
 * `at` を含む最上位の関数の本文を返す。
 *
 * **なぜ要るか (2026-09-25 · パス 455 の実測)。** 門の名前をファイル単位で
 * `toContain` すると、**同じファイルに 2 つの門が在るとき隣の名前で満たされる** ——
 * `SettingsPage.tsx` は `CredentialRow` と `GoogleOAuthSection` の両方を持つので、
 * 行の `note` を隣の門の名前へ入れ替える対照が**鳴らなかった**。
 * 書き手の関数へ絞ると、その行が読んでいる物だけを見る。
 */
function enclosingFunction(src: string, at: number): string {
  const MARK = /\n(?:export )?(?:async )?function /g;
  let start = 0;
  let end = src.length;
  for (const m of src.matchAll(MARK)) {
    if (m.index! < at) start = m.index!;
    else {
      end = m.index!;
      break;
    }
  }
  return src.slice(start, end);
}

function walk(dir: string, rel: string, out: string[]): void {
  for (const e of readOriginalDirEntries(dir)) {
    if (e.name === '__tests__') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, `${rel}/${e.name}`, out);
    else if (/\.tsx?$/.test(e.name)) out.push(`${rel}/${e.name}`);
  }
}

function shippingFiles(): readonly string[] {
  const out: string[] = [];
  for (const d of SCAN_DIRS) walk(join(ROOT, d), d, out);
  return out.sort();
}

function hits(): readonly Hit[] {
  const out: Hit[] = [];
  for (const file of shippingFiles()) {
    const src = readOriginalSource(join(ROOT, file));
    for (const m of src.matchAll(WRITE)) out.push({ file, receiver: m[1] ?? '', at: m.index ?? 0 });
  }
  return out;
}

/** 受け手の綴り 1 つあたり 1 行 (同じ受け手の複数回は 1 件に畳む)。 */
function pairs(): readonly string[] {
  return [...new Set(hits().map((h) => `${h.file}::${h.receiver}`))].sort();
}

/** 台帳の行が指す書き手の、関数の本文。 */
function writerFunction(row: { file: string; receiver: string }): string {
  const src = readOriginalSource(join(ROOT, row.file));
  const hit = hits().find((h) => h.file === row.file && h.receiver === row.receiver);
  expect(hit, `${row.file}::${row.receiver} の書き込みが走査に無い`).toBeTruthy();
  return enclosingFunction(src, hit!.at);
}

describe('資格情報を書く出荷コードの母集団', () => {
  it('★ 走査は空でない (針が死んでいない)', () => {
    expect(hits().length).toBeGreaterThanOrEqual(5);
    expect(shippingFiles().length).toBeGreaterThanOrEqual(60);
  });

  it('★ 針は受け手を要求する (state setter を拾わない)', () => {
    // 標本: 受け手が無い形は数えない。
    expect([...'const [token, setToken] = useState<string>("")'.matchAll(WRITE)]).toHaveLength(0);
    // 標本: 受け手が在る 3 形は数える。
    for (const s of ['window.serviceHub.setToken(a, b)', 'hub.setToken(a, b)', 'getVault().setToken(a, b)']) {
      expect([...s.matchAll(WRITE)]).toHaveLength(1);
    }
    // 実物にその形が在る (針が的に当たっている)。
    expect(readOriginalSource(join(ROOT, 'components/StatusBar.tsx'))).toContain('const [token, setToken] = useState');
  });

  it('★ 走査の一致は、すべて台帳に在る', () => {
    const known = new Set(LEDGER.map((r) => `${r.file}::${r.receiver}`));
    expect(pairs().filter((p) => !known.has(p))).toEqual([]);
  });

  it('★ 台帳の行は、すべて走査に在る (消えた行が残らない)', () => {
    const found = new Set(pairs());
    expect(LEDGER.map((r) => `${r.file}::${r.receiver}`).filter((p) => !found.has(p))).toEqual([]);
  });

  it('★ 保管庫の受け手は、そのファイルで `getVault()` に束ねられている (分類の裏取り)', () => {
    for (const row of LEDGER.filter((r) => r.store !== 'bridge')) {
      const src = readOriginalSource(join(ROOT, row.file));
      const bound = row.receiver === 'getVault()' || src.includes(`${row.receiver} = getVault()`);
      expect(bound, `${row.file} の ${row.receiver} が getVault() に束ねられていない`).toBe(true);
    }
  });

  it('★ 橋の受け手は、そのファイルで `window.serviceHub` に束ねられている (逆向き)', () => {
    for (const row of LEDGER.filter((r) => r.store === 'bridge')) {
      const src = readOriginalSource(join(ROOT, row.file));
      const bound = row.receiver === 'window.serviceHub' || src.includes(`${row.receiver} = window.serviceHub`);
      expect(bound, `${row.file} の ${row.receiver} が window.serviceHub に束ねられていない`).toBe(true);
    }
  });

  it('★ `vault-gated` の行は、実行形態を問う口と**自分の**断りの文を読んでいる', () => {
    const gated = LEDGER.filter((r) => r.store === 'vault-gated');
    expect(gated.length).toBeGreaterThanOrEqual(1);
    for (const row of gated) {
      const fn = writerFunction(row);
      expect(fn, `${row.file}::${row.receiver} が useBuildKind を読んでいない`).toContain('useBuildKind');
      expect(row.note, `${row.file}::${row.receiver} に note が無い`).toBeTruthy();
      expect(fn, `${row.file}::${row.receiver} が ${row.note} を読んでいない`).toContain(row.note!);
    }
  });

  it('★ `vault-ungated` を名乗る行は、門を持っていてはいけない (逆向き)', () => {
    /*
     * **この向きが 2026-09-25 (パス 455) まで無かった。** 実測した対照:
     * 門を足した行の分類を `vault-ungated` へ戻しても **17 件とも緑**だった ——
     * `vault-gated` の要求から外れるだけで、「門を持たないこと」は誰も見ていない。
     * その状態で門が消されると、台帳は既に「無い」と言っているので何も鳴らない。
     * **分類を下げるのも、退行の 1 手である。**
     */
    const ungated = LEDGER.filter((r) => r.store === 'vault-ungated');
    for (const row of ungated) {
      expect(row.note, `${row.file}::${row.receiver} は門が無い側なのに note を持つ`).toBeUndefined();
      const fn = writerFunction(row);
      expect(
        fn.includes('useBuildKind'),
        `${row.file} は \`vault-ungated\` を名乗るのに useBuildKind を読んでいる —— 門が在るなら \`vault-gated\` へ`,
      ).toBe(false);
    }
  });

  it('★ 台帳の理由は省略しない', () => {
    for (const row of LEDGER) {
      expect(row.why.length, `${row.file}::${row.receiver}`).toBeGreaterThanOrEqual(30);
      expect(SHORTHAND.test(row.why), `${row.file}::${row.receiver}`).toBe(false);
    }
  });

  it('★ 保管庫を読む出荷コードは web-shim だけ (この分類の前提)', () => {
    // shim はブラウザ版だけ据え付く —— その条件そのものを原文で確かめる。
    const shim = readOriginalSource(join(ROOT, 'web-shim.ts'));
    expect(shim).toContain("!window.serviceHub");
    expect(shim.match(/vault\s*\.\s*getToken\s*\(/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    // 出荷コードの他の場所で保管庫からトークンを読む所は無い。
    const readers = shippingFiles().filter((f) => /\.\s*getToken\s*\(/.test(readOriginalSource(join(ROOT, f))));
    expect(readers).toEqual([]);
  });
});
