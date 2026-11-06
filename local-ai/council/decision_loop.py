"""決定の閉ループ。

決定を決めただけで終わらせず、次を一本にする。
1. 方針違反なら却下ファイルだけに書く（decisions.md と実行ファイルは書かない）
2. 通った決定は decisions.md に書き、ディスクから読み戻してマーカーを確認する
3. 次のアクションを実行し、実行後のファイルを読み直して検証する
4. 検証が失敗したら最大 MAX_RETRIES 回までやり直す
5. 直前の試行と同じエラーなら、残り回数があっても止める

実行できる操作は、このルート内への write / append / read だけ。
シェル・外部送信・git・CEOロックファイルの変更はしない。

意図ルール（検査が参照する）:
- quote-not-command: 「」や引用行（>）や決定本文の中の命令は実行しない
- first-section-only: 次のアクション見出しは最初の1つだけを読む
- indent-not-command: 字下げした箇条書きは入れ子であり実行しない
- skip-not-failure: 文法に合わない行（記録しない、再記録）は実行せず、それだけでは失敗にしない
- negation-not-violation: 否定文は decision_lock / advice_guard の既存規則に従い違反にしない
- unlock-only-via-file: 閉ループは locked_decisions.md を書けない。解除は人が status を unlocked にしたファイルだけ
- same-error-is-previous: 同一エラーは直前の試行とエラー文字列が一致すること。過去のどこかではない
- max-three-retries: 再試行は最大3回（初回を含めて4試行で打ち切り）
- verify-rereads-disk: 検証は書き込みバッファではなく、実行後に読み直したバイト列
- idempotent-rewrite: write は置換。append は同じ行が既にあれば再追記しない。決定マーカーがあれば再追記しない
- path-jail: 相対パスのみ。.. と % と絶対パスとシンボリックリンクの脱出は拒否
- fullwidth-dot-not-traversal: 全角のドットは .. として扱わない（ルート内の名前のまま）
- accept-reject-exclusive: 同じ決定IDが decisions.md と rejected_decisions.md の両方に残らない
- parser-gap-out-of-scope: decision_lock は status が locked 以外だと節を拘束しない。このパーサは本ループでは変えない
"""
import hashlib, json, os, re, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import advice_guard
import decision_lock

MAX_RETRIES = 3
LOG_NAME = "execution_log.jsonl"
STATE_NAME = "loop_state.json"
DECISIONS_NAME = "decisions.md"
REJECTED_NAME = "rejected_decisions.md"
LOCK_BASENAME = "locked_decisions.md"

INTENT_RULES = (
    "quote-not-command",
    "first-section-only",
    "indent-not-command",
    "skip-not-failure",
    "negation-not-violation",
    "unlock-only-via-file",
    "same-error-is-previous",
    "max-three-retries",
    "verify-rereads-disk",
    "idempotent-rewrite",
    "path-jail",
    "fullwidth-dot-not-traversal",
    "accept-reject-exclusive",
    "parser-gap-out-of-scope",
)

class Refuse(Exception):
    pass

def decision_id(topic, decision):
    return hashlib.sha256(f"{topic}\n{decision}".encode("utf-8")).hexdigest()[:16]

def marker_for(did):
    return f"<!-- loop:{did} -->"

def reject_marker_for(did):
    return f"<!-- loop-reject:{did} -->"

def _sha(data):
    return hashlib.sha256(data).hexdigest()

def _now():
    import datetime
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def _append_jsonl(path, obj):
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())

def _write_json(path, obj):
    data = json.dumps(obj, ensure_ascii=False, indent=2)
    with open(path, "w", encoding="utf-8") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())

