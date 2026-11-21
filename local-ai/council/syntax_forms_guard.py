"""既に通る Mamori の2形を消す決定を、decisions.md の通常ブロックにしない。

CEO の locked_decisions.md にはこの項目は無い。解除画面は足さない。
保存の唯一の口 commit_decision と、会議中の guard_check がこの検査を通す。

パーサが受理する形（src/shared/mamori/parser.ts の stmt）:
- 浅いオブジェクト分割。const の直後が { } のときだけ。const [ と let { は無い。
- for (const 名前 of 式)。of だけ。in は無い。

意図規則:
1. 文は「。」と改行で区切り、文の中は「、」と「,」で節に分ける。
2. 保護対象は、束ねた呼び方（2形 / 二形 / 2つの形 / 二つの形 / 通る構文 / 通っている構文。
   「2形残す」も含む）、浅い `const { … } =`、`for (const … of …)` だけ。
   「2形式」「二形態」「通る構文解析」は別の語なので対象にしない。
3. 同じ節で保護対象が「を / は / も / まで」で消去の動詞に結ばれると消去命令。
   動詞は、消す、削除、除去、消去、削る、取り除く、外す、廃止、取り消す、取消、禁止する、潰す、なくす、落とす、やめる。
   「の例 / の説明 / の資料 / の教育 / の文書」が間にあれば、消しているのは資料であり命令にしない。
4. 動詞の残りが、しない・するな・てはならない・残す・維持・誤り・破棄・無効・取りやめ・中止・
   過去の報告（しようとした、と書いた、に逆転した）なら、その場の命令ではない。
   「するなら」は「するな」ではない。仮定の「なら」だけでは命令にせず、後ろの節の消去が勝つ。
   「しなければならない / すべき / と決定する / に読み替える / として扱う」は命令が残る。
5. 「残す」を「消す / 削除」に読み替える・逆転する・と決定する、は消去命令。
   「逆転した」だけの報告で、今から消すと決めていなければ命令ではない。
6. より後ろの節が、同じ対象（2形・通る構文は両方）を残す・削除しない・破棄するなら前の命令は取り消される。
   片方だけ残しても、もう片方の消去は残る。後ろに新しい消去があれば、それが勝つ。
7. かぎ括弧の中も、外側で取り消されていなければ命令として扱う。
   対象だけを示して削除を命じていない引用（記録する、載せる、示す、使う）は命令にしない。
8. 関係ない削除（経費、他の API、while、as、配列の const [、for-in、let の for、let {）は対象外。
   「構文教育は不要」だけでは消去命令ではない。
   「削除を禁止する」「削除を取り消す」は消去の否定であり、命令にしない。
   「削除を禁止しない」も、その場では一続きの名詞句として命令にしない。後ろの節で「消す」と言えばそれが勝つ。
9. 保護対象に触れた決定の中で、別の目的語が無い「削除する / 消す」、および「これは消す」は、その対象への命令として読む。
   語の途中の「は」（やはり）は助詞ではない。
"""
import re
import unicodedata

ID = "mamori-two-forms"
WHY = (
    "パーサが既に受理する2形（浅い const { … } = と for (const … of …)）を消す決定は記録できません。"
    "残す・削除しないは記録できます。"
)

# 「2形残す」は対象。「2形式」「二形態」「通る構文解析」は別の語なので対象にしない。
_BOTH = r"(?:(?<![0-9A-Za-z])2形(?![式態個回次号])|二形(?![態式])|(?:2つ|二つ)の形(?![式態]))"
_SYNTAX = r"(?:通っている構文(?![解])|通る構文(?![解]))"
_DEST = r"const\s*\{[^{}]{0,80}\}\s*=\s*[^をはもまで、,。\n]{0,40}"
_FOR = r"for\s*\(\s*const\s+[A-Za-z_][A-Za-z0-9_]*\s+of\s+[^をはもまで、,。) \n]{0,24}\s*\)?\s*;?"
_TGT = rf"(?:{_DEST}|{_FOR}|{_BOTH}|{_SYNTAX})"
_LINK = r"(?:\s*と\s*" + _TGT + r")?(?:\s*の\s*(?:構文|受理|サポート|対応|実装))?\s*(?:まで|を|は|も)\s*[、,]?\s*(?:いま|今|ただちに|パーサから|言語から|構文から|今期から)?\s*$"
_IMM = re.compile(_TGT + _LINK)
_VERB = re.compile(
    r"(?:取り除く|取り除き|取り消す|取り消し|禁止する|禁止し|禁ずる|やめる|やめ|削除|除去|消去|削る|削り|廃止|廃し|消す|消し|外す|外し|取消|潰す|なくす|無くす|落とす|落とし)"
)
_REV = re.compile(
    rf"(?:{_BOTH}|{_SYNTAX}|const\s*\{{[^{{}}]{{0,60}}\}}\s*=|for\s*\(\s*const\s+\w+\s+of)"
    r".{0,40}?残す.{0,24}?[をとは].{0,18}?(?:消す|消し|削除|「消す」|『消す』)"
)
_SHIFTER = re.compile(r"の(?:例|説明|資料|教育|文章|文書|ドキュメント|記載|サンプル|用例|教材)")
_FOREIGN = re.compile(r"API|api|エンドポイント|経費|費用|予算|科目|椅子|広告|人員|while|配列|アンカー|正規表現|帳票|部品|メモ")
_KEEP_BOTH = re.compile(
    rf"(?:{_BOTH}|{_SYNTAX}).{{0,18}}(?:残す|維持する|維持し|削除しない|消さない|廃止しない|外さない|そのまま)"
    r"|(?:両方|いずれも|二つとも|2つとも).{0,10}(?:残す|維持する|削除しない)"
)
_FORM_NOUN = re.compile(rf"{_BOTH}|{_SYNTAX}|const\s*\{{|for\s*\(\s*const\s+[A-Za-z_][A-Za-z0-9_]*\s+of\b")


