#!/usr/bin/env node
'use strict';

/**
 * 指示のティア —— 利用者の 1 つの指示から「どれだけ深く・長く・何に任せて」働くかを決める。
 *
 * ## なぜ要るか (2026-10-07 · パス 505)
 *
 * 主セッションのモデルと effort は利用者が `/model` と `/effort` で決める。それは
 * ここからは変えられない (hook にも、アシスタント自身にも、その口は無い)。
 * **変えられるのは、指示を受けたあとの働き方**である —— どの仕事をサブエージェントへ
 * 任せるか・そのサブエージェントにどのモデルと effort を渡すか・Workflow の検証段を
 * どれだけ重くするか・途中で止めずに最後 (全件の検査と実機と記録) まで走るか。
 * これらは指示ごとに**同じ基準で**決まるべきで、その基準が散文にしか無いと、
 * 軽い指示に重い検証を掛け、重い指示を軽い手で片付ける形が繰り返される。
 *
 * ## 仕組み
 *
 * `.claude/settings.json` の `UserPromptSubmit` hook として、指示のたびに走る。
 * 標準入力の JSON (`{ prompt }`) を読み、ティア (`light` / `standard` / `deep`) を
 * 決め、**1 行の案内**を標準出力に書く —— Claude Code はこれを指示の文脈へ足すので、
 * アシスタントは次の応答の冒頭でそれを読める。案内が指す方針は
 * `docs/MODEL_EFFORT_POLICY.md` の 1 つ (数や名前を 2 度書かない —— この script が
 * 持つ表 `TIERS` が正で、方針書と agent 定義は検査がそれと突き合わせる)。
 *
 * ## 契約
 *
 *   - **必ず exit 0** —— 読めない・空・スラッシュコマンドなら何も出さずに終わる。
 *     UserPromptSubmit の hook が exit 2 で終わると**指示そのものが止まる**ので、
 *     この script は指示を止める判断を 1 つも持たない。
 *   - 出力は 1 行 (300 字以内) —— 指示のたびに文脈へ入るので長くしない。
 *   - 子プロセスを作らない・網へ出ない・ファイルを書かない (読むのも stdin だけ)。
 *   - 判定は純関数 `classifyInstruction` で、`--self-test` と
 *     `src/shared/__tests__/taskTierPolicy.test.ts` が標本で留める。
 *
 * ## 使い方
 *
 *   echo '{"prompt":"…"}' | node scripts/task-tier.cjs     # hook と同じ経路
 *   node scripts/task-tier.cjs --classify "指示の文"        # 手で確かめる
 *   node scripts/task-tier.cjs --self-test
 */

const fs = require('node:fs');

/** 1 行の案内の上限 (文字)。指示のたびに文脈へ入るので、ここより長くしない。 */
const MAX_GUIDANCE_CHARS = 300;

/** 案内を出す指示の最短の長さ (文字)。1 文字の相槌には出さない。 */
const MIN_PROMPT_CHARS = 2;

/**
 * ティアの表 —— **これが正**で、`docs/MODEL_EFFORT_POLICY.md` と
 * `.claude/agents/<agent>.md` はこの表と検査で突き合わせる。
 *
 * `mainEffort` は主セッションへの**推奨** (利用者が `/effort` で決める物)。
 * `agent` / `agentModel` / `agentEffort` は Agent tool へ渡す定義で、
 * `.claude/agents/<agent>.md` の frontmatter と一致していなければ検査が落ちる。
 * `workflow` は Workflow (多段のエージェント) を**提案する**か —— 走らせるのは
 * 利用者の opt-in が要るので、ここは提案の可否だけを持つ。
 */
const TIERS = Object.freeze({
  light: Object.freeze({
    id: 'light',
    label: '軽',
    mainEffort: 'low',
    agent: 'scout',
    agentModel: 'haiku',
    agentEffort: 'low',
    workflow: false,
    summary: '1 ファイルの訂正・状態の確認・門を回す・マージや push などの操作。主セッションだけで足りる',
  }),
  standard: Object.freeze({
    id: 'standard',
    label: '標準',
    mainEffort: 'medium',
    agent: 'mechanic',
    agentModel: 'sonnet',
    agentEffort: 'medium',
    workflow: false,
    summary: '機能や修正を検査つきで入れる・複数ファイルの機械的な直し・台帳の更新。手を分けるなら mechanic',
  }),
  deep: Object.freeze({
    id: 'deep',
    label: '深',
    mainEffort: 'high',
    agent: 'auditor',
    agentModel: 'inherit',
    agentEffort: 'high',
    workflow: true,
    summary: '測っていない軸を実機で測る・欠陥や脆弱性を探す・原因を特定する・設計や法則を変える・パスを続ける',
  }),
});

