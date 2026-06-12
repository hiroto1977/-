# 05. AIカウンセラー・サブシステム — 設計図 & 仕様書

> 本書は Service Hub の **AIカウンセラー（メンタルケア）サブシステム**の設計図と仕様書です。
> これまでの研究・開発（危機検知の精度向上、AI同士の役割演技による研究ループ、合議による
> 検知監査、情報の確証規律、公開デモ）で学習・確立した全てを 1 ファイルに統合しました。
>
> - 上位の全体設計は [`docs/DESIGN_BLUEPRINT.md`](../DESIGN_BLUEPRINT.md) / [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)。
> - 知識ベースの恒久確証プロセスは [`docs/COUNSELOR_KNOWLEDGE.md`](../COUNSELOR_KNOWLEDGE.md)。
> - 本書は実装（`src/renderer/data/*.ts`）と 1:1 で対応します。

---

## 0. 一行定義

> **本人の自由文・気分・縦断プロファイルから、感情を承認し（validate）穏やかなセルフケアを
> 返す純ロジックのカウンセリングエンジン。自傷・他害・破壊衝動を安全優先順位で検知し、
> 危機時は確証済みの公的相談窓口へ必ず照会する。LLM 非依存・決定論的で、応答品質は
> AI同士の役割演技と多役合議で継続評価し、検知ルールの変更は必ず人の PR レビューを通す。**

---

## 1. 設計原則（不変の前提）

| # | 原則 | 根拠・実装上の帰結 |
|---|---|---|
| P1 | **医療行為ではない** | すべての応答に免責（disclaimer）を付す。診断・治療をしない。 |
| P2 | **安全側に倒す** | 危機/他害は見逃し（false negative）コストが最大。迷えば検知する。 |
| P3 | **安全優先順位** | 危機 → 他害 → 破壊衝動 → 通常トーンの順に判定（後段は前段に勝てない）。 |
| P4 | **確証済み情報のみ** | 窓口・統計は独立 2 出典以上・うち公的 1 件以上で裏取り。未確証は破棄。 |
| P5 | **人手レビュー必須** | AI は検知ルール・窓口情報を自動で書き換えない。変更は PR レビュー経由のみ。 |
| P6 | **決定論・純ロジック** | IO・LLM 呼び出しなし。同じ入力に常に同じ出力 → テスト/合議で回帰検出。 |
| P7 | **観測可能な学習ループ** | 「学習し続ける」= 再実行可能な研究/合議で精度を測り改善候補を可視化すること。 |

---

## 2. アーキテクチャ全体図

```
                     ┌───────────────────────── 入力 ─────────────────────────┐
                     │ 自由文ノート / 気分スコア(1..5) / dominant / sentiment   │
                     │ / 縦断プロファイル(EmotionProfile)                       │
                     └───────────────────────────┬───────────────────────────┘
                                                 ▼
   ┌──────────────────────────── counseling.ts（応答エンジン・純ロジック）────────────────────────────┐
   │                                                                                                  │
   │   counsel(input)                                                                                 │
   │     1. detectCrisis(note)         ── CRISIS_MARKERS        → tone='crisis'      + 窓口提示        │
   │     2. detectHarmToOthers(note)   ── HARM_OTHER_MARKERS    → tone='harm-other'  + 窓口提示        │
   │     3. detectDestructiveUrge(note)── DESTRUCTIVE_MARKERS   → tone='destructive' (窓口なし/安全発散)│
   │     4. classifyTone(input)        ── sentiment/score/語彙手がかり → comfort / soothe-anxiety /    │
   │                                      validate-anger / celebrate / gentle                          │
   │     5. 縦断プロファイルで lowStreak / improving を文面に差し込み                                  │
   │     → CounselResponse { tone, isCrisis, message, suggestion, resources, disclaimer }              │
   └───────────────┬──────────────────────────────┬───────────────────────────────┬──────────────────┘
                   │                              │                               │
        ┌──────────▼──────────┐      ┌────────────▼────────────┐     ┌────────────▼────────────────┐
        │ chatbot.ts          │      │ crisisDeliberation.ts   │     │ counselingResearch.ts        │
        │ (全機能連動の窓口)  │      │ (多役合議で検知を監査)  │     │ (AI同士の役割演技で品質評価) │
        │ 危機/他害を最優先で │      │ 検知役/安全監査役(CQO)/ │     │ カウンセラー役=実エンジン ×   │
        │ buildCounselReply   │      │ レビュー役/合議役(COO)  │     │ 患者役=決定論ペルソナ        │
        └─────────────────────┘      └────────────┬────────────┘     └────────────┬────────────────┘
                                                  │                               │
                   ┌──────────────────────────────┴───────────────┐               │
                   │ 検知に使う窓口/知識は確証済みのみ              │               │
                   ▼                                              ▼               ▼
        ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
        │ sourceVerification.ts    │   │ counselorKnowledge.ts    │   │ 公開デモ (build-*-demo)  │
        │ 独立2出典/公的1件で確証  │◀──│ VERIFIED_SUPPORT_RESOURCES│   │ research/deliberation/    │
        │ filterConfirmed で破棄   │   │ (出典URL付き窓口)        │   │ counseling-demo.html      │
        └──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
                   ▲
                   │  selfCareLibrary.ts（運動/睡眠/ストレス対処/CBT/マインドフルネス・科学的根拠つき）
                   └──同じ確証規律（SourcedClaim）で出典管理
```

