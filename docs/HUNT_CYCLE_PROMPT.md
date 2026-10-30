# 狩りの輪 —— 予約 (Routine) の指示文

> 2026-10-28 · threat: T-214。Claude Code の予約 (週 1 · 新しいセッション) に渡す指示文は、**この文書の
> 「指示文」の節と同じ物**にする。文を変えるときはここを変えてから予約を更新する (予約の中身は
> リポジトリの外に在るので、ここが唯一の読める写しになる)。輪の仕組みは `docs/THREAT_HUNT.md` の
> 「輪を回す仕組み」、道具は `scripts/hunt-cycle.cjs`、記録は `security/hunt-cycles.json`。
>
> **2026-10-30 (パス 561 · threat: T-222) から、狩るのは 1 人の監査役ではなく常設の班である** ——
> 名簿 `security/hacker-team.json` (赤 8 役・変種狩り・反証役・進化役)・編成と学習と進化の道具
> `scripts/hacker-team.cjs`。brief が今週の班を決定的に選び、record が学んだ型と名簿の変更を書き戻す。

## 予約の形

| 項目 | 値 | 理由 |
| --- | --- | --- |
| 間隔 | 週 1 (`CRON_TZ=Asia/Tokyo 17 4 * * 2` = 火曜 04:17 JST) | 毎日の dependency-audit (07:00 JST) と重ねない。米国太平洋 6〜9 時 (JST 22〜1 時) の混む帯を避ける |
| セッション | 毎回新しいセッション (`create_new_session_on_fire`) | 前の周の文脈を引きずらない。指示文だけで完結する |
| モデル | 主セッションと同じ (deep の仕事 —— `docs/MODEL_EFFORT_POLICY.md` §4) | 穴を探す判断を軽いモデルに任せない |
| 予約の id | `trig_018x9FJf4AjgmEnYSGzu7xud` (2026-10-28 作成 · 初回 2026-11-03 04:17 JST) | 予約の中身はリポジトリの外。確かめるときはこの id を Claude Code の予定実行の一覧で引く |
| 1 周の人数 | 監査役 最大 6 体 (赤 3 = 偵察 + 面に効く 2 · 変種狩り · 反証役 · 進化役) | 角度を分けて並べる (1 人の盲点を他が埋める)。**1 人で回した頃の数倍の利用料**が掛かる —— 減らすなら名簿の `lineup.red` を下げる |
| 止め方 | Claude Code の予定実行の一覧から無効化 | **実行のたびに利用料が掛かる**。止めれば毎日の報告が「止まった」と Issue に出す (`hunt:cycle -- status`) |

## 指示文

```
あなたは Service Hub (このリポジトリ) の常設の AI ホワイトハッカー班を率いて「狩りの輪」を 1 周回す。輪は
探索 → 解析 → 対策 → 報告 の 4 段で、飛ばした段は記録できない (scripts/hunt-cycle.cjs の record が断る)。
班の名簿は security/hacker-team.json (赤・変種狩り・反証役・進化役)。先に docs/SESSION_HANDOFF.md と
docs/THREAT_HUNT.md を読む。security/hacker-team.json がまだ無い木 (班の仕組みが main に入る前) なら、
班の段を飛ばして 1 体の auditor で同じ 4 段を回し、PR の本文にそう書く。

1. 探索 (explore): `npm run hunt:cycle -- brief` を走らせ、出た面・手順書の節・狩り残し・再確認の期限・
   「今週の班」・「変種狩りの種」・「収穫の無い役」を読む。今週の班の赤と変種狩りを、それぞれ 1 体の
   auditor (.claude/agents/auditor.md · 読み取り専用) として**同じ 1 通の中で並べて**起動する (互いの結果を
   見せない)。各体には その役の mission・面の手順書の節・狩り残し・期限切れを渡し、変種狩りには種
   (学んだ型の shape と look・この面の最近の穴) を渡す。起動するのは brief の班の人数まで (最大 6)。
   監査役は追跡ファイルを編集しない。試しの物は scratchpad へ。
2. 解析 (analyze): 全員の指摘を 1 つの一覧にまとめ、反証役 (blue の mission) を 1 体の auditor として起動して
   1 件ずつ実物のコードで再現させる。さらに自分でも実物 (実物の関数・vitest・ローカルの偽サーバ・実ブラウザ)
   で再現する。再現できない物は未確認として台帳の huntBacklog へ (理由と測った事を書く)。重さを盛らない。
   既に docs/SECURITY.md / docs/SECURITY_AUDIT.md / security/threat-ledger.json に在る物は、直しが不完全だと
   示せない限り数えない。確認した穴は、見つけた役の名を控える (記録の team[].confirmed)。
3. 対策 (countermeasure): 本物だけを最小で直す (守りを足す向き)。攻撃を再現する回帰検査を書き (題名に
   `threat: T-xxx`)、修正を外すと落ちることを対照で確かめる。security/threat-ledger.json に 1 行
   (面・型・重さ・修正・回帰検査)。確かめて健全だった物は clearedBacklog へ日付つきで。
   `npm test && npm run verify:all` を全部回す (verify:all だけでは CI で落ちる)。出荷物が動いたら
   `perf` / `e2e` / `e2e:lite`。
4. 報告 (report): 進化役 (evolver の mission) を 1 体の auditor として起動し、この周の指摘・確認・直しを渡して
   ① 確認した穴 1 つにつき学んだ型 (learned: threat / shape = 型の 1 行 / look = 次に探すときの grep の針や
   見る場所) ② 名簿の変更 (evolution: add = 新しい攻撃の型を受け持つ赤の役 / retire = 収穫の無い役 / notes =
   変えた・変えなかった理由) を提案させる。提案は自分で読み、根拠の無い物は落とす。
   セッションに指定された branch (無ければ main から `claude/hunt-cycle-<YYYY-MM-DD>`) に commit して push し、
   **draft PR** を開く。本文は 今週の班 / 見つけた物 (実測の表) / 直し / 機械 (検査名と件数) / 対照 (方向と
   落ちた件数) / 学んだ型 / 名簿の変更 / 残した物。**マージはしない** (人が決める)。最後に brief の雛形
   (team / learned / evolution を含む) を埋めた JSON を scratchpad に書き、
   `npm run hunt:cycle -- record <そのファイル>` で 1 周を security/hunt-cycles.json へ、学んだ型と名簿の変更を
   security/hacker-team.json へ記録し、その commit も PR に入れる。
   直す物が 1 つも無かった周も記録する (report.pr を null にし reason に「確かめて健全だった N 件」を書き、
   learned は空・evolution.notes に判断を書く)。

守る規則: 読んで書いた数は測った数ではない / 不在の主張には標本を添える / 鳴らない対照は合格ではなく報せ /
docs/SESSION_HANDOFF.md と docs/REMAINING_WORK.md に周の記録を 1 節ずつ足す / commit と PR の末尾の帰属行は
セッションの案内に従う。何かが途中で止まったら、止まった段と理由を PR か Issue に書いて終える (黙って終えない)。
```
