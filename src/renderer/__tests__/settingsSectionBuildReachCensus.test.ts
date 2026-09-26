/**
 * **設定画面の節は、その保存先を読まない実行形態では操作子を出さない** (2026-09-25 · パス 456)。
 *
 * ## なぜ母集団が要るのか
 *
 * 同じ形の欠陥を 3 パス続けて**人が 1 つずつ**見つけた:
 *
 * | パス | 節 | 保存先 | デスクトップ版の読み手 | 直す前に画面が言ったこと |
 * | --- | --- | --- | ---: | --- |
 * | 454 | `GoogleOAuthSection` | ブラウザ版の保管庫 | **0 件** | Google 連携を有効化しました |
 * | 455 | `CredentialRow` (9 枚) | 同 | **0 件** | (施錠のため保存できないが、貼らせてから断る) |
 * | 456 | `ProxySection` | 平文 IndexedDB (`proxy`) | **0 件** | プロキシ設定を保存しました |
 *
 * **3 件とも「保存した」と言い、3 件とも誰も読まない。** 4 つ目を人が見つけるのを
 * 待たないために、設定画面が描く節を**面の側から**数える。
 *
 * ## この検査が持つもの
 *
 * **母集団** —— `SettingsPage` の JSX に出る大文字のタグを走査し (実測 17)、
 * 1 つずつ「その節が触る保存先を、どの実行形態が読むか」を理由つきで名乗らせる (両方向)。
 * `browser-only` を名乗る行には**実行形態の判定が原文に在ること**を要求する。
 *
 * ★ **判定の正しさは振る舞いの検査が持つ** ——
 * `pages/__tests__/proxySectionBuildGate.test.ts` /
 * `pages/__tests__/credentialSlotBuildGate.test.ts` /
 * `pages/__tests__/googleOAuthPasteBuildGate.test.ts`。
 * ここは「問われていない節が無い」ことだけを見る。
 *
 * ★ **`fsa` は `both` である (測って決めた)** —— デスクトップ版でも File System Access API
 * は在り、実際に使える。実測 (2026-09-25 · Electron 43 · `file://` · `sandbox: true` /
 * `contextIsolation: true`): `typeof window.showDirectoryPicker === 'function'`・
 * `isSecureContext === true`・`showDirectoryPicker({mode:'readwrite'})` は**投げずに
 * ダイアログを開く** (12 秒待っても解決しない = 開いたまま)。だから門は要らない。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripNonCode } from '../../shared/__tests__/stripNonCode';

const ROOT = join(__dirname, '..');
const src = (rel: string) => readOriginalSource(join(ROOT, rel));

/** 実行形態の判定を読む口 (どちらも `runtimeMode.ts` の 1 つへ行く)。 */
const GATES = ['useBuildKind', 'isBrowserBuild'] as const;

type Reach =
  /** 触る保存先を両方の実行形態が読む (門は要らない)。 */
  | 'both'
  /** **ブラウザ版だけが読む** —— 門が要る (無ければデスクトップ版で偽の成功を出す)。 */
  | 'browser-only'
  /** 何も保存しない (表示・その場の操作だけ)。 */
  | 'no-store'
  /** 節ではなく入れ物 (見出し・状態バー)。 */
  | 'layout';

interface Row {
  readonly tag: string;
  readonly reach: Reach;
  /** どこで宣言されているか (`pages/SettingsPage.tsx` からの相対)。`layout` は省ける。 */
  readonly declaredIn?: string;
  readonly why: string;
}

/**
 * 実測 (2026-09-25) —— 「触る保存先」は走査して確かめた。
 * `record-store` / `localStorage` / 橋は**両ビルドが読む**ので `both`。
 */
