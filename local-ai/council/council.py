#!/usr/bin/env python3
"""ローカルAI評議会: 複数ローカルLLMが常時議論し、提案ファイルを書き出すデーモン（標準ライブラリのみ）。
行動はこのディレクトリ内へのファイル書き込みと読み取り専用チェックに限定。外部送信・git操作は一切しない。"""
import json, os, re, socket, threading, time, datetime, html, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get("COUNCIL_API", "http://127.0.0.1:4000/v1/chat/completions")
KEY = open(os.path.expanduser("~/litellm/master_key")).read().strip()
INTERVAL = int(os.environ.get("COUNCIL_INTERVAL", "600"))
TURNS = int(os.environ.get("COUNCIL_TURNS", "2"))          # 提案→批判→検証 を何周するか
MIN_FREE_MB = int(os.environ.get("COUNCIL_MIN_FREE_MB", "1500"))
TIMEOUT = int(os.environ.get("COUNCIL_TIMEOUT", "240"))
MAX_TOK = int(os.environ.get("COUNCIL_MAX_TOKENS", "280"))
PORT = int(os.environ.get("COUNCIL_PORT", "8091"))
ROLES = [
    ("提案者", os.environ.get("COUNCIL_PROPOSER", "qwen3-1.7b"), "あなたは提案者です。議題に対し具体的で実行可能な改善案を1〜3個出してください。前の発言の批判・検証があれば反映して改訂してください。"),
    ("批判者", os.environ.get("COUNCIL_CRITIC", "glm-edge-1.5b"), "あなたは批判者です。直前の提案のリスク・抜け・コストを短く鋭く指摘し、代替案を1つ示してください。"),
    ("検証者", os.environ.get("COUNCIL_VERIFIER", "internlm2.5-1.8b"), "あなたは検証者です。提案と批判のうち、事実として確認できる点・できない点を区別し、検証方法（読み取り専用の確認手順）を示してください。"),
]
CHAIR = ("議長", os.environ.get("COUNCIL_CHAIR", "balanced"))
COMMON = "必ず日本語で、200字以内で答えてください。この評議会はローカル環境内でファイルに提案を書くことしかできません。外部送信やgit pushは提案しないでください。"
STATE = {"status": "起動", "topic": "", "transcript": [], "updated": ""}
SERVICES = {"Ollama": (11434, "/"), "llama1.5B": (8081, "/health"), "llama3B": (8085, "/health"), "llama7B": (8086, "/health"),
            "LocalAI": (8084, "/readyz"), "llama-swap": (8090, "/v1/models"), "LiteLLM": (4000, "/health/liveliness"), "OpenWebUI": (8080, "/health")}

def now(): return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
def free_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable"): return int(l.split()[1]) // 1024
    return 0
def port_up(p):
    try:
        with socket.create_connection(("127.0.0.1", p), 2): return True
    except OSError: return False

def clean(t):
    t = re.sub(r"<think>.*?</think>", "", t, flags=re.S)
    t = re.sub(r"^.*</think>", "", t, flags=re.S)   # 閉じタグのみの場合
    t = re.sub(r"^(提案者|批判者|検証者|議長)\s*[:：]\s*", "", t.strip())
    return t.strip()

