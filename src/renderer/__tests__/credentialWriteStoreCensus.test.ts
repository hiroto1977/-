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
 * ★ **`CredentialRow` は今日は `vault-ungated` として残した (理由を測って書く)。**
 * 消す口が在るので今日の穴は「偽の保証」だけで、直すには 9 スロットそれぞれに
 * *働く道*を名乗らせる必要が在る —— ところが `anthropic` は `ServiceId` ではなく
 * (デスクトップ版の AI の鍵は skills / emotions / business / stocks / assistant に
 * 分かれる)、1 つの操作子では名乗れない。**名指しした操作子は実在しなければならない**
 * (パス 426 の門) ので、設計が要る。`docs/REMAINING_WORK.md` に実測を残した。
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
    store: 'vault-ungated',
    why:
      '`CredentialRow` の 9 スロット。読み (`listConfigured`) と削除 (`clearToken`) も同じ保管庫なので'
      + '**カードの中では整合**し、消す口も在る —— 今日の穴は説明文がデスクトップ版で偽になること'
      + '(「AI 経営アドバイザー / Skills / Emotions で使用」の 3 つは main の保管ファイルを読む)。'
      + '直すには 9 スロットそれぞれに働く道を名乗らせる必要が在り、`anthropic` は `ServiceId` ではないので'
      + '1 つの操作子では名乗れない (デスクトップ版の AI の鍵は 5 サービスに分かれる)。設計が要るので次のパスへ。',
  },
  {
    file: 'pages/SettingsPage.tsx',
    receiver: 'v',
    store: 'vault-gated',
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
    for (const m of src.matchAll(WRITE)) out.push({ file, receiver: m[1] ?? '' });
  }
  return out;
}

/** 受け手の綴り 1 つあたり 1 行 (同じ受け手の複数回は 1 件に畳む)。 */
function pairs(): readonly string[] {
  return [...new Set(hits().map((h) => `${h.file}::${h.receiver}`))].sort();
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

  it('★ `vault-gated` の行は、実行形態を問う口を読んでいる', () => {
    const gated = LEDGER.filter((r) => r.store === 'vault-gated');
    expect(gated.length).toBeGreaterThanOrEqual(1);
    for (const row of gated) {
      const src = readOriginalSource(join(ROOT, row.file));
      expect(src, `${row.file} が useBuildKind を読んでいない`).toContain('useBuildKind');
      expect(src, `${row.file} が断りの文を読んでいない`).toContain('pasteOAuthUnreadNote');
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