const LEDGER: readonly Row[] = [
  {
    tag: 'BackupPanel', reach: 'both', declaredIn: 'components/BackupPanel.tsx',
    why: '記録のストア (両ビルドが同じ IndexedDB を読む)。控えの書き出しと復元はどちらでも働く。',
  },
  {
    tag: 'RecordShapeAuditPanel', reach: 'both', declaredIn: 'components/RecordShapeAuditPanel.tsx',
    why: '同じ記録のストアを点検して消す。形の判定も削除も実行形態に依らない。',
  },
  {
    tag: 'ParametersPanel', reach: 'both', declaredIn: 'components/ParametersPanel.tsx',
    why: '数値パラメータの上書きを記録のストアへ置く。読む側 (useParameters) も両ビルド。',
  },
  {
    tag: 'ThemeSection', reach: 'both', declaredIn: 'components/ThemeSection.tsx',
    why: 'localStorage の servicehub.theme と、デスクトップ版では橋の setColorScheme。どちらの実行形態にも効く。',
  },
  {
    tag: 'LicenseSection', reach: 'both', declaredIn: 'pages/SettingsPage.tsx',
    why: '招待コードの引き換えは usePlan 経由で localStorage。両ビルドが同じ鍵を読む。',
  },
  {
    tag: 'UnusedCredentialSection', reach: 'both', declaredIn: 'pages/SettingsPage.tsx',
    why: '橋 (listConfigured / clearToken) を読む。ブラウザ版では shim が保管庫へ、デスクトップ版では main のファイルへ振り分く。',
  },
  {
    tag: 'FsaSection', reach: 'both', declaredIn: 'pages/SettingsPage.tsx',
    why: 'File System Access API は Electron 43 の file:// でも在り、picker が実際に開く (上の docblock に実測)。保存先の handle も両ビルドが読む。',
  },
  {
    tag: 'CredentialRow', reach: 'browser-only', declaredIn: 'pages/SettingsPage.tsx',
    why: 'ブラウザ版の保管庫へ直接書く (getVault().setToken)。デスクトップ版に読む物は 0 件で、しかも保管庫は施錠されたまま解錠できない (パス 455)。',
  },
  {
    tag: 'GoogleOAuthSection', reach: 'browser-only', declaredIn: 'pages/SettingsPage.tsx',
    why: '同じ保管庫へ 4 本のトークンを書く。デスクトップ版には読む物も消す物も無い (パス 454)。',
  },
  {
    tag: 'ProxySection', reach: 'browser-only', declaredIn: 'pages/SettingsPage.tsx',
    why: '平文 IndexedDB の proxy 鍵へ書く。読むのは web-shim と saasWriteWeb だけで、shim はブラウザ版にしか据え付かない。main 側にプロキシの仕組みは 0 件 (パス 456)。',
  },
  {
    tag: 'VaultControls', reach: 'browser-only', declaredIn: 'pages/SettingsPage.tsx',
    why: 'パスワード変更と施錠は保管庫の操作なのでブラウザ版だけ。2026-09-09 (パス 137) から isBrowserBuild で出し分けており、すべてのデータを削除だけが橋を通って両ビルドで働く。',
  },
  {
    tag: 'CloudSyncPanel', reach: 'no-store', declaredIn: 'components/CloudSyncPanel.tsx',
    why: '送信路の実装が 1 つも無く、保存もしない (setItem / 記録のストアの出現は 0 件)。今すぐ同期は押せず、未接続であることを画面が書く。',
  },
  {
    tag: 'ConnectionHub', reach: 'both', declaredIn: 'pages/SettingsPage.tsx',
    why: '橋の listConfigured を読んで並べるだけ (書き込みは無い)。橋は実行形態ごとに保管庫 / main の保管ファイルへ振り分くので両ビルドで正しい。パス 456 まで getVault() を直に読んでおり、デスクトップ版で必ず 0 / 74 と答えていた。',
  },
  {
    tag: 'UpdateSection', reach: 'no-store', declaredIn: 'pages/SettingsPage.tsx',
    why: '橋の checkUpdate を叩いて結果を出すだけ。両ビルドで働き、保存もしない。',
  },
  {
    tag: 'StorageProtectionNotice', reach: 'no-store', declaredIn: 'pages/SettingsPage.tsx',
    why: '橋の storageProtection の件数と仕組みの名前を描くだけ。書き込みは 1 つも無い。',
  },
  { tag: 'Section', reach: 'layout', why: '見出しと件数の入れ物 (components/StatusBar.tsx)。' },
  { tag: 'StatusBar', reach: 'layout', why: '取得ボタンと資格情報スロットの共通の帯 (components/StatusBar.tsx)。節ではない。' },
];

/** `SettingsPage` の本体に出る大文字の JSX タグ (母集団)。 */
function renderedTags(): string[] {
  const text = src('pages/SettingsPage.tsx');
  const start = text.indexOf('export function SettingsPage() {');
  expect(start, 'SettingsPage が見つからない').toBeGreaterThan(0);
  const rest = text.slice(start + 10);
  const nxt = /\n(?:export )?(?:function|const|type|interface) /.exec(rest);
  const body = nxt === null ? rest : rest.slice(0, nxt.index);
  return [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1] as string))].sort();
}

