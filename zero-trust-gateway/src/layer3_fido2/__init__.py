# 第 3 層: 物理キーとスマホのパスキーの二重確認 (WebAuthn)。ARCHITECTURE_V2.md §3.3。
#
#   store.py      … 認証器の控え (公開鍵・ID・署名カウンタだけ)
#   enrollment.py … 最初の認証器を登録するための、1 回きりの登録コード
#   challenges.py … 確認のたびに出す乱数 (1 回きり・120 秒)
#   verify.py     … 応答の検め (署名と形はライブラリ・この入口の決まりを足す)
#   sessions.py   … いまの認証の強さ (端末の鍵ごと)
#   service.py    … 登録と確認の流れの窓口