def ask(model, system, user):
    for m in (model, "fast"):
        body = json.dumps({"model": m, "max_tokens": MAX_TOK, "temperature": 0.7, "stop": ["\n清継さん:", "\n清継さん：", "\n提案者:", "\n批判者:", "\n検証者:"],
                           "messages": [{"role": "system", "content": system + COMMON}, {"role": "user", "content": user + ("\n/no_think" if m.startswith("qwen3") else "")}]}).encode()
        req = urllib.request.Request(API, body, {"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                out = clean(json.load(r)["choices"][0]["message"]["content"] or "")
            if out: return m, out
        except Exception as e:
            log_sys(f"{m} 失敗: {e!r} → fast にフェイルオーバー")
    return "none", "（応答なし）"

def log_sys(msg):
    with open(os.path.join(HERE, "logs", "system.log"), "a") as f: f.write(f"{now()} {msg}\n")

def health_summary():
    down = [n for n, (p, _) in SERVICES.items() if not port_up(p)]
    return down, f"空きメモリ {free_mb()}MB / 停止中: {', '.join(down) or 'なし'}"

PENDING = []
def pick_topic():
    if PENDING: return "清継さんの発言", PENDING.pop(0) + f"（{os.environ.get('COUNCIL_USER','清継')}さんからの直接の発言。必ずこれに応えること）"
    inbox = os.path.join(HERE, "inbox.md")
    if os.path.exists(inbox):
        lines = open(inbox, encoding="utf-8").read().splitlines()
        for i, l in enumerate(lines):
            s = l.strip()
            if s.startswith("- ") and not s.startswith("- [済]"):
                lines[i] = l.replace("- ", "- [済] ", 1)
                open(inbox, "w", encoding="utf-8").write("\n".join(lines) + "\n")
                return "ユーザー議題", s[2:]
    down, h = health_summary()
    down = [d for d in down if d != "llama7B"]  # 7Bは省メモリで意図的に停止することがある
    if down: return "サービス健全性", f"ローカルAIサービスの状態: {h}。原因の推定と復旧・予防策を議論せよ。"
    rw = "/workspace/repo-analysis/docs/REMAINING_WORK.md"
    if os.path.exists(rw):
        items = [l.strip() for l in open(rw, encoding="utf-8").read().split("\n## ")[0].splitlines() if l.strip().startswith(("-", "*", "1", "2", "3"))]
        if items:
            n = int(time.time() // INTERVAL) % len(items)
            return "リポジトリ残作業", "Service Hub リポジトリの残作業: " + items[n][:300] + " — 次の一手を議論せよ。"
    return "サービス健全性", f"ローカルAI環境の改善点（{h}）を議論せよ。"

def session():
    src, topic = pick_topic()
    fm = free_mb()
    turns = TURNS if fm >= MIN_FREE_MB * 2 else 1
    STATE.update(status="議論中", topic=f"[{src}] {topic}", transcript=[], updated=now())
    day = datetime.date.today().isoformat()
    path = os.path.join(HERE, "logs", f"{day}.md")
    hist = []
    def add(role, model, text):
        hist.append(f"{role}: {text}")
        STATE["transcript"].append((role, model, text)); STATE["updated"] = now()
        with open(path, "a", encoding="utf-8") as f: f.write(f"**{role}**（{model}）\n\n{text}\n\n")
    with open(path, "a", encoding="utf-8") as f: f.write(f"\n## {now()} [{src}] {topic}\n\n空きメモリ {fm}MB, {turns}周\n\n")
    for t in range(turns):
        for role, model, sysp in ROLES:
            if free_mb() < MIN_FREE_MB:
                log_sys("空きメモリ不足のため議論を短縮"); break
            if PENDING and src != "清継さんの発言":
                hist.append(f"{USER}さん（割り込み）: {PENDING[0]}")
            ctx = "\n".join(hist[-4:])
            m, out = ask(model, sysp, f"議題: {topic}\n\nこれまでの議論:\n{ctx or '（なし）'}\n\nあなたの発言:")
            add(role, m, out)
    m, dec = ask(CHAIR[1], "あなたは議長です。議論をまとめ、『決定:』1〜2文と『次のアクション:』箇条書き3つ以内（ローカルで実行できる具体的なもの）を書いてください。",
                 f"議題: {topic}\n\n議論:\n" + "\n".join(hist))
    add("議長", m, dec)
    if src == "清継さんの発言": thread_log(f"議長（{m}）", dec)
    with open(os.path.join(HERE, "decisions.md"), "a", encoding="utf-8") as f:
        f.write(f"\n## {now()} [{src}] {topic[:120]}\n\n{dec}\n")
    STATE.update(status=f"待機中（次回まで{INTERVAL}秒）", updated=now())

WEB = os.path.join(HERE, "web")
THREAD = os.path.join(HERE, "user_thread.md")
USER = os.environ.get("COUNCIL_USER", "清継")
CHAT = []          # 村での会話（最新）
LOCK = threading.Lock()
def thread_log(who, text):
    CHAT.append({"who": who, "text": text, "at": now()}); del CHAT[:-30]
    with open(THREAD, "a", encoding="utf-8") as f: f.write(f"- {now()} **{who}**: {text}\n")
def role_by_name(n):
    for r, m, sp in ROLES:
        if r == n: return r, m, sp
    if n == CHAIR[0]: return CHAIR[0], CHAIR[1], "あなたは評議会の議長です。"
    return None
def api_state():
    dp = os.path.join(HERE, "decisions.md")
    decs = [d.strip() for d in open(dp, encoding="utf-8").read().split("\n## ") if d.strip()][-5:] if os.path.exists(dp) else []
    return {"status": STATE["status"], "topic": STATE["topic"], "updated": STATE["updated"], "free_mb": free_mb(),
            "transcript": [{"role": r, "model": m, "text": t} for r, m, t in STATE["transcript"]][-8:],
            "roles": [{"role": r, "model": m} for r, m, _ in ROLES] + [{"role": CHAIR[0], "model": CHAIR[1]}],
            "services": {n: port_up(p) for n, (p, _) in SERVICES.items()}, "decisions": decs, "chat": CHAT[-12:], "user": USER}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, b, ct):
        self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state": return self.send(json.dumps(api_state(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if path in ("/", "/index.html"): path = "/index.html"
        if path != "/text":
            f = os.path.realpath(os.path.join(WEB, path.lstrip("/")))
            if f.startswith(WEB + os.sep) and os.path.isfile(f):
                return self.send(open(f, "rb").read(), "text/html; charset=utf-8" if f.endswith(".html") else "text/javascript")
            self.send_response(404); self.end_headers(); return
    def do_POST(self):
        host = self.headers.get("Host", ""); origin = self.headers.get("Origin", "")
        if self.client_address[0] != "127.0.0.1" or (origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}")) \
           or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send_response(403); self.end_headers(); return
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n > 4096: self.send_response(413); self.end_headers(); return
        try: d = json.loads(self.rfile.read(n)); text = str(d.get("text", "")).strip()[:500]
        except Exception: self.send_response(400); self.end_headers(); return
        if not text: self.send_response(400); self.end_headers(); return
        if self.path == "/api/chat":
            r = role_by_name(str(d.get("to", "")))
            if not r: self.send_response(404); self.end_headers(); return
            thread_log(USER, f"→{r[0]}: {text}")
            hist = "\n".join(f"{c['who']}: {c['text']}" for c in CHAT[-6:])
            m, out = ask(r[1], r[2] + f"今は村で{USER}さんと直接話しています。役柄を保ち、{USER}さんに語りかけてください。", f"最近の会話:\n{hist}\n\n{USER}さん: {text}")
            thread_log(f"{r[0]}（{m}）", out)
            return self.send(json.dumps({"who": r[0], "model": m, "text": out}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if self.path == "/api/topic":
            thread_log(USER, f"→評議会: {text}")
            PENDING.append(text)
            return self.send(b'{"ok":true}', "application/json")
        self.send_response(404); self.end_headers()
        e = html.escape
        dp = os.path.join(HERE, "decisions.md")
        decs = open(dp, encoding="utf-8").read()[-6000:] if os.path.exists(dp) else ""
        tr = "".join(f"<h3>{e(r)} <small>({e(m)})</small></h3><p>{e(t)}</p>" for r, m, t in STATE["transcript"])
        _, h = health_summary()
        page = f"""<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=30><title>ローカルAI評議会</title>
<style>body{{font-family:sans-serif;max-width:900px;margin:auto;padding:1em}}p,pre{{white-space:pre-wrap}}</style>
<h1>ローカルAI評議会</h1><p>状態: {e(STATE['status'])}（更新 {e(STATE['updated'])}）<br>{e(h)}</p>
<h2>最新の議題</h2><p>{e(STATE['topic'])}</p>{tr}<h2>決定ログ（最新）</h2><pre>{e(decs)}</pre>"""
        b = page.encode(); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

if __name__ == "__main__":
    threading.Thread(target=ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever, daemon=True).start()
    log_sys("評議会デーモン起動")
    while True:
        if free_mb() < MIN_FREE_MB:
            STATE.update(status=f"空きメモリ不足でスキップ（{free_mb()}MB）", updated=now()); log_sys(STATE["status"])
        else:
            try:
                with LOCK: session()
            except Exception as ex: log_sys(f"セッション失敗: {ex!r}"); STATE["status"] = "エラー（次回再試行）"
        for _ in range(INTERVAL):
            if PENDING: break
            time.sleep(1)