def normalize(text):
    """全角英数を畳み、ゼロ幅とバッククォートを外す。意味の切れ目（。）は残す。"""
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("\u3000", " ")
    for ch in ("\u200b", "\u200c", "\u200d", "\ufeff", "\u2060"):
        t = t.replace(ch, "")
    t = t.replace("`", "")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"(?<=[^\W\dA-Za-z_])[ ]+(?=[^\W\dA-Za-z_])", "", t)
    return t


def _kind_of(frag):
    shorthand = re.search(rf"{_BOTH}|{_SYNTAX}", frag) is not None
    dest = "const" in frag and "{" in frag
    forof = re.search(r"for\s*\(\s*const", frag) is not None
    if shorthand or (dest and forof):
        return "all"
    if forof:
        return "forof"
    if dest:
        return "dest"
    return "all"


def _local_tail(text, end):
    rest = text[end:]
    cut = len(rest)
    for sep in "、,。\n":
        i = rest.find(sep)
        if 0 <= i < cut:
            cut = i
    return rest[:cut]


def _tail_cancels(tail):
    """この動詞の残りが、命令を取り消しているなら True。空なら命令は残る。"""
    t = re.sub(r"^[」』\"'）)\s]+", "", tail or "")
    if not t:
        return False
    if re.match(r"なら(?:ば|[、,。\s]|$)", t):
        return True
    # 「削除を禁止 / 取り消す / 破棄」は、削除という言葉が目的語になっただけで命令ではない。
    if re.match(r"[をはも](?:禁止|取り消し|取り消|やめ|中止|無効|破棄)", t):
        return True
    if t.startswith(("なければならない", "しなくてはならない", "する必要がある", "すべき")):
        return False
    if re.match(r"(?:してはならない|てはならない|てはいけない|してはいけない|しない|しません|するな(?![らさ])|せず|せぬ|ません|ない(?:[。\s、,！!？?]|$))", t):
        return True
    if re.match(r"な(?:[。\sよ！!？?、,]|$)", t):
        return True
    if re.search(r"(?:誤り|間違い|無効|破棄|取りやめ)(?:ではない|でない|じゃない)", t):
        return False
    if re.search(r"残す|維持する|維持し", t) and not re.search(r"残す.{0,16}[をとは].{0,12}(?:消|削除)", t):
        return True
    if re.search(r"誤り|間違い|無効|破棄|取りやめ|中止|撤回", t):
        return True
    if re.search(r"読み替えた|読み替えていた|に逆転した|と書いた|と言った|と指摘|しようとした|しそうになった", t):
        return True
    if re.search(r"読み替|と決定|すると決|に逆転する|として扱う", t):
        return False
    if re.search(r"していた", t):
        return True
    if re.match(r"した(?:[。\s、,]|$)", t):
        return True
    return False


def _attach_imm(pre, verb):
    m = _IMM.search(pre)
    if not m:
        return None
    if verb.startswith(("やめ", "止め")) and not re.search(r"(?:サポート|対応|受理|2形|二形|通る構文|通っている構文|const\s*\{|for\s*\()", m.group(0)):
        return None
    return {"kind": _kind_of(m.group(0)), "frag": (m.group(0) + verb).strip()[:80]}


def _foreign(clause):
    """この節に、保護対象とは別の「を / は」の目的語がある。語中の「は」（やはり）は助詞にしない。"""
    if _SHIFTER.search(clause or ""):
        return True
    if _FOREIGN.search(clause or ""):
        return True
    for m in re.finditer(r"([^\sをはも、,]{1,24})(まで|を|は|も)", clause or ""):
        noun, particle = m.group(1), m.group(2)
        nxt = (clause or "")[m.end():m.end() + 1]
        prev = noun[-1:] if noun else ""
        if particle == "は" and re.match(r"[ぁ-ん]", prev) and re.match(r"[ぁ-ん]", nxt or ""):
            continue
        if _FORM_NOUN.search(noun):
            continue
        if noun in ("構文", "受理", "サポート", "対応", "実装", "これ", "それ", "あれ", "この", "その", "上記", "当該"):
            continue
        return True
    return False


