# ポータル — 対象者ごとの入口 (社内 / パートナー / カスタマー)

2026-11-11 に足した。企業のポータルは**誰のための入口か**で分かれる。このアプリの画面は社内の仕事の道具なので、
社外の人へ出す画面は**名指しで書いた物だけ**にし、社外向けは**別の単一 HTML** として配る。

| ポータル | 対象 | 届け方 | 中身 |
| --- | --- | --- | --- |
| 社内ポータル | 従業員 | このアプリそのもの (`dist/standalone.html` / デスクトップ版) | すべての画面 (分類ごとの一覧) |
| パートナーポータル | 取引先 (外注先・代理店・仕入先) | `dist/portal-partner.html` を配る | お知らせ・取引ガイドライン / 書類スタジオ / コンプライアンス |
| カスタマーポータル | 顧客 | `dist/portal-customer.html` を配る | お知らせ / 取扱説明書・資料 / よくある質問 / お問い合わせ |

このアプリはサーバを持たない。だから「社外の人がログインして社内のデータを見る」形のポータルは作れないし、作っていない。
社外向けの HTML は**端末の中だけで動く頁**で、社内のデータにも保管庫にも外部サービスにも繋がらない。

## 仕組み

```
shared/portal.mamori            台帳 (どの画面をどのポータルに出すか) と、入口の関門 portalScreenOrNull
        │  生成 (npm run mamori:build)
shared/portal.ts                印つきの型 VettedPortalScreen —— 関門だけが作る
        │
renderer/portal/PortalScreenView.tsx   画面を開く唯一の口 (印つきの値しか受けない)
        ├── renderer/portal/PortalDirectory.tsx   社内版の中の一覧 (3 つのタブ) —— サイドバーの「🚪 ポータル」/ 村の殻の「🚪 ポータル」
        └── renderer/portal/PortalApp.tsx          社外向けの HTML の殻 (並び・ハッシュ → 関門 → 口)
                 ├── portal/partnerMain.tsx   → src/renderer/portal-partner.html  → dist/portal-partner.html
                 └── portal/customerMain.tsx  → src/renderer/portal-customer.html → dist/portal-customer.html
```

- **台帳と関門は Mamori で書いてある** (`src/shared/portal.mamori`)。生成物 `portal.ts` を手で直さない。
  社外向けのポータルに画面を足すには、台帳 (`PARTNER_SCREENS` / `CUSTOMER_SCREENS`) に**理由つきで** 1 行足す。
  足さない画面は社内だけ —— 新しい画面を作っても、台帳へ書くまで社外には出ない。
- **画面を開く口は印つきの値しか受けない。** URL のハッシュ・保存値・会話の出力を素の文字列のまま渡すと `tsc` が断る。
- **社外向けの HTML は入口が別。** 社内版の入口 (`main.tsx`)・橋 (`web-shim.ts`)・保管庫・外部サービスへの経路・AI へ送る経路は
  取り込まない。橋は `renderer/portal/portalShim.ts` の最小の実装で、資格情報を預からず、網へ出ず、何も書き込まない。
- **CSP は社内版より狭い** (`connect-src 'none'`・スクリプトは畳み込んだ 1 本のハッシュだけ・Worker も枠も無し)。

## コマンド

```bash
npm run build:portal     # dist/portal-partner.html と dist/portal-customer.html を組む
npm run e2e:portal       # 組んだ 2 つと、社内版の中の一覧 (dist/standalone.html) を実ブラウザ (chromium) で開いて確かめる
```

- `e2e:portal` は 3 つの HTML が要る (`dist/standalone.html` / `dist/portal-partner.html` / `dist/portal-customer.html`)。
  無ければ走らずに断る。実測 (2026-11-11): **79 件 ❌ 0** —— パートナー 24・カスタマー 22・社内版の既定の殻 17・村の殻 16。
  どの画面も字と地の対比 (WCAG AA) を社内版の contrast suite と同じ道具で測る。

- **社内版の後に組む。** `npm run build:web` / `build:web:lite` は `dist/` を掃除するので、ポータルの HTML は消える。
  `build:portal` は一時の場所へ組んでから仕上がった 1 ファイルだけを `dist/` へ置くので、社内版を消さない。
- 組んだ物に社内版だけの文面 (保管庫・社内版の橋・設定画面・AI へ送る経路・サイドバーの検索) が 1 つでも在れば、**書かずに落ちる**。

