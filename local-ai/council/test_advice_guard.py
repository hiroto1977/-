import advice_guard as g
bad=["決定: dataCryptoの実装を本日から開始する。","決定: 全員にas BufferSourceの使い方を教育する。","決定: Mamoriにasキーワードを追加する。",
"決定: Mamoriにwhile文を導入する。","決定: 設定はJSON.stringifyで暗号化して保存する。","決定: IVを毎週定期的に再生成する。",
"決定: isHexColorの正規表現を最適化する。","決定: C++とPythonを併用して実装する。","決定: 暗号化モジュールを作り直す。","次のアクション:\n- BufferSourceを直接使う方法を周知"]
good=["決定: atlassianSite.tsの移植をsite: 'https://' + parsed.hostname で測る。","決定: dataCryptoには触らない。asをMamoriに足さない。",
"決定: Mamoriにwhile文は追加しない。for (const ch of s) を使う。","決定: JSON.stringifyは暗号化ではないと周知する。","決定: 正規表現のアンカーは外さない。",
"決定: const { email, token } = o; の分割代入の例をdecisions.mdに記録する。","決定: 書き直しだけで移せる残り2本の壁を特定する。","決定: IVは毎回getRandomValuesで生成する既存実装を維持する。"]
for t in bad: assert g.check(t), t
for t in good: assert not g.check(t), (t, g.check(t))
print(f"ALL OK bad={len(bad)} good={len(good)}")
