/**
 * **断られた理由と、今どうなっているかを、混ぜずに言う。**
 *
 * 業務レコード (IndexedDB) の読み書きが断られたときの文面。3 通りの操作 ×
 * 3 通りの理由を全て留める —— 理由で打ち手が変わり (容量を空ける /
 * 通常のウィンドウで開く / やり直す)、操作で**今どうなっているか**が変わる
 * (打った物は残っている / 一覧はそのまま / 空でも消えたとは限らない)。
 *
 * 経路 (最後の 1 件と購読) も同じ所で留める。画面はこの 1 本しか見ないので、
 * 届かない・消えない・古いままのどれが起きても画面が嘘をつく。
 */
import { describe, expect, it, vi } from 'vitest';
import type { DeviceStoreOp } from '../deviceStoreFailure';

/**
 * **毎回読み直してから測る。**
 *
 * 文面の表 (HEADING / STATE / CAUSE / REMEDY) はモジュール読み込み時に組まれる。
 * 静的初期化子の変異は「読み込み済みの写し」には当たらないので、
 * 静的 import のままだと**表の文字を空にしても検査が緑のまま通る**
 * (2026-09-06 実測で 16 件生存。`readNumeric.test.ts` と同じ形)。
 * `vi.resetModules()` → 動的 import で、変異した初期化子をテストの中で走らせる。
 */
async function load(): Promise<typeof import('../deviceStoreFailure')> {
  vi.resetModules();
  return import('../deviceStoreFailure');
}

/** `name` だけを変えた例外 (ブラウザが投げる形)。 */
function err(name: string): Error {
  const e = new Error('boom');
  e.name = name;
  return e;
}

describe('deviceStoreFailureKind — 打ち手が変わる 3 通りへ分ける', () => {
  it('★ 容量超過は quota (ブラウザごとの名前も拾う)', async () => {
    const m = await load();
    expect(m.deviceStoreFailureKind(err('QuotaExceededError'))).toBe('quota');
    expect(m.deviceStoreFailureKind(err('NS_ERROR_DOM_QUOTA_REACHED'))).toBe('quota');
  });

  it('★ 保存が禁じられている / ストアが使えないは blocked', async () => {
    const m = await load();
    expect(m.deviceStoreFailureKind(err('SecurityError'))).toBe('blocked');
    // Firefox はプライベートウィンドウで InvalidStateError を返す。打ち手は同じ。
    expect(m.deviceStoreFailureKind(err('InvalidStateError'))).toBe('blocked');
  });

  it('★ それ以外は unknown (Error でない物も含む)', async () => {
    const m = await load();
    expect(m.deviceStoreFailureKind(err('AbortError'))).toBe('unknown');
    expect(m.deviceStoreFailureKind(err('UnknownError'))).toBe('unknown');
    expect(m.deviceStoreFailureKind('文字列を投げる実装')).toBe('unknown');
    expect(m.deviceStoreFailureKind(null)).toBe('unknown');
  });
});

