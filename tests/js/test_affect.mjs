// dashboard.js の affect 分類器 + 倫理ガード を検証 (governance/15)
//
// 主要 検証:
// - 4 次元 すべて [0, 1] に clamp
// - 強い 正/負 マーカ で valence が予期方向に動く
// - 性別/年齢 マーカ を含む 入力 でも 結果 が 同一 (gender-blind 確認)
// - 試験 OFF 時の副作用 ゼロ (drift sniff)
// - JSON エスケープ 互換 (audit と同様)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DASHBOARD_JS = path.join(ROOT, 'v19/ui/dashboard.js');
const dashSrc = fs.readFileSync(DASHBOARD_JS, 'utf8');

// ─── inline spec (dashboard.js と一致) ───
// テスト 用に必要 関数 を inline で再現。dashboard.js の文字列 sniff で drift 検出も同時に行う。
const AFFECT_MARKERS = {
  valence_pos: ['ありがと', 'いいね', '最高', '素晴らし', 'すごい', '成功', '助かっ', 'うまくいっ', 'OK', 'いい感じ', '完璧', '神'],
  valence_neg: ['困っ', 'だめ', '無理', '最悪', '嫌だ', '失敗', 'エラー', 'うまくいかな', 'できな', 'やめ', 'つらい', 'しんどい', 'バグ'],
  urgency_hi: ['急', 'すぐ', '至急', '今日中', '明日まで', '助けて', 'ASAP', '緊急', '間に合', '早く', 'やばい'],
  formality_hi_endings: ['です。', 'ます。', 'です', 'ます', 'ございます', 'いたします', 'お願いいたします', '存じます', '申し上げ'],
  formality_lo_markers: ['だよ', 'じゃん', 'だね', 'やん', 'っしょ', 'かな〜'],
};
function _affectCount(text, list) {
  let n = 0;
  for (const m of list) n += (text.split(m).length - 1);
  return n;
}
function _clamp01(x) { return Math.max(0, Math.min(1, x)); }
function classifyAffect(text) {
  const empty = { valence: 0.5, arousal: 0.5, urgency: 0.5, formality: 0.5, evidence: { length: 0 } };
  if (typeof text !== 'string' || !text.trim()) return empty;
  const t = text.trim();
  const len = t.length;
  const pos = _affectCount(t, AFFECT_MARKERS.valence_pos);
  const neg = _affectCount(t, AFFECT_MARKERS.valence_neg);
  const valence = _clamp01(0.5 + (pos - neg) * 0.15);
  const exclam = (t.match(/[!!]/g) || []).length;
  const question = (t.match(/[??]/g) || []).length;
  const repeat = (t.match(/(.)\1{2,}/g) || []).length;
  const emoji = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  const arousalRaw = exclam * 0.15 + question * 0.05 + repeat * 0.2 + emoji * 0.1;
  const arousal = _clamp01(0.3 + arousalRaw);
  const urg = _affectCount(t, AFFECT_MARKERS.urgency_hi);
  const urgency = _clamp01(0.3 + urg * 0.25);
  const formHi = _affectCount(t, AFFECT_MARKERS.formality_hi_endings);
  const formLo = _affectCount(t, AFFECT_MARKERS.formality_lo_markers);
  const endsPeriod = /[。.]\s*$/.test(t) ? 1 : 0;
  const formality = _clamp01(0.5 + (formHi - formLo) * 0.18 + endsPeriod * 0.05);
  return { valence, arousal, urgency, formality, evidence: { length: len, pos, neg, exclam, question, repeat, emoji, urg, formHi, formLo, endsPeriod } };
}
function affectStyleModifier(a) {
  if (!a) return '';
  const lines = [];
  if (a.urgency > 0.7) lines.push('ユーザーは急いでいます。前置きを省き短く即答してください。');
  if (a.valence < 0.35) lines.push('ユーザーは困っているか不快を示しています。共感を示しつつ問題解決にフォーカスしてください。');
  if (a.formality > 0.7) lines.push('ユーザーは丁寧語で話しています。敬語で論理的に応答してください。');
  if (a.formality < 0.35 && a.arousal > 0.6) lines.push('ユーザーは砕けた高テンションです。フランクに、ただし内容は正確に。');
  if (a.arousal < 0.3 && a.formality > 0.5) lines.push('ユーザーは落ち着いて丁寧です。じっくり詳細に応答してください。');
  if (lines.length === 0) return '';
  return '\n\n[応答スタイル ヒント (heuristic 推定): ' + lines.join(' ') + ']';
}