def _inherit(pre, clause, verb):
    """目的語が省かれた消去だけ、直前までの保護対象へ結びつける。
    「削除を禁止する / 取り消す」は消去の否定なので、ここでは命令にしない。"""
    if verb.startswith(("やめ", "止め", "禁止", "禁ず")):
        return None
    head = clause[:clause.rfind(verb)] if verb and verb in clause else clause
    if re.search(r"(?:削除|消去|廃止|除去)[をはも]\s*$", head or ""):
        return None
    if _foreign(clause):
        return None
    if not _FORM_NOUN.search(pre):
        return None
    window = pre[-180:]
    return {"kind": _kind_of(window), "frag": (verb + "（対象は直前の2形）").strip()[:80]}


def _orders_in(text, start, end):
    clause = text[start:end]
    found, seen = [], set()
    for m in _VERB.finditer(text):
        if m.start() < start or m.start() >= end:
            continue
        if _tail_cancels(_local_tail(text, m.end())):
            continue
        pre = text[:m.start()]
        hit = _attach_imm(pre, m.group(0)) or _inherit(pre, clause, m.group(0))
        if not hit or m.start() in seen:
            continue
        seen.add(m.start())
        found.append(hit)
    for m in _REV.finditer(text):
        verb_at = m.start() + (m.group(0).rfind("消") if "消" in m.group(0) else m.group(0).rfind("削除"))
        if verb_at < start or verb_at >= end:
            continue
        if _tail_cancels(_local_tail(text, m.end())):
            continue
        if any(abs(verb_at - s) < 2 for s in seen):
            continue
        found.append({"kind": _kind_of(m.group(0)), "frag": m.group(0).strip()[:80]})
    return found


def _bare_keep(clause):
    return re.fullmatch(
        r"\s*(?:やはり|やっぱり|いや|ではなく|ではな|ので|ただし|結局)?\s*(?:残す|残し|維持する|維持し|削除しない|消さない|取りやめ|中止|無効|破棄)\s*",
        clause or "",
    ) is not None


def _clears(clause):
    """この節が、前にある2形の消去命令を取り消す。"""
    if not clause:
        return False
    if _bare_keep(clause):
        return True
    if re.search(r"実施してはなら|記録してはなら|採用してはなら|従ってはなら", clause):
        return True
    if _foreign(clause) and not _FORM_NOUN.search(clause):
        return False
    if re.search(r"(?:削除|消去|廃止|除去|消すこと|外すこと)(?:は|を|の)?(?:しない|しません|してはなら|てはなら|禁止)", clause):
        return True
    if re.search(r"(?:削除|消去|消す案|消すの|廃止)(?:は|を)?(?:無効|破棄|取りやめ|中止|誤り|撤回)", clause):
        if re.search(r"(?:無効|破棄|誤り|取りやめ)(?:ではない|でない|じゃない)", clause):
            return False
        return True
    if re.search(r"(?:その|この|上記の|先の)決定は(?:無効|破棄|誤り|取りやめ|撤回)", clause):
        return True
    if re.search(r"誤り|間違い", clause) and _FORM_NOUN.search(clause):
        if re.search(r"誤り(?:ではない|でない|じゃない)", clause):
            return False
        return True
    return False


def _kept(clause):
    kinds = set()
    if _KEEP_BOTH.search(clause):
        kinds.add("all")
    if re.search(r"削除を禁止|消去を禁止|廃止を禁止", clause) and _FORM_NOUN.search(clause):
        kinds.add("all")
    if re.search(_DEST, clause) and re.search(r"残す|維持する|維持し|削除しない|消さない|廃止しない", clause):
        kinds.add("dest")
    if re.search(_FOR, clause) and re.search(r"残す|維持する|維持し|削除しない|消さない|廃止しない", clause):
        kinds.add("forof")
    if "dest" in kinds and "forof" in kinds:
        kinds.add("all")
    return kinds


def _kept_cancels(kinds, order):
    if "all" in kinds:
        return True
    if order["kind"] == "all":
        return False
    return order["kind"] in kinds


def _spans(text):
    parts, start = [], 0
    for m in re.finditer(r"[。\n、,]+", text):
        if text[start:m.start()].strip():
            parts.append((start, m.start()))
        start = m.end()
    if text[start:].strip():
        parts.append((start, len(text)))
    return parts


def check(decision):
    """消去命令が残れば [(mamori-two-forms, 理由, 該当)]。空なら記録してよい。"""
    text = normalize(decision)
    active = []
    for a, b in _spans(text):
        clause = text[a:b].strip()
        if _clears(clause):
            active = []
        else:
            kinds = _kept(clause)
            active = [o for o in active if not _kept_cancels(kinds, o)]
        active.extend(_orders_in(text, a, b))
    if not active:
        return []
    return [(ID, WHY, active[-1]["frag"])]
