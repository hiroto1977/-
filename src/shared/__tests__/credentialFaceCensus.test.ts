/**
 * **宣言した資格情報に、読む口と書く口が両方在るか** —— 面の側から両方向に数える
 * (2026-09-24 · パス 451)。
 *
 * ## なぜ要るか
 *
 * `SERVICE_CREDENTIAL_USE` は「その資格情報が**実際に読まれるのか**」を宣言し、
 * `scripts/lint-credential-use.cjs` がそれを 1 方向だけ突き合わせる ——
 * **`none` と宣言したのに入力欄が在る**形を落とす。逆向き
 * (**読むと宣言したのに入力欄が無い**) は誰も見ていなかった。
 *
 * 実測 (2026-09-24 · 直す前 · 資格情報を預かる 23 サービス):
 *
 * | 形 | サービス | 何が起きていたか |
 * | --- | --- | --- |
 * | **読み手が在って書き手が 0 件** | **`stocks` / `business`** | main が空の鍵を Anthropic へ送り、相手の 401 の本文を画面に出す。**鍵を置く口はどの画面にも無い** |
 * | 書き手が在って読み手が 0 件 | `shopify` | Shopify のトークンを預かるが、どの handler も `ctx.token` を読まない |
 * | 読み手が在るが**渡す先が無視** | `teamradar` | 宣言だけが `action` (fetcher の引数は `_ctx`)。綴りの走査では `reader-only` に見える |
 * | 両方在る | 残る 20 | —— |
 *
 * ★ **既存の census が見なかった理由は「対を数えたから」** —— パス 284 / 285 は
 * 「両ビルドに双子が在る断り」を数えたので、**片側が 0 件の組は母集団に入らない**。
 * パス 450 の「読み手が在って書き手が 0 件」と同じ死角である。
 *
 * ## 判定の仕方
 *
 * - **読み手** = client モジュールが `ctx.token` を読む (注記と文字列は落としてから)。
 *   ゲートの `touchesToken` は `\btoken\b` を**ファイル全体**に当てるので、
 *   `payload.token` (= **連携先**のトークン) も注記の中の言及も同じに見える ——
 *   `shopify` がそれで通っていた (実測: `ctx.token` の出現は注記 1 件だけ)。
 * - **書き手** = `StatusBar` の `tokenSetup` を渡す画面が在る (ゲートの
 *   `tokenSetupServiceIds` をそのまま借りる)、または台帳が別の書き口を名乗る。
 *
 * どちらも綴りの走査なので、**背骨は振る舞い** ——
 * `advisorMissingKeyRefusal.test.ts` が実物の handler に空のトークンを渡し、
 * `pages/__tests__/anthropicKeyFieldOnScreen.test.ts` が実物の画面を描いて欄を探す。
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SERVICE_CREDENTIAL_USE, collectsCredential } from '../credentialUse';
import type { ServiceId } from '../serviceId';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { stripNonCode } from './stripNonCode';

const gate = require('../../../scripts/lint-credential-use.cjs') as {
  tokenSetupServiceIds: (
    dir: string,
    readFile: (p: string) => string,
    listDir: (d: string) => string[],
  ) => Map<string, string>;
};

const SRC = join(__dirname, '..', '..');
const PAGES = join(SRC, 'renderer', 'pages');
const CLIENTS = join(SRC, 'main', 'clients');

/** 読み手: client モジュールが `ctx.token` を読むか (注記・文字列は落とす)。 */
function readsOwnToken(id: ServiceId): boolean {
  const f = join(CLIENTS, `${id}.ts`);
  if (!existsSync(f)) return false;
  return /\bctx\s*\.\s*token\b/.test(stripNonCode(readOriginalSource(f)));
}

