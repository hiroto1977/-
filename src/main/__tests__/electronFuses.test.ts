import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    value: false,
    why:
      'true だと file:// の文書に追加の特権が付く。取り込んだ HTML を開かせる経路が ' +
      '将来できたときに効いてくる。',
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
  it('★ fuse の鍵は 5 つ (増減したら中身を判断すること)', () => {
    expect(Object.keys(config.electronFuses ?? {}).sort()).toEqual(Object.keys(REQUIRED_FUSES).sort());
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

  it('理由が空の項目が無い', () => {
    for (const [name, { why }] of Object.entries(REQUIRED_FUSES)) {
      expect(why.trim().length, `${name} の理由が空`).toBeGreaterThan(30);
    }
  });
});
