import os, shutil, tempfile
import advice_guard as g
import decision_lock as d
bad=["決定: dataCryptoの実装を本日から開始する。","決定: 全員にas BufferSourceの使い方を教育する。","決定: Mamoriにasキーワードを追加する。",
"決定: Mamoriにwhile文を導入する。","決定: 設定はJSON.stringifyで暗号化して保存する。","決定: IVを毎週定期的に再生成する。",
"決定: isHexColorの正規表現を最適化する。","決定: C++とPythonを併用して実装する。","決定: 暗号化モジュールを作り直す。","次のアクション:\n- BufferSourceを直接使う方法を周知"]
good=["決定: atlassianSite.tsの移植をsite: 'https://' + parsed.hostname で測る。","決定: dataCryptoには触らない。asをMamoriに足さない。",
"決定: Mamoriにwhile文は追加しない。for (const ch of s) を使う。","決定: JSON.stringifyは暗号化ではないと周知する。","決定: 正規表現のアンカーは外さない。",
"決定: const { email, token } = o; の分割代入の例をdecisions.mdに記録する。","決定: 書き直しだけで移せる残り2本の壁を特定する。","決定: IVは毎回getRandomValuesで生成する既存実装を維持する。"]
for t in bad: assert g.check(t), t
for t in good: assert not g.check(t), (t, g.check(t))

# 助言の禁止パターンが黙っていても、ロック違反として却下ファイルに残す。
silent = ["nonce教育を推進", "新たなnonce導入", "getRandomValuesの再実装"]
for t in silent:
    assert not g.check(t), (t, g.check(t))
    assert any("datacrypto-0927-cancel" in h[0] for h in d.check(t)), (t, d.check(t))
loud = "データ暗号化の実装開始"
assert g.check(loud) and any("datacrypto-0927-cancel" in h[0] for h in d.check(loud))
assert any("llama7B-stop" in h[0] for h in d.check("停止解除は11:45まで遅らせる"))
assert not g.check("停止解除は11:45まで遅らせる")

folder = tempfile.mkdtemp(prefix="council-advice-side-")
try:
    adv, rej = os.path.join(folder, "advice_inbox.md"), os.path.join(folder, "rejected_decisions.md")
    text = "nonce教育を推進"
    outcome, hits = g.intake(text, advice_path=adv, rejected_path=rej)
    body, note = open(rej, encoding="utf-8").read(), open(adv, encoding="utf-8").read()
    assert outcome == "reject" and "datacrypto-0927-cancel" in body and text in body and "却下" in note
    assert "担当役員" not in note
    keep = "決定: llama7Bは停止のまま維持し、再起動しない。"
    outcome, _ = g.intake(keep, advice_path=adv, rejected_path=rej)
    note = open(adv, encoding="utf-8").read()
    assert outcome == "accept" and keep in note and note.count("却下") == 1
finally:
    shutil.rmtree(folder, ignore_errors=True)
print(f"ALL OK bad={len(bad)} good={len(good)} silent_lock={len(silent)}")
