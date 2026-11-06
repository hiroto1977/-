"""固定決定（CEOロック）: locked_decisions.md の status: locked を評議会と start-all が拘束する。
解除は CEO（清継）が該当項目の status を unlocked に書き換えたときだけ。文言では外れない。

意図規則（保存前・議題取り込みの共通）:
文は「。」と改行で区切り、文の中は読点で節に分ける。
節の中の禁止行為は、その節の残りで否定・破棄・無効・抵触・取消されていないときだけ命令とする。
より後ろの節にある破棄・無効・抵触・取りやめ・中止、または同じ行為の否定は、それより前の命令を取り消す。
後ろに新しい命令があれば、それが勝つ。かぎ括弧の引用も、取り消されなければ命令として扱う。

迂回基盤（llama7B-stop が locked のあいだ。別のロック項目にはしない）:
停止対象（llama7B / 固定停止 / 7B級 / 7Bモデル / Qwen2.5-7B / :8086 / ポート8086）が決定文に現れ、
同じ命令が次の手段を新設・導入・構築・実装するなら却下する。
手段: メモリ管理プラットフォーム、システムレベルメモリ制御、再起動ツール・再起動機構。
制御プレーン・制御基盤は、同じ文に停止対象があるときだけ。
DB圧縮・データベース圧縮・リーク掃除・冗長化・監視は、同じ文で停止対象の仕事を戻す・停止を解消する・
迂回する・再稼働させる目的が、手段の直後（で / により / して）に生きているときだけ。
手段の動詞やその目的が、節の中で否定・破棄・無効・「するな」「せず」なら命令ではない。
より後ろの節の同じ行為の否定、または「停止のまま」「対象外」は、それより前の迂回命令を取り消す。
後ろに新しい構築命令があれば、それが勝つ。かぎ括弧の引用も、取り消されなければ命令として扱う。
業務アプリのプラットフォーム開発、手段だけの言及（停止対象が無い）、空きメモリの数値だけ、
起動を命じない汎用監視、停止の維持、解除の破棄は命令にしない。
「。」と改行は文の区切り。ただし名詞が助詞で終わり次の文が構築動詞だけ、または名詞が改行で分断されているときは、
その2文を1つの命令として見る。
"""
import datetime, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
NEG = r"(しない|しません|禁止|避け|触らない|触れない|行わない|やめ|使わない|足さない|追加しない|不採用|議題外|外す|ではない|でない|ではありません|にならない|撤回|取り消|取消|誤り|NG|ダメ|不可|抑制|控える|見送)"

_cache = {"mtime": None, "locks": []}

_LLAMA_EXTRA = re.compile(
    r"llama7B[^。\n]{0,48}?(?:固定停止を解除|停止を解除|ロックを?解除)"
    r"|固定停止を解除|固定停止の解除"
    r"|memorieset[^。\n]{0,16}?(?:を実施|実施する|実施して|を実行|実行する|を開始|開始する|をロード|ロードする|を起動|起動する)"
    r"|メモリセット[^。\n]{0,12}?(?:を実施|実施する|実施して|を実行|実行する|をロード|ロードする)"
    r"|(?<![0-9A-Za-z])7Bを(?:起動|再起動|立ち上げ|ロード|再開)"
    r"|(?<![0-9A-Za-z])7Bの固定停止を解除"
    r"|(?<![0-9A-Za-z])7Bモデル[^。\n]{0,12}?(?:を)?(?:起動|再起動|立ち上げ|ロード)",
    re.I)
_CRYPTO_EXTRA = re.compile(
    r"(?:dataCrypto|データ暗号|IV|nonce|Nonce|ノンス)[^。\n]{0,32}?ロックを?解除"
    r"|(?:nonce|Nonce|ノンス)[^。\n]{0,18}?(?:を導入|導入する|導入します|導入して|導入を進|を再実装|再実装する(?!口)|を作り直|作り直す(?!な)|作り直して)"
    r"|IVを開き直|IV更新を再開|IVのロックを?解除|IVロック解除|IVを再開"
    r"|ノンスを作り直|ノンスを導入",
    re.I)