/**
 * 書き手: `tokenSetup` を渡す画面が在るか (ゲートの走査をそのまま借りる)。
 *
 * 読みは**原文の道具だけ**を通す —— `readdirSync` を直に呼ぶと、Stryker の sandbox で
 * 変異体を読んでしまう (`originalSourcePolicy` がそれを落とす · パス 399)。
 */
function writerPages(): ReadonlySet<string> {
  const ids = gate.tokenSetupServiceIds(
    PAGES,
    (p) => readOriginalSource(p),
    (d) => readOriginalDirEntries(d).map((e) => e.name),
  );
  return new Set(ids.keys());
}

/** 台帳の行。`kind` は**測った形**で、`why` は人が書く判断。 */
interface Row {
  readonly kind: 'both' | 'reader-only' | 'writer-only' | 'neither';
  readonly writer?: 'own-panel';
  /**
   * `reader-only` の免除 —— **渡す先が引数を明示的に無視する**。
   * 綴りの走査は「渡した先が使うか」を見られないので、原文の `_` 接頭辞で確かめる。
   */
  readonly ignoredByCallee?: true;
  readonly why: string;
}

const LEDGER: Readonly<Partial<Record<ServiceId, Row>>> = {
  assistant: {
    kind: 'both',
    writer: 'own-panel',
    why:
      'マルチプロバイダの資格情報は JSON 1 本なので `StatusBar` の 1 行の欄では足りない。'
      + '`AssistantPage` のエージェント設定パネルが 11 欄から組んで `setToken(\'assistant\', …)` へ渡す '
      + '(パス 450 が入力欄を表から組む形にした)。',
  },
  shopify: {
    kind: 'writer-only',
    why:
      '**画面は「API トークン」を預かるのに、どの handler も `ctx.token` を読まない** (実測: '
      + '`ctx.token` の出現は注記 1 件だけで、10 個の connector はどれも `payload.token` = '
      + '**連携先** (Slack / LINE / Gmail ほか) のトークンを読む)。読み取りも静的な stub で '
      + '`_ctx` を無視する。**2026-08 の監査が 8 サービスについて閉じた形の 9 件目**だが、'
      + 'あの規則は「`LIVE_ACTIONS` に登録が無い」を条件にしており、shopify は登録を持つので '
      + '通っていた。宣言を `none` へ直すと `lint:credential-use` の `touchesToken` が '
      + '(注記と `payload.token` を見て) 「`action` のはず」と鳴るので、**ゲートの針ごと**'
      + '直す必要が在る —— 別のパスで測ってから閉じる。'
      + '逃げ口は今日も開いている (パス 427 が直した `StatusBar` の「削除」)。',
  },
  teamradar: {
    kind: 'reader-only',
    ignoredByCallee: true,
    why:
      '**針は `reader-only` と言うが、振る舞いは `neither` である** —— `ctx.token` の出現は '
      + '1 件 (`fetchTeamRadarSnapshot({ token: ctx.token, … })`) で、**渡す先 '
      + '`fetchTeamRadarSnapshotImpl(_ctx, deps)` は引数を明示的に無視する** (`_` 接頭辞)。'
      + '綴りの走査は「渡した先が使うか」を見られないので、ここだけは**原文の `_ctx` を'
      + '別に確かめて**免除する (下の `it`)。画面に入力欄も無いので今日保存される道は無く、'
      + '**罠であって生きた欠陥ではない** —— ただし `collectsCredential` が true を返す間は '
      + '`unusedStoredCredentials` に載らないので、万一の保存値に掃除の導線が無い。'
      + '宣言 (`action` → `none`) を直すには `lint:credential-use` の針も要るので、'
      + 'shopify と同じパスで閉じる。',
  },
};

