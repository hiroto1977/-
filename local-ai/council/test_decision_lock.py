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
]
good_dec = [
    "決定: llama7Bは停止のまま維持し、再起動しない。",
    "決定: llama7Bの立ち上げは行わない。",
    "決定: dataCryptoには触らない。IVは毎回getRandomValuesの既存実装を維持する。",
    "決定: 09:27の実装開始とIV更新は取り消したままとする。",
    "決定: サービス健全性は1.5B/3Bのみ確認し、固定停止のllama7Bは対象外とする。",
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
]
good_topic = [
    "llama7Bは停止のまま・起動しないことを再確認する",
    "09:27の実装開始とIV更新を決定文で取り消す",
    "ローカルAI環境の改善（空きメモリ 3000MB / 固定停止: llama7B）",
    "Mamoriの分割代入のテスト例を増やす",
]
for t in bad_topic:
    assert d.check_topic(t), t
for t in good_topic:
    assert not d.check_topic(t), (t, d.check_topic(t))

assert "llama7B-stop" in d.digest()
print(f"ALL OK locks={len(d.locks())} bad_dec={len(bad_dec)} good_dec={len(good_dec)} bad_topic={len(bad_topic)} good_topic={len(good_topic)}")
