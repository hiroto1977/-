# ローカルAI評議会（council）

複数のローカルLLMが役割を分担し、常に話し合いながら提案をまとめる常駐デーモンです。
`start-all.sh`（および `--watch` の60秒監視ループ）から自動起動され、落ちても再起動されます。`stop-all.sh` で停止します。

## AI組織（35人、`build_org.py` が `repo-analysis/orchestration/registry.json` から `org.json` を生成）
| 階層 | 人数 | モデル |
|---|---|---|
| CEO | 清継さん本人（アバターのみ、AIは代弁しません） | — |
| COO | 1 | balanced（Qwen2.5 3B） |
| 役員（CFO/CIO/CHRO/CSO/CQO） | 5 | balanced |
| 秘書（役員ごとに1人） | 5 | 小型モデルを順番に割り当て |
| 管理職（税務/資金/給与/投資/家計/経営/FP&A/品質） | 8 | 同上 |
| 一般職（管理職ごとに2人） | 16 | 同上 |

小型モデル（qwen3-1.7b, glm-edge-1.5b, internlm2.5-1.8b など）は llama-swap が1つずつ読み込みます。空きメモリが5.5GB未満なら重いモデルは qwen3-1.7b に置き換え、失敗時は `fast` → `balanced` に切り替えます。日本語でない応答（中国語の混入など）や、清継さん・CEOを名乗る行は捨てます。

## 流れ（1回の会議は最大6発言）
1. COOが議題を選び、担当役員を決める（優先順：清継さんの発言 → `inbox.md` → 停止中のサービス → `docs/REMAINING_WORK.md` → 環境の改善点）
2. 担当の管理職が提案 → 一般職が現場の視点を出す → 秘書がリスクと抜けを整理
3. 役員が「決定」と「次のアクション」を出す → COOが清継さんへの報告をまとめ、`decisions.md` に追記
4. `COUNCIL_INTERVAL` 秒（既定600秒）待って次へ。清継さんの発言が届くとすぐ始めます
   - 待ち時間は壁時計とモノトニック時計の両方で測ります（ボックスが一時停止するとモノトニック時計は止まるため、再開後すぐに次の会議を始めます）
   - 会議ループは別スレッドで動き、例外はすべて捕まえて続行します。メインのウォッチドッグがスレッドの停止や `COUNCIL_STALL_SEC`（既定 max(2×間隔, 3×タイムアウト+60) 秒）以上の無反応を検知すると、ループを作り直します（`logs/system.log` に「会議ループ開始 gen=N」）

## 議題の追加
- 村のページ下のチャットで「組織全体へ」を選んで送信（COOが最優先で会議にかけます）
- または `inbox.md` に `- 議題` の形で1行追加（1回話し合うと `- [済]` になります）
- 期限付きの継続議題: `- [〜07:00] 議題` または `- [継続:2026-11-05 07:00] 議題`（JST）。期限まで毎回の会議で取り上げ、期限を過ぎると `- [済] …（期限 … 到達）` になります。`〜07:00` は最初に読んだ時点で次に来る07:00の絶対日時に書き換えます
  - 本文に `候補: A、B、C`（または `項目:`、区切りは `、` `,` `/`）があると、1回の会議で1項目ずつ順番に（一巡したら最初から）具体的に設計させ、`decisions.md` に「設計項目 n/N」付きで記録します。進み具合は `recurring_state.json` に保存




## 固定決定（CEOロック）
`locked_decisions.md` の `status: locked` 項目は、CEO（清継）が `status: unlocked` に書き換えるまで覆せません。
- 議題: 固定決定を復活・再開しようとする受信箱／助言／CEO指示は会議にかけず却下（`rejected_decisions.md` に理由）
- 決定: 役員決定がロックを覆す文なら助言ガードと同様に差し戻し・不記録
- 起動: `start-all.sh` は `llama7B-stop` が locked のとき `ENABLE_7B` を強制 0（7B の既定も 0）
- 健全性表示: ロック中サービスは「固定停止」と出し、停止中リストから外す（再起動議題化を防ぐ）
- プロンプト: 各役の system に固定決定ダイジェストを付与
- `/api/state` に `locks`（`on` / `items`）。掲示板に 🔒 カード
初期ロック: `llama7B-stop`（停止維持）、`datacrypto-0927-cancel`（2026-11-05 09:27 の実装開始とIV更新の取消確定・Nonce再利用防止）。テスト: `python3 test_decision_lock.py`。`COUNCIL_DECISION_LOCK=0` で無効化（通常は使わない）。

## 助言ガード
役員の決定が助言（`advice_inbox.md` の行や、禁止パターン）と食い違うときは `decisions.md` に書かず、`rejected_decisions.md` に理由を残して役員に1回だけやり直させます。掲示板には 🛑 カードが出ます。
禁止パターンは `advice_guard.py`（dataCrypto の実装着手、`as BufferSource`、Mamori への `as` / `while` 追加、JSON.stringify を暗号化と扱う、IV の定期再生成、正規表現アンカーの除去、C++/Python 混在）。否定文（〜しない / 禁止 など）は違反にしません。
`COUNCIL_ADVICE_GUARD=0` で無効化できます。`COUNCIL_ADVICE_GUARD_LLM=1` で検証モデルにも確認させます（既定は OFF）。テスト: `python3 test_advice_guard.py`。