/** 「徹底」の印 —— deep の中でも主セッションに xhigh を推奨する語。 */
const THOROUGH_MARKS = Object.freeze([
  '徹底', '網羅', '漏れなく', 'すべて', '全部', '全件', '全画面', '総当たり',
  'thorough', 'comprehensive', 'exhaustive', 'every ', 'all of',
]);

/**
 * deep の印 —— 測る・探す・原因を特定する・設計や法則を変える・パスを続ける。
 * 「続けて」は、このリポジトリでは「次のパスを回す」(測って直して留めて記録する) の
 * 合図なので deep に置く。
 */
const DEEP_MARKS = Object.freeze([
  '測って', '測定', '実測', '実機', '脆弱性', 'セキュリティ', '監査', '根本', '原因',
  '設計', '法則', '変異検査', 'mutation', 'e2e', '続けて', '次のパス', 'パスを',
  '調査', '調べて', '解析', '分析', 'レビュー', '欠陥', 'バグ', '不具合', '穴',
  'audit', 'security', 'measure', 'root cause', 'investigate', 'review', 'vulnerab',
  'bug', 'defect', 'design',
]);

/**
 * light の印 —— 訂正・確認・操作。deep の印が 1 つでも在れば deep が勝つ
 * (「脆弱性を確認して」は確認ではなく監査)。
 */
const LIGHT_MARKS = Object.freeze([
  '誤字', 'typo', '名前を変え', 'リネーム', 'rename', '確認して', '教えて', '状態',
  'status', 'マージ', 'merge', 'push', 'プッシュ', 'コミット', 'commit', '回して',
  '再生成', '見て', '説明', 'どう', '何', '?', '？', 'draft', 'ドラフト', 'ラベル',
]);

/**
 * 行の数で「標準以上」と見なす床 —— 箇条書きが 3 行以上ある指示は、
 * 印が無くても 1 つの操作では終わらない。
 */
const MIN_BULLETS_FOR_STANDARD = 3;

/** 印の一致を数える (小文字で比べる・一致した印をそのまま返す)。 */
function hits(text, marks) {
  const lower = text.toLowerCase();
  return marks.filter((m) => lower.includes(m.toLowerCase()));
}

/** 箇条書きの行数 (`-` / `*` / `・` / 数字 + `.` / `①` 系で始まる行)。 */
function bulletLines(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*・]|\d+[.)]|[①-⑳])/.test(l)).length;
}

/**
 * 指示のティアを決める。
 *
 * 返り値: `null` (案内を出さない —— 空・短すぎ・スラッシュコマンド) か
 * `{ tier, thorough, reasons }`。`reasons` は一致した印 (先頭 3 つ) で、
 * 案内の「根拠」になる —— 根拠の無い判定は読んだ人が検算できない。
 */
function classifyInstruction(prompt) {
  if (typeof prompt !== 'string') return null;
  const text = prompt.trim();
  if (text.length < MIN_PROMPT_CHARS) return null;
  if (text.startsWith('/')) return null;

  const deep = hits(text, DEEP_MARKS);
  const thorough = hits(text, THOROUGH_MARKS);
  const light = hits(text, LIGHT_MARKS);

  if (deep.length > 0) {
    return { tier: 'deep', thorough: thorough.length > 0, reasons: deep.slice(0, 3) };
  }
  if (light.length > 0 && bulletLines(text) < MIN_BULLETS_FOR_STANDARD) {
    return { tier: 'light', thorough: false, reasons: light.slice(0, 3) };
  }
  const reasons = light.length > 0 ? ['箇条書き ' + bulletLines(text) + ' 行'] : ['印なし (既定)'];
  return { tier: 'standard', thorough: thorough.length > 0, reasons };
}

