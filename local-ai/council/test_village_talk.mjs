import test from 'node:test';
import assert from 'node:assert/strict';
import { talkRequest, oneOutcome, groupAck, pendingNote, replyFailed } from './web/villageTalk.mjs';

test('1対1は /api/chat、組織全体は /api/topic', () => {
  assert.deepEqual(talkRequest('cfo', ' 資金は？ '), { path: '/api/chat', body: { to: 'cfo', text: '資金は？' }, mode: 'one' });
  assert.deepEqual(talkRequest('', '全体の議題'), { path: '/api/topic', body: { to: '', text: '全体の議題' }, mode: 'group' });
  assert.equal(talkRequest('cfo', '   '), null);
  assert.equal(talkRequest('', ''), null);
});

test('1対1の成功は相手の名前を状態に残す', () => {
  const o = oneOutcome(true, { id: 'cfo', who: 'CFO', model: 'balanced', text: '現金を先に見ます。' });
  assert.equal(o.failed, false);
  assert.equal(o.status, 'CFO の返答');
  assert.equal(o.bubble, '現金を先に見ます。');
  assert.equal(o.id, 'cfo');
});

test('モデル停止は応答なしを隠さず理由を状態に出す', () => {
  const o = oneOutcome(true, { id: 'cfo', who: 'CFO', model: 'none', text: '（応答なし）' });
  assert.equal(o.failed, true);
  assert.match(o.status, /CFO から応答がありません/);
  assert.match(o.status, /ローカルモデルが止まっている/);
  assert.equal(o.bubble, '（応答なし）');
  assert.equal(replyFailed('none', '何か'), true);
  assert.equal(replyFailed('balanced', '（応答なし）'), true);
  assert.equal(replyFailed('balanced', '現金を先に見ます。'), false);
});

test('壊れた応答は空の成功にしない', () => {
  const down = oneOutcome(false, null);
  assert.equal(down.failed, true);
  assert.match(down.status, /受け取れませんでした/);
  assert.match(down.bubble, /受け取れませんでした/);
  const empty = oneOutcome(true, { who: 'CFO', text: '  ' });
  assert.equal(empty.failed, true);
});

test('組織全体の受付文は会議欄を指し、待ち件数は状態の別行に出す', () => {
  assert.match(groupAck(), /組織全体へ届けました/);
  assert.match(groupAck(), /会議欄に残します/);
  assert.doesNotMatch(groupAck(), /会議待ち/);
  assert.equal(pendingNote(1, false), '議題 1 件が会議待ちです');
  assert.equal(pendingNote(1, true), '');
  assert.equal(pendingNote(0, false), '');
});