## 3Dの村（http://127.0.0.1:8091）
Three.js（`web/vendor` に同梱、ビルド不要）のボクセル風の村です。中央に会議ホールと清継さん（CEO）、周りにCOOと役員の家（秘書は隣）、外側に管理職と一般職の区画、角にローカルサービスの「マシンルーム」があります。空の色は東京時間で昼夜が変わり、ドラッグで視点を回せます。

`web/vendor/three.module.min.js` は Three.js r160 のビルド済みファイルです。先頭のライセンス表記は Copyright 2010-2023 Three.js Authors、SPDX-License-Identifier: MIT です。`OrbitControls.js` は同じ版の examples 由来です（MIT。このファイル自体にはライセンスヘッダがありません）。minify 済みの `three.module.min.js` は eslint の対象外で、`lint:network-targets` の母集団からも外しています。

- 清継さん以外の住民は自由に歩き回ります（建物の入口で中に入って消え、しばらくして出てくる・立ち止まる・ぶつからないようにすれ違う）。会議の発言者は会議ホールのテーブルへ歩き、それ以外は手が空くと机でタイピングします
- 住民をクリックするか、チャットで `@CFO 質問` のように名前を書くと、その人が立ち止まってこちらを向き、吹き出しで返事します（`/api/chat`）
- 会話は `user_thread.md` に、議論は `logs/YYYY-MM-DD.md` に保存されます
- 状態は `/api/state`、組織図は `/api/org`（JSON）
- 機械室の稼働は `/api/state` の `services`。各サービスへ HTTP GET し、仕事のできる経路が 2xx のときだけ true。ポートが開いているだけでは稼働にしない。LiteLLM は `/health/liveliness`（プロセス生存）ではなく `/v1/models`。liveliness が 200 でも `/v1/models` が 500 なら村は停止（💤）と出す。認証ヘッダは LiteLLM にだけ付ける。時間内に応答が無ければ停止。テスト: `python3 test_health_probe.py`。起動スクリプトの再起動判定（liveliness または待受）はこの表示とは別で、ここでは変えていない。
- 動作確認用に `?selftest=1` を付けると、住民の移動数を数えて `@CFO` に話しかけます
- 既定のカメラは「✋ 自由」です。村が大きくなっても自動では引きません。画面端にマウスを寄せるか WASD／矢印でスクロールして見て回ります（チャット入力中のキーは無効）。ミニマップをクリックしても移動できます。「🗺 全体」を押したときだけ引きます。スマホの指では、上下のスワイプで村（注視点）との距離が変わります（上で近づき、下で離れます）。2本指のピンチも距離を変えます（広げると近づき、狭めると離れます）。横へのスワイプは視点の回転です。マウスのドラッグ回転とホイールのズームはこれまでのままです。

## 安全のための制限
- できることは、このディレクトリへのファイル書き込みと読み取り専用の確認だけです。git push や外部への送信はしません
- サーバーは 127.0.0.1 だけで待ち受け、POST はループバックかつ同一オリジンの JSON のみ受け付けます（4KB以下、本文500字まで）
- 画面上の文字はすべて textContent で表示し、HTMLとしては解釈しません
- 空きメモリが `COUNCIL_MIN_FREE_MB`（既定1500MB）未満なら回を飛ばし、1回の呼び出しは `COUNCIL_TIMEOUT` 秒（既定240）で打ち切ります
- 小さいモデルなので、内容は参考程度です（事実の誤りや中国語の混入があります）

## 企業データ連携（任意・既定OFF）
`company_link.py`。`company_link.example.json` を `company_link.json` にコピーし `enabled: true`。source は json / csv / sqlite / sql（SQLAlchemy URL は環境変数 `COMPANY_DB_URL`）。
読み取り専用（SELECT/WITH 1文のみ・SQLiteは mode=ro + query_only）。`GET /api/company`、`POST /api/company/refresh`（`{"demo":"large|small|deficit|example|off"}` でデモ切替、メモリ上のみ）。
サンプル（すべて架空）: `example_company.json`, `examples/*.json`。テスト: `python3 test_company_link.py`。

## Claude（相談役・議長）
Claude Code CLI にログイン済みのときだけ、会議の最後に Claude が議長講評を書き、チャットで相談役 Claude と1対1で話せます。CLI が無い／未ログインのときは `balanced` モデルが「代理議長」「代理」として答え、会議は止まりません（村の Claude ラベルに「・未ログイン」などと出ます）。
呼び出しはツール全無効・MCP なし・空の作業ディレクトリ・入力6000字/出力1200字・1時間あたり回数制限つきです。
環境変数: `COUNCIL_CLAUDE=0`（無効化）、`COUNCIL_CLAUDE_BIN`、`COUNCIL_CLAUDE_MAX_PER_HOUR`（既定6）、`COUNCIL_CLAUDE_TIMEOUT`（既定120秒）。
`advice_inbox.md` の外部助言は現在 Grok のみです（掲示板では「☁️ クラウドの助言（Grok）」）。テスト: `python3 test_claude_chair.py`。