describe('deviceStoreFailureMessage — 操作 × 理由', () => {
  it('★ 保存 × 容量超過: 打った物が残っていることと、空け方を言う', async () => {
    const m = await load();
    expect(m.deviceStoreFailureMessage('records', 'save', err('QuotaExceededError'))).toBe(
      'この端末に保存できませんでした（この端末の保存領域が一杯です）。'
        + '打ち込んだ内容は画面に残っています。'
        + 'ライブラリの不要なファイルを削除してから、やり直してください。',
    );
  });

  it('★ 削除 × 禁止: 一覧がそのままであることと、開き直し方を言う', async () => {
    const m = await load();
    expect(m.deviceStoreFailureMessage('records', 'delete', err('SecurityError'))).toBe(
      'この端末から削除できませんでした（ブラウザの設定 (プライベートモードなど) で端末への保存が禁じられています）。'
        + '一覧はそのままです。'
        + '通常のウィンドウで開き直してください。',
    );
  });

  it('★ 読み × 不明: 空でも消えたとは限らないと言い、種別を出す', async () => {
    const m = await load();
    const line = m.deviceStoreFailureMessage('records', 'read', err('AbortError'));
    expect(line).toBe(
      'この端末に保存した記録を読めませんでした（AbortError）。'
        + '画面は空でも、記録が消えたとは限りません。'
        + '画面を再読み込みしてやり直し、直らないときは設定のバックアップで控えを取ってください。',
    );
  });

  it('★ 9 通りすべてが別の文面になる (操作も理由も文面に効いている)', async () => {
    const m = await load();
    const ops: DeviceStoreOp[] = ['read', 'save', 'delete'];
    const causes = [err('QuotaExceededError'), err('SecurityError'), err('AbortError')];
    const all = ops.flatMap((op) => causes.map((c) => m.deviceStoreFailureMessage('records', op, c)));
    expect(new Set(all).size).toBe(9);
  });

  it('★ Error でない物を投げられても文面になる (種別の欄に写る)', async () => {
    const m = await load();
    expect(m.deviceStoreFailureMessage('records', 'save', 'IDBOpenDBRequest failed')).toContain(
      '（IDBOpenDBRequest failed）',
    );
  });

  it('どの操作でも、理由と「今どうなっているか」と打ち手が 1 行に揃う', async () => {
    const m = await load();
    for (const op of ['read', 'save', 'delete'] as DeviceStoreOp[]) {
      const line = m.deviceStoreFailureMessage('records', op, err('QuotaExceededError'));
      expect(line).toContain('この端末の保存領域が一杯です');
      expect(line).toContain('やり直してください');
      expect(line.endsWith('。')).toBe(true);
    }
  });
});

describe('deviceStoreFailureMessage — 保管庫ごとの主語', () => {
  it('★ ファイル × 読み: 「0 件」を空と言い切らない', async () => {
    const m = await load();
    expect(m.deviceStoreFailureMessage('files', 'read', err('QuotaExceededError'))).toBe(
      'この端末に保存したファイルを読めませんでした（この端末の保存領域が一杯です）。'
        + '一覧が 0 件でも、ファイルが消えたとは限りません。'
        + 'ライブラリの不要なファイルを削除してから、やり直してください。',
    );
  });

  it('★ ファイル × 保存: 書き出した物が端末に残っていないと言う', async () => {
    const m = await load();
    expect(m.deviceStoreFailureMessage('files', 'save', err('SecurityError'))).toBe(
      'この端末にファイルを保存できませんでした（ブラウザの設定 (プライベートモードなど) で端末への保存が禁じられています）。'
        + '書き出した内容は端末に残っていません。'
        + '通常のウィンドウで開き直してください。',
    );
  });

  it('★ ファイル × 削除: 一覧がそのままであることを言う', async () => {
    const m = await load();
    const line = m.deviceStoreFailureMessage('files', 'delete', err('AbortError'));
    expect(line).toBe(
      'この端末からファイルを削除できませんでした（AbortError）。'
        + '一覧はそのままです。'
        + '画面を再読み込みしてやり直し、直らないときは設定のバックアップで控えを取ってください。',
    );
  });

  it('★ 記録とファイルは、どの操作でも別の文面になる (主語が効いている)', async () => {
    const m = await load();
    for (const op of ['read', 'save', 'delete'] as DeviceStoreOp[]) {
      const records = m.deviceStoreFailureMessage('records', op, err('QuotaExceededError'));
      const files = m.deviceStoreFailureMessage('files', op, err('QuotaExceededError'));
      expect(records, op).not.toBe(files);
    }
    // ファイル側だけが「ファイル」と名乗る (記録側に混ざっていない)。
    expect(m.deviceStoreFailureMessage('records', 'read', err('AbortError'))).not.toContain('ファイルを読めません');
  });
});

