# Linux 移行ガイド — 開発マシンを Linux に切り替える

開発マシン (Windows / Mac) を Linux に乗り換え、Service Hub の開発を
そのまま継続するための手順書。**自動化できる部分は
`scripts/setup-linux.sh` に集約**してあり、手作業が必要なのは
OS インストールそのもの（物理作業）だけ。

| フェーズ | 内容 | 自動化 |
|---|---|---|
| 0 | バックアップ | **`migrate.sh backup` で自動**（個人データのみ手動） |
| 1 | ライブ USB 作成 + ハードウェア確認 | **`make-live-usb.sh` で自動**（USB を挿す・起動確認のみ手動） |
| 2 | Ubuntu インストール | **`make-autoinstall.sh` で無人化可**（USB ブート操作のみ手動） |
| 3 | 日本語入力 (Mozc) | **`setup-linux.sh` が自動導入**（GNOME 検出時） |
| 4 | 開発環境の再構築 | **`migrate.sh restore` + `setup-linux.sh` で全自動** |
| 5 | サービストークンの再登録 | 手動（設定ページ）。`--doctor` が暗号化方式を診断 |

物理操作（USB の抜き挿し・再起動・ブートメニュー選択）以外は全てスクリプト化
されている。人間の作業は「スクリプトを実行 → USB を挿して再起動 → 待つ」まで。

