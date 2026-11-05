"""助言ガード: advice_inbox.md の助言(Grok)と食い違う決定を decisions.md に記録しない。
小さいローカルモデル向けに、まず確実な禁止パターン（正規表現）で判定し、任意で検証モデルにも確認させる。"""
import re
NEG = r"(しない|しません|禁止|避け|触らない|触れない|行わない|やめ|使わない|足さない|追加しない|不採用|議題外|外す|ではない|でない|ではありません|にならない|撤回|取り消|取消|誤り|NG|ダメ|不可)"
# (名前, 理由, 正規表現) — 助言で禁止された内容
RULES = [
    ("dataCrypto実装", "dataCryptoは議題外・触らない（助言: 実装開始は禁止）",
     r"(dataCrypto|データ暗号|暗号化(処理|モジュール)?)[^。\n]{0,30}(実装|作り直|書き直|再実装|移植|改修|修正|着手|開始|置き換|リファクタ)"),
    ("as BufferSource", "as BufferSourceの直接使用・教育は禁止",
     r"as\s*BufferSource|BufferSource[^。\n]{0,20}(直接|使用|使う|教育|教え|周知|研修)"),
    ("Mamoriにas追加", "asをMamoriに足さない（字句で禁止）",
     r"(Mamori|言語)[^。\n]{0,25}(`?as`?\s*(構文|キーワード|演算子)?)[^。\n]{0,10}(追加|導入|足す|サポート|実装|対応)|`as`[^。\n]{0,15}(追加|導入|足す|許可)"),
    ("Mamoriにwhile追加", "Mamoriにwhile文は足さない（不採用）",
     r"while\s*(文|ループ|構文)?[^。\n]{0,15}(追加|導入|足す|実装|サポート|採用)"),
    ("JSON.stringify暗号化", "JSON.stringifyは暗号化ではない",
     r"JSON\.?stringify[^。\n]{0,30}(暗号|秘匿|保護|安全に保存)|JSON化[^。\n]{0,10}(暗号|秘匿)"),
    ("IV定期再生成", "IVは毎回getRandomValues。定期再生成は誤り",
     r"(IV|初期化ベクト?ル|nonce|Nonce|ノンス)[^。\n]{0,20}(定期|周期|一定期間|毎日|毎週|使い回|再利用|固定)"),
    ("正規表現アンカー除去", "正規表現のアンカーを外さない・最適化しない",
     r"(正規表現|regex|RegExp|isHexColor|safeColor)[^。\n]{0,25}(最適化|簡略化|アンカー[^。\n]{0,6}(外|削除|除去|省略)|緩め)|アンカー[^。\n]{0,8}(外す|削除|除去|省略)"),
    ("C++/Python混在", "C++/Python/素のTypeScriptを混ぜない（Mamori/TypeScriptで書く）",
     r"(C\+\+|Python|パイソン)[^。\n]{0,30}(混在|併用|組み合わせ|揃え|統一|混ぜ|書き換|移行|で実装)"),
]
_C = [(n, why, re.compile(rx, re.I)) for n, why, rx in RULES]

def _negated(text, end):
    return re.match(r"[^。\n]{0,16}" + NEG, text[end:]) is not None or re.match(r"(さない|さず|せず)", text[end:]) is not None

def check(decision):
    """違反の [(名前, 理由, 該当箇所)] を返す。空なら記録してよい。否定文（〜しない/禁止 等）は違反としない。"""
    hits = []
    for name, why, rx in _C:
        for m in rx.finditer(decision or ""):
            if _negated(decision, m.end()): continue
            hits.append((name, why, m.group(0))); break
    return hits

def advice_digest(lines, n=12):
    adv = [l.strip().lstrip("- ").replace("[済] ", "") for l in lines if "助言" in l and l.strip().startswith("- ")]
    return "\n".join(a[:220] for a in adv[-n:])
