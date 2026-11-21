#!/usr/bin/env node
/**
 * security-posture — **セキュリティの「次の一手」を、台帳から決定的に導く**
 * (定期点検の道具 14 本目 · 2026-10-23 · threat: T-167)。
 *
 * ## 何が欠けていたか
 *
 * 守りを増やす仕組みは揃っている: 狩り (docs/THREAT_HUNT.md) → 台帳 (security/threat-ledger.json) →
 * 回帰検査 → 39 の門 → 毎日の依存・脅威ウォッチ。**欠けていたのは、その輪を回し続ける「次はどこを狩るか」を
 * 決める側** —— 台帳の `ai-automated-attack` の穴が「AI 監査は人が起動する」と書いていた当のもの。
 * 狩りが止まっても、止まったことに誰も気付かない。再確認の期限も、守りの薄い型も、数える物が無かった。
 *
 * ## 何をするか (網にも AI にも触れない・費用は 0)
 *
 *   1. 面ごとの狩りの速度 (直近 30 日に見つけた数・最後に見つけた日・直近 90 日の重み付き収穫)
 *   2. **止まった面** —— 狩り残し (huntBacklog) が在るのに STALL_DAYS 日以上新しい穴が見つかっていない
 *   3. **再確認の期限** —— 「確かめて健全だった」(clearedBacklog) が RECHECK_DAYS 日を過ぎた
 *   4. **守りの薄い型** —— 型ごとの穴 (gaps) と守り (defenses) の差
 *   5. **次に狩る候補の順位** —— 収穫の多い面ほど・狩り残しが古いほど先
 *   6. 台帳が読めない・日付が読めない物は `problems` (「0 件」と混ぜない)
 *
 * 自動なのは**検知と順位づけまで**。狩りそのもの (監査役の起動) は利用料が掛かる判断なので、人 (または
 * 利用者の指示を受けた AI) が `docs/THREAT_HUNT.md` の手順で回す。毎日の dependency-audit が同じ測定を
 * 報告に載せ、止まった面・期限切れは要対応として常設 Issue に出る。
 *
 * 使い方:
 *   npm run audit:security-posture            # 文面
 *   node scripts/security-posture.cjs --json  # 機械可読
 *   node scripts/security-posture.cjs --self-test
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(REPO_ROOT, 'security', 'threat-ledger.json');

/** 狩り残しが在るのに、これだけ新しい穴が出ていない面は「止まった」。 */
const STALL_DAYS = 21;
/** 「確かめて健全だった」をこれだけ経ったら確かめ直す。 */
const RECHECK_DAYS = 45;
/** 収穫を数える窓。 */
const YIELD_DAYS = 90;
const RECENT_DAYS = 30;
const QUEUE_SIZE = 5;
/** 重さ → 収穫の点。重い穴が出た面は、同じ型の穴がまだ在る見込みが高い。 */
const SEVERITY_POINTS = { critical: 4, high: 3, medium: 2, low: 1 };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ISO_IN_TEXT = /\b(20\d{2}-\d{2}-\d{2})\b/;

/** `YYYY-MM-DD` を UTC の日数へ。読めなければ null (暦に無い日も null)。 */
function dayNumber(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(t / 86_400_000);
}

/**
 * 台帳 (parse 済み) と今日 (YYYY-MM-DD) から姿勢を導く。純関数 —— 時計も網も読まない。
 * @returns {{surfaces: object[], stalled: object[], recheckDue: object[], thinClasses: object[],
 *   queue: object[], problems: string[], actionable: number, today: string}}
 */
