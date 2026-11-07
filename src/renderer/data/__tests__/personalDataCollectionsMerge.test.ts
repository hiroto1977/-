/**
 * **`personalDataCollections()` は、同じ collection を 1 度しか返さない。** (パス 502)
 *
 * この関数は 3 つの出どころ (欄の名前の走査 / 入れ子の台帳 / 中身で機微な台帳) を
 * 順に足し、**先に入った物を優先して、後の台帳の重複を落とす**。実物のデータでは
 * 3 つの出どころが重なることは無い (`collectionShapes.test.ts` が留める) ので、
 * この落とす枝は今日のデータでは 1 度も通らず、守りが外れても誰も鳴らなかった。
 *
 * 平文バックアップの確認文は**ここで数えた件数**を利用者に告げる
 * (`backup.ts`)。重複して返すと「個人情報を含む記録が 2 件」と**過大に**数える。
 * 台帳は実行時には素の object なので、検査の中で重複を一時的に作って確かめ、必ず元へ戻す。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  COLLECTION_SHAPES,
  NESTED_PERSONAL_DATA,
  PERSONAL_DATA_FIELDS,
  SENSITIVE_BY_CONTENT,
  personalDataCollections,
} from '../collectionShapes';

type LedgerEntry = { readonly fields: readonly string[]; readonly why: string };
/** 台帳の型は Readonly だが、実行時は素の object。検査の間だけ足して、`afterEach` で戻す。 */
const nested = NESTED_PERSONAL_DATA as Record<string, LedgerEntry>;
const sensitive = SENSITIVE_BY_CONTENT as Record<string, LedgerEntry>;

const injected: { readonly ledger: Record<string, LedgerEntry>; readonly key: string }[] = [];
function inject(ledger: Record<string, LedgerEntry>, key: string, entry: LedgerEntry): void {
  if (Object.hasOwn(ledger, key)) throw new Error(`${key} は既に台帳に在る (この検査は新しい鍵だけを足す)`);
  ledger[key] = entry;
  injected.push({ ledger, key });
}
afterEach(() => {
  for (const { ledger, key } of injected.splice(0)) delete ledger[key];
});

const countOf = (collection: string): number => personalDataCollections().filter((p) => p.collection === collection).length;
const fieldsOf = (collection: string): readonly string[] | undefined =>
  personalDataCollections().find((p) => p.collection === collection)?.fields;

describe('personalDataCollections — 出どころが重なっても 1 度だけ返す (パス 502)', () => {
  it('★ 前提: 標本の collection は走査で出る (欄 phone / email を持つ)・台帳には居ない', () => {
    // 重複を作る前の姿。ここが崩れたら、下の検査は別の物を測ってしまう。
    expect(COLLECTION_SHAPES['shigyo-contacts']!.fields.some((f) => PERSONAL_DATA_FIELDS.includes(f))).toBe(true);
    expect(Object.hasOwn(NESTED_PERSONAL_DATA, 'shigyo-contacts')).toBe(false);
    expect(Object.hasOwn(SENSITIVE_BY_CONTENT, 'shigyo-contacts')).toBe(false);
    expect(countOf('shigyo-contacts')).toBe(1);
    expect(fieldsOf('shigyo-contacts')).toEqual(['phone', 'email']);
  });

  it('★ 走査で出る collection が入れ子の台帳にも居ても、1 件だけ (走査の欄が優先)', () => {
    inject(nested, 'shigyo-contacts', { fields: ['representative'], why: '検査が一時的に足した重複 (台帳の欄は採らない)' });
    expect(countOf('shigyo-contacts')).toBe(1);
    // 先に入った走査の欄が残り、後の台帳の欄は載らない。
    expect(fieldsOf('shigyo-contacts')).toEqual(['phone', 'email']);
    // 重複を作っても、他の collection の件数は動かない。
    expect(countOf('team-members')).toBe(1);
    expect(countOf('bank-submission-settings')).toBe(1);
  });

  it('★ 走査で出る collection が「中身で機微」の台帳にも居ても、1 件だけ (走査の欄が優先)', () => {
    inject(sensitive, 'shigyo-contacts', { fields: ['topic'], why: '検査が一時的に足した重複 (台帳の欄は採らない)' });
    expect(countOf('shigyo-contacts')).toBe(1);
    expect(fieldsOf('shigyo-contacts')).toEqual(['phone', 'email']);
    expect(countOf('shigyo-consultations')).toBe(1);
  });

  it('★ 入れ子の台帳の collection が「中身で機微」の台帳にも居ても、1 件だけ (入れ子の欄が優先)', () => {
    expect(Object.hasOwn(NESTED_PERSONAL_DATA, 'bank-submission-settings')).toBe(true);
    inject(sensitive, 'bank-submission-settings', { fields: ['profile'], why: '検査が一時的に足した重複 (台帳の欄は採らない)' });
    expect(countOf('bank-submission-settings')).toBe(1);
    expect(fieldsOf('bank-submission-settings')).toEqual(['representative', 'address']);
  });

  it('★ 対照: 出どころが重ならなければ、どの出どころの collection も 1 件ずつ返る', () => {
    // 走査 (欄の名前) / 入れ子の台帳 / 中身で機微の台帳 の 3 種類が、それぞれ 1 件ずつ。
    expect(countOf('team-members')).toBe(1);
    expect(countOf('bank-submission-settings')).toBe(1);
    expect(countOf('shigyo-consultations')).toBe(1);
    expect(fieldsOf('shigyo-consultations')).toEqual(['topic', 'date', 'serviceId']);
    // 全体でも collection 名は 1 度ずつ。
    const names = personalDataCollections().map((p) => p.collection);
    expect(new Set(names).size).toBe(names.length);
  });
});