describe('fireReported — 押しただけの操作', () => {
  it('★ 渡された約束を受け取る (拒否を宙に浮かせない)', async () => {
    const m = await load();
    const attached: string[] = [];
    /*
     * 本物の Promise を渡すと、**この関数が何もしない変異体**では拒否が宙に浮き、
     * 検査全体が「未処理の拒否」で崩れて**どの検査が鳴ったのか分からなくなる**
     * (2026-09-06 実測: 変異検査がその 1 件を Killed ではなく RuntimeError として数えた)。
     * thenable を渡して「受け取ったか」だけを見る —— 鳴り方を自分で選ぶ。
     */
    const thenable = {
      then(onOk: unknown, onErr: unknown) {
        attached.push(typeof onOk === 'function' ? 'ok' : '-');
        attached.push(typeof onErr === 'function' ? 'err' : '-');
      },
    };
    m.fireReported(thenable as unknown as Promise<unknown>);
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(attached).toEqual(['ok', 'err']);
  });

  it('★ 拒否された約束を渡しても、呼んだ側へは投げ返さない', async () => {
    const m = await load();
    expect(() => m.fireReported(Promise.reject(new Error('断られた')))).not.toThrow();
    await new Promise<void>((r) => setTimeout(r, 0));
  });

  it('同期に済む呼び出し (void) を渡しても投げない', async () => {
    const m = await load();
    expect(() => m.fireReported(undefined)).not.toThrow();
  });
});

describe('経路 — 最後の 1 件だけを、購読している画面へ', () => {
  it('★ 届いた 1 件は current から読める (画面が後から出ても出せる)', async () => {
    const m = await load();
    expect(m.currentDeviceStoreFailure()).toBeNull();
    m.reportDeviceStoreFailure('records', 'save', 'sales-entries', err('QuotaExceededError'));
    const f = m.currentDeviceStoreFailure();
    expect(f?.op).toBe('save');
    expect(f?.where).toBe('sales-entries');
    expect(f?.message).toContain('保存領域が一杯');
  });

  it('★ 購読者へ届く / 閉じると null が届く / 解除すると届かない', async () => {
    const m = await load();
    const seen: (string | null)[] = [];
    const off = m.subscribeDeviceStoreFailure((f) => seen.push(f === null ? null : f.op));
    m.reportDeviceStoreFailure('records', 'read', 'kpi-actuals', err('InvalidStateError'));
    m.clearDeviceStoreFailure();
    expect(m.currentDeviceStoreFailure()).toBeNull();
    off();
    m.reportDeviceStoreFailure('records', 'delete', 'kpi-actuals', err('AbortError'));
    expect(seen).toEqual(['read', null]);
    // 解除後の 1 件は current には入る (画面が居ないだけ)。
    expect(m.currentDeviceStoreFailure()?.op).toBe('delete');
  });

  it('★ 後から来た方が残る (打ち手は 1 つなので並べない)', async () => {
    const m = await load();
    m.reportDeviceStoreFailure('records', 'save', 'a', err('QuotaExceededError'));
    m.reportDeviceStoreFailure('records', 'delete', 'b', err('SecurityError'));
    expect(m.currentDeviceStoreFailure()?.where).toBe('b');
  });

  it('購読者が複数居ても全員に届く', async () => {
    const m = await load();
    const a = vi.fn();
    const b = vi.fn();
    m.subscribeDeviceStoreFailure(a);
    m.subscribeDeviceStoreFailure(b);
    m.reportDeviceStoreFailure('records', 'save', 'a', err('QuotaExceededError'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('対照: 報せる前に閉じても、購読者には null が届く (押した反応は返す)', async () => {
    const m = await load();
    const seen: unknown[] = [];
    m.subscribeDeviceStoreFailure((f) => seen.push(f));
    m.clearDeviceStoreFailure();
    expect(seen).toEqual([null]);
  });
});