function analyzePosture(ledger, now) {
  const problems = [];
  const today = dayNumber(now);
  if (today === null) throw new Error(`今日の日付が読めない: ${JSON.stringify(now)}`);
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.threats) || !Array.isArray(ledger.surfaces)) {
    return { surfaces: [], stalled: [], recheckDue: [], thinClasses: [], queue: [], problems: ['台帳が読めない (threats / surfaces が配列でない)'], actionable: 1, today: now };
  }
  const huntBacklog = Array.isArray(ledger.huntBacklog) ? ledger.huntBacklog : [];
  const cleared = Array.isArray(ledger.clearedBacklog) ? ledger.clearedBacklog : [];
  const classes = Array.isArray(ledger.classes) ? ledger.classes : [];

  const surfaces = ledger.surfaces.map((id) => ({
    id,
    found: 0,
    recent: 0,
    yieldPoints: 0,
    lastFound: null,
    mitigated: 0,
    backlog: 0,
  }));
  const bySurface = new Map(surfaces.map((s) => [s.id, s]));

  for (const t of ledger.threats) {
    const s = bySurface.get(t.surface);
    if (s === undefined) {
      problems.push(`${t.id}: 台帳に無い面 ${JSON.stringify(t.surface)}`);
      continue;
    }
    const day = dayNumber(t.found);
    if (day === null) {
      problems.push(`${t.id}: found の日付が読めない (${JSON.stringify(t.found)})`);
      continue;
    }
    s.found += 1;
    if (t.status === 'mitigated') s.mitigated += 1;
    if (s.lastFound === null || t.found > s.lastFound) s.lastFound = t.found;
    const age = today - day;
    if (age <= RECENT_DAYS) s.recent += 1;
    if (age <= YIELD_DAYS) s.yieldPoints += SEVERITY_POINTS[t.severity] ?? 1;
  }

  const queue = [];
  for (const h of huntBacklog) {
    const s = bySurface.get(h.surface);
    if (s === undefined) {
      problems.push(`狩り残し ${JSON.stringify(String(h.item).slice(0, 40))}: 台帳に無い面 ${JSON.stringify(h.surface)}`);
      continue;
    }
    s.backlog += 1;
    const dated = ISO_IN_TEXT.exec(String(h.why));
    const day = dated === null ? null : dayNumber(dated[1]);
    const ageDays = day === null ? null : Math.max(0, today - day);
    queue.push({
      surface: h.surface,
      item: h.item,
      ageDays,
      surfaceYield: s.yieldPoints,
      // 面の収穫 + 狩り残しの古さ (週ごとに 1 点・上限 10 点)。日付の無い物は古さ 0 —— 順位を盛らない。
      score: s.yieldPoints + Math.min(10, Math.floor((ageDays ?? 0) / 7)),
    });
  }
  queue.sort((a, b) => b.score - a.score || (b.ageDays ?? -1) - (a.ageDays ?? -1));

  const stalled = [];
  for (const s of surfaces) {
    if (s.backlog === 0) continue;
    const last = s.lastFound === null ? null : dayNumber(s.lastFound);
    const idle = last === null ? null : today - last;
    if (idle === null || idle >= STALL_DAYS) stalled.push({ surface: s.id, idleDays: idle, backlog: s.backlog });
  }

  const recheckDue = [];
  for (const c of cleared) {
    const day = dayNumber(c.checkedOn);
    if (day === null) {
      problems.push(`確認済み ${JSON.stringify(String(c.item).slice(0, 40))}: checkedOn が読めない`);
      continue;
    }
    if (today - day >= RECHECK_DAYS) recheckDue.push({ item: c.item, checkedOn: c.checkedOn, ageDays: today - day });
  }

  const thinClasses = classes
    .map((c) => ({
      id: c.id,
      name: c.name,
      defenses: Array.isArray(c.defenses) ? c.defenses.length : 0,
      gaps: Array.isArray(c.gaps) ? c.gaps.length : 0,
    }))
    .filter((c) => c.gaps > 0)
    .map((c) => ({ ...c, margin: c.defenses - c.gaps }))
    .sort((a, b) => a.margin - b.margin || b.gaps - a.gaps)
    .slice(0, 3);

  return {
    surfaces,
    stalled,
    recheckDue,
    thinClasses,
    queue: queue.slice(0, QUEUE_SIZE),
    problems,
    actionable: stalled.length + recheckDue.length + problems.length,
    today: now,
  };
}

/** 報告に載せる Markdown。 */
function renderPosture(p) {
  const lines = ['### セキュリティの姿勢 (台帳から導いた次の一手)', ''];
  lines.push('| 面 | 見つけた数 | 直近 30 日 | 最後に見つけた日 | 狩り残し | 緩和のみ |');
  lines.push('| --- | ---: | ---: | --- | ---: | ---: |');
  for (const s of p.surfaces) {
    lines.push(`| ${s.id} | ${s.found} | ${s.recent} | ${s.lastFound ?? '—'} | ${s.backlog} | ${s.mitigated} |`);
  }
  lines.push('');
  if (p.stalled.length > 0) {
    lines.push(`**狩りが止まった面** (狩り残しが在るのに ${STALL_DAYS} 日以上、新しい穴が出ていない):`);
    for (const s of p.stalled) lines.push(`- ❌ \`${s.surface}\` —— ${s.idleDays === null ? '穴の記録なし' : `${s.idleDays} 日`}・狩り残し ${s.backlog} 件`);
    lines.push('');
  }
  if (p.recheckDue.length > 0) {
    lines.push(`**再確認の期限切れ** (「健全だった」から ${RECHECK_DAYS} 日以上):`);
    for (const r of p.recheckDue) lines.push(`- ❌ ${String(r.item).slice(0, 80)} (${r.checkedOn} · ${r.ageDays} 日前)`);
    lines.push('');
  }
  if (p.problems.length > 0) {
    lines.push('**台帳に読めない物がある:**');
    for (const x of p.problems) lines.push(`- ❌ ${x}`);
    lines.push('');
  }
  if (p.queue.length > 0) {
    lines.push('**次に狩る候補** (面の収穫 + 狩り残しの古さの順):');
    p.queue.forEach((q, i) => lines.push(`${i + 1}. [${q.surface}] ${String(q.item).slice(0, 90)} —— 点 ${q.score}${q.ageDays === null ? '' : `・${q.ageDays} 日前に残した`}`));
    lines.push('');
  }
  if (p.thinClasses.length > 0) {
    lines.push('**守りの薄い型** (穴の数 − 守りの数が小さい順):');
    for (const c of p.thinClasses) lines.push(`- ${c.name}: 守り ${c.defenses} / 穴 ${c.gaps}`);
    lines.push('');
  }
  lines.push('_自動なのは検知と順位づけまでで、起動は週 1 の予約 (狩りの輪 · `docs/HUNT_CYCLE_PROMPT.md`) が担う。直しは draft PR に出し、マージは人が決める。_');
  return lines.join('\n');
}