_EXTRAS = {"llama7B-stop": _LLAMA_EXTRA, "datacrypto-0927-cancel": _CRYPTO_EXTRA}
_FAM = {"llama7B-stop": "llama", "datacrypto-0927-cancel": "crypto"}

# 停止を迂回する新規基盤。llama7B-stop が locks() にいるときだけ _bypass_make が使う。
_ANCHOR = re.compile(
    r"llama7B|Qwen2\.5-7B|7B級|7Bモデル|固定停止|:\s*8086|ポート\s*8086", re.I)
_NOUN_DOC = re.compile(
    r"メモリ管理プラットフォーム|メモリ管理のプラットフォーム|メモリを管理するプラットフォーム|メモリ管理の仕組み|"
    r"システムレベル(?:の)?メモリ制御|システムレベルでメモリを制御(?:する仕組み)?|"
    r"再起動ツール|再起動のツール|再起動用ツール|再起動機構|再起動の仕組み|再起動用の仕組み",
    re.I)
_NOUN_SENT = re.compile(
    r"メモリ制御プレーン|メモリ制御基盤|代替のメモリ制御プレーン|代替メモリ制御プレーン|"
    r"代替制御プレーン|代替の制御プレーン|制御プレーン|制御基盤",
    re.I)
_NOUN_B = re.compile(r"DB圧縮|データベース(?:を)?圧縮|リーク掃除|冗長化|監視", re.I)
_TIED = re.compile(
    r"(?:llama7B|Qwen2\.5-7B|7B級|7Bモデル|固定停止|:\s*8086|ポート\s*8086|処理|仕事|停止)"
    r".{0,12}?"
    r"(?:戻す|戻し|戻せ|再稼働|解消|(?<!未)解決|復旧|復活|載せ|使えるように|置き換|迂回|再ロード|再読込|起動し直)"
    r"|(?:戻す|戻し|再稼働|解消|解決|復旧|復活|載せ|使えるように|置き換|迂回)"
    r".{0,12}?"
    r"(?:llama7B|7B級|7Bモデル|固定停止|処理|仕事|:\s*8086)",
    re.I)
_VERB_AFTER = re.compile(
    r"^(?:[をのはがもで]|の仕組み|の基盤|のツール|のための|、|,|，|\s){0,8}"
    r"(構築|導入|新設|実装|開発|設置|用意|作成|作り|作る|立て|立つ)")
_VERB_DEAD = re.compile(
    r"^(?:[をのはがもで]|の仕組み|の基盤|のツール|のための|、|,|，|\s){0,8}"
    r"(?:作らない|作らず|作るな|立てない|立てず|設けない|設けず)")
_VERB_FIX = re.compile(r"^(?:により|によって|で)(直す|正す)")
_MEANS = re.compile(r"^(?:により|によって|で|して)")

def _negated(text, end):
    return re.match(r"[^。\n]{0,16}" + NEG, text[end:]) is not None or re.match(r"(さない|さず|せず)", text[end:]) is not None

def normalize(text):
    """全角英数・llama 7B の空白・日本語の間の空白を畳む。意味の違う 17B は残す。"""
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("\u3000", "")
    t = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"(?i)llama\s*7\s*b", "llama7B", t)
    t = re.sub(r"(?i)(?<![A-Za-z0-9])7\s*b(?![A-Za-z0-9])", "7B", t)
    t = re.sub(r"(?<=[^\W\dA-Za-z_])[ ]+(?=[^\W\dA-Za-z_])", "", t)
    return t

def _parse(text):
    locks = []
    blocks = re.split(r"(?m)^##\s+", text or "")
    for b in blocks[1:]:
        lines = b.splitlines()
        if not lines: continue
        lid = lines[0].strip().split()[0]
        fields = {"id": lid}
        body = "\n".join(lines[1:])
        for m in re.finditer(r"(?m)^-\s*([a-z_]+)\s*:\s*(.+)$", body):
            fields[m.group(1)] = m.group(2).strip()
        if fields.get("status", "").lower() != "locked":
            continue
        lock = {
            "id": lid,
            "title": fields.get("title", lid),
            "reason": fields.get("reason", ""),
            "service": fields.get("service") or None,
            "cancels": fields.get("cancels") or None,
            "locked_at": fields.get("locked_at", ""),
            "locked_by": fields.get("locked_by", "CEO"),
            "forbid": re.compile(fields["forbid"], re.I) if fields.get("forbid") else None,
            "topic_forbid": re.compile(fields["topic_forbid"], re.I) if fields.get("topic_forbid") else None,
        }
        locks.append(lock)
    return locks