## 配る前にすること

1. `src/renderer/portal/portalContent.ts` を自社の内容へ書き換える。**いま在るのは見本**で、会社名も連絡先も架空である
   (ドメインは予約済みの `example.co.jp`)。載せるのは社外の人が読んでよい内容だけにする —— このファイルの文は HTML へそのまま入る。
2. 同じファイルの `PORTAL_CONTENT_IS_SAMPLE` を `false` にする (画面の「見本」の札が消える)。
3. `npm run build:portal` → `npm run e2e:portal`。
4. **社内版と別の場所 (オリジン) に置く。** ブラウザの保存領域 (localStorage / IndexedDB) は場所ごとに分かれる。
   同じ場所に社内版と並べて置くと、パートナーポータルの「書類スタジオ」が社内版の書類スタジオの下書きを読み書きする
   (同じ鍵 `servicehub.docstudio.v1` を使う)。`file://` で開く場合、同じ端末の `file://` の頁は保存領域を共有しうるので、
   **社内版を使う端末でポータルの HTML を開いて確かめるときは、別のブラウザのプロファイルを使う**。
   取引先・顧客の端末には社内版が無いので、この重なりは起きない。

## 端末に残る物

| ポータル | 残る物 | 消し方 |
| --- | --- | --- |
| パートナー | 書類スタジオの下書き (localStorage `servicehub.docstudio.v1`) と、**空の** IndexedDB `business-hub-data` (書類スタジオが記録層を開くと作られる。行は 0 件) | 頁の下の「🗑 この端末に残した入力を消す」(下書きの鍵だけを消して読み直す)。空のデータベースは残る —— ブラウザのサイトデータの削除で消える |
| カスタマー | 何も残さない | — |

どちらも資格情報を預からない (API キー・トークンの入力欄が無い)。網へは出ない。上の表は実ブラウザで測った (2026-11-11 · chromium · `file://`)。

## 何が守っているか

| 守る物 | 強制する物 |
| --- | --- |
| 社外向けのポータルで開ける画面は台帳の物だけ | 関門 `portalScreenOrNull` (Mamori) と `src/shared/__tests__/portalGate.test.ts` (全サービスを総当たり・型の対照) |
| 配る HTML に社内の物が入っていない | `src/renderer/portal/__tests__/portalBundleClosure.test.ts` (入口からの取り込みの閉包を esbuild で数える。カスタマーは全件名指し) |
| 橋が預からない・送らない・書かない | `src/renderer/portal/__tests__/portalShim.test.ts` (15 の口を全部呼ぶ) |
| 殻が社内の画面のハッシュを開かない・消す口が自分の鍵だけを消す | `src/renderer/portal/__tests__/portalApp.test.ts` |
| CSP と仕上がりの確認 | `src/shared/__tests__/buildPortal.test.ts` |
| 実物の HTML が網へ出ない・社内の殻が無い・CSP 違反が無い・字と地の対比が AA を割らない | `npm run e2e:portal` (実 chromium) |
| 社内版の 2 つの殻 (サイドバー / 村) の入口から 3 つの一覧が開き、社外向けの一覧に台帳の画面だけが並ぶ | `npm run e2e:portal` (実 chromium · `dist/standalone.html`) |
| 社内版の一覧 (3 つのタブ) | `src/renderer/__tests__/portalDirectory.test.ts` |

## 分かっていること (限界)

- **パートナーの HTML は、全サービスの同梱の見本 (`data/snapshot.ts` · 約 70 KB) を丸ごと含む。** 画面が `SNAPSHOT[id]` を引くためで、
  中身は架空の値 (秘密は無い) だが、社内の画面の見本まで運ぶ。画面ごとに割るのは残作業。
- **パートナーの書類スタジオは、すべての書式を出す** (就業規則・賃金台帳など、取引に関わらない書式も選べる)。
  取引の書式だけに絞るのは残作業。
- **載せる情報を画面から編集する手段は無い。** `portalContent.ts` を書き換えて組み直す。
- **問い合わせは送らない。** サーバが無いので、連絡先と伝えてほしいことを示すだけにしてある。
- **発注・納品の進み具合を取引先と共有する機能は無い** (共有する先のサーバが無い)。書式を作って交付前に検めるところまで。