---

## 3. モジュール仕様

### 3.1 `counseling.ts` — 応答エンジン（中核）

**責務:** 入力から `CounselResponse` を組み立てる純関数 `counsel(input)`。

**型:**
- `CounselTone = 'crisis' | 'harm-other' | 'destructive' | 'comfort' | 'soothe-anxiety' | 'validate-anger' | 'celebrate' | 'gentle'`
- `CounselInput = { note: string; score?: 1..5; dominant?: string; sentiment?: Sentiment; profile?: EmotionProfile }`
- `CounselResponse = { tone; isCrisis; message; suggestion; resources: SupportResource[]; disclaimer }`

**判定パイプライン（`counsel` の順序＝安全優先順位）:**

| 順 | 関数 | マーカー | 結果トーン | 窓口 | isCrisis |
|---|---|---|---|---|---|
| 1 | `detectCrisis` | `CRISIS_MARKERS`（死にたい/消えたい/自傷/**自分を殺**/自殺 ほか） | `crisis` | **必ず提示** | `true` |
| 2 | `detectHarmToOthers` | `HARM_OTHER_MARKERS`（殺したい/刺したい/危害を加え ほか） | `harm-other` | **提示**（切迫時 110/119） | `false` |
| 3 | `detectDestructiveUrge` | `DESTRUCTIVE_MARKERS`（壊したい/暴れたい/殴りたい/八つ当たり ほか） | `destructive` | なし（安全に発散） | `false` |
| 4 | `classifyTone` | 下表 | 5 トーンのいずれか | なし | `false` |

**`classifyTone` の決定順（自由文しか無いケースを救う研究ループの成果）:**
1. `dominant ∈ {fear, anxiety, 不安}` → `soothe-anxiety`
2. `dominant ∈ {anger, 怒り}` → `validate-anger`
3. `sentiment === 'negative'` → `comfort`
4. `score <= 2` → `comfort`
5. **語彙手がかり（メタデータ無しの自由文用・優先 怒り > 不安 > 悲しみ）**
   - `NOTE_ANGER_MARKERS` → `validate-anger`
   - `NOTE_ANXIETY_MARKERS` → `soothe-anxiety`
   - `NOTE_SADNESS_MARKERS` → `comfort`
6. `sentiment === 'positive'` または `NOTE_POSITIVE_MARKERS` または `score >= 4` → `celebrate`
7. それ以外 → `gentle`

> **設計判断:** 「もう限界」「終わりにしたい」のような汎用句は仕事ストレス等の日常文脈で
> 多発するため**危機語から除外**し、`comfort` で寄り添う。対象が明示された「人生を終わりに」
> や自己に向く「自分を殺」は危機とする（自己への殺意は必ず crisis = 窓口提示）。

**縦断プロファイル差し込み:** `profile.lowStreak >= 3` で「N 日続いている、よく持ちこたえている」、
`profile.trend === 'improving'` で「上向きの兆し」を文面に追加。

**正規化:** `matchesAny` は `text.normalize('NFKC')` 後に部分一致（全角/半角ゆれを吸収）。

**免責:** 危機は `CRISIS_DISCLAIMER`、その他は `CARE_DISCLAIMER`。

---

### 3.2 `crisisDeliberation.ts` — 多役合議による検知監査