def reload(force=False):
    path = LOCK_PATH
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        _cache["mtime"] = None; _cache["locks"] = []; return []
    if not force and _cache["mtime"] == mtime and _cache.get("path") == path:
        return _cache["locks"]
    locks = _parse(open(path, encoding="utf-8").read())
    _cache["mtime"] = mtime; _cache["path"] = path; _cache["locks"] = locks
    return locks

def locks():
    return reload()

def digest(n=12):
    ls = locks()
    if not ls: return "（固定決定なし）"
    lines = []
    for L in ls[:n]:
        extra = f" / 取消対象: {L['cancels']}" if L.get("cancels") else ""
        if L.get("service"): extra += f" / サービス: {L['service']}は起動しない"
        lines.append(f"- [{L['id']}] {L['title']}（{L['reason'][:120]}{extra}）")
    return "\n".join(lines)

def forced_down_services():
    return {L["service"] for L in locks() if L.get("service")}

def _sentences(text):
    return [s.strip() for s in re.split(r"[。\n]+", text) if s.strip()]

def _clauses(sent):
    parts = []
    start = 0
    for m in re.finditer(r"[、,，]", sent):
        chunk = sent[start:m.start()]
        if chunk.strip():
            parts.append((chunk, start, m.start()))
        start = m.end()
    tail = sent[start:]
    if tail.strip():
        parts.append((tail, start, len(sent)))
    return parts or [(sent, 0, len(sent))]

def _clause_tail(sentence, end):
    rest = sentence[end:]
    cut = len(rest)
    for sep in "、,，":
        i = rest.find(sep)
        if 0 <= i < cut:
            cut = i
    return rest[:cut]

def _repudiated(sentence, start, end):
    """この一致が、同じ節の中で否定・破棄・無効・抵触されているなら命令ではない。"""
    after = _clause_tail(sentence, end)
    if re.search(r"(無効|破棄|取消|禁止|取りやめ|中止)(ではない|でない|じゃない)", after[:24]):
        return False
    if re.match(r"\s*(しなければ|しなければならない|する必要|しなくては)", after):
        return False
    if re.match(r"な(?!い|る|っ)", after):
        return True
    if _negated(sentence, end):
        return True
    if re.search(r"してはならな|てはならな|てはいけな|できません", after[:24]):
        return True
    if re.search(r"(を|は|も)?(破棄|無効)", after[:18]) and not re.search(r"(破棄|無効)(ではない|でない|しない)", after[:18]):
        return True
    if re.search(r"抵触|覆せな|覆せませ", after[:24]):
        return True
    window = sentence[start:end]
    if re.search(r"(を|は)破棄", window):
        return True
    return False

def _act_dead(sentence, start, end):
    """迂回手段の動詞・目的が、この節で否定・破棄・無効・するな なら生きた命令ではない。"""
    if _repudiated(sentence, start, end):
        return True
    tail = _clause_tail(sentence, end)
    if re.search(r"してはならな|てはならな|てはいけな|実施してはならな", tail):
        return True
    if re.match(r"(?:するな|すな|せず|しないで|しない)", tail):
        return True
    if re.search(r"(?:構築|導入|新設|実装|開発|設置|用意|作成|圧縮)(?:しない|せず|するな)", tail):
        return True
    return False

def _bound_verb(sent, end):
    """手段名詞の直後の構築動詞。('live', 語) / ('dead', 語) / ('absent', None)。"""
    after = sent[end:end+24]
    if _VERB_DEAD.match(after):
        return "dead", "作る"
    m = _VERB_FIX.match(after)
    if m:
        vs, ve = end + m.start(1), end + m.end(1)
        return ("dead" if _act_dead(sent, vs, ve) else "live"), m.group(1)
    m = _VERB_AFTER.match(after)
    if not m:
        return "absent", None
    vs, ve = end + m.start(1), end + m.end(1)
    return ("dead" if _act_dead(sent, vs, ve) else "live"), m.group(1)