/** その節の宣言のスライス (門が在るかを読むため)。 */
function declarationSlice(row: Row): string {
  expect(row.declaredIn, `${row.tag}: declaredIn が無い`).not.toBeUndefined();
  const text = src(row.declaredIn!);
  const at = text.search(new RegExp(`function ${row.tag}\\s*\\(`));
  expect(at, `${row.tag} の宣言が ${row.declaredIn} に無い`).toBeGreaterThan(-1);
  const rest = text.slice(at + 10);
  const nxt = /\n(?:export )?function /.exec(rest);
  return nxt === null ? rest : rest.slice(0, nxt.index);
}

describe('設定画面の節 × 実行形態の母集団 (パス 456)', () => {
  it('★ 走査が空虚でない (タグ 12 件以上・browser-only が 3 件以上)', () => {
    expect(renderedTags().length).toBeGreaterThanOrEqual(12);
    expect(LEDGER.filter((r) => r.reach === 'browser-only').length).toBeGreaterThanOrEqual(3);
  });

  it('★ 描かれている節はすべて台帳に在る', () => {
    const known = new Set(LEDGER.map((r) => r.tag));
    const missing = renderedTags().filter((t) => !known.has(t));
    expect(missing, `台帳に無い節: ${missing.join(', ')} —— どの実行形態が読むか書くこと`).toEqual([]);
  });

  it('★ 台帳の行はすべて実際に描かれている (逆向き)', () => {
    const rendered = new Set(renderedTags());
    const stale = LEDGER.filter((r) => !rendered.has(r.tag)).map((r) => r.tag);
    expect(stale, `描かれていないのに台帳に在る: ${stale.join(', ')}`).toEqual([]);
  });

  it('★ 理由は省略形を許さない (20 字以上)', () => {
    for (const r of LEDGER) {
      expect(r.why.length, `${r.tag} の理由が短い: ${r.why}`).toBeGreaterThanOrEqual(20);
    }
  });

  it('★ browser-only の節は実行形態を原文で判定している', () => {
    const rows = LEDGER.filter((r) => r.reach === 'browser-only');
    for (const r of rows) {
      const body = declarationSlice(r);
      const gated = GATES.some((g) => body.includes(g));
      expect(gated, `${r.tag}: ブラウザ版だけが読む保存先なのに実行形態を判定していない`).toBe(true);
    }
  });

  /**
   * **逆向き** —— 分類を下げるのも退行の 1 手である。`browser-only` の要求から
   * 外れるだけで「門を持たないこと」を誰も見ていなければ、門が後で消されても
   * 台帳は既に「要らない」と言うので何も鳴らない (パス 455 の対照 J と同じ形)。
   * だから**原文から**ブラウザ版だけの保存先を探し、それに触る節が `browser-only`
   * を名乗ることを要求する。
   */
  it('★ ブラウザ版だけの保存先に触る節は browser-only を名乗る (逆向き)', () => {
    /** 実測 (2026-09-25): renderer からブラウザ版だけが読む保存先へ書く口。 */
    const BROWSER_ONLY_WRITES = [/getVault\(\)/, /setProxyConfig\s*\(/] as const;
    for (const r of LEDGER) {
      if (r.reach === 'layout') continue;
      // **注記の中の言及は数えない** (法則 `mention-vs-declaration`) —— この針は
      // 書いたその場で自分の docblock に当たった: `ConnectionHub` を橋へ移した
      // ときに「直す前は getVault() を読んでいた」と説明を書き、走査が
      // **その説明を宣言として数えた**。原文から注記と文字列を落としてから当てる。
      const body = stripNonCode(declarationSlice(r));
      const touched = BROWSER_ONLY_WRITES.filter((re) => re.test(body));
      if (touched.length === 0) continue;
      expect(
        r.reach,
        `${r.tag}: ブラウザ版だけの保存先 (${touched.map((re) => re.source).join(' / ')}) に触るのに ${r.reach} を名乗っている`,
      ).toBe('browser-only');
    }
  });

  it('★ 針は注記の中の言及を数えない (標本つき)', () => {
    const NEEDLE = /getVault\(\)/;
    // 的に当たる: 実際の呼び出し
    expect(NEEDLE.test(stripNonCode('  const list = await getVault().listConfigured();\n'))).toBe(true);
    // 当たらない: 同じ綴りが注記の中に在るだけ (直した直後の `ConnectionHub` がこの形)
    expect(NEEDLE.test(stripNonCode('  // ここが getVault() を直に読んでいた\n'))).toBe(false);
  });

  it('★ 保存しない節・両方が読む節は宣言元が実在する', () => {
    for (const r of LEDGER) {
      if (r.reach === 'layout') continue;
      expect(declarationSlice(r).length, `${r.tag} の宣言が空`).toBeGreaterThan(0);
    }
  });
});
