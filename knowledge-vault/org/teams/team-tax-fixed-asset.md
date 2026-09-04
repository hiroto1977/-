---
team_id: tax-fixed-asset
type: org-team
manager: mgr-tax
title: "税務(固定資産税・都市計画税)"
tags:
  - org/team
  - orchestration
aliases:
  - "税務(固定資産税・都市計画税)"
---
# 税務(固定資産税・都市計画税)
- 焦点: 固定資産税(標準1.4%)・都市計画税(制限0.3%)の概算。100円未満切捨, 住宅用地特例(小規模200㎡以下=固定1/6・都計1/3, 一般超過分=1/3・2/3)の面積按分でfixedAssetBase/cityPlanningBaseを返す, 免税点(土地30万/家屋20万/償却資産150万 未満非課税), calcFixedAssetTaxTotalで合算内訳。rate範囲外/負/非有限/asset. ホワイトリスト外はthrow。税率・特例分数・免税点は実値全文照合, エラーメッセージは正規表現照合で撃墜(pragma 0件)・概算注記必須
- 役割: research
- 指揮系統: [[ceo|CEO]] → [[coo|COO]] → [[cfo|最高財務責任者 (CFO)]] → [[mgr-tax|税務部長]] → 本チーム（並列Agent）
- 担当役員の知識ブリーフ: [[cfo|最高財務責任者 (CFO)]] 参照
## 関連
- [[Organization]]
- [[AI_ORCHESTRATION_CONTEXT]]
- [[Home]]
---
*このノートはリポジトリの確証済み知識データ（`src/renderer/data/*Knowledge.ts` ほか）から `npm run vault:build` で自動生成されています。直接編集しないでください（編集は本体データ側に行い再生成する）。*