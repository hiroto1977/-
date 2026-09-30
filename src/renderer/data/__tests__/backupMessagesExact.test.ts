/**
 * **バックアップの確認文・断りの文・結果の文を、全文で留める。** (パス 502)
 *
 * 既存の検査は文の**断片** (`toContain('消える記録はありません')` など) を探す。
 * 断片ごとの照合は、文の**繋ぎ目** —— 行を繋ぐ `join('\n')`・断りの文を組む 3 つ目の断片・
 * 「形式不正 0 件」のときの空の注記・件数が読めないときの代わりの語 —— を見ない。
 * 利用者は置換の確認文を読んで**元に戻せない操作**の OK を押すので、
 * 入力 → 出力の全文を値ごと (`toBe`) で並べる。
 *
 * 書き出し時刻は `null` で固定する (`toLocaleString('ja-JP')` は実行環境の時間帯とロケールに依る)。
 * 期待値は、画面が利用者に見せる文を**手で書き下した物**で、原文の式の写しではない。
 */
import { describe, expect, it } from 'vitest';
import {
  plaintextBackupConfirmMessage,
  replaceRestoreConfirmMessage,
  restoreResultMessage,
  unusableBackupRefusal,
  type PlaintextExposure,
  type RestorePlan,
} from '../backup';
import { MIN_PASSWORD_LENGTH } from '../../security/vault';

/** 手で組んだ計画。数は互いに違う値にして、取り違えたら文が変わるようにする。 */
function planOf(over: Partial<RestorePlan>): RestorePlan {
  return {
    mode: 'replace',
    exportedAt: null,
    incoming: 0,
    existing: 0,
    dropped: 0,
    added: 0,
    overwritten: 0,
    newerLocal: 0,
    localOnly: 0,
    unusableLocal: 0,
    lost: 0,
    toImport: [],
    ...over,
  };
}

describe('replaceRestoreConfirmMessage — 置換の確認文の全文 (パス 502)', () => {
  it('★ 形式不正が 0 件なら、注記は空で、4 行を改行で繋ぐ (繋ぎ目に余計な字が入らない)', () => {
    const text = replaceRestoreConfirmMessage(
      planOf({ incoming: 5, existing: 3, added: 3, overwritten: 1, newerLocal: 1, localOnly: 1, lost: 2 }),
    );
    expect(text).toBe(
      [
        '既存の業務データを全て削除してから復元します。',
        'バックアップ: 書き出し時刻不明・5 件',
        'この端末: 3 件 —— バックアップに無い 1 件と、この端末の方が新しい 1 件 (計 2 件) が消え、元に戻せません。',
        'よろしいですか？',
      ].join('\n'),
    );
    // 改行は 3 つ (4 行)。行を繋ぐ区切りが空・別の字になっていない。
    expect(text.split('\n')).toHaveLength(4);
  });

  it('★ 形式不正の控えが在れば、バックアップの行に注記を足し、消える理由に 3 つ目を足す', () => {
    const text = replaceRestoreConfirmMessage(
      planOf({ incoming: 6, existing: 4, dropped: 2, newerLocal: 2, unusableLocal: 1, lost: 3 }),
    );
    expect(text).toBe(
      [
        '既存の業務データを全て削除してから復元します。',
        'バックアップ: 書き出し時刻不明・6 件（うち 2 件は形式が不正で取り込めません）',
        'この端末: 4 件 —— バックアップに無い 0 件と、この端末の方が新しい 2 件と、' +
          'バックアップ側が形式不正で入れ替えられない 1 件 (計 3 件) が消え、元に戻せません。',
        'よろしいですか？',
      ].join('\n'),
    );
  });

  it('★ 消える記録が無いときは、そう言う (空欄にしない)', () => {
    const text = replaceRestoreConfirmMessage(planOf({ incoming: 2, existing: 2, overwritten: 2 }));
    expect(text).toBe(
      [
        '既存の業務データを全て削除してから復元します。',
        'バックアップ: 書き出し時刻不明・2 件',
        'この端末: 2 件 —— 消える記録はありません (この端末の記録は全てバックアップにあり、バックアップの方が新しいか同時刻です)。',
        'よろしいですか？',
      ].join('\n'),
    );
  });
});