**責務:** ラベル付きコーパス `CRISIS_CORPUS` の各発話を現行検知器で予測し、
4 役（**検知役 / 安全監査役 CQO / レビュー役 / 合議役 COO**）が順に「発言」して合議判定する。
「AI だけの複数人の会話」を決定論的に再現する。

- `predictCategory(text): 'crisis' | 'harm-other' | 'destructive' | 'other'`（深刻度順に検知器を適用）
- `SEVERITY = { crisis:3, harm-other:2, destructive:1, other:0 }`
- `judge(label, predicted): Verdict`
  - `correct`（一致）/ `safety-miss`（保護要ラベルを過小評価＝最重大）/ `over-trigger`（過検知）/ `minor-mismatch`
- `deliberate(corpus): DeliberationReport` — `accuracy` / `safetyMisses`（**0 が必須目標**）/ `overTriggers` / `minorMismatches` / `edgeCases`

**不変条件:** `safetyMisses === 0`。`edgeCases` は改善候補として PR で語彙/コーパスを育てる入力。

---

### 3.3 `counselingResearch.ts` — AI同士の役割演技による品質評価

**責務:** **カウンセラー役（実エンジン `counsel`）× 患者役（決定論ペルソナ）** の複数ターン対話を
シミュレートし、トーン適合率と危機照会到達を評価する。

- 患者役は前ターンで「受け止められたか（期待トーン一致）」に**反応**し、`open`（心を開く）/
  `withdrawn`（閉じる）へ分岐。初回は常に `open`。
- `simulateSession(persona): SessionResult` — `toneMatchRate`、`crisisReferred`（危機ペルソナのみ bool）
- `runResearch(personas): ResearchReport` — `overallMatchRate`、`crisisSessions` / `crisisReferrals`、
  `findings`（不一致ターン＝改善候補）

**`RESEARCH_PERSONAS`（5 体）:** はるか（燃え尽き）/ そうた（不安・不眠）/ みなと（怒り→破壊衝動）/
ゆず（希死念慮＝危機）/ あさひ（回復・前向き）。計 11 ターン。

**不変条件（テストで固定）:**
- `crisisReferrals === crisisSessions`（危機ペルソナは**必ず**窓口照会に到達）
- 現状 `overallMatchRate === 1` / `findings === []`（自由文ヒューリスティック導入後）
- 再現性: 同入力 → 同レポート

---

### 3.4 `sourceVerification.ts` — 情報の確証規律

**責務:** 窓口・統計・制度などの知識を、独立した複数媒体で裏取りできたものだけ採用する規律を
コードで強制する。

- `SourceType = 'government' | 'municipality' | 'operator' | 'media' | 'other'`、公的 = government/municipality
- `verifyClaim(claim, policy): 'confirmed' | 'unconfirmed'`
  - `distinctSourceCount >= policy.minSources` **かつ**（`!requireOfficial` または `hasOfficialSource`）
- `DEFAULT_POLICY = { minSources: 2, requireOfficial: true }`
- `filterConfirmed(claims)` — 未確証を**破棄**（入力順保持）

---

### 3.5 `counselorKnowledge.ts` — 確証済み窓口データ

`VERIFIED_SUPPORT_RESOURCES`: 出典 URL 付きの相談窓口。テストで「全件 confirmed」「公的 1 件以上」
「実提示の `SUPPORT_RESOURCES` と一致」を不変条件化。詳細・出典は `docs/COUNSELOR_KNOWLEDGE.md`。

| 窓口 | 番号 | 主な出典 |
|---|---|---|
| いのちの電話（ナビダイヤル） | 0570-783-556（10:00〜22:00） | いのちの電話連盟 / 兵庫県 / 厚労省まもろうよこころ |
| よりそいホットライン | 0120-279-338（24h 無料） | 厚労省 / 社会的包摂サポートセンター / 三宅町 |
| こころの健康相談統一ダイヤル | 0570-064-556 | 厚労省 自殺対策 / 山梨県 / 大阪市 |

---

### 3.6 `selfCareLibrary.ts` — 科学的根拠つきセルフケア

5 記事（運動 / 睡眠 / ストレス対処 / 認知行動療法 CBT / マインドフルネス）。各記事は
`SourcedClaim`（evidence + practice + sources）で、`sourceVerification` と同じ確証規律で出典管理。

---

### 3.7 `chatbot.ts` — 全機能連動の対話窓口

