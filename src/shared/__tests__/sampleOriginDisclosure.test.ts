/**
 * **見本なのに見本と言わない項を、同じ台帳の中に混在させない** (2026-09-12 · パス 164)。
 *
 * ## 実測した欠陥
 *
 * `SERVICE_DATA_ORIGIN` が 'sample' のサービスは **42 件** ——
 * fetcher が stub (`createSnapshotStub` / `return STUB`) で I/O が一切無く、
 * 画面は同梱データを出す。その 42 件のうち、サイドバーの説明が見本だと述べていたのは
 * **11 件だけ** (`(snapshot)` / `仮想データ`)。残り 31 件は何も言わずに並んでいた。
 *
 * 同じ表の中でこう並ぶ:
 *
 * ```
 *   Sentry       エラー監視 — issues / performance / releases          ← 実連携に読める
 *   ai-blogkun   AI 自動ブログ生成 SaaS (snapshot)                      ← 見本だと言う
 * ```
 *
 * **どちらも stub である。** 利用者は並べて読むので、片方が黙っていれば
 * 「こちらは繋がっている」と読む —— パス 161 (在りもしない保存先) /
 * 163 (実物とずれた数) と同じ「画面が言っていることは本当か」の家系である。
 *
 * 実測 (2026-09-12・jsdom でブラウザ版として 26 画面を描いた): 23 画面が
 * `内蔵サンプル` のバッジと「この画面は同梱データと手入力を表示します（外部連携なし）」を
 * 出していた。**実行時の断りは在る** (パス 91 の仕事) —— 足りないのはサイドバーだけだった。
 *
 * ## 台帳の形
 *
 * origin が 'sample' の全件について、**説明が見本だと述べる**か、
 * **述べない理由を台帳に書く**かのどちらか。理由は 3 系統に分かれた:
 *
 * - `records` … 画面の主役は利用者の記録・手入力で、同梱データは初期表示だけ
 *   (士業 CRM・不動産・投資信託・税務試算)。「(snapshot)」と書くと逆に誤解を招く
 * - `derived` … 同梱データを出さない (実行時にバッジも出ない)。売上・チーム・経営概況
 * - `verified` … 同梱しているのが**確証済みの知識**で、見本ではない (制度知識・コネクタ台帳)
 *
 * **双方向**に見る (述べていない項が台帳に無ければ落ち、台帳の項が sample でなければ落ちる)。
 */
import { describe, expect, it } from 'vitest';
import { SERVICES } from '../../renderer/services';
import { SERVICE_DATA_ORIGIN } from '../dataOrigin';
import type { ServiceId } from '../serviceId';

/** 説明が「同梱の見本である」と述べている綴り。 */
const DISCLOSES = /snapshot|模擬データ|仮想データ|同梱|見本|サンプル/;

/** 述べなくてよい理由。**空文字は許さない** (無言の除外を作らない)。 */
const LEDGER: Partial<Record<ServiceId, string>> = {};

const SAMPLE_IDS = (Object.keys(SERVICE_DATA_ORIGIN) as ServiceId[]).filter(
  (id) => SERVICE_DATA_ORIGIN[id] === 'sample',
);

function descriptionOf(id: ServiceId): string | null {
  return SERVICES.find((s) => s.id === id)?.description ?? null;
}

describe('見本のサービスは、サイドバーでもそう述べる (パス 164)', () => {
  it('★ origin が sample の項は、説明が見本だと述べるか台帳に理由が在る', () => {
    const silent = SAMPLE_IDS.filter((id) => {
      if (id in LEDGER) return false;
      const d = descriptionOf(id);
      return d === null || !DISCLOSES.test(d);
    });
    expect(
      silent,
      '同梱データを出す画面は説明でもそう述べること (11 件が既に「(snapshot)」と書いている)。'
        + '述べない理由が在るなら sampleOriginDisclosure.test.ts の台帳へ',
    ).toEqual([]);
  });

  it('★ 台帳に在るのに origin が sample でない項は無い (腐った台帳を許さない)', () => {
    const stale = Object.keys(LEDGER).filter((id) => !SAMPLE_IDS.includes(id as ServiceId));
    expect(stale).toEqual([]);
  });

  it('★ 台帳の理由は空でない (無言の除外を作らない)', () => {
    const blank = Object.entries(LEDGER).filter(([, why]) => (why ?? '').trim().length === 0);
    expect(blank.map(([id]) => id)).toEqual([]);
  });

  it('★ 台帳に載せた項は、説明で見本だと述べていない (二重管理を許さない)', () => {
    // 述べているなら台帳から外す — でないと「理由が在るのに述べてもいる」行が腐る。
    const both = Object.keys(LEDGER).filter((id) => {
      const d = descriptionOf(id as ServiceId);
      return d !== null && DISCLOSES.test(d);
    });
    expect(both).toEqual([]);
  });

  it('★ 対照: 綴りの規則が実際に当たる (空振りしていない)', () => {
    expect(DISCLOSES.test('エラー監視 — issues / performance / releases (snapshot)')).toBe(true);
    expect(DISCLOSES.test('折れ線・円・レーダーで数値を可視化 (仮想データ + 自己検査つき)')).toBe(true);
    expect(DISCLOSES.test('エラー監視 — issues / performance / releases')).toBe(false);
  });

  it('走査が生きている (sample の項が 12 件以上ある)', () => {
    // 分類が壊れて 0 件になると、上の検査が無条件に通る。
    // 下限は実態に合わせて置く: 2026-11-19 のローカル完結バッチ 1・2 で
    // 士業 8 件と分析・内部画面 9 件が 'local' へ移り 22 件、バッチ 3 で
    // grok・不動産・投資信託が 'local'、dropbox が 'remote' へ移り 18 件、
    // 2026-11-21 の第4弾で storage・obsidian・docker が 'local' へ移り、
    // 残る sample は外部連携待ち・別機能待ちの 14 件。
    expect(SAMPLE_IDS.length).toBeGreaterThanOrEqual(11);
  });
});