function selfTest() {
  let bad = 0;
  const check = (label, ok) => {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  };
  console.log('self-test:');
  const t = (id, surface, found, severity = 'medium', status = 'fixed') => ({ id, surface, found, severity, status });
  const base = {
    surfaces: ['a', 'b'],
    threats: [t('T-1', 'a', '2026-10-20', 'high'), t('T-2', 'b', '2026-08-01', 'low')],
    huntBacklog: [{ surface: 'b', item: '古い', why: '2026-08-02 に残した' }, { surface: 'a', item: '新しい', why: '日付なし' }],
    clearedBacklog: [{ item: '古い確認', checkedOn: '2026-08-01' }, { item: '新しい確認', checkedOn: '2026-10-20' }],
    classes: [{ id: 'c', name: 'C', defenses: [{}], gaps: ['x', 'y'] }],
  };
  const p = analyzePosture(base, '2026-10-23');
  check('止まった面: b (最後 83 日前・狩り残しあり)', p.stalled.length === 1 && p.stalled[0].surface === 'b' && p.stalled[0].idleDays === 83);
  check('止まっていない面: a (3 日前)', !p.stalled.some((s) => s.surface === 'a'));
  check('再確認の期限切れは古い方だけ', p.recheckDue.length === 1 && p.recheckDue[0].item === '古い確認');
  check('次に狩る候補: 古い狩り残し (b · 収穫 1 + 古さ 10) が、新しい高収穫の面 a (3) より先', p.queue[0].surface === 'b' && p.queue[0].score === 11);
  check('日付の無い狩り残しは古さ 0 で、収穫の点だけ (順位を盛らない)', p.queue[1].surface === 'a' && p.queue[1].ageDays === null && p.queue[1].score === 3);
  check('薄い型を挙げる (守り 1 / 穴 2)', p.thinClasses.length === 1 && p.thinClasses[0].margin === -1);
  check('要対応 = 止まった面 + 期限切れ + 読めない物', p.actionable === 2);
  const p2 = analyzePosture({ ...base, threats: [t('T-1', 'a', '2026-02-31')] }, '2026-10-23');
  check('暦に無い日付は problems (0 件と混ぜない)', p2.problems.length === 1 && p2.actionable >= 1);
  const p3 = analyzePosture({ ...base, threats: [t('T-1', 'zzz', '2026-10-20')] }, '2026-10-23');
  check('台帳に無い面は problems', p3.problems.some((x) => x.includes('zzz')));
  check('台帳が配列でなければ読めないと言う', analyzePosture({}, '2026-10-23').problems.length === 1 && analyzePosture(null, '2026-10-23').actionable === 1);
  let threw = false;
  try {
    analyzePosture(base, 'yesterday');
  } catch {
    threw = true;
  }
  check('今日の日付が読めなければ投げる', threw);
  const p4 = analyzePosture({ ...base, threats: [t('T-1', 'a', '2026-10-22'), t('T-2', 'b', '2026-10-22')] }, '2026-10-23');
  check('どの面も最近見つけていれば止まらない', p4.stalled.length === 0);
  check('文面に面の表と次の候補が出る', renderPosture(p).includes('| a | 1 |') && renderPosture(p).includes('次に狩る候補'));
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

/** 実行環境のローカルな暦の今日 (UTC の切り出しは日本の朝 9 時まで前日になる · lint:forbidden)。 */
function localToday() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function loadLedger() {
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const posture = analyzePosture(loadLedger(), localToday());
  if (argv.includes('--json')) console.log(JSON.stringify(posture, null, 2));
  else console.log(renderPosture(posture));
  // 報告する道具 —— 要対応が在っても exit 0 (止まった面は人が判断する)。読めなかったときだけ落とす。
  return posture.problems.length > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { analyzePosture, renderPosture, dayNumber, STALL_DAYS, RECHECK_DAYS, YIELD_DAYS, SEVERITY_POINTS };
