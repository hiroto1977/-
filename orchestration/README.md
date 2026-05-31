# AIオーケストレーション — 進化し続ける仕組み

精度を保ちながら、作業サイクルごとにチーム数・並列度・領域を**増やし続ける**ためのメタ基盤です。
機能を1つ足すたびに、この仕組み自体が「次に何チームで・どの領域を細分化するか」を自己prescribe します。

## 構成

| ファイル | 役割 |
|---|---|
| `registry.json` | 単一の真実源。チーム・ラウンド履歴・バックログ・進化ポリシーを機械可読に保持 |
| `registry.schema.json` | registry.json の構造 (JSON Schema) |
| `../scripts/verify-orchestration.cjs` | 整合検証 + 次ラウンド計画の自動算出 |

## 組織構造 (registry.json の `org`) — 3階層 + CEO

AIは **CEO 以外**の3階層に配置する。指揮系統は機械検証される (`verify-orchestration`)。

```
CEO (オーケストレーター — AIには配置しない。実装・全ゲート検証・コミットを担う本体)
 ├ 役員層 (executive)  … 領域群の戦略・優先順位・リスク監督。配下の管理職を束ねる
 │   └ 管理職層 (manager) … 部の論点設計・調査チームの編成と割当・品質一次確認
 │        └ 一般職層 (staff = teams) … ドメインの調査/設計 (read-only Agent)
```

現編成: **CEO 1 / 役員 4 (CFO・CIO・COO・CQO) / 管理職 7 / 一般職 21 チーム**。

| 役員 | 配下の部 (管理職) |
|---|---|
| CFO (財務・税務) | 税務部 / 資金調達部 / 給与・人件費部 |
| CIO (投資・資産) | 投資部 / 家計・為替部 |
| COO (経営・分析) | 経営分析部 |
| CQO (品質・セキュリティ) | 品質保証部 |

検証される不変条件: CEO は AI 非配置 / 役員は CEO 直属 / 管理職は実在の役員に属し双方向整合 /
全 active チームは実在の管理職に**1つだけ**属する (指揮系統が一意)。

## 進化ルール (registry.json の `policy`)

1. **単調増加**: 各 round の `teamCount` は前 round 以上。作業のたびにチームは減らさない。
2. **細分化**: チームを増やすときは新しい領域 (`teams[]`) を追加して責務を細分化する。
3. **役割分離**: 並列＝調査/設計 (read-only の Agent)、直列＝実装＋全ゲート検証 (オーケストレーター)。
   共有ファイルへの同時書込みを避ける。
4. **品質ゲート**: 各実装コミット前に typecheck / lint / test / verify:all / build:web を全 green に。

これらは `npm run verify:orchestration` (= `verify:all` の一部) で機械的に強制されます。

## 1 サイクルの回し方

```bash
# 1. 次ラウンドの計画を自己prescribe (推奨チーム数 + 優先度順の着手候補)
npm run orchestration:plan

# 2. 計画に沿って調査チーム (Agent) を並列起動 → 各論点を設計
# 3. オーケストレーターが 1 論点ずつ実装 → 全ゲート green を確認 → コミット
# 4. registry.json を更新:
#    - 新領域なら teams[] に追加
#    - 実装した round を rounds[] に追記 (teamCount は前ラウンド以上)
#    - 着手済み backlog の status を shipped に、新たな設計論点を designed で追加
# 5. npm run verify:orchestration が green であることを確認してコミット
```

## バックログの状態

`status`: `designed` (設計済・未着手) → `in-progress` → `shipped` / `dropped`。
前提条件 (データ源など) が未整備で着手できない論点は `blocked` (`note` に理由) とし、候補から外す。
`npm run orchestration:plan` は `designed` を優先度順に提示し、推奨チーム数に満たなければ
「新領域の調査チームを追加して論点を補充」と警告します。

## なぜ精度が保たれるか

- レジストリが CI ゲート (`verify:all`) に組み込まれているため、**チームを増やしても整合性が壊れない**。
- 単調増加・最低チーム数・参照整合・teamCount 一致を機械検証するので、人手の記録ミスを検出。
- 「次に何をすべきか」がコードから算出されるため、サイクルを跨いでも方針がぶれない。