def _tied_after(sent, end):
    """手段の直後が「で / により / して」で、停止対象を戻す目的が生きているならその語。"""
    after = sent[end:end+64]
    if not _MEANS.match(after):
        return None
    for m in _TIED.finditer(sent):
        if end <= m.start() <= end + 64 and not _act_dead(sent, m.start(), m.end()):
            return m.group(0)
    return None

def _tied_before(sent, start):
    """「停止を解消するため、手段」のように、目的が手段の直前で生きているならその語。"""
    before = sent[max(0, start - 28):start]
    if not re.search(r"(?:のため|するため)、?$", before):
        return None
    for m in _TIED.finditer(sent):
        if start - 28 <= m.end() <= start and not _act_dead(sent, m.start(), m.end()):
            return m.group(0)
    return None

def _bypass_make(blob, lock, topic, doc_anchor, base_len):
    """blob 内の生きた迂回命令。span は元の文（base_len）に収める。"""
    if not doc_anchor:
        return []
    sent_anchor = _ANCHOR.search(blob) is not None
    found = []
    for rx, kind in ((_NOUN_DOC, "doc"), (_NOUN_SENT, "sent"), (_NOUN_B, "b")):
        for m in rx.finditer(blob):
            found.append((m.start(), m.end(), m.group(0), kind))
    orders = []
    for start, end, noun, kind in found:
        if kind != "doc" and not sent_anchor:
            continue
        if kind == "b" and not sent_anchor:
            continue
        state, verb = _bound_verb(blob, end)
        purpose = None
        if state == "dead":
            continue
        if state != "live":
            purpose = _tied_after(blob, end) or _tied_before(blob, start)
            if not purpose:
                continue
        if _act_dead(blob, start, end):
            continue
        span_end = min(end, base_len)
        span_start = min(start, max(0, span_end - 1))
        if span_end <= 0:
            continue
        keys = [noun]
        if verb:
            keys.append(verb)
        if purpose:
            keys.append(purpose)
        orders.append({
            "lid": lock["id"], "fam": "llama", "bypass": True, "keys": keys,
            "start": span_start, "end": span_end, "frag": noun,
            "hit": _hit(lock, noun, topic), "placed": False,
        })
        break
    return orders

def _patterns(lock, topic):
    found = []
    if lock.get("forbid"):
        found.append(lock["forbid"])
    if topic and lock.get("topic_forbid"):
        found.append(lock["topic_forbid"])
    extra = _EXTRAS.get(lock["id"])
    if extra:
        found.append(extra)
    return found

def _hit(lock, frag, topic):
    if topic:
        return (f"固定議題:{lock['id']}", f"固定決定『{lock['title']}』に反する議題のため却下", frag)
    return (f"固定:{lock['id']}", f"CEOロック『{lock['title']}』を覆せません。解除は清継さんが locked_decisions.md の status を unlocked に変更したときだけ。理由: {lock['reason'][:100]}", frag)