> **USB を一切使いたくない場合**は「[USB レス移行パス](#usb-レス移行パス)」を参照。
> 旧マシンが Windows なら WSL2 で**再起動すら不要**、データ移送は
> `migrate.sh backup --encrypt` + クラウドストレージで置き換えられる。

推奨ディストリビューション: **Ubuntu 24.04 LTS**。
情報量が多く、CI (GitHub Actions) も Ubuntu で動いているため
ローカルと CI の環境差が最小になる。Windows に近い操作感が
良ければ Linux Mint (Ubuntu ベース) でも同じ手順で動く。

---

## フェーズ 0: バックアップ（旧マシンで）

開発関連は **1 コマンドで自動化**されている（Windows の場合は Git Bash / WSL から実行）:

```bash
bash scripts/migrate.sh backup            # 既定: ~/ 配下を走査
bash scripts/migrate.sh backup --scan ~/projects --out /media/usb/migration.tar.gz
```

これが行うこと:

- `~/.ssh`・`~/.gitconfig`・`~/.config/git` を権限保持のまま tar.gz 化（秘密鍵を含むため
  アーカイブは `chmod 600`、SHA256 を表示 — 移送後に照合する）
- 配下の **全 git リポジトリを走査**し、未コミット変更 / stash / 未 push コミット /
  upstream 無しブランチを `MIGRATION_MANIFEST.txt` に列挙（push 漏れの機械検知）

残りの手動チェックリスト:

- [ ] ドキュメント・写真など個人データを外部ドライブ / クラウドへ
- [ ] ブラウザのプロファイル（同期アカウントでのログインが最も簡単）
- [ ] manifest に列挙されたリポジトリを push（または意図的に放置と判断）
- [ ] Windows の場合: BitLocker 回復キーを控え、「高速スタートアップ」を無効化

> **トークンはコピーしない**: Service Hub のサービストークンは
> Electron `userData` ディレクトリに `safeStorage`（OS キーチェーン由来の
> マシン固有鍵）で暗号化保存されている。**ディレクトリごとコピーしても
> 新マシンでは復号できない**ため、フェーズ 5 で再登録する。
> ブラウザ単体版 (standalone.html) の Vault も同様に、
> マスターパスワードで新マシンにて再セットアップする。

## フェーズ 1: ライブ USB 作成 + ハードウェア確認

USB の作成（ISO ダウンロード・SHA256 検証・書き込み）は自動化されている
（Linux / WSL 上で実行。Windows ネイティブなら Rufus / balenaEtcher を使う）:

```bash
bash scripts/make-live-usb.sh                     # 候補 USB デバイス一覧を表示
bash scripts/make-live-usb.sh --device /dev/sdX --dry-run   # 実行内容を事前確認
bash scripts/make-live-usb.sh --device /dev/sdX   # ISO 取得 + 検証 + 書き込み
```

誤って内蔵ディスクを消さないよう、**リムーバブル判定・マウント中拒否・
デバイス名の再入力確認**の3重ガードが入っている。ISO は公式 SHA256SUMS と
照合され、最新の 24.04 ポイントリリースが自動選択される。

手動で残るのは確認作業のみ: USB からブートし「インストールせずに Ubuntu を
試す」を選び、Wi-Fi・画面・音・タッチパッドの動作を見る。ここで動かないものが
あれば、インストール前に再検討ができる。

## フェーズ 2: Ubuntu インストール

### 通常インストール（デュアルブート推奨）

- インストーラーの「Windows と並行してインストール」を選択。Windows 専用
  アプリが必要になったとき戻れる。3 か月ほど Linux だけで生活できると確認
  できてから Windows パーティションを消すのが堅実。
- NVIDIA GPU 搭載機は「**サードパーティ製ソフトウェアをインストール**」に
  必ずチェック（プロプライエタリドライバが入る）。

### 無人インストール（クリーンインストールを自動化したい場合）

```bash
bash scripts/make-autoinstall.sh --user <ユーザー名> --hostname <ホスト名>
```

日本語ロケール・JP キーボード・Mozc・ユーザー作成までを無人実行する
autoinstall 設定（`user-data` / `meta-data`）を生成する。別の USB を
`CIDATA` ラベルで FAT32 フォーマットして 2 ファイルを置き、ライブ USB と
両方挿してブートするとインストーラーが検出する（生成される README.txt に
手順あり）。**ディスク全消去を伴うためデュアルブートには使わない**こと。
パスワードは SHA-512 ハッシュで埋め込まれ平文は保存されないが、
user-data 自体もコミット禁止。

- インストール後 `sudo apt update && sudo apt upgrade -y` を一度実行。

## フェーズ 3: 日本語入力 (Mozc)

**フェーズ 4 の `setup-linux.sh` が自動化済み**: GNOME デスクトップを検出すると
`ibus-mozc` を導入し、GUI セッション内なら入力ソースへの登録まで行う
（`Super + Space` で切替）。無人インストール（上記）を使った場合は
パッケージ導入済みのため登録のみ。

手動でやる場合: 設定 → キーボード → 入力ソース → 「+」 → 日本語 →
**日本語 (Mozc)** を追加。候補が出ない場合は一度ログアウト / ログイン。

## フェーズ 4: 開発環境の再構築（ここから自動）

```bash
# リポジトリを clone
git clone <このリポジトリの URL> service-hub && cd service-hub

# フェーズ0 のアーカイブから SSH 鍵・git 設定を復元 (権限も自動正規化)
bash scripts/migrate.sh restore /path/to/service-hub-migration-*.tar.gz

# ワンコマンドセットアップ + 品質ゲート
bash scripts/setup-linux.sh --verify
```

`migrate.sh restore` は既存ファイルを上書きしない（`--force` で上書き）。
`~/.ssh` は 700 / 鍵 600 / 公開鍵 644 に自動正規化され、旧マシンの
push 漏れ manifest も再表示される。

`setup-linux.sh` が行うこと（冪等・再実行安全。ネットワーク操作は
2s/4s バックオフで最大 3 回再試行）:

1. **OS パッケージ**: git / curl / build-essential / Electron 実行ライブラリ
   (libnss3, libgtk-3, libasound2 など。Ubuntu 24.04 の `t64` リネームにも対応) / xvfb
2. **Node.js LTS**: 既に v20 以上があればスキップ、無ければ nvm 経由で導入
3. **npm 依存**: `npm ci`
4. **`--verify` 指定時**: `typecheck` → `npm test` → `verify:all` で全 green を確認
5. **環境診断 (doctor)**: 最後に自動実行。`--doctor` 単体なら診断のみ（副作用ゼロ）

```bash
bash scripts/setup-linux.sh --doctor
```

診断項目: OS / WSL 検出 / Node バージョン / npm 依存 / Electron 共有ライブラリ
(ldconfig) / Xvfb / キーリング (safeStorage の OS 暗号化が効くか) /
git user 設定 / ディスク空き容量。❌（開発不能）が 1 つでもあれば exit 1。

完了したら `npm run dev` で Electron 版が起動すれば移行成功。

## フェーズ 5: サービストークンの再登録

フェーズ 0 の注記の通り、トークンは旧マシンから持ち越せない。
アプリの各サービスページ（または設定ページ）から再登録する。
取得手順は `docs/WEB_SETUP_GUIDE.md`・`docs/OAUTH_SETUP.md` を参照。

GNOME デスクトップ標準の gnome-keyring が動いていれば `safeStorage` の
OS 暗号化がそのまま効く。ヘッドレス / キーリング無し環境では
base64 フォールバックで動作する（`src/main/secrets.ts` 参照）。

## USB レス移行パス

USB メモリを使わずに Linux 開発環境へ移行する 3 つの方法。
**データ移送**と **OS 導入**を分けて考える。

### データ移送: クラウドストレージ経由（全パス共通）

```bash
# 旧マシン: 暗号化バックアップを作成 (AES-256-CBC + PBKDF2 60万回)
bash scripts/migrate.sh backup --encrypt
# → service-hub-migration-*.tar.gz.enc を Google Drive / Dropbox 等にアップロード

# 新マシン: ダウンロードして SHA256 照合 → restore (.enc は自動で復号)
bash scripts/migrate.sh restore service-hub-migration-*.tar.gz.enc
```

SSH 秘密鍵を含むため、**暗号化なしのアーカイブをクラウドに置かない**こと。
パスフレーズはどこにも保存されない（忘れると復元不能）。

### OS 導入A: WSL2（旧マシンが Windows 10/11 — 最も簡単・推奨）

再起動もパーティション変更も不要。PowerShell（管理者）で 1 コマンド:

```powershell
wsl --install -d Ubuntu-24.04
```

ユーザー作成後、Ubuntu ターミナルでフェーズ 4 をそのまま実行
（`migrate.sh restore` → `setup-linux.sh --verify`）。`--doctor` が WSL を
自動検出する。Electron の GUI 表示は WSLg（Windows 11 / 最新の WSL）が担う。
Windows と Linux が共存するため「3 か月試してから完全移行」の試用にも最適。

### OS 導入B: 仮想マシン（VirtualBox / Hyper-V / VMware）

ISO をダウンロードして VM に直接マウントすれば USB は不要。
`make-autoinstall.sh` の生成物も VM の 2 台目ディスク（CIDATA ラベル）として
使える。実ハードウェアの互換性確認はできないが、お試しには十分。

### OS 導入C: ベアメタル直接インストール（非推奨）

USB なしで実機に直接インストールする方法（GRUB loopback ブート、
ネットワークブート等）は存在するが、ブートローダーの手動設定を誤ると
**既存 OS が起動不能になるリスク**があり、自動化による安全ガードも
効かせにくい。実機インストールには素直に USB（フェーズ 1〜2）を使うか、
上記 A/B で十分か先に検討することを推奨。

## トラブルシューティング

まず `bash scripts/setup-linux.sh --doctor` を実行すると、大半の問題は
✅/⚠/❌ で原因まで特定できる。

| 症状 | 対処 |
|---|---|
| Electron が起動せず `libnss3.so` 等のエラー | `--doctor` で不足ライブラリを特定 → `bash scripts/setup-linux.sh` を再実行 |
| SSH 接続が `Permissions are too open` で拒否 | `migrate.sh restore` が自動正規化する。手動なら `chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_*` |
| `npm run smoke` が DISPLAY エラー | xvfb 導入済みか確認（スクリプトが導入する）。CI と同じくヘッドレスで動く |
| NVIDIA で画面が乱れる / 黒画面 | 「追加のドライバー」からプロプライエタリドライバを選択 |
| 日本語入力が効かない | 入力ソースに Mozc があるか確認 → ログアウト / ログイン |
| トークンが消えた | 仕様（マシン固有鍵）。フェーズ 5 の通り再登録 |

## Mac (Apple Silicon) からの移行についての注意

M1 以降の Mac への Linux インストールは Asahi Linux 以外は実用的でない。
その場合は別の PC に Linux を入れるか、リモート開発
（このリポジトリは Claude Code on the web などのリモート Linux 環境でも
そのまま動く）を検討する。
