/**
 * **重複したメールの組は、最初に現れた順ではなくメールの昇順で返す。** (パス 502)
 *
 * `findDuplicateMembers` の `.sort(([a], [b]) => a.localeCompare(b))` を消す変異体と、
 * 比較子を `() => undefined` (= 全部同順) にする変異体が生き残っていた。
 * 既存の検査 (`members.test.ts` の「メールの昇順で返し」) の標本は、最初に現れた順
 * (hanako → taro) と昇順がたまたま**同じ**だったので、並べ替えが何もしなくても通っていた。
 *
 * 並びは画面の警告 (`duplicateMembersNote`) と書面 §3 の但し書きにそのまま出る
 * (どの組が重複しているかを、入力順ではなく安定した順で述べる)。ここは
 * **最初に現れた順 ≠ 昇順 ≠ 降順**の標本で、3 つを見分ける。
 */
import { describe, expect, it } from 'vitest';
import { duplicateMembersNote, findDuplicateMembers } from '../members';

describe('findDuplicateMembers — 並び (パス 502)', () => {
  // 最初に現れた順: jiro → taro → hanako (昇順は hanako → jiro → taro・降順は taro → jiro → hanako)
  const MEMBERS = [
    { email: 'jiro@example.com' },
    { email: 'taro@example.com' },
    { email: 'hanako@example.com' },
    { email: 'Taro@Example.com' },
    { email: 'HANAKO@example.com' },
    { email: 'jiro@example.com' },
    { email: ' taro@example.com ' },
  ];

  it('★ メールの昇順で返す (最初に現れた順でも降順でもない)', () => {
    expect(findDuplicateMembers(MEMBERS)).toEqual([
      { email: 'hanako@example.com', count: 2 },
      { email: 'jiro@example.com', count: 2 },
      { email: 'taro@example.com', count: 3 },
    ]);
  });

  it('★ 警告の文も同じ並びで組む (昇順の組が先に名指しされる)', () => {
    expect(duplicateMembersNote(findDuplicateMembers(MEMBERS))).toBe(
      '同じメールアドレスのメンバーが 3 組重複しており、従業員数に 2 度数えられています（hanako@example.com ×2、jiro@example.com ×2、taro@example.com ×3）。一覧の × で余分な行を消してください。',
    );
  });
});