def _sentence_orders(sent, topic, joined=None, doc_anchor=False):
    orders = []
    seen = set()
    for L in locks():
        for rx in _patterns(L, topic):
            for m in rx.finditer(sent):
                if _repudiated(sent, m.start(), m.end()):
                    continue
                key = (L["id"], m.start(), m.end())
                if key in seen:
                    continue
                seen.add(key)
                orders.append({
                    "lid": L["id"], "fam": _FAM.get(L["id"], "other"),
                    "start": m.start(), "end": m.end(), "frag": m.group(0),
                    "hit": _hit(L, m.group(0), topic), "placed": False,
                })
        if L["id"] == "llama7B-stop" and "即再起動" in sent and re.search(r"llama7B|固定停止|memorieset|メモリセット|(?<![0-9A-Za-z])7B", sent, re.I):
            for m in re.finditer("即再起動", sent):
                if _repudiated(sent, m.start(), m.end()):
                    continue
                orders.append({
                    "lid": L["id"], "fam": "llama", "start": m.start(), "end": m.end(),
                    "frag": m.group(0), "hit": _hit(L, m.group(0), topic), "placed": False,
                })
        if L["id"] == "llama7B-stop":
            blob = joined if joined is not None else sent
            for o in _bypass_make(blob, L, topic, doc_anchor, len(sent)):
                orders.append(o)
    if re.search(r"ロック[をは]?解除", sent):
        want = []
        if re.search(r"llama7B|固定停止|memorieset|メモリセット|(?<![0-9A-Za-z])7B", sent, re.I):
            want.append("llama7B-stop")
        if re.search(r"dataCrypto|データ暗号|IV|nonce|Nonce|ノンス|09:27", sent, re.I):
            want.append("datacrypto-0927-cancel")
        by_id = {L["id"]: L for L in locks()}
        for m in re.finditer(r"ロック[をは]?解除", sent):
            if _repudiated(sent, m.start(), m.end()):
                continue
            for lid in want:
                L = by_id.get(lid)
                if not L:
                    continue
                orders.append({
                    "lid": lid, "fam": _FAM.get(lid, "other"), "start": m.start(), "end": m.end(),
                    "frag": m.group(0), "hit": _hit(L, m.group(0), topic), "placed": False,
                })
    return orders

def _specific_cancel(clause, order):
    if not re.search(r"(しない|禁止|破棄|無効|中止|取りやめ|ならない|行わない)", clause):
        return False
    if re.search(r"(しない|禁止|破棄|無効)(ではない|でない)", clause):
        return False
    frag = order["frag"]
    for token in ("memorieset", "メモリセット", "再起動", "立ち上げ", "ロード", "開き直", "導入", "解除", "起動"):
        if token in frag and token in clause:
            return True
    return False

def _cancels(clause, order):
    if re.search(r"(破棄|無効|取りやめ|中止|不採用)(しない|ではな|じゃない)", clause):
        return False
    if re.search(r"無効", clause) and not re.search(r"無効(ではない|でない|じゃない)", clause):
        return True
    if re.search(r"(を破棄|は破棄|も破棄|取りやめ|中止|不採用|記録しない|に抵触|は抵触|抵触する|覆せな|覆せませ|してはならな|てはならな|てはいけな)", clause):
        return True
    fam = order["fam"]
    if fam == "llama" and re.search(r"(停止のまま|起動しない|再開しない|ロックを維持|ロック維持|対象外)", clause):
        return True
    if fam == "crypto" and re.search(r"(再着手しない|触らない|取消を維持|取り消したまま|実装しない|導入しない|開き直さない|更新しない)", clause):
        return True
    if order.get("bypass"):
        for key in order.get("keys", ()):
            idx = 0
            while True:
                i = clause.find(key, idx)
                if i < 0:
                    break
                if _act_dead(clause, i, i + len(key)):
                    return True
                idx = i + len(key)
        if re.search(r"実施(?:は|を)?しない", clause):
            return True
        blob = "\n".join(order.get("keys") or [])
        undos = (
            ("戻", r"戻さない|戻さず|戻せない|戻すな|戻(?:は|を|も)?(?:しない|せず)"),
            ("解消", r"解消(?:は|を|も)?(?:しない|せず|するな)"),
            ("解決", r"解決(?:は|を|も)?(?:しない|せず|するな)"),
            ("置き換", r"置き換え(?:は|を|も)?(?:ない|ず|しない)"),
            ("再稼働", r"再稼働(?:は|を|も)?(?:しない|せず)"),
            ("迂回", r"迂回(?:は|を|も)?(?:しない|せず)"),
            ("復旧", r"復旧(?:は|を|も)?(?:しない|せず)"),
            ("載せ", r"載せ(?:は|を|も)?(?:ない|ず)|載(?:は|を|も)?(?:しない|せず)"),
            ("使えるように", r"使えるように(?:は|も)?(?:しない|せず)"),
        )
        for stem, pat in undos:
            if stem in blob and re.search(pat, clause) and not re.search(r"(?:" + pat + r")(?:のではない|ではない|でない)", clause):
                return True
    return _specific_cancel(clause, order)

