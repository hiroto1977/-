# 評議会への議題（1行1議題、「- 」で始める。処理済みは「- [済]」になる。期限付き継続議題は「- [〜07:00] 議題」または「- [継続:YYYY-MM-DD HH:MM] 議題」（JST）で、期限まで毎回取り上げ「候補: A、B、C」を1回1項目ずつ順に設計する）

- [済] 朝(07:00 JST)まで継続: プログラム言語Mamori(src/shared/mamori, 現在v0.12)の次の開発。候補: while文、分割代入、正規表現ガード、dataCrypto移行。各セッションで1項目を設計・レビューし decisions.md に記録
- [済] (v0.12版・終了) プログラム言語Mamori(src/shared/mamori, 現在v0.12)の次の開発。候補: while文、分割代入、正規表現ガード、dataCrypto移行。各セッションで1項目を具体的に設計し decisions.md に記録
- [済] プログラム言語Mamori(src/shared/mamori, 現在v0.13。const/letの1段の分割代入は実装・マージ済み)の次の開発。構文例は必ずMamori/TypeScriptの形で書き、Pythonで書かないこと。候補: src/shared/atlassianSite.tsの移植、書き直しだけで移せる残り2本の壁の特定、while文の要否の再検討（Mamoriにwhileは足さない前提）。dataCrypto(src/shared/dataCrypto.ts)は議題外・触らない。asをMamoriに足さない。JSON.stringifyは暗号化ではない。各セッションで1項目を具体的に設計し decisions.md に記録（期限 2026-11-05 07:00 到達）
