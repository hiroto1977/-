# `.git` の縮小 — 手順と、その前に読むべきこと

最終更新: 2026-08-17

`.git` が 1.3 GB ある。原因は**生成物を繰り返しコミットしたこと**で、内訳は
`dist/standalone.html` 362MB（327 版）/ `dist-chunks/` 106MB /
`academicKnowledge.ts` 306MB（本体ソースなので不可避）/
knowledge-graph の education 176MB。追跡からの除外は済んでいるので**増加は止まっている**。

このファイルは「それでも履歴から消す」場合の手順書である。**ただし先に
次の 2 点を読んでほしい。**

---

## 先に読む①: リモートは、履歴を書き換えても縮まない

履歴を書き換えて force-push しても、GitHub 上の容量はほぼ減らない。

- **`refs/pull/*` が古いオブジェクトを恒久的に固定する。** GitHub は PR の ref を
  永久に保持するので、過去の PR が参照している blob は到達可能なまま残る。
- リモートの gc は自分で走らせられない。**GitHub Support に依頼**して初めて実際に減る。

つまり「約 470MB 減る」は**ローカルの `.git` の話**である。リモートを本当に縮めるには
「全 PR を閉じる → 履歴書き換え → Support へ gc 依頼」の 3 点セットが必要で、
1 つ目だけでも実務上かなり重い。

## 先に読む②: ローカルは、破壊的な操作なしで今すぐ解決する

手元の `.git` を小さくしたいだけなら、**再クローンで足りる**。

```bash
git clone --depth 50 https://github.com/hiroto1977/-.git service-hub
# → .git は数十 MB。履歴を書き換えないので誰にも影響しない
```

CI も同じで、`actions/checkout@v4` は既定で浅いクローンを作るため**すでに対策済み**。
つまり「開発体験」と「CI 時間」の観点では、履歴書き換えの利得はほぼ無い。

---

## それでも実行する場合

### 実行してはいけない環境

**浅いクローンからは絶対に実行しない。** Claude Code の実行環境や CI のチェックアウトは
浅い・単一ブランチのクローンで、手元に全履歴も全ブランチも無い。

```bash
git rev-parse --is-shallow-repository   # true なら実行不可
git ls-remote --heads origin | wc -l    # リモートの本当のブランチ数
git branch -r | wc -l                   # 手元にある数（少なければ危険）
```

2026-08-17 時点の実測では、コンテナ内は **shallow=true / 手元 ref 2 本に対し
リモートは 217 本**だった。この状態で force-push すると、**手元に無い 215 本の
ブランチをリモートから消す**ことになる。復旧できない。
`git filter-repo` 自体も浅いクローンでの実行を拒否する（そのためのガード）。

### 手順（全履歴を持つ手元のマシンで）

```bash
# 0) 前提: 開いている PR をすべてマージまたはクローズする
#    （残したままだと PR が壊れ、かつ refs/pull が古い blob を固定し続ける）

# 1) 全履歴・全ブランチを持つ新しいクローンを作る（ミラーではなく通常クローン）
git clone https://github.com/hiroto1977/-.git shrink-work
cd shrink-work
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git rev-parse --is-shallow-repository    # false であることを確認

# 2) 退避を作る（取り返しがつかないので必須）
git branch backup/pre-shrink-$(date +%Y%m%d) origin/main
git push origin backup/pre-shrink-$(date +%Y%m%d)
#    さらにローカルへ .git ごとコピーを取っておく
cp -a .git /path/to/safe/git-backup-$(date +%Y%m%d)

# 3) git-filter-repo を入れる（BFG でもよい）
pipx install git-filter-repo    # または pip install git-filter-repo

# 4) 生成物を履歴から落とす
#    knowledge-graph / knowledge-vault は verify:graph / vault:check の
#    検証対象なので **消さない**。消すのはビルド生成物だけ。
git filter-repo \
  --path dist/standalone.html \
  --path-glob 'dist-chunks/*' \
  --invert-paths

# 5) 結果を確認する
git count-objects -vH        # size-pack が減っているか
git log --oneline -5         # 履歴が壊れていないか
git ls-files | wc -l         # 作業ツリーのファイル数が変わっていないか

# 6) すべてのブランチとタグを force-push（全 SHA が変わる）
git push --force --all origin
git push --force --tags origin

# 7) GitHub Support に gc を依頼する
#    これをやらないとリモートの容量は減らない。
#    https://support.github.com/ から「repository garbage collection」を依頼する
```

### 実行後に全員がやること

**既存のクローンはすべて壊れる。** `git pull` が
`fatal: refusing to merge unrelated histories` で失敗するので、各自が再クローンする。

```bash
# 既存の作業を退避してから
git fetch origin && git reset --hard origin/main
# それでも直らなければ再クローン
```

---

## 再発防止（実装済み）

同じことが起きないよう、**追跡ファイルの大きさに天井**を置いた
（`scripts/lint-repo-size.cjs` / `npm run lint:repo-size`・`verify:all` と CI に登録）。

| 検査 | 予算 | 2026-08-17 実測 |
|---|---|---|
| 1 ファイル | 12 MB 以下 | 最大 8.4 MB (`academicKnowledge.ts`) |
| 追跡合計 | 80 MB 以下 | 57.7 MB / 8,396 ファイル |
| 警告 | 合計が上限の 85% を超えたら警告（落とさない） | 71% |

`verify:arch` が見ているのは追跡行数の**下限**（大量削除の検知）で、膨張は捕まえない。
床と天井は別の検査なので両方置いてある。

**一度履歴に入った blob は、後から追跡を外しても消えない。** 上のとおり消すには
破壊的な操作と Support 依頼が要るので、実質的な対策は「入れる前に止める」だけである。