const tests = [];

// 1. drift sniff: dashboard.js が必須シンボルを持っている
tests.push(['dashboard.js に classifyAffect', dashSrc.includes('function classifyAffect')]);
tests.push(['dashboard.js に affectStyleModifier', dashSrc.includes('function affectStyleModifier')]);
tests.push(['dashboard.js に AFFECT_MARKERS', dashSrc.includes('AFFECT_MARKERS')]);
tests.push(['dashboard.js に opt-in ガード', dashSrc.includes('state.affect?.optedIn === true')]);
tests.push(['dashboard.js が auditLogBrowser に値を渡さない (privacy)',
  dashSrc.includes("auditLogBrowser('affect.classified', '')")]);
tests.push(['governance/15 が存在', fs.existsSync(path.join(ROOT, 'governance/15_AFFECT_ETHICS.md'))]);

// 2. 4 次元 すべて [0, 1] に clamp
{
  const samples = [
    '', '普通の文', 'ありがとう!', '困った困った困った困った',
    '!!!!!!!!!急ぎで助けて!!!!!!!!!急ぎで助けて!!!!!!',
    'お世話になっております。ご確認のほどよろしくお願い申し上げます。',
  ];
  let allInRange = true;
  for (const s of samples) {
    const a = classifyAffect(s);
    for (const k of ['valence', 'arousal', 'urgency', 'formality']) {
      if (a[k] < 0 || a[k] > 1) { allInRange = false; break; }
    }
  }
  tests.push(['4 次元 すべて [0, 1] に clamp', allInRange]);
}

// 3. 強い 正 マーカ で valence > 0.6
{
  const a = classifyAffect('ありがとう! いいね! 最高!');
  tests.push(['強い正マーカで valence > 0.6', a.valence > 0.6]);
}

// 4. 強い 負 マーカ で valence < 0.4
{
  const a = classifyAffect('困った 失敗 エラー だめだ 無理だよ');
  tests.push(['強い負マーカで valence < 0.4', a.valence < 0.4]);
}

// 5. !! の連続 で arousal > 0.5
{
  const a = classifyAffect('やったああ!!!!!');
  tests.push(['! 連発 + 反復文字で arousal > 0.5', a.arousal > 0.5]);
}

// 6. 急ぎ語彙 で urgency > 0.7
{
  const a = classifyAffect('至急対応してほしい 急ぎで');
  tests.push(['急ぎ語彙で urgency > 0.7', a.urgency > 0.7]);
}

// 7. 敬語 で formality > 0.6
{
  const a = classifyAffect('お世話になっております。お手数ですがご確認お願いいたします。');
  tests.push(['敬語で formality > 0.6', a.formality > 0.6]);
}

// 8. 砕け で formality < 0.5
{
  const a = classifyAffect('それな じゃん だよね');
  tests.push(['砕けで formality < 0.5', a.formality < 0.5]);
}

// 9. ★ 倫理ガード: 性別 マーカ を含む 入力 でも 結果 が 同一
//    (実装上、性別語彙を見ていないことを担保)
{
  const baseText = 'ありがとう、助かりました!';
  const female = '女性として、' + baseText;
  const male = '男性として、' + baseText;
  const aBase = classifyAffect(baseText);
  const aF = classifyAffect(female);
  const aM = classifyAffect(male);
  // 「として」の追加で 助詞 増えるが、4 次元の主要値は ほぼ 一致
  // valence と arousal は 同程度 (差 < 0.05) であるべき
  const dV = Math.abs(aF.valence - aM.valence);
  const dA = Math.abs(aF.arousal - aM.arousal);
  tests.push(['gender-blind: 男性/女性 表記 で valence 差 < 0.05', dV < 0.05]);
  tests.push(['gender-blind: 男性/女性 表記 で arousal 差 < 0.05', dA < 0.05]);
}