describe('unusableBackupRefusal — 全件が形式不正な置換の断り (パス 502)', () => {
  it('★ 4 つの断片を繋いだ全文を返す (逃げ口の「すべてのデータを削除」まで)', () => {
    expect(unusableBackupRefusal(planOf({ incoming: 4, dropped: 4, existing: 7 }))).toBe(
      'このバックアップは 4 件すべてが形式不正で、取り込める記録が 1 件もありません。' +
        '置換すると、この端末の 7 件を消して何も入らないため復元しませんでした。' +
        '別のバックアップファイルを選んでください。業務データを消したいだけなら、' +
        '設定の「すべてのデータを削除」をお使いください。',
    );
  });

  it('★ 対照: 断る条件に当たらなければ null (マージ・形式不正が 0 件・一部だけ不正)', () => {
    expect(unusableBackupRefusal(planOf({ mode: 'merge', incoming: 4, dropped: 4, existing: 7 }))).toBeNull();
    expect(unusableBackupRefusal(planOf({ incoming: 4, dropped: 0, existing: 7 }))).toBeNull();
    expect(unusableBackupRefusal(planOf({ incoming: 4, dropped: 3, existing: 7 }))).toBeNull();
    // 0 件の控えは「全件が不正」ではない (何も無いだけ)。
    expect(unusableBackupRefusal(planOf({ incoming: 0, dropped: 0, existing: 7 }))).toBeNull();
  });
});

describe('restoreResultMessage — 復元の結果の文の全文 (パス 502)', () => {
  it('★ 置換: 件数・消えた内訳・再読み込みの案内を繋いだ全文', () => {
    const plan = planOf({ incoming: 7, existing: 3, newerLocal: 1, localOnly: 1, lost: 2 });
    expect(restoreResultMessage(plan, 7, 0)).toBe(
      '7 件のレコードを復元しました（既存データは置換。消えた 2 件 = バックアップに無い 1 件 + この端末の方が新しかった 1 件）。再読み込みで反映されます。',
    );
  });

  it('★ 置換 + 形式不正: 取り込めなかった件数を注記し、消えた内訳に 3 つ目を足す', () => {
    const plan = planOf({ incoming: 9, existing: 4, dropped: 2, newerLocal: 1, localOnly: 1, unusableLocal: 1, lost: 3 });
    expect(restoreResultMessage(plan, 7, 2)).toBe(
      '7 件のレコードを復元しました（既存データは置換。消えた 3 件 = バックアップに無い 1 件 + この端末の方が新しかった 1 件' +
        ' + バックアップ側が形式不正だった 1 件）。2 件は形式が不正なため取り込みませんでした。再読み込みで反映されます。',
    );
  });

  it('★ マージ: 追加・更新・この端末の方が新しい件数の全文', () => {
    const plan = planOf({ mode: 'merge', incoming: 5, existing: 2, added: 3, overwritten: 1, newerLocal: 1 });
    expect(restoreResultMessage(plan, 4, 0)).toBe(
      '4 件のレコードを復元しました（マージ: 追加 3・更新 1・この端末の方が新しい 1 件はそのまま）。再読み込みで反映されます。',
    );
  });

  it('★ 件数が読めないとき (非有限) は、数字の代わりに「不明な件数」と言う', () => {
    const plan = planOf({ incoming: 7, existing: 3, newerLocal: 1, localOnly: 1, lost: 2 });
    const expected = (label: string): string =>
      `${label}のレコードを復元しました（既存データは置換。消えた 2 件 = バックアップに無い 1 件 + この端末の方が新しかった 1 件）。再読み込みで反映されます。`;
    expect(restoreResultMessage(plan, Number.NaN, 0)).toBe(expected('不明な件数'));
    expect(restoreResultMessage(plan, Number.POSITIVE_INFINITY, 0)).toBe(expected('不明な件数'));
    // 対照: 有限なら数字を出す (0 件も)。
    expect(restoreResultMessage(plan, 0, 0)).toBe(expected('0 件'));
    // 読めない dropped は注記しない (NaN 件と刷らない)。
    expect(restoreResultMessage(plan, 7, Number.NaN)).toBe(expected('7 件'));
  });
});

describe('plaintextBackupConfirmMessage — 平文で書き出す前の確認文の全文 (パス 502)', () => {
  const exposure: PlaintextExposure = {
    total: 3,
    parts: [
      { collection: 'team-members', label: 'チームメンバー (メールアドレス)', count: 2 },
      { collection: 'shigyo-contacts', label: '士業の連絡先 (電話番号・メールアドレス)', count: 1 },
    ],
  };

  it('★ 4 行を改行で繋ぎ、件数の内訳を「・」で並べ、暗号化の下限文字数を言う', () => {
    const text = plaintextBackupConfirmMessage(exposure);
    expect(text).toBe(
      [
        '合言葉が空なので、平文 (暗号化なし) で書き出します。',
        '個人情報・機微な記録が 3 件入ります: チームメンバー (メールアドレス) 2 件・士業の連絡先 (電話番号・メールアドレス) 1 件。',
        `このファイルを持ち出す・共有するなら、上の欄に合言葉 (${MIN_PASSWORD_LENGTH} 文字以上) を入れて暗号化してください。`,
        'このまま平文で書き出しますか？',
      ].join('\n'),
    );
    expect(text!.split('\n')).toHaveLength(4);
  });

  it('★ 対照: 持ち出すと困る記録が 0 件なら確認しない (null)', () => {
    expect(plaintextBackupConfirmMessage({ total: 0, parts: [] })).toBeNull();
  });
});
