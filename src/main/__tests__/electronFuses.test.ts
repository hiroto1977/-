import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readOriginalSource } from '../../shared/__tests__/originalSource';
import { stripComments } from '../../shared/__tests__/stripNonCode';

/*
 * **配布物の fuse は、値まで留める。**
 *
 * ## 何を守るのか
 *
 * Electron の fuse は**署名済みバイナリに焼き込まれる**ので、後から
 * 実行時のコードでは変えられない。だから配布の設定
 * (`electron-builder.json`) が唯一の指定場所であり、そこが緩むと
 * **出荷したアプリの性質そのものが変わる**。
 *
 * とくに `runAsNode` —— `true` に戻すと、署名済みの自分自身を
 * `ELECTRON_RUN_AS_NODE=1` で Node として起動でき、アプリの資格で
 * `safeStorage.decryptString` を呼べる。**保存済みトークンが復号できる。**
 *
 * ## なぜ検査が要るか (2026-08-25 実測)
 *
 * `electron-builder.json` は改竄検知の鎖 (`chain:verify`) が守っている。
 * だが鎖が見るのは「**未承認の変更が無いこと**」であって、
 * **中身が何と書いてあるべきか**ではない。実際に確かめた:
 *
 * ```
 *   runAsNode を true にする
 *     → chain:verify   exit 1   (ここまでは鳴る)
 *   通常の編集手順どおり chain:append する
 *     → chain:verify   exit 0
 *     → npm test       exit 0   (10,809 件)
 *     → verify:all     exit 0   (33 ゲート)
 * ```
 *
 * `chain:append` は保護対象を触ったときの**日常の手順**である
 * (このセッションでも何度も踏んでいる)。つまり鎖は「気付かぬ書き換え」を
 * 止めるが、「**意図した書き換えの中身**」は誰も見ていなかった。
 *
 * ## 値そのものと、集合の両方を留める
 *
 * 名指しの規則は名指しした綴りしか止められない。新しい fuse が Electron に
 * 増えたとき、ここが黙ったままでは意味が無いので**鍵の集合**も固定する。
 */

const CONFIG = join(__dirname, '../../../electron-builder.json');

interface BuilderConfig {
  readonly electronFuses?: Record<string, unknown>;
  readonly asar?: unknown;
  readonly files?: readonly string[];
}

const config = JSON.parse(readFileSync(CONFIG, 'utf8')) as BuilderConfig;

/** 各 fuse の**必要な値**と、なぜその値でなければならないか。 */
const REQUIRED_FUSES: Readonly<Record<string, { value: boolean; why: string }>> = {
  runAsNode: {
    value: false,
    why:
      'true だと ELECTRON_RUN_AS_NODE=1 で署名済みバイナリを Node として起動でき、' +
      'アプリの資格で safeStorage.decryptString を呼べる (保存済みトークンが復号できる)。',
  },
  enableCookieEncryption: {
    value: true,
    why: 'Cookie ストアを暗号化する。false だとプロファイルを持ち出した者が素で読める。',
  },
  enableNodeOptionsEnvironmentVariable: {
    value: false,
    why:
      'true だと NODE_OPTIONS で任意の --require を差し込める = 起動時に他人のコードが ' +
      'アプリの資格で走る。',
  },
  enableNodeCliInspectArguments: {
    value: false,
    why: 'true だと --inspect で主プロセスへデバッガを繋げる = 記憶の中の鍵まで読める。',
  },
  grantFileProtocolExtraPrivileges: {
    value: true,
    why:
      'false にすると asar 内の file:// の読み込みが ERR_FILE_NOT_FOUND で失敗し、梱包版の窓が白くなる ' +
      '(2026-10-23 に Electron 45.0.0 の梱包物で実測: false = chrome-error://chromewebdata/ · true = 起動して UI が出る · threat: T-165)。' +
      '追加の特権の危険 (乗っ取られたレンダラーが fetch で任意の file:// を読む) は、窓の session の門 ' +
      '(fileRequestGate · threat: T-140) が要求の側で閉じる。fuse を false に戻す前に、梱包物で窓が出ることを測ること。',
  },
  onlyLoadAppFromAsar: {
    value: true,
    why:
      'Electron は app.asar → app/ の順に探す。false だと app.asar を消して resources/app/ にコードを置くだけで、' +
      '署名済みバイナリが他人のコードを実行する (2026-10-23 に梱包物で実測: false = 置いたコードが走った · true = 走らない · threat: T-166)。' +
      '実測は npm run smoke:packaged が毎回行う。',
  },
};

