import os, shutil, tempfile
import decision_lock as d
d.LOCK_PATH = d.LOCK_PATH  # use real file beside this test
d.reload(force=True)
assert any(L["id"] == "llama7B-stop" for L in d.locks()), d.locks()
assert any(L["id"] == "datacrypto-0927-cancel" for L in d.locks())
assert "llama7B" in d.forced_down_services()

bad_dec = [
    "決定: llama7Bを再起動してサービスを復旧する。",
    "決定: 空きメモリに余裕があるため7Bモデルを立ち上げる。",
    "次のアクション:\n- llama7Bのロードを開始する",
    "決定: dataCryptoの実装を本日から開始する。",
    "決定: IVの生成方法を確認・更新します。",
    "決定: 09:27の実装開始とIVを再開する。",
    "停止解除は11:45まで遅らせる",
    "解除を11:45まで遅らせる",
    "11:45まで停止解除を保留",
    "nonce教育を推進",
    "新たなnonce導入",
    "getRandomValuesの再実装",
    "データ暗号化の実装開始",
]
good_dec = [
    "決定: llama7Bは停止のまま維持し、再起動しない。",
    "決定: llama7Bの立ち上げは行わない。",
    "決定: dataCryptoには触らない。IVは毎回getRandomValuesの既存実装を維持する。",
    "決定: 09:27の実装開始とIV更新は取り消したままとする。",
    "決定: サービス健全性は1.5B/3Bのみ確認し、固定停止のllama7Bは対象外とする。",
    "停止解除は11:45まで遅らせない",
    "停止解除を破棄する",
    "来期の売上目標は7Bで、費用の見直しを開始する。",
    "nonce教育は推進しない",
    "新たなnonce導入は行わない",
    "getRandomValuesの再実装はしない",
    "予算の解除を11:45まで遅らせる",
    "契約解除を来月まで延期する",
    "IVは毎回getRandomValuesの既存実装を維持する。",
]
for t in bad_dec:
    assert d.check(t), t
for t in good_dec:
    assert not d.check(t), (t, d.check(t))

bad_topic = [
    "llama7Bを再起動してメモリ再分配する",
    "停止中のモデル（llama7B）を立ち上げる手順を決める",
    "09:27の実装開始とIV更新を進める",
    "dataCryptoの実装開始を再開する",
    "停止解除は14:41まで遅らせる",
    "nonce教育を推進する",
]
good_topic = [
    "llama7Bは停止のまま・起動しないことを再確認する",
    "09:27の実装開始とIV更新を決定文で取り消す",
    "ローカルAI環境の改善（空きメモリ 3000MB / 固定停止: llama7B）",
    "Mamoriの分割代入のテスト例を増やす",
    "停止解除は行わない",
    "予算解除は11:45まで遅らせる",
    "教育を推進する",
]
for t in bad_topic:
    assert d.check_topic(t), t
for t in good_topic:
    assert not d.check_topic(t), (t, d.check_topic(t))

assert "llama7B-stop" in d.digest()

def ids(text):
    return [h[0] for h in d.check(text)]
assert "固定:llama7B-stop" in ids("停止解除は11:45まで遅らせる")
assert "固定:llama7B-stop" in ids("解除を〜まで遅らせる")
assert "固定:llama7B-stop" in ids("14:41まで停止解除を保留する")
assert "固定:datacrypto-0927-cancel" in ids("nonce教育を推進")
assert "固定:datacrypto-0927-cancel" in ids("新たなnonce導入")
assert "固定:datacrypto-0927-cancel" in ids("getRandomValuesの再実装")
assert "固定:datacrypto-0927-cancel" in ids("データ暗号化の実装開始")

folder = tempfile.mkdtemp(prefix="council-lock-side-")
try:
    dec_p, rej_p = os.path.join(folder, "decisions.md"), os.path.join(folder, "rejected_decisions.md")
    late = "停止解除は11:45まで遅らせる"
    outcome, _ = d.commit_decision(late, decisions_path=dec_p, rejected_path=rej_p, topic="14:41", officer="CQO")
    dec = open(dec_p, encoding="utf-8").read() if os.path.exists(dec_p) else ""
    rej = open(rej_p, encoding="utf-8").read()
    assert outcome == "reject" and "担当役員" not in dec and "## " not in dec
    assert "llama7B-stop" in rej and late in rej
    soft = "getRandomValuesの再実装"
    outcome, _ = d.commit_decision(soft, decisions_path=dec_p, rejected_path=rej_p, topic="16:20", officer="CQO")
    dec = open(dec_p, encoding="utf-8").read() if os.path.exists(dec_p) else ""
    rej = open(rej_p, encoding="utf-8").read()
    assert outcome == "reject" and "担当役員" not in dec and soft not in dec
    assert "datacrypto-0927-cancel" in rej and soft in rej
    keep = "決定: llama7Bは停止のまま維持し、再起動しない。"
    outcome, _ = d.commit_decision(keep, decisions_path=dec_p, rejected_path=rej_p, topic="維持", officer="CQO")
    dec = open(dec_p, encoding="utf-8").read()
    assert outcome == "accept" and "担当役員" in dec and keep in dec and late not in dec
finally:
    shutil.rmtree(folder, ignore_errors=True)

print(f"ALL OK locks={len(d.locks())} bad_dec={len(bad_dec)} good_dec={len(good_dec)} bad_topic={len(bad_topic)} good_topic={len(good_topic)}")
