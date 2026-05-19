# Emotions タブ セットアップ

「人間の感情を学習する」テーマを、Service Hub 上で **業務効率化と自己観察**
に直結する形に落とし込んだタブ。3 つの独立した機能を 1 画面に集約しています。

| 機能 | データの出どころ | API キーが要る？ |
|---|---|---|
| **気分ログ (Mood Journal)** | ローカル fs (`userData/service-hub-emotions.json`) | 不要 |
| **30 日トレンド** | 上記からの自動集計 (SVG sparkline) | 不要 |
| **テキスト感情分析** | Anthropic Claude Haiku 4.5 | **要** (Anthropic API キー) |

## できること

### 1. 気分ログ

毎日 1〜5 のスケールで気分を記録 + 任意の短いメモ。日次で 1 件保存 (同日に再登録すると上書き)。
過去 365 日分まで自動保存。

### 2. 30 日トレンド SVG

ログから直近 30 日の点と折れ線を描画。記録のない日はギャップとして可視化。
気分の傾向を一目で確認。

### 3. テキスト感情分析

任意のテキスト (メール本文・日記・誰かのメッセージなど) を Anthropic Messages API に送り、
6 軸スコアを返す:

```json
{
  "scores": {
    "joy": 0.65,
    "sadness": 0.10,
    "anger": 0.05,
    "fear": 0.15,
    "surprise": 0.20,
    "disgust": 0.00
  },
  "sentiment": "positive",
  "dominant": "joy"
}
```

各スコアを色付きバーで可視化、主感情は強調表示。
直近 50 件まで分析履歴を保存。

## Anthropic API キーの取得

1. https://console.anthropic.com/ にサインアップ
2. Settings → API Keys → "Create Key"
3. 表示された `sk-ant-…` をコピー
4. Emotions タブの「Anthropic API キー」ボタンに貼り付け → 保存

無料クレジット ($5) があるので個人利用なら初月コストゼロ。 1 分析あたり ~$0.001
(Haiku 4.5)。

## 他のタブとの統合

| タブ | アクション | 効用 |
|---|---|---|
| **Gmail** | 「受信トーン分析」ボタン → Inbox の件名一覧を Emotions タブに送って分析 | 朝の受信トレイのストレス度を可視化 |
| **Slack** | 「チャンネル雰囲気分析」ボタン → チャンネル名 + purpose を分析 | ワークスペース全体のムード傾向 |

両方とも結果は Emotions タブの分析履歴に蓄積されます。

## データの保管場所

- macOS: `~/Library/Application Support/service-hub-desktop/service-hub-emotions.json`
- Linux: `~/.config/service-hub-desktop/service-hub-emotions.json`
- Windows: `%APPDATA%\service-hub-desktop\service-hub-emotions.json`

このファイルは平文 JSON です (内容が PII ではないため暗号化していない)。完全に削除
したい場合は Emotions タブの「履歴を消去」アクション、または直接ファイルを削除。

## マルチモーダル感情分析 (ロードマップ)

テキストだけでなく **顔表情** や **音声プロソディ** からも感情を読み取りたい場合は、
[Hume AI](https://www.hume.ai/) の Expression Measurement API が選択肢:

| モード | API | スコープ |
|---|---|---|
| Face | `wss://api.hume.ai/v0/stream/models` (face モデル) | カメラ画像 → 48 軸感情 |
| Prosody | 同上 (prosody モデル) | 音声 → 47 軸感情 |
| Language | 同上 (language モデル) | テキスト → 53 軸感情 |

実装する場合は:
1. Hume の API キー取得 ($0.04/min for voice, audio で安価)
2. Service Hub に新しい LIVE_ACTIONS エントリ (`hume-face-analyze` 等) を追加
3. レンダラから `getUserMedia` で取得した stream を main 経由で Hume に送る

(Electron で webcam を扱う場合、`navigator.mediaDevices.getUserMedia` を renderer で
呼び、main は仲介しない方が遅延が少ない。preload ブリッジで権限管理する形が無難。)

## 業務での活かし方

| シーン | 使い方 |
|---|---|
| 朝一の状態把握 | 気分ログで自分の状態を客観視 → ハードな会議を午後に動かす判断材料 |
| 重要メールの返信前 | 自分の下書きを分析 → "anger" が高すぎる時は一晩寝かす |
| チームの兆候 | 同じ Slack チャンネルを週次で分析 → "fear" / "anger" 指数の異常を早期検知 |
| 1on1 の準備 | 直近の会話ログを分析 → 触れるべき話題の優先度付け |
| 自己理解 | 月次でトレンドを振り返り → 気分が落ちる曜日 / トリガを特定 |

## 制約

- Claude API はストリーミング非対応で組んでいるので、長文は応答に数秒かかる
- 分析履歴は最大 50 件で自動 trim。大量に分析するなら定期的にダンプを取る
- Hume / 音声 / 顔は未実装 (上記ロードマップ参照)
- 気分ログのスコアは主観 1〜5 のみ — 多次元感情を客観的に記録したいならテキスト分析側を使う
