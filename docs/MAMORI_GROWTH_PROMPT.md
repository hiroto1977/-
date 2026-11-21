# 言語を育てる輪 —— 予約のセッションへの指示文

2026-10-30 (パス 563) から、Claude Code の予約 (週 1 · 新しいセッション) がこの文をそのまま受け取る。
指示文と道具 (`scripts/mamori-growth.cjs`) の一致は `src/shared/__tests__/mamoriGrowth.test.ts` が見る。
予約の本文を変えたらここも変え、ここを変えたら予約も更新する。

**2026-11-12 から、指示文は「始める前に」の段で始まる。** 予約はリポジトリを付けずに作られていた
(実測: 予約の `folders` が空。11/05 の実行は木が無いまま 70 秒で終わり、PR も Issue も記録も出さなかった)。
セッションのリポジトリは始まるときに決まるので、**本来の直しは予約にリポジトリを付けること**である ——
Claude Code の予定実行の設定で持ち主が選ぶ (指示文からも、予約を書き換える道具からも付けられない)。
リポジトリ無しのセッションが自分で足す道 (add_repo · push) は、無人の実行では権限の判定が断った
(2026-11-12 · 確認用のセッションで実測)。だから「始める前に」の a. は、足せなければ理由と直し方を書いて終える。
b. と c. はリポジトリが付いた後に効く: 土台の枝を決め (台帳を変えている開いた PR が在ればその枝 —— main から切ると、
まだ main に入っていない周と MG-xxx の番号・作業が重なる。2026-11-04 に並行した進化を合流し直した)、
土台の台帳の最後の周が 5 日以内なら回さない (人が同じ枝で輪を回している週に、同じ壁を二重に移さない)。

---

<!-- prompt:start -->
あなたは Service Hub (このリポジトリ) の守りの言語 Mamori を 1 周ぶん育てる。言語の仕様は docs/MAMORI.md、
台帳は security/mamori-growth.json、道具は `npm run mamori:grow`。先に docs/SESSION_HANDOFF.md と docs/MAMORI.md を読む。
security/mamori-growth.json がまだ無い木 (この輪が main に入る前) なら、何もせず、そう書いた Issue を開いて終える。

始める前に (リポジトリと土台): 予約のセッションは、リポジトリが付いていないまま始まることがある。
a. `git rev-parse --show-toplevel` がこのリポジトリを指さなければ、リポジトリを足す道具 (add_repo · owner `hiroto1977` ·
   repo `-` · access `push`) を呼び、返ってきた手順どおりに clone する (clone の後に呼べと案内された道具が在れば呼ぶ)。
   clone した場所へ移り、`npm ci` を済ませてから下の段へ進む。足せなければ (無人の実行では権限の判定が断ることがある)、
   断られた理由と直し方 (「予定実行の設定で、この予約にリポジトリ hiroto1977/- を選ぶ」) を最後の返答に書いて終える。木が無いまま進めない。
b. 土台を決める: 開いている PR のうち、言語を育てた記録 (security/mamori-growth.json) を変えている物を GitHub の道具で探す。無ければ main を土台にする。
   在れば、その PR の head の枝を土台にして新しい枝を切り、draft PR の base もその枝にする (複数在れば、台帳がいちばん進んでいる物)。
   main から切ると、まだ main に入っていない周と番号・作業が重なる。探せなければ (GitHub の道具が無い)、始めずに理由を書いて終える。
c. 土台の security/mamori-growth.json の最後の周の日付が 5 日以内なら、今週は誰かがその枝で輪を回している。新しい周を始めず、そう書いて終える。

1. 決める (brief): `npm run mamori:grow -- brief` を走らせ、「今週育てる物」(port = 守りの壁の TypeScript を 1 本 Mamori へ移す /
   feature = 構文を 1 つ足す / probe = 言語の穴を探す) と、壁ごとの足りない構文・足す候補の順位・記録の雛形を読む。
   brief と違う物を育てるなら、理由を記録の deviation に書く (10 字以上)。数え方は heuristic なので、
   移せるかは実際に .mamori を書いて `npm run mamori:build` が通るかで決まる —— 通らなければ足りない構文を記録して feature に切り替えてよい。
