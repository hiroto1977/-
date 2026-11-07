/**
 * **鍵と題を分けたあとの文面と、選択肢の書き方** (2026-09-12 · パス 179)。
 *
 * 文面は画面がそのまま刷るので、**全文を書き写して**留める
 * (本体から読んで突き合わせると、文面が空になる変異体を殺せない ——
 * パス 171 で踏んだ「検査の自己参照」)。
 */
import { describe, expect, it } from 'vitest';
import {
  shadowedSkillIdNote,
  skillOptionText,
  unrunnableSkillsNote,
  unsafeSkillIdNote,
} from '../skillIdentity';

describe('unsafeSkillIdNote (パス 179)', () => {
  it('★ 使えない名前を挙げ、直す先 (フォルダ名) と直さなくていい所 (name:) を言う', () => {
    expect(unsafeSkillIdNote('請求書作成')).toBe(
      '実行できません: 実行には 英数字と . _ - だけの名前が要りますが、'
      + 'フォルダ名 (またはファイル名) は「請求書作成」です。'
      + 'フォルダ名を英数字に変えると実行できます (frontmatter の name: は日本語のままで構いません)。',
    );
  });

  it('★ 名前をそのまま入れる (別の名前を出さない)', () => {
    expect(unsafeSkillIdNote('my tool')).toContain('「my tool」');
    expect(unsafeSkillIdNote('my tool')).not.toContain('請求書作成');
  });

  it('★ 「できない」で終わらせない (打てる手が在る)', () => {
    expect(unsafeSkillIdNote('x y')).toContain('変えると実行できます');
  });
});

describe('shadowedSkillIdNote (パス 179)', () => {
  it('★ 勝つ側の実物のパスを出す', () => {
    expect(shadowedSkillIdNote('alpha', '/home/u/.claude/skills/alpha/SKILL.md')).toBe(
      '実行できません: 同じ名前「alpha」を /home/u/.claude/skills/alpha/SKILL.md も持っており、'
      + '実行するとそちらの定義が読まれます。どちらかの名前を変えてください。',
    );
  });

  it('★ 「そちらが読まれる」と述べる (黙って別の物が走るのが元の欠陥)', () => {
    expect(shadowedSkillIdNote('a', '/p')).toContain('そちらの定義が読まれます');
  });
});

describe('skillOptionText (パス 179)', () => {
  const a = { id: 'alpha', label: 'レビュー' };
  const b = { id: 'gamma', label: 'レビュー' };
  const c = { id: 'solo', label: '初期化' };

  it('★ 題が一意なら題だけ', () => {
    expect(skillOptionText(c, [a, b, c])).toBe('初期化');
  });

  it('★ 題が重なっていれば鍵を添える (どちらを選んだか読める)', () => {
    expect(skillOptionText(a, [a, b, c])).toBe('レビュー (alpha)');
    expect(skillOptionText(b, [a, b, c])).toBe('レビュー (gamma)');
  });

  it('★ 自分 1 件だけの一覧では添えない (自分を重複と数えない)', () => {
    expect(skillOptionText(a, [a])).toBe('レビュー');
  });

  it('★ 同じ題が 3 件でも全部に添える', () => {
    const d = { id: 'delta', label: 'レビュー' };
    for (const x of [a, b, d]) {
      expect(skillOptionText(x, [a, b, d])).toBe(`レビュー (${x.id})`);
    }
  });
});

describe('unrunnableSkillsNote (パス 179)', () => {
  it('★ 0 件なら何も言わない', () => {
    expect(unrunnableSkillsNote(0)).toBeUndefined();
  });

  it('★ 負の数でも何も言わない (引き算の取り違えで「-1 件」と刷らない)', () => {
    expect(unrunnableSkillsNote(-1)).toBeUndefined();
  });

  it('★ 件数を言い、理由は行に在ると案内する', () => {
    expect(unrunnableSkillsNote(2)).toBe('このうち 2 件は実行できません (一覧の各行に理由を出しています)。');
  });

  it('★ 1 件でも言う (境界)', () => {
    expect(unrunnableSkillsNote(1)).toBe('このうち 1 件は実行できません (一覧の各行に理由を出しています)。');
  });
});
