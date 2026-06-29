---
collection: academic
id: mgmt-altman-z-score
category: "management"
category_ja: "経営学"
title: "アルトマンのZスコア（Altman Z-Score／1968）——財務比率の判別分析による企業倒産予測"
as_of: "2026-06-27"
source_count: 2
authoritative: true
tags:
  - collection/academic
  - academic/management
  - knowledge/verified
aliases:
  - "アルトマンのZスコア（Altman Z-Score／1968）——財務比率の判別分析による企業倒産予測"
---

# アルトマンのZスコア（Altman Z-Score／1968）——財務比率の判別分析による企業倒産予測

> [!info] コレクション: [[学術概念]] ・ 区分: 経営学 ・ asOf: 2026-06-27 ・ 出典: 2件（うち権威ある出典 ✓）

## 概要
「アルトマンのZスコア」は、ニューヨーク大学のエドワード・I・アルトマンが1968年の論文「Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy」（Journal of Finance 第23巻4号589-609頁）で開発した、企業の倒産（経営破綻）を予測する統計モデルである。個々の財務比率を単独で見るのではなく、複数の比率を「多変量判別分析（multiple discriminant analysis）」によって一つの総合指標Zに結合する点に特色がある。製造業の上場企業を対象とした原型では、(1)運転資本÷総資産、(2)利益剰余金÷総資産、(3)金利・税引前利益(EBIT)÷総資産、(4)株式時価総額÷負債簿価、(5)売上高÷総資産、の5つの比率に重みを付けて合算する。算出されたZスコアは三つの領域で解釈される。おおむねZが2.99を超えれば財務的に安全（safe zone）、1.81を下回れば倒産の危険が高い（distress zone）、その中間は判定の難しい「グレーゾーン」とされる。この単純さと予測力ゆえに、Zスコアは信用分析・与信判断・債券格付け・投資スクリーニングの実務で広く用いられてきた。アルトマンはのちに、非上場企業向けに時価を簿価で置き換えたZ'スコア、非製造業や新興国企業に適用できるよう売上高比率を除いたZ''スコアへとモデルを拡張した。批判としては、判別分析が変数の正規性を前提とすること、会計操作や産業差の影響を受けること、より新しいロジット型・機械学習型の予測モデルに精度で劣りうることなどが指摘されるが、それでも倒産予測の古典的ベンチマークとして今日まで参照され続けている。

## 提唱者・初出
Edward I. Altman（1968・Zスコア・モデルの開発者） ／ 多変量判別分析（multiple discriminant analysis・複数の財務比率を総合指標Zへ結合） ／ 5つの財務比率と判定領域（運転資本/総資産ほか・safe>2.99／grey／distress<1.81） ／ Z'スコア・Z''スコア（非上場企業・非製造業/新興国への拡張）

## 出典
- [Altman, E. I. (1968). Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy. The Journal of Finance, 23(4), 589-609.](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1968.tb00843.x) `学術`
- [IDEAS/RePEc 収録の書誌（Altman [1968], Journal of Finance 23(4):589-609・判別分析による倒産予測・Zスコアと判定領域）](https://ideas.repec.org/a/bla/jfinan/v23y1968i4p589-609.html) `リファレンス`

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