describe('資格情報の面 —— 読む口と書く口を両方向に数える', () => {
  const HELD = (Object.keys(SERVICE_CREDENTIAL_USE) as ServiceId[]).filter((id) =>
    collectsCredential(SERVICE_CREDENTIAL_USE[id]),
  );
  const writers = writerPages();

  function shapeOf(id: ServiceId): Row['kind'] {
    const reader = readsOwnToken(id);
    const writer = writers.has(id) || LEDGER[id]?.writer === 'own-panel';
    if (reader && writer) return 'both';
    if (reader) return 'reader-only';
    if (writer) return 'writer-only';
    return 'neither';
  }

  it('母集団が空でない (走査が死んでいない)', () => {
    expect(HELD.length).toBeGreaterThanOrEqual(23);
    expect(writers.size).toBeGreaterThanOrEqual(19);
  });

  it('★ 読み手が在って書き手が 0 件のサービスは、免除された 1 件だけ', () => {
    const readerOnly = HELD.filter((id) => shapeOf(id) === 'reader-only');
    // 免除は「渡す先が引数を無視する」と台帳が名乗り、下の `it` が原文で確かめる物だけ。
    const unexcused = readerOnly.filter((id) => LEDGER[id]?.ignoredByCallee !== true);
    expect(unexcused).toEqual([]);
  });

  it('★ 免除の理由は原文で確かめる —— 渡す先が引数を明示的に無視している', () => {
    const excused = (Object.keys(LEDGER) as ServiceId[]).filter(
      (id) => LEDGER[id]!.ignoredByCallee === true,
    );
    expect(excused.length).toBeGreaterThanOrEqual(1);
    for (const id of excused) {
      const code = stripNonCode(readOriginalSource(join(CLIENTS, `${id}.ts`)));
      // `(_ctx` / `(_ctx:` —— 引数を使わないことを宣言する書き方 (eslint がそれを許す印)。
      expect(code, `${id}: 渡す先が引数を無視していない`).toMatch(/\(\s*_[A-Za-z]\w*\s*[:,)]/);
    }
  });

  it('★ 台帳は「both でない行」をちょうど持つ (両方向)', () => {
    const measured = HELD.filter((id) => shapeOf(id) !== 'both').sort();
    const declared = (Object.keys(LEDGER) as ServiceId[])
      .filter((id) => LEDGER[id]!.kind !== 'both')
      .sort();
    expect(measured).toEqual(declared);
  });

  it('★ 台帳の kind は実測と一致する', () => {
    for (const id of Object.keys(LEDGER) as ServiceId[]) {
      expect(shapeOf(id), id).toBe(LEDGER[id]!.kind);
    }
  });

  it('台帳の理由は省略形ではない', () => {
    for (const [id, row] of Object.entries(LEDGER)) {
      expect(row.why.length, id).toBeGreaterThanOrEqual(30);
      expect(row.why, id).not.toMatch(/^同上[。）)]?$/);
    }
  });

  it('★ 針が的に当たる —— `payload.token` だけの module は読み手ではない', () => {
    const payloadOnly = 'const { token } = ctx.payload as { token?: string };\n';
    expect(/\bctx\s*\.\s*token\b/.test(stripNonCode(payloadOnly))).toBe(false);
    expect(/\bctx\s*\.\s*token\b/.test(stripNonCode("const t = ctx.token;\n"))).toBe(true);
    // 注記の中の言及は数えない (`mention-vs-declaration`)。
    expect(/\bctx\s*\.\s*token\b/.test(stripNonCode('// ctx.token は Shopify のトークン\n'))).toBe(
      false,
    );
  });

  it('★ 実測: 3 つの形がそれぞれ 1 つ以上在る / 無い', () => {
    const shapes = HELD.map(shapeOf);
    expect(shapes.filter((s) => s === 'both').length).toBeGreaterThanOrEqual(20);
    // `reader-only` は免除の 1 件 (teamradar) だけ・`writer-only` は shopify だけ。
    expect(shapes.filter((s) => s === 'reader-only').length).toBe(1);
    expect(shapes.filter((s) => s === 'writer-only').length).toBe(1);
    expect(shapes.filter((s) => s === 'neither').length).toBe(0);
  });
});