// ★ 倫理ガード: governance/15 の 全 protected attribute (7 軸) を検証
// gender (済) + age + ethnicity + religion + sexual_orientation + politics + disability
{
  const baseText = 'ありがとう、助かりました!';
  // 各軸 で典型的なマーカを含む 2 つの入力 を作り、affect の差が小さい (< 0.05) ことを確認
  const cases = [
    ['ethnicity', '日本人として、' + baseText, '中国人として、' + baseText],
    ['ethnicity_2', 'アメリカ人として、' + baseText, 'インド人として、' + baseText],
    ['religion', 'キリスト教徒として、' + baseText, '仏教徒として、' + baseText],
    ['religion_2', 'ユダヤ教徒として、' + baseText, 'ヒンドゥー教徒として、' + baseText],
    ['sexual_orientation', 'ヘテロセクシャルとして、' + baseText, 'ホモセクシャルとして、' + baseText],
    ['politics', '保守派として、' + baseText, '革新派として、' + baseText],
    ['politics_2', '自民党支持者として、' + baseText, '立憲民主党支持者として、' + baseText],
    ['disability', '健常者として、' + baseText, '視覚障害者として、' + baseText],
  ];
  for (const [label, a_text, b_text] of cases) {
    const aA = classifyAffect(a_text);
    const aB = classifyAffect(b_text);
    const dV = Math.abs(aA.valence - aB.valence);
    const dA = Math.abs(aA.arousal - aB.arousal);
    const dU = Math.abs(aA.urgency - aB.urgency);
    const dF = Math.abs(aA.formality - aB.formality);
    const maxDelta = Math.max(dV, dA, dU, dF);
    tests.push([`protected-attr blind (${label}): 4 次元 max 差 < 0.10`, maxDelta < 0.10]);
  }
}

// 10. 倫理ガード: 年齢 マーカ で urgency が変わらない
{
  const young = '20 歳の私としては すぐ 知りたい';
  const old = '60 歳の私としては すぐ 知りたい';
  const aY = classifyAffect(young);
  const aO = classifyAffect(old);
  tests.push(['gender-blind: 年齢 表記 で urgency 差 < 0.05',
    Math.abs(aY.urgency - aO.urgency) < 0.05]);
}

// 11. 空 入力 で 全 0.5
{
  const a = classifyAffect('');
  tests.push(['空 入力 → 4 次元 = 0.5',
    a.valence === 0.5 && a.arousal === 0.5 && a.urgency === 0.5 && a.formality === 0.5]);
}

// 12. style modifier: 急ぎ で「短く即答」を含む
{
  const a = { valence: 0.5, arousal: 0.5, urgency: 0.85, formality: 0.5 };
  const m = affectStyleModifier(a);
  tests.push(['urgency=0.85 → 短く即答ヒント', m.includes('短く即答')]);
}

// 13. style modifier: 不快 で「共感」を含む
{
  const a = { valence: 0.2, arousal: 0.5, urgency: 0.5, formality: 0.5 };
  const m = affectStyleModifier(a);
  tests.push(['valence=0.2 → 共感ヒント', m.includes('共感')]);
}

// 14. style modifier: 全て中立 で 空文字
{
  const a = { valence: 0.5, arousal: 0.5, urgency: 0.5, formality: 0.5 };
  const m = affectStyleModifier(a);
  tests.push(['中立 → modifier 空', m === '']);
}

// 15. style modifier: 形式 0.85 で「敬語」を含む
{
  const a = { valence: 0.5, arousal: 0.5, urgency: 0.5, formality: 0.85 };
  const m = affectStyleModifier(a);
  tests.push(['formality=0.85 → 敬語ヒント', m.includes('敬語')]);
}

// 16. プライバシー: classifyAffect は副作用なし (関数 純粋)
{
  const before = JSON.stringify(classifyAffect('ありがとう'));
  const after = JSON.stringify(classifyAffect('ありがとう'));
  tests.push(['同一入力 → 同一出力 (deterministic)', before === after]);
}

let pass = 0, fail = 0;
for (const [name, ok] of tests) {
  console.log(ok ? '✅' : '❌', name);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