/** 判定から 1 行の案内を組む。 */
function renderGuidance(verdict) {
  if (verdict === null) return '';
  const t = TIERS[verdict.tier];
  const effort = verdict.tier === 'deep' && verdict.thorough ? 'xhigh' : t.mainEffort;
  const why = verdict.reasons.map((r) => `「${r}」`).join('');
  const parts = [
    `[task-tier] ${t.id} (${t.label}) —— 根拠: ${why}。`,
    `主セッション: effort ${effort} を推奨 (合わなければ /effort を 1 行で案内)。`,
    `任せるなら ${t.agent} (${t.agentModel} / ${t.agentEffort})。`,
    t.workflow ? 'Workflow (検証段 xhigh) を 1 行で提案。' : '',
    '方針: docs/MODEL_EFFORT_POLICY.md',
  ];
  const line = parts.filter((p) => p !== '').join(' ');
  return line.length > MAX_GUIDANCE_CHARS ? line.slice(0, MAX_GUIDANCE_CHARS) : line;
}

/** hook の入口 —— stdin の JSON から prompt を取る。読めなければ `null`。 */
function promptFromStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    const json = JSON.parse(raw);
    return typeof json?.prompt === 'string' ? json.prompt : null;
  } catch {
    return null;
  }
}

function selfTest(log = console.log) {
  let bad = 0;
  const cases = [
    ['続けて', 'deep'],
    ['脆弱性を確認して', 'deep'],
    ['この画面の文字色を実機で測って直して', 'deep'],
    ['Investigate the root cause of the flaky e2e', 'deep'],
    ['マージして', 'light'],
    ['CI の状態を教えて', 'light'],
    ['docs の誤字を直して', 'light'],
    ['KPI 画面に CSV の書き出しを足して検査も書いて', 'standard'],
    ['こちらが出した指示に対して適切なモデルとエフォートを自動で選択できるようにルール化して', 'standard'],
    ['- 設定画面を直す\n- 検査を足す\n- 文書を更新して', 'standard'],
  ];
  for (const [prompt, want] of cases) {
    const got = classifyInstruction(prompt)?.tier ?? null;
    const ok = got === want;
    if (!ok) bad++;
    log(`  ${ok ? '✓' : '✗'} ${JSON.stringify(prompt.slice(0, 40))} → ${got} (期待 ${want})`);
  }
  const silent = [['', null], ['/model opus', null], ['は', null]];
  for (const [prompt, want] of silent) {
    const got = classifyInstruction(prompt);
    const ok = got === want;
    if (!ok) bad++;
    log(`  ${ok ? '✓' : '✗'} ${JSON.stringify(prompt)} は案内を出さない`);
  }
  const thorough = classifyInstruction('全画面を徹底的に測って');
  const thoroughOk = thorough?.tier === 'deep' && thorough.thorough === true
    && renderGuidance(thorough).includes('effort xhigh');
  if (!thoroughOk) bad++;
  log(`  ${thoroughOk ? '✓' : '✗'} 「徹底」は deep の中で xhigh を推奨する`);
  const plain = renderGuidance(classifyInstruction('続けて'));
  const lenOk = plain.length > 0 && plain.length <= MAX_GUIDANCE_CHARS && !plain.includes('\n');
  if (!lenOk) bad++;
  log(`  ${lenOk ? '✓' : '✗'} 案内は 1 行で ${MAX_GUIDANCE_CHARS} 字以内 (実測 ${plain.length})`);
  const agentsOk = Object.values(TIERS).every((t) => /^[a-z]+$/.test(t.agent));
  if (!agentsOk) bad++;
  log(`  ${agentsOk ? '✓' : '✗'} ティアごとの agent 名は小文字の英字だけ`);
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const at = argv.indexOf('--classify');
  if (at >= 0) {
    const line = renderGuidance(classifyInstruction(argv.slice(at + 1).join(' ')));
    if (line !== '') console.log(line);
    return 0;
  }
  // hook の経路: 何があっても exit 0 (指示を止める判断を持たない)。
  const line = renderGuidance(classifyInstruction(promptFromStdin()));
  if (line !== '') console.log(line);
  return 0;
}

module.exports = {
  TIERS, DEEP_MARKS, LIGHT_MARKS, THOROUGH_MARKS, MAX_GUIDANCE_CHARS, MIN_PROMPT_CHARS,
  MIN_BULLETS_FOR_STANDARD, classifyInstruction, renderGuidance, selfTest,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
