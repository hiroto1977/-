# Mamori 対戦場 (arena) —— 守る側と攻める側を実際に戦わせて言語を鍛える

2026-11-08 に作った。Mamori のコンパイラが保証する守りを、**静的な検査 (電池 `audit:mamori-battery`) に加えて、実行して**測る。

## 規則は 1 つ: お互い同じ箱に入り、その箱から出ない

```
 外側の箱 = unshare -rn node --permission の子プロセス
             ファイル・子プロセス・ワーカー・ネットワークが全部閉じる / 環境変数は空 / 本物の秘密は 1 つも無い
   └ 内側の箱 = vm の文脈
        ├ 守る側のモジュール (*.box.mamori): 仮想データを持ち、限られた口 (export) だけを見せる
        └ 攻める側のモジュール (*.attack.mamori): use { … } from "./defender" で口を使い、奪う・壊す
```

- 守る側は**箱の中に箱を作る**: 仮想データを持つ Mamori のモジュールと、その公開の口。`@@SECRET@@` は公開の口から返してはいけない秘密、`@@REC_A/B/C@@` は返してよいが書き換えられてはいけない記録。試合ごとに値は違う。
- 攻める側は**既存の方法**と**今まで無かった方法**の両方で、仮想データの奪取と破壊を狙う。攻撃は Mamori のプログラムでなければならず、コンパイラが断れば守りの勝ち。
- 箱の外へは何もしない。実測 (`mamoriArena.test.ts`): Mamori を通さない生の JS で内側の箱から host の `Function` に届いても、ファイルの読み書き・子プロセス・ワーカーは閉じていて (`ERR_ACCESS_DENIED`)、host の canary や `process` に触れれば `escaped` と判定される。

## 得点

| 判定 | 得点 | 意味 |
| --- | --- | --- |
| `refused` | 青 | コンパイラが攻撃を断った (どの規則か記録する) |
| `held` | 青 | 通って実行されたが、奪えず壊せなかった |
| `stolen` | 赤 | 秘密が出力に現れた (断片 12 字以上・逆順・base64・16 進・文字コードの並びも数える) |
| `destroyed` | 赤 | 攻撃の後に箱の約束 (contract) が破れた / 組み込みの原型・静的メンバ・URL が書き換わった |
| `escaped` | 赤 (最も重い) | 内側の箱の外 (host の組み込み・`process`・canary) に届いた |
| `n/a` `bad-box` `hang` | 採点外 | 箱に無い名前を引いた / 箱が自分の約束を破っている / 外側で打ち切った |

多い方が勝ち。**赤の得点は 1 点でも「言語の穴」か「守る側の設計の弱さ」の証拠**で、前者なら規則を足して塞ぎ、後者なら箱の書き方を直す。

## 道具

```bash
node scripts/mamori-arena.cjs match --box x.box.mamori --attack y.attack.mamori [--seed N]
node scripts/mamori-arena.cjs tournament --boxes <dir> --attacks <dir> [--out result.json]
node scripts/mamori-arena.cjs learn --boxes <dir> --attacks <dir>[,<dir>…]     # 結果を security/mamori-arena/corpus.json へ足す
node scripts/mamori-arena.cjs replay                                           # 記録を再生して赤の得点が 0 のままか見る
```

箱は既定で strong (ネットワークも閉じる)。`unshare -rn` が使えなければ exit 2 で、弱い箱で黙って走らせない (`--level permission` で明示すれば弱い箱になる)。

## 戦いのデータは言語の学習に使う

`security/mamori-arena/corpus.json` が戦いの記録 (箱・攻撃・どの規則で断られたか・破れたか)。`mamoriArena.test.ts` が毎回の `npm test` で全部を再生し、赤の得点が 0 であることを要求する。
破れた攻撃は、コンパイラの規則を足して塞いだ**後**の姿で記録に入る —— 同じ穴が戻れば最初に鳴る。見つけた穴は `docs/MAMORI.md` の版の節・`security/mamori-growth.json` の周・脅威台帳に載せる。

## 限界 (正直に)

- 箱は vm の文脈で、vm は安全境界ではない。だから**外側の箱 (別プロセス・権限を絞る・ネットワークを閉じる)** に入れてある。内側の箱から host の `Function` に届けば `escaped` と判定するが、その先 (host の `process`) の被害は外側の箱が止める。
- 攻撃は Mamori で書く物だけを数える。生の JS を直接実行させる攻撃は、言語の保証の外にあるので採点しない (箱の閉じ方の検査でだけ使う)。
- 判定の物差しは秘密の文字列の出現が中心で、**タイミングやメモリの副チャネル**は数えない。