def _join_bypass(sent, nxt):
    """改行で分断された「手段を / 構築する」と、名詞の途中改行を1つの命令に戻す。"""
    if not nxt:
        return sent
    if re.search(r"[をのでに]$", sent) and re.match(
            r"(?:構築|導入|新設|実装|開発|設置|用意|作成|作ら|作る|作り|立て)", nxt):
        return sent + nxt
    cat = sent + nxt
    crossed = False
    for rx in (_NOUN_DOC, _NOUN_SENT, _NOUN_B):
        for m in rx.finditer(cat):
            if m.start() < len(sent) < m.end():
                crossed = True
                break
        if crossed:
            break
    return cat if crossed else sent

def _collect(text, topic):
    """残った命令の [(名前, 理由, 該当)]。空なら記録・受理してよい。"""
    text = normalize(text)
    active = []
    sents = _sentences(text)
    doc_anchor = _ANCHOR.search(text) is not None
    for i, sent in enumerate(sents):
        nxt = sents[i + 1] if i + 1 < len(sents) else ""
        joined = _join_bypass(sent, nxt)
        orders = _sentence_orders(sent, topic, joined=joined, doc_anchor=doc_anchor)
        for ctext, a, b in _clauses(sent):
            active = [o for o in active if not _cancels(ctext, o)]
            for o in orders:
                if o["placed"]:
                    continue
                if a <= o["end"] - 1 < b:
                    active.append(o)
                    o["placed"] = True
    hits, seen = [], set()
    for o in active:
        if o["lid"] in seen:
            continue
        seen.add(o["lid"])
        hits.append(o["hit"])
    return hits

def check(decision):
    """決定文が固定決定を覆すなら [(名前, 理由, 該当箇所)]。否定・破棄・維持は違反にしない。"""
    return _collect(decision, topic=False)

def check_topic(topic):
    """議題が固定決定の復活・覆しを求めるなら [(名前, 理由, 該当箇所)]。
    取消・維持・停止の確認、ロックを守る引用は許可。再開・解除・起動・再着手は却下。"""
    return _collect(topic, topic=True)

def _stamp():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def _fmt_hits(hits):
    lines = []
    for h in hits or []:
        if isinstance(h, tuple):
            n, why, frag = h
            lines.append(f"- {n}: {why}（該当: {frag}）")
        else:
            lines.append(f"- {h}")
    return lines

def append_rejection(path, topic, body, hits, retry=False):
    """rejected_decisions.md にだけ足す。decisions.md には書かない。"""
    label = "やり直し後も矛盾・不記録" if retry else "保存前検査で却下"
    block = f"\n## {_stamp()} {str(topic)[:80]}（{label}）\n\n理由:\n" + "\n".join(_fmt_hits(hits)) + f"\n\n却下した決定:\n\n{body}\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(block)

def append_decision(path, dec, topic, summary, review, src, officer):
    topic_line = (topic or dec or "").replace("\n", " ")[:120]
    block = f"\n## {_stamp()} [{src}] {topic_line}\n\n担当役員: {officer}\n\n{dec}\n"
    if summary:
        block += f"\nCOO総括: {summary}\n"
    if review:
        block += f"\n議長: {review}\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(block)

def commit_decision(dec, *, decisions_path, rejected_path, topic="", summary="", review="", src="会議", officer="CQO"):
    """保存直前の唯一の書き込み口。命令が残れば却下ログだけ、無ければ decisions.md だけ。"""
    import advice_guard
    blob = "\n".join(p for p in (dec or "", summary or "", review or "") if p)
    hits = list(check(blob))
    for h in advice_guard.check(blob):
        hits.append(h)
    if hits:
        append_rejection(rejected_path, topic or (dec or "")[:80], blob, hits, retry=False)
        return "reject", hits
    append_decision(decisions_path, dec or "", topic, summary, review, src, officer)
    return "accept", []

def public():
    return [{"id": L["id"], "title": L["title"], "reason": L["reason"][:200], "service": L.get("service"),
             "cancels": L.get("cancels"), "locked_at": L.get("locked_at"), "locked_by": L.get("locked_by")}
            for L in locks()]
