/**
 * 「すべてのデータを削除」の**残った物を名指しする文**を、値ごと (`toBe`) 留める (パス 502)。
 *
 * 既存の検査 (`main/__tests__/eraseAll.test.ts`) は実物の消去を走らせて `toContain(パス)` で見るので、
 * **文の繋ぎ目** —— 2 つ目のファイルを区切る ` / `・ファイルの句と画面側の句を繋ぐ `。`・
 * 「消せなかった物が無いのに句を立てない」境目 —— は誰も主張していなかった。断片ごとの `toContain` は
 * 繋ぎ目を見ない (`"a/b"` でも `"a / b"` でも通る)。
 *
 * 期待値は原文の式からではなく、画面が利用者へ言う文を**手で書いた値**にしてある。
 * 変えたい日には、この文を書き換える人が「利用者が読む文が変わる」と気付けるように。
 */
import { describe, expect, it } from 'vitest';
import { describeDesktopEraseReport, desktopEraseScopeSummary, type DesktopEraseReport } from '../eraseReport';

/** どの残り方でも末尾に付く手当ての文。 */
const ADVICE =
  'アプリを終了してから、そのファイル (と同じ場所の .prev / .tmp-*) を手で消してください。データは残っています。';

function report(over: Partial<DesktopEraseReport>): DesktopEraseReport {
  return { kind: 'desktop', files: {}, renderer: 'deleted', allDeleted: false, ...over };
}

describe('describeDesktopEraseReport — 残った物の文を値ごと留める', () => {
  it('全部消えた報告 (allDeleted) は文を出さない', () => {
    expect(describeDesktopEraseReport(report({ allDeleted: true }))).toBeNull();
  });

  it('消せなかったファイルが 1 つなら、そのパスだけを名指しする (消えた物・元から無い物は挙げない)', () => {
    const text = describeDesktopEraseReport(
      report({ files: { '/u/a.json': 'failed', '/u/b.json': 'deleted', '/u/c.json': 'missing' } }),
    );
    expect(text).toBe(`消せなかったファイル: /u/a.json。${ADVICE}`);
  });

  it('消せなかったファイルが 2 つなら、` / ` で区切って files の順に並べる', () => {
    const text = describeDesktopEraseReport(
      report({
        files: { '/u/a.json': 'failed', '/u/b.json': 'deleted', '/u/w.json': 'failed', '/u/c.json': 'missing' },
      }),
    );
    expect(text).toBe(`消せなかったファイル: /u/a.json / /u/w.json。${ADVICE}`);
  });

  it('画面側の保存領域だけが残ったときは、ファイルの句を立てない (空の「消せなかったファイル: 」を出さない)', () => {
    const text = describeDesktopEraseReport(
      report({ files: { '/u/a.json': 'deleted', '/u/b.json': 'missing' }, renderer: 'failed' }),
    );
    expect(text).toBe(`画面側の保存領域 (業務レコード・ライブラリ・設定) を消せませんでした。${ADVICE}`);
  });

  it('ファイルも画面側も残ったときは、2 つの句を「。」で繋ぐ', () => {
    const text = describeDesktopEraseReport(report({ files: { '/u/a.json': 'failed' }, renderer: 'failed' }));
    expect(text).toBe(
      `消せなかったファイル: /u/a.json。画面側の保存領域 (業務レコード・ライブラリ・設定) を消せませんでした。${ADVICE}`,
    );
  });

  it('手順が途中で投げた報告 (error) は、残った物の一覧ではなく「どこまで消えたか分からない」と言う', () => {
    const text = describeDesktopEraseReport(
      report({ files: { '/u/a.json': 'failed' }, renderer: 'failed', error: 'disk on fire' }),
    );
    expect(text).toBe(
      '消去の途中で止まりました: disk on fire。どこまで消えたか分からないので、アプリを終了してからファイルを手で確かめてください。データは残っている可能性があります。',
    );
  });
});

describe('desktopEraseScopeSummary — 設定画面が「何が消えて何が消えないか」を言う文を値ごと留める', () => {
  it('消える物 (トークン・状態ファイル・画面側の保存領域)・消えない物・再起動の条件を、この順に 1 文ずつ言う', () => {
    // 画面側の保存領域の括弧 (業務レコード・ライブラリの書類・プロキシ設定・画面の設定・下書き・会話履歴) と、
    // 最後の「全部消えた時だけ再起動する」は、利用者が「押したらどうなるか」を知る唯一の場所。
    expect(desktopEraseScopeSummary()).toBe(
      'このパソコンにアプリが保存した物をすべて消します: 保存済みトークン (secrets.json とその控え)、' +
        '気分の記録・人材育成・チームレーダー・ウォッチリストの状態ファイル (とその残骸)、' +
        '画面側の保存領域 (業務レコード・ライブラリの書類・プロキシ設定・画面の設定・下書き・会話履歴)。' +
        '消えない物: 書き出したファイル・OS のキーチェーンに残る鍵の器 (中身の暗号文は消える)・アプリ本体。' +
        '全部消えた時だけアプリが再起動し、最初の状態に戻ります。',
    );
  });
});
