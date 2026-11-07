# 固定決定（CEOロック）

このファイルの `status: locked` の項目は、CEO（清継）が当該項目の `status: unlocked` に書き換えるまで評議会が覆せません。
拘束範囲: 議題の受理、役員決定の `decisions.md` 記録、`start-all.sh` による llama7B（8086）起動。
コードや環境変数だけでは解除できません。

## llama7B-stop
- status: locked
- title: llama7Bは停止のまま維持する
- locked_at: 2026-11-06 01:40 JST
- locked_by: CEO 清継
- reason: 17:24取消→18:00復活→18:11実起動（空き2538→1916MB）→19:57再取消→20:50再開最優先の繰り返しを止める。メモリ逼迫のため停止を固定する。
- service: llama7B
- forbid: (llama7B|Llama7B|7B\s*モデル|Qwen2\.5-7B|:\s*8086)[^。\n]{0,28}(起動|再開|立ち上げ|再起動|再構築|ロード|開始)|(起動|再開|立ち上げ|再起動|再構築)[^。\n]{0,28}(llama7B|Llama7B|7B\s*モデル)
- topic_forbid: (llama7B|Llama7B|7B\s*モデル).{0,40}(再起動|立ち上げ|再開|起動|再構築)|(再起動|立ち上げ|再開|起動).{0,40}(llama7B|Llama7B|7B)

## datacrypto-0927-cancel
- status: locked
- title: 09:27の実装開始とIV更新は取消確定（再着手禁止）
- locked_at: 2026-11-06 01:40 JST
- locked_by: CEO 清継
- cancels: 2026-11-05 09:27:38 の決定（dataCrypto実装開始・IV更新）
- reason: 取消が報告書にすり替えられ正式取消になっていなかった。既存は dataCrypto.mamori と hostEncrypt 内の毎回 getRandomValues。不用意なIV更新は Nonce 再利用になる。安全な nonce 方式を明示した新しい正式決定が無い限り再着手しない。
- forbid: (dataCrypto|データ暗号)[^。\n]{0,40}(実装|着手|開始|作り直|書き直|改修|更新)|IV[^。\n]{0,24}(更新|変更|再生成|作り直|改修)|(実装開始とIV|09:27[^。\n]{0,20}(再開|復活|実施))
- topic_forbid: (09:27.{0,40}(実装|IV|復活|再開)|IV更新を?(再開|実施|実行|進める)|dataCrypto.{0,30}(実装開始|着手|作り直)|実装開始とIV)
