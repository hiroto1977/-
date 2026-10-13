#!/usr/bin/env node
'use strict';

/*
 * 週次の依存監査 (`.github/workflows/dependency-audit.yml`) が「要対応を常設 Issue 1 つに
 * 集める」ための同期。workflow の `actions/github-script` から `require` される。
 *
 *   node scripts/dependency-audit-issue.cjs --self-test
 *
 * ## なぜ YAML の中の script から外へ出したか (2026-09-17 · パス 306)
 *
 * この workflow はこの branch にしか無く、GitHub にも未登録なので、書かれてから **1 度も
 * 走っていない** (パス 305 の走査)。読むと、Issue を探す側が `state: 'open'` で、同じ script が
 * 要対応 0 件のときその Issue を **閉じる**。閉じた翌週に要対応が出ると、探す側は閉じた物を
 * 見つけられず **2 つ目を作る** —— 「常設 Issue 1 つ」という約束 (CLAUDE.md) は 2 週目で破れる。
 * YAML の中の script は検査できないので、判断をここへ出して self-test と vitest で留める。
 *
 * 規則:
 *   - 探すのは open / closed を問わず (`state: 'all'`)、更新順 (常設 Issue は毎週更新されるので
 *     先頭付近に居る)。`listForRepo` は PR も返すので `pull_request` を持つ物は除く。
 *   - 在れば本文を書き換え、要対応が 0 なら閉じ・1 以上なら開く (再開を含む)。
 *   - 無ければ要対応が 1 以上のときだけ作る。0 件のときは何も作らない。
 */

const TITLE = '🔐 依存の勧告とセキュリティの床（自動更新）';

/** 常設 Issue (open / closed を問わず) を 1 つ返す。無ければ null。 */
async function findIssue(github, context) {
  const { data } = await github.rest.issues.listForRepo({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100,
  });
  return data.find((i) => !i.pull_request && i.title === TITLE) ?? null;
}

/**
 * 報告 (`orchestration/dependency-audit.json`) を常設 Issue に反映する。
 * @returns {{ action: 'updated'|'reopened'|'closed'|'created'|'none', number: number|null }}
 */
async function syncIssue({ github, context, report }) {
  if (typeof report?.actionable !== 'number' || typeof report?.markdown !== 'string') {
    throw new Error('dependency-audit の報告の形が違います (actionable / markdown が要る)');
  }
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const state = report.actionable > 0 ? 'open' : 'closed';
  const existing = await findIssue(github, context);
  if (existing) {
    await github.rest.issues.update({ owner, repo, issue_number: existing.number, body: report.markdown, state });
    const action = existing.state === state ? 'updated' : state === 'open' ? 'reopened' : 'closed';
    return { action, number: existing.number };
  }
  if (report.actionable > 0) {
    const { data } = await github.rest.issues.create({ owner, repo, title: TITLE, body: report.markdown });
    return { action: 'created', number: data.number };
  }
  return { action: 'none', number: null };
}

/**
 * 偽の GitHub client。呼び出しを記録し、一覧は与えた物を **`state` で絞って** 返す (本物と同じく
 * 既定は open だけ)。絞らない偽物だと、探す側を `state: 'open'` に戻しても「閉じた Issue を再開する」
 * 検査が通ってしまう —— 対照 A で実際にそうなった (引数を読む検査だけが鳴った)。
 */
function fakeGithub(issues) {
  const calls = [];
  return {
    calls,
    rest: {
      issues: {
        async listForRepo(args) {
          calls.push(['list', args]);
          const want = args.state ?? 'open';
          return { data: issues.filter((i) => want === 'all' || i.state === want) };
        },
        async update(args) {
          calls.push(['update', args]);
          return { data: {} };
        },
        async create(args) {
          calls.push(['create', args]);
          return { data: { number: 999 } };
        },
      },
    },
  };
}

function selfTest() {
  const context = { repo: { owner: 'o', repo: 'r' } };
  let bad = 0;
  const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log(`  ${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (期待 ${JSON.stringify(want)})`}`);
    if (!ok) bad++;
  };
  const run = (issues, report) => {
    const gh = fakeGithub(issues);
    return syncIssue({ github: gh, context, report }).then((r) => ({ r, calls: gh.calls }));
  };
  return (async () => {
    {
      // ★ 閉じた常設 Issue が在り、要対応が戻った → 再開する (2 つ目を作らない)
      const { r, calls } = await run([{ number: 7, title: TITLE, state: 'closed' }], { actionable: 2, markdown: 'm' });
      check('閉じた常設 Issue は再開する (作らない)', r, { action: 'reopened', number: 7 });
      check('  update が 1 回・create は 0 回', calls.map((c) => c[0]), ['list', 'update']);
      check('  update は state open', calls[1][1].state, 'open');
      check('  探すのは state all・更新順', [calls[0][1].state, calls[0][1].sort], ['all', 'updated']);
    }
    {
      const { r, calls } = await run([{ number: 7, title: TITLE, state: 'open' }], { actionable: 0, markdown: 'm' });
      check('要対応 0 なら開いている常設 Issue を閉じる', r, { action: 'closed', number: 7 });
      check('  update は state closed', calls[1][1].state, 'closed');
    }
    {
      const { r } = await run([{ number: 7, title: TITLE, state: 'open' }], { actionable: 3, markdown: 'm' });
      check('開いていて要対応が在れば本文の更新だけ', r, { action: 'updated', number: 7 });
    }
    {
      const { r, calls } = await run([], { actionable: 1, markdown: 'm' });
      check('無ければ要対応が在るときだけ作る', r, { action: 'created', number: 999 });
      check('  create の title', calls[1][1].title, TITLE);
    }
    {
      const { r, calls } = await run([], { actionable: 0, markdown: 'm' });
      check('無くて要対応 0 なら何もしない', r, { action: 'none', number: null });
      check('  create も update も無い', calls.map((c) => c[0]), ['list']);
    }
    {
      // listForRepo は PR も返す —— 同じ題名の PR は常設 Issue ではない
      const { r } = await run([{ number: 5, title: TITLE, state: 'open', pull_request: { url: 'x' } }], { actionable: 1, markdown: 'm' });
      check('同じ題名の PR は無視する', r, { action: 'created', number: 999 });
    }
    {
      let threw = false;
      try {
        await syncIssue({ github: fakeGithub([]), context, report: { actionable: '1', markdown: 'm' } });
      } catch {
        threw = true;
      }
      check('報告の形が違えば投げる (黙って none にしない)', threw, true);
    }
    if (bad > 0) {
      console.error(`❌ self-test 不一致 ${bad} 件`);
      return 1;
    }
    console.log('✅ self-test 全件一致');
    return 0;
  })();
}

module.exports = { TITLE, findIssue, syncIssue, fakeGithub };

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest().then((c) => process.exit(c));
  } else {
    console.error('usage: node scripts/dependency-audit-issue.cjs --self-test (本体は workflow の github-script から require される)');
    process.exit(2);
  }
}
