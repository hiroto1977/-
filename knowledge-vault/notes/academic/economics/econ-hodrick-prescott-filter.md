---
collection: academic
id: econ-hodrick-prescott-filter
category: "economics"
category_ja: "経済学"
title: "ホドリック＝プレスコット・フィルター——景気循環をトレンドから分離する平滑化フィルターとその妥当性論争"
as_of: "2026-09"
source_count: 5
authoritative: true
tags:
  - collection/academic
  - academic/economics
  - knowledge/verified
aliases:
  - "ホドリック＝プレスコット・フィルター——景気循環をトレンドから分離する平滑化フィルターとその妥当性論争"
---

# ホドリック＝プレスコット・フィルター——景気循環をトレンドから分離する平滑化フィルターとその妥当性論争

> [!info] コレクション: [[学術概念]] ・ 区分: 経済学 ・ asOf: 2026-09 ・ 出典: 5件（うち権威ある出典 ✓）

## 概要
ホドリック＝プレスコット・フィルター（HPフィルター）は時系列を滑らかなトレンド成分と循環成分に分解する平滑化手法で、ロバート・ホドリックとエドワード・プレスコットが1980年代初頭の未公刊論文で提示し、1997年に『Postwar U.S. Business Cycles: An Empirical Investigation』としてJournal of Money, Credit and Banking誌29巻1号1〜16頁に発表した。観測値への適合度（残差平方和）とトレンドの二階差分の平方和にλを掛けた滑らかさ罰則の合計を最小化してトレンドを求め、四半期データにはλ=1600が標準とされる（同じ最小化問題はウィッタカー1923年やレザー1961年の研究に既に現れていた）。実物的景気循環モデルの較正やIMF・中央銀行の出力ギャップ推定、バーゼルIII規制の信用・GDPギャップ（λ=400,000）に広く用いられる一方、コグリー＆ネイソン（1995）は差分定常系列で存在しない循環を作り出すと批判し、ハミルトン（2018）は標本終端の推定改訂の大きさとλの恣意性から使用を戒め回帰による代替を提案、ラヴン＆ウーリッヒ（2002）はλを観測頻度の4乗で調整すべきと論じた。中小企業経営者が売上系列を見る際は、直近数期のトレンド推定は今後のデータ追加で大きく改訂され得るため速報値として過信せず、単純移動平均や別手法との比較で補うべきである。

## 提唱者・初出
ロバート・ホドリック＆エドワード・プレスコット（1980年代ディスカッションペーパー／1997『Postwar U.S. Business Cycles: An Empirical Investigation』JMCB）／ジェームズ・ハミルトン（2018『Why You Should Never Use the Hodrick-Prescott Filter』REStat）／ティモシー・コグリー＆ジェームズ・ネイソン（1995 JEDC・擬似循環批判）／モーテン・ラヴン＆ハラルド・ウーリッヒ（2002『On Adjusting the Hodrick-Prescott Filter for the Frequency of Observations』REStat）／先駆: E・T・ウィッタカー（1923『On a New Method of Graduation』）／C・E・V・レザー（1961『A Simple Method of Trend Construction』）／対比: マリアン・バクスター＆ロバート・キング（1999 バンドパス・フィルター）

## 出典
- [Hodrick, R. J., & Prescott, E. C. (1997). Postwar U.S. Business Cycles: An Empirical Investigation. Journal of Money, Credit and Banking, 29(1), 1–16 (EconPapers record). — HPフィルターの原論文（モデル定義と実証結果の一次資料）](https://econpapers.repec.org/RePEc:mcb:jmoncb:v:29:y:1997:i:1:p:1-16) `学術`
- [Hamilton, J. D. (2018). Why You Should Never Use the Hodrick-Prescott Filter. The Review of Economics and Statistics (MIT Press), 100(5), 831–843. doi:10.1162/rest_a_00706 — 擬似的動学・標本終端の改訂・λの恣意性への批判と回帰型代替案の一次資料](https://direct.mit.edu/rest/article/100/5/831/58479/Why-You-Should-Never-Use-the-Hodrick-Prescott) `学術`
- [Ravn, M. O., & Uhlig, H. (2002). On Adjusting the Hodrick-Prescott Filter for the Frequency of Observations. The Review of Economics and Statistics (MIT Press), 84(2), 371–376. doi:10.1162/003465302317411604 — λを観測頻度の4乗で調整する規則の一次資料](https://direct.mit.edu/rest/article/84/2/371/57338/On-Adjusting-the-Hodrick-Prescott-Filter-for-the) `学術`
- [Cogley, T., & Nason, J. M. (1995). Effects of the Hodrick-Prescott Filter on Trend and Difference Stationary Time Series: Implications for Business Cycle Research. Journal of Economic Dynamics and Control (Elsevier), 19(1–2), 253–278. doi:10.1016/0165-1889(93)00781-X — 差分定常系列への適用が生む擬似的循環変動の指摘](https://www.sciencedirect.com/science/article/abs/pii/016518899300781X) `学術`
- [Drehmann, M., & Tsatsaronis, K. (2014). The Credit-to-GDP Gap and Countercyclical Capital Buffers: Questions and Answers. BIS Quarterly Review, March 2014. — バーゼルIII規制の信用・GDPギャップにおける一方向HPフィルター（λ=400,000）の実務利用に関する一次資料](https://www.bis.org/publ/qtrpdf/r_qt1403g.htm) `公的`

## 関連概念
- [[econ-real-business-cycle-kydland|実物的景気循環理論（キドランド＆プレスコット）]] — 同じ思想家
- [[econ-real-business-cycle-kydland-prescott|リアル・ビジネス・サイクル理論——キドランド＆プレスコットの技術ショックと景気循環]] — 同じ思想家
- [[bizlaw-keech-v-sandford|キーチ対サンドフォード——受託者は地位から利益を得てはならない]] — 同じ思想家
- [[econ-central-bank-independence-kydland|中央銀行の独立性と時間非一貫性問題——キドランド＝プレスコットの規則対裁量論]] — 同じ思想家
- [[econ-central-bank-independence-rogoff|中央銀行の独立性——ロゴフの保守的中央銀行論とインフレ目標政策]] — 同じ思想家
- [[econ-equity-premium-puzzle-mehra-prescott|株式プレミアム・パズル——標準理論で説明できない株式の超過収益]] — 同じ思想家
- [[econ-nominal-anchor-mishkin|名目アンカー——インフレ期待を安定化する金融政策の制度的枠組み]] — 同じ思想家
- [[econ-time-inconsistency-kydland-prescott|時間的非整合性——最適計画の事後的破棄とルール対裁量の問題]] — 同じ思想家
- [[econ-dsge-models|動的確率的一般均衡（DSGE）モデル]] — 同じ思想家
- [[econ-bank-lending-channel-kashyap|銀行貸出チャネル——金融政策が銀行の信用供給を通じて作用する経路]] — 出典を共有

## 関連
- コレクション: [[学術概念]]
- ヴォルト入口: [[Home]]
- オーケストレーション連携: [[AI_ORCHESTRATION_CONTEXT]]

---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*