describe('electron-builder の fuse は値まで固定する', () => {
  it('設定に electronFuses が在る', () => {
    expect(config.electronFuses, 'electronFuses ごと消えている').toBeDefined();
  });

  it.each(Object.entries(REQUIRED_FUSES))('★ %s は決められた値である', (name, { value, why }) => {
    expect(config.electronFuses?.[name], `${name}: ${why}`).toBe(value);
  });

  /*
   * **集合も留める。** 上の 5 本は今ある fuse しか見ない。Electron が
   * 新しい fuse を足したとき、既定値のまま放置してよいとは限らない ——
   * 増減したらここで気付いて、判断してから台帳へ足す。
   */
  it('★ fuse の鍵は 6 つ (増減したら中身を判断すること)', () => {
    expect(Object.keys(config.electronFuses ?? {}).sort()).toEqual(Object.keys(REQUIRED_FUSES).sort());
  });

  it('★ onlyLoadAppFromAsar は true — app.asar を消して resources/app を置く差し替えを止める (threat: T-166)', () => {
    expect(config.electronFuses?.onlyLoadAppFromAsar, REQUIRED_FUSES.onlyLoadAppFromAsar?.why).toBe(true);
    // enableEmbeddedAsarIntegrityValidation は意図して未設定 (mac / win の署名つき梱包を測れるまで入れない。T-166 の fix に理由)
    expect(config.electronFuses).not.toHaveProperty('enableEmbeddedAsarIntegrityValidation');
  });

  /*
   * `asar` は既定で true。明示的に false にすると、アプリの資源が
   * 素のファイルとしてインストール先に並ぶ。
   */
  it('asar を無効化していない', () => {
    expect(config.asar, 'asar: false は資源を素のファイルで置く').not.toBe(false);
  });

  /*
   * 配布物に**入れる物**も、増えたら見る。`files` に `src/**` や `.env` が
   * 混ざれば、ソースや設定がそのまま配られる。
   */
  it('配布物に入れるのはビルド成果物だけ', () => {
    expect(config.files).toEqual(['dist/**/*', 'dist-electron/**/*', 'build/icon.png', 'package.json']);
  });

  /*
   * **fuse を true にしている安全は、要求の門に依る** (threat: T-165 · T-140)。門 (`installFileRequestGate`) が
   * 窓の session に付いていなければ、乗っ取られたレンダラーが `fetch('file:///…')` で任意のファイルを読める。
   * 2 つを別々に留めても、片方だけが外れる形が開くので、ここで結ぶ。
   */
  it('★ grantFileProtocolExtraPrivileges を true にする間は、主プロセスが file:// の門を窓へ付ける (threat: T-165)', () => {
    const main = stripComments(readOriginalSource(join(__dirname, '../main.ts')));
    if (config.electronFuses?.grantFileProtocolExtraPrivileges === true) {
      expect(main, 'fuse が true なのに file:// の門が付いていない (T-140)').toMatch(/installFileRequestGate\(\s*win\.webContents\.session/);
    }
    expect(config.electronFuses?.grantFileProtocolExtraPrivileges, 'false は梱包版を白画面にする (T-165)').toBe(true);
  });

  it('理由が空の項目が無い', () => {
    for (const [name, { why }] of Object.entries(REQUIRED_FUSES)) {
      expect(why.trim().length, `${name} の理由が空`).toBeGreaterThan(30);
    }
  });
});
