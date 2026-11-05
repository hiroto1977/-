"""固定決定（CEOロック）: locked_decisions.md の status: locked を評議会と start-all が拘束する。
解除は CEO（清継）が該当項目の status を unlocked に書き換えたときだけ。"""
import os, re, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_PATH = os.path.join(HERE, "locked_decisions.md")
NEG = r"(しない|しません|禁止|避け|触らない|触れない|行わない|やめ|使わない|足さない|追加しない|不採用|議題外|外す|ではない|でない|ではありません|にならない|撤回|取り消|取消|誤り|NG|ダメ|不可|抑制|控える|見送)"

_cache = {"mtime": None, "locks": []}

def _negated(text, end):
    return re.match(r"[^。\n]{0,16}" + NEG, text[end:]) is not None or re.match(r"(さない|さず|せず)", text[end:]) is not None

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
    if not force and _cache["mtime"] == mtime:
        return _cache["locks"]
    locks = _parse(open(path, encoding="utf-8").read())
    _cache["mtime"] = mtime; _cache["locks"] = locks
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

def check(decision):
    """決定文が固定決定を覆すなら [(名前, 理由, 該当箇所)]。否定文は違反にしない。"""
    hits = []
    text = decision or ""
    for L in locks():
        rx = L.get("forbid")
        if not rx: continue
        for m in rx.finditer(text):
            if _negated(text, m.end()): continue
            hits.append((f"固定:{L['id']}", f"CEOロック『{L['title']}』を覆せません。解除は清継さんが locked_decisions.md の status を unlocked に変更したときだけ。理由: {L['reason'][:100]}", m.group(0)))
            break
    return hits

def check_topic(topic):
    """議題が固定決定の復活・覆しを求めるなら [(名前, 理由, 該当箇所)]。
    取消・維持・停止の確認は許可。再開・復活・起動・再着手は却下。"""
    hits = []
    text = topic or ""
    reinforcing = re.search(
        r"(取消|取り消|取り消し|停止のまま|起動しない|再開しない|維持|固定|ロック維持|触らない|議題外|禁止)", text)
    overturning = re.search(
        r"(を再開|を復活|再び|再起動|立ち上げ|ロードして|ロック解除|status:\s*unlocked|"
        r"(実装開始|IV更新|dataCrypto).{0,12}(再開|復活|進める|実施|実行))", text)
    if reinforcing and not overturning:
        return []
    for L in locks():
        rx = L.get("topic_forbid") or L.get("forbid")
        if not rx: continue
        for m in rx.finditer(text):
            hits.append((f"固定議題:{L['id']}", f"固定決定『{L['title']}』に反する議題のため却下", m.group(0)))
            break
    return hits


def public():
    return [{"id": L["id"], "title": L["title"], "reason": L["reason"][:200], "service": L.get("service"),
             "cancels": L.get("cancels"), "locked_at": L.get("locked_at"), "locked_by": L.get("locked_by")}
            for L in locks()]