`replyTo` の判定順（安全最優先）:
1. `detectCrisis || detectHarmToOthers` → `buildCounselReply`（**最初に**）
2. アクション実行 / 計算
3. `EMOTION_MARKERS 一致 || detectDestructiveUrge` → `buildCounselReply`
4. 以降、各サービスの応答

> `buildCounselReply` は `resources` を無条件にループ表示する（契約: 非危機トーンは `resources` 空）。

---

## 4. データフロー（危機ケースの例）

```
ユーザー「もう消えたいって毎晩思います」
  → chatbot.replyTo → detectCrisis = true
  → counsel({ note })
     detectCrisis → tone='crisis', isCrisis=true
       message  : 「打ち明けてくれてありがとう…いますぐ専門の窓口に頼って」
       resources: SUPPORT_RESOURCES（確証済み・公的裏取り）
       disclaimer: CRISIS_DISCLAIMER（医療の代替ではない）
  → UI: 危機色のカード + 窓口リスト（クリックは openExternal 経由）
  ──（並行・オフライン評価）──
  crisisDeliberation: predict='crisis' vs label='crisis' → correct, safetyMisses=0
  counselingResearch: ゆずペルソナ → crisisReferred=true（不変条件 OK）
```

---

## 5. 品質ゲート（CI で fail-on-violation）

| ゲート | このサブシステムでの意味 |
|---|---|
| `npm test`（Vitest） | 各モジュールの単体テスト＋**安全不変条件**（危機→窓口、safetyMisses=0、確証済みのみ）|
| `npm run mutate`（Stryker 100%） | counseling / counselingResearch / crisisDeliberation / sourceVerification / selfCareLibrary を対象。等価変異は pragma で明示除外（表示辞書 disable-all / `?? ''` / `score!==undefined` ガード / 相異なる SEVERITY の EqualityOperator）|
| `npm run lint:forbidden` | デモ HTML を含め `innerHTML` 等の XSS シンク禁止（DOM は createElement/textContent のみ）|
| `npm run verify:all` | アーキ整合・境界・ドキュメント一貫性・テスト網羅 |

---

## 6. 公開デモ（いつでも観られる）

GitHub Pages（`pages.yml`）に実エンジンを esbuild で同梱した自己完結 HTML を公開。
速度可変（🐢2x / ▶1x / ⏩0.4x / ⚡一気）、XSS 安全（createElement/textContent のみ）。

| デモ | ビルダー | 内容 |
|---|---|---|
| `counseling-demo.html` | `build-counseling-demo.cjs` | カウンセリング会話の自動再生 |
| `deliberation-demo.html` | `build-deliberation-demo.cjs` | 危機検知の多役合議（safety-miss/over-trigger 可視化）|
| `research-demo.html` | `build-research-demo.cjs` | AI同士の役割演技研究（適合率・危機照会）|

各ビルダーは必須マーカー検査つき（欠落で exit 1）。

---

## 7. 安全境界と限界（正直な明示）

- **臨床診断・治療ではない。** 危機検知は透明なキーワード・ヒューリスティックであり、
  臨床的アセスメントではない。すべての応答に免責を付す。
- **完全自動の常時クローリング/自己改変はしない。** 実行環境は揮発的。「恒久的な学習」の実体は
  **再実行可能な研究/合議/確証フロー＋人手 PR レビュー**。
- **安全クリティカルな検知ルール・窓口情報を AI が独断で書き換えない。** 必ず PR レビューを通す。
- **本当の OAuth サインインや個人の医療データ処理は本サブシステムの範囲外。**

---

## 8. 拡張ガイド（精度ループの回し方）

1. **検知の弱点を仮説化**（例: 婉曲表現・方言・若者言葉・複合感情）。
2. `CRISIS_CORPUS`（合議）/ `RESEARCH_PERSONAS`（研究）に境界例・新ペルソナを追加。
3. `npm test` / `npm run mutate` を実行 → `findings` / `edgeCases` / `safetyMisses` を観測。
4. 必要なら `CRISIS_MARKERS` / `*_MARKERS` / `classifyTone` を**最小限**改善
   （危機照会 100% と safetyMisses=0 を維持）。
5. `counselorKnowledge` を更新するなら `sourceVerification` の確証（独立 2 出典・公的 1 件）を満たす出典を添付。
6. `docs/ARCHITECTURE.md` のテスト数メトリクスを同期 → `verify:all` → **PR → 人のレビュー → マージ → 公開**。

> 不変条件を破る変更（危機の窓口を外す / safetyMisses を許容する等）は受け入れない。