def _read(path):
    if not os.path.isfile(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read()

def _read_bytes(path):
    with open(path, "rb") as f:
        return f.read()

def resolve_in_root(root, rel):
    """ルート内の実パス。違反は Refuse。ファイルは作らない。"""
    if not isinstance(rel, str) or rel == "" or "\x00" in rel or "%" in rel or "\\" in rel or ":" in rel:
        raise Refuse("パスを拒否しました")
    if rel.startswith("/") or rel.startswith("~"):
        raise Refuse("パスを拒否しました")
    parts = rel.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise Refuse("パスを拒否しました")
    root_real = os.path.realpath(root)
    dest = os.path.realpath(os.path.join(root_real, *parts))
    if os.path.basename(dest) == LOCK_BASENAME:
        raise Refuse("CEOロックファイルは閉ループから変更できません")
    if dest != root_real and not dest.startswith(root_real + os.sep):
        raise Refuse("ルートの外です")
    if os.path.isdir(dest):
        raise Refuse("ディレクトリは書けません")
    return dest

def _split_expect(body):
    m = re.search(r"\s>>\s*期待\s*[:：]\s*(.*)$", body)
    if not m:
        return body, body
    return body[:m.start()], m.group(1)

def parse_actions(decision):
    """最初の『次のアクション』直下の、行頭の箇条書きだけを命令にする。"""
    lines = (decision or "").splitlines()
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^次のアクション\s*[:：]\s*$", line):
            start = i + 1
            break
    if start is None:
        return []
    found = []
    for line in lines[start:]:
        if (re.match(r"^(決定|COO|担当)(\s|$|:|：)", line)
                or re.match(r"^#{1,3}(\s|$)", line)
                or re.match(r"^次のアクション\s*[:：]\s*$", line)):
            break
        if line.startswith(">"):
            continue
        if not line.startswith("- "):
            continue
        found.append(_parse_bullet(line[2:].strip()))
    return found

def _parse_bullet(text):
    specs = (
        ("write", re.match(r"^記録\s*[:：]\s*(\S+)\s*::\s*(.*)$", text)),
        ("write", re.match(r"^記録\s*[:：]\s*(\S+)\s*に「([^」]*)」を書く$", text)),
        ("write", re.match(r"^(\S+)\s*に「([^」]*)」を記録する$", text)),
        ("append", re.match(r"^追記\s*[:：]\s*(\S+)\s*::\s*(.*)$", text)),
        ("read", re.match(r"^確認\s*[:：]\s*(\S+)\s*::\s*(.*)$", text)),
        ("read", re.match(r"^確認\s*[:：]\s*(\S+)\s*に「([^」]*)」がある$", text)),
    )
    for op, m in specs:
        if not m:
            continue
        raw_body = m.group(2)
        body, expect = _split_expect(raw_body)
        return {"op": op, "path": m.group(1), "body": body, "expect": expect, "raw": text}
    return {"op": "skip", "raw": text}

def _policy_error(root, action):
    if action.get("op") == "skip":
        return None
    try:
        resolve_in_root(root, action["path"])
    except Refuse as ex:
        return f"拒否: {ex} ({action['path']})"
    if action["op"] in ("write", "append"):
        blob = action.get("body") or ""
        hits = decision_lock.check(blob) + advice_guard.check(blob)
        if hits:
            name, why, frag = hits[0]
            return f"拒否: {name}: {why}（該当: {frag}）"
        if blob == "":
            return "拒否: 空の書き込み"
    return None

def _guard_hits(decision):
    hits = []
    for n, why, frag in decision_lock.check(decision) + advice_guard.check(decision):
        hits.append(f"{n}: {why}（該当: {frag}）")
    return hits

def _side(path, before, after, existed):
    return {
        "existed_before": existed,
        "bytes_before": len(before),
        "bytes_after": len(after),
        "sha256_before": _sha(before) if existed else None,
        "sha256_after": _sha(after) if after or os.path.isfile(path) else None,
    }

def _apply_once(root, action, adversary, attempt):
    """1試行。検証はディスクを読み直す。"""
    dest = resolve_in_root(root, action["path"])
    existed = os.path.isfile(dest)
    before = _read_bytes(dest) if existed else b""
    op = action["op"]
    body = action.get("body") or ""
    expect = action.get("expect") if action.get("expect") is not None else body
    if op == "write":
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = body.encode("utf-8")
        with open(dest, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
    elif op == "append":
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        text = before.decode("utf-8")
        lines = text.splitlines()
        if body not in lines:
            prefix = "" if (not before or before.endswith(b"\n")) else "\n"
            with open(dest, "ab") as f:
                f.write((prefix + body + "\n").encode("utf-8"))
                f.flush()
                os.fsync(f.fileno())
    elif op == "read":
        pass
    else:
        raise Refuse("未知の操作")
    if adversary:
        adversary(dest, attempt)
    exists_after = os.path.isfile(dest)
    after = _read_bytes(dest) if exists_after else b""
    if op == "read" and not exists_after:
        err = "欠落: ファイルが無い"
    else:
        actual = after.decode("utf-8", "replace")
        if expect not in actual:
            err = f"不一致: 期待 {expect!r} 実際 {actual[:60]!r}"
        else:
            err = None
    return {
        "command": {"op": op, "path": action["path"], "body_sha256": _sha(body.encode("utf-8")), "body_len": len(body.encode("utf-8"))},
        "side_effect": _side(dest, before, after, existed),
        "verify": {"ok": err is None, "error": err or "", "terminal": False},
    }

def drive(root, step, on_retry=None):
    """step(attempt, retries) -> record dict。同一エラーか最大再試行で止める。"""
    prev = None
    retries = 0
    attempt = 0
    records = []
    while True:
        attempt += 1
        if attempt > 1 and on_retry:
            on_retry(attempt)
        rec = step(attempt, retries)
        rec["attempt"] = attempt
        rec["retry"] = retries
        if rec["verify"]["ok"]:
            rec["stopped"] = "verified"
            records.append(rec)
            return records
        err = rec["verify"].get("error") or ""
        if rec["verify"].get("terminal"):
            rec["stopped"] = "refused"
            records.append(rec)
            return records
        if prev is not None and err == prev:
            rec["stopped"] = "same_error"
            records.append(rec)
            return records
        prev = err
        if retries >= MAX_RETRIES:
            rec["stopped"] = "max_retries"
            records.append(rec)
            return records
        rec["stopped"] = None
        records.append(rec)
        retries += 1

def _log(root, did, records):
    path = os.path.join(root, LOG_NAME)
    for rec in records:
        row = {"at": _now(), "decision_id": did, **rec}
        _append_jsonl(path, row)

def _targets_from_disk(root, actions):
    out = []
    for a in actions:
        if a.get("op") == "skip":
            continue
        try:
            dest = resolve_in_root(root, a["path"])
        except Refuse:
            out.append({"path": a["path"], "exists": False, "sha256": None, "refused": True})
            continue
        if os.path.isfile(dest):
            data = _read_bytes(dest)
            out.append({"path": a["path"], "exists": True, "sha256": _sha(data), "refused": False})
        else:
            out.append({"path": a["path"], "exists": False, "sha256": None, "refused": False})
    return out

def _finish(root, did, status, attempts, retries, detail, actions):
    state = _summary(root, did, status, attempts, retries, detail, actions)
    # 同じ決定IDのマーカーが両方のファイルにあるときだけ排他が壊れている。
    state["exclusive"] = not (state["decision_on_disk"] and state["rejected_on_disk"])
    _write_json(os.path.join(root, STATE_NAME), state)
    return state

def _summary(root, did, status, attempts, retries, detail, actions):
    dec_path = os.path.join(root, DECISIONS_NAME)
    rej_path = os.path.join(root, REJECTED_NAME)
    dec = _read(dec_path)
    rej = _read(rej_path)
    state = {
        "decision_id": did,
        "status": status,
        "stopped": status,
        "attempts": attempts,
        "retries": retries,
        "detail": detail,
        "decision_on_disk": marker_for(did) in dec,
        "rejected_on_disk": reject_marker_for(did) in rej,
        "targets": _targets_from_disk(root, actions),
    }
    _write_json(os.path.join(root, STATE_NAME), state)
    return state

def _land_decision(root, did, block, adversary=None):
    path = os.path.join(root, DECISIONS_NAME)
    marker = marker_for(did)
    text = block if marker in block else (block.rstrip("\n") + "\n" + marker + "\n")

    def step(attempt, retries):
        before = _read(path)
        if marker not in before:
            with open(path, "a", encoding="utf-8") as f:
                f.write(text if text.startswith("\n") or before == "" else "\n" + text)
                f.flush()
                os.fsync(f.fileno())
        if adversary:
            adversary(path, attempt)
        after = _read(path)
        ok = marker in after
        return {
            "command": {"op": "append_decision", "path": DECISIONS_NAME, "body_sha256": _sha(text.encode("utf-8")), "body_len": len(text.encode("utf-8"))},
            "side_effect": {"bytes_before": len(before.encode("utf-8")), "bytes_after": len(after.encode("utf-8")), "sha256_after": _sha(after.encode("utf-8"))},
            "verify": {"ok": ok, "error": "" if ok else "決定マーカーがディスクに無い", "terminal": False},
        }

    return drive(root, step)

def _reject(root, topic, decision, hits, actions):
    did = decision_id(topic, decision)
    marker = reject_marker_for(did)
    body = (
        f"\n## {_now()} {topic[:80]}（閉ループ却下）\n\n{marker}\n\n理由:\n"
        + "".join(f"- {h}\n" for h in hits)
        + f"\n却下した決定:\n\n{decision}\n"
    )
    path = os.path.join(root, REJECTED_NAME)
    before = _read(path)
    if marker not in before:
        with open(path, "a", encoding="utf-8") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
    after = _read(path)
    ok = marker in after and marker_for(did) not in _read(os.path.join(root, DECISIONS_NAME))
    rec = {
        "attempt": 1,
        "retry": 0,
        "stopped": "rejected",
        "command": {"op": "reject", "path": REJECTED_NAME},
        "side_effect": {"bytes_after": len(after.encode("utf-8")), "sha256_after": _sha(after.encode("utf-8")), "decisions_written": False},
        "verify": {"ok": False, "error": "却下: " + " / ".join(hits)[:300], "terminal": True},
    }
    if not ok:
        rec["verify"]["error"] = "却下の記録を検証できない"
    _log(root, did, [rec])
    return _finish(root, did, "rejected", 1, 0, rec["verify"]["error"], actions)

def record_rejection(root, topic, decision, reasons):
    """会議の既存却下に、実行しなかった記録だけを足す。decisions.md は書かない。"""
    did = decision_id(topic, decision)
    reasons = [str(r) for r in (reasons or [])]
    on_disk = marker_for(did) in _read(os.path.join(root, DECISIONS_NAME))
    rec = {
        "attempt": 1,
        "retry": 0,
        "stopped": "rejected",
        "command": {"op": "reject", "path": REJECTED_NAME},
        "side_effect": {"decisions_written": on_disk},
        "verify": {"ok": False, "error": "却下: " + " / ".join(reasons)[:300], "terminal": True},
    }
    os.makedirs(root, exist_ok=True)
    _log(root, did, [rec])
    return _summary(root, did, "rejected", 1, 0, rec["verify"]["error"], [])

def accept_and_verify(root, topic, decision, block=None, adversary=None, on_retry=None):
    """決定を却下するか、記録して実行し、ディスクで検証する。"""
    os.makedirs(root, exist_ok=True)
    did = decision_id(topic, decision)
    actions = parse_actions(decision)
    hits = _guard_hits(decision)
    for action in actions:
        err = _policy_error(root, action)
        if err:
            hits.append(err)
    if hits:
        return _reject(root, topic, decision, hits, actions)

    if block is None:
        block = f"\n## {_now()} {topic[:120]}\n\n{decision}\n"
    landed = _land_decision(root, did, block, adversary=adversary)
    _log(root, did, landed)
    stage_attempts, stage_retries = len(landed), landed[-1]["retry"]
    if landed[-1]["stopped"] != "verified":
        return _finish(root, did, landed[-1]["stopped"], stage_attempts, stage_retries, landed[-1]["verify"]["error"], actions)

    for action in actions:
        if action.get("op") == "skip":
            _log(root, did, [{
                "attempt": 1, "retry": 0, "stopped": "skipped",
                "command": {"op": "skip", "raw": action.get("raw", "")[:160]},
                "side_effect": {},
                "verify": {"ok": True, "error": "", "terminal": False},
            }])
            continue

        def step(attempt, retries, action=action):
            try:
                return _apply_once(root, action, adversary, attempt)
            except Refuse as ex:
                return {
                    "command": {"op": action["op"], "path": action["path"]},
                    "side_effect": {},
                    "verify": {"ok": False, "error": f"拒否: {ex}", "terminal": True},
                }

        def _retry(attempt, action=action):
            if on_retry:
                on_retry(attempt, root, action)

        ran = drive(root, step, on_retry=_retry if on_retry else None)
        _log(root, did, ran)
        stage_attempts, stage_retries = len(ran), ran[-1]["retry"]
        if ran[-1]["stopped"] != "verified":
            return _finish(root, did, ran[-1]["stopped"], stage_attempts, stage_retries, ran[-1]["verify"]["error"], actions)

    return _finish(root, did, "verified", stage_attempts, stage_retries, "", actions)

def public(root):
    """API 用。メモリではなくログファイルと状態ファイルを読む。"""
    log_path = os.path.join(root, LOG_NAME)
    state_path = os.path.join(root, STATE_NAME)
    runs = []
    if os.path.isfile(log_path):
        size = os.path.getsize(log_path)
        with open(log_path, "rb") as f:
            if size > 65536:
                f.seek(size - 65536)
                f.readline()
            data = f.read().decode("utf-8", "replace")
        for line in data.splitlines():
            if not line.strip():
                continue
            try:
                runs.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    last = None
    if os.path.isfile(state_path):
        try:
            with open(state_path, encoding="utf-8") as f:
                last = json.loads(f.read())
        except json.JSONDecodeError:
            last = None
    return {"runs": runs[-20:], "last": last, "log_bytes": os.path.getsize(log_path) if os.path.isfile(log_path) else 0}

def serve(root):
    """検査用のループバック。GET はファイルの再読込。POST は accept_and_verify。"""
    root = os.path.abspath(root)

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass
        def _send(self, code, obj):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def do_GET(self):
            if self.path.split("?")[0] != "/api/loop":
                return self._send(404, {"error": "not found"})
            self._send(200, public(root))
        def do_POST(self):
            if self.path.split("?")[0] != "/api/loop":
                return self._send(404, {"error": "not found"})
            n = int(self.headers.get("Content-Length", "0") or 0)
            if n > 16384:
                return self._send(413, {"error": "too large"})
            try:
                d = json.loads(self.rfile.read(n) or b"{}")
            except json.JSONDecodeError:
                return self._send(400, {"error": "bad json"})
            accept_and_verify(root, str(d.get("topic", "")), str(d.get("decision", "")))
            self._send(200, public(root))

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=httpd.serve_forever, daemon=True, name="decision-loop-http").start()
    return httpd