2. 破る (probe・必ず): 何を育てる周でも、**言語を破るプログラムを 3 つ以上**書いてコンパイルし、狙った規則で断られるかを見る。
   足す構文が在るなら、その構文で ① 印を偽造する (mint を gate の外へ・as の代わりになる形) ② 危ない口を sink の外で呼ぶ
   (オブジェクト・配列・arrow に包んで持ち出す) ③ 宣言していない外の名前や原型・Function へ届く (`.constructor` 以外の道) を試す。
   断られなかった物は穴である —— 脅威台帳 security/threat-ledger.json に T-xxx として載せ、直し (コンパイラの規則) と回帰検査
   (題名に `threat: T-xxx`) を入れる。2026-10-30 の T-224 (`String.constructor(code)()` が `eval` の代わりになった) はこの段で出た。
3. 育てる:
   - port: (brief が「移せる」と数えても host の壁 — capability モジュールを直に呼ぶ・rest 引数・sink の型引数 — は書き直しでは移せない。移せないと実測で分かった壁は台帳 `unportable` に証拠つきで足す —— brief はそれを port に選ばない。)
   - port: 隣に `X.mamori` を書き、`npm run mamori:build` で `X.ts` を生成物にする。判定は 1 つも変えない
     (生成物と元の差は注記の場所・空行・テンプレート文字列を `+` へ替えた所だけにする —— `git diff` で読む)。
     `src/shared/mamori/__tests__/mamoriGenerated.test.ts` の EXPECTED に足し、docs/MAMORI.md の「Mamori で書いてある物」に 1 行。
   - feature: 台帳の risk (来歴の規則を外す道になるか) を先に読み、その道を塞ぐ規則と一緒に足す。字句 (parser.ts)・来歴 (checker.ts)・
     変換 (emit.ts)・AST (ast.ts) をそろえ、`src/shared/mamori/__tests__/` に「変換の全形を 1 byte で留める」検査と「規則を破るプログラムで
     断る」検査を足す。docs/MAMORI.md の文法・規則の表を更新し、版を上げる (0.x → 0.x+1)。
4. 確かめる: 守っている物を実際に壊す対照を回し、狙った検査が落ちることを見る (鳴らない対照は合格ではなく報せ)。
   `npx stryker run --mutate <触ったコンパイラ / 生成物>` (先に `rm -f .stryker-incremental.json`) で **100.00%** にする ——
   生存は検査で殺すか、等価なら理由つきの pragma (生成物には .mamori の `//` 注記として書く)。
   保護対象を触ったら `npm run chain:verify` → `npm run chain:append`。`npm test && npm run verify:all` を全部回す。
   出荷物が動いたら (src/renderer・src/shared の生成物) `perf` / `e2e` / `e2e:lite`。
5. 記録と報告: セッションに指定された branch (無ければ「始める前に」で決めた土台から `claude/mamori-grow-<YYYY-MM-DD>`) に commit して push し、
   **draft PR** を開く (本文: 今週育てた物 / 破った試し (実測の表) / 足した規則 / 機械 (検査名と件数) / 対照 (方向と落ちた件数) /
   変異検査 / 残した物)。**マージはしない** (人が決める)。最後に brief の雛形を埋めた JSON を scratchpad に書き、
   `npm run mamori:grow -- record <そのファイル>` で 1 周を security/mamori-growth.json へ記録し (言語の版と構文の判断も進む)、
   その commit も PR に入れる。docs/SESSION_HANDOFF.md と docs/REMAINING_WORK.md に周の記録を 1 節ずつ足す。

6. 伝える: 作業の終わりに `npm run mamori:grow -- report` を走らせ、**言語の現在の完成度** (版・守りの壁の移行率・構文の数) と
   **次の作業の提案**を、PR の本文と利用者への報告の最後に書く。数は report の出力をそのまま使い、散文に書き写さない
   (読んで書いた数は測った数ではない)。提案には、先に塞ぐ道 (台帳の risk) を添える。

守る規則: 読んで書いた数は測った数ではない / 不在の主張には標本を添える / 鳴らない対照は合格ではなく報せ /
commit と PR の末尾の帰属行はセッションの案内に従う。途中で止まったら、止まった段と理由を PR か Issue に書いて終える (黙って終えない)。
<!-- prompt:end -->
