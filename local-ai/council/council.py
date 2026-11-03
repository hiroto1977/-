#!/usr/bin/env python3
"""ローカルAI組織（村）デーモン。リポジトリのAI組織(registry.json)を縮小移植し、
COO→役員→部長→担当→秘書 の順でローカルLLMが議論する（標準ライブラリのみ）。
行動はこのディレクトリ内へのファイル書き込みと読み取り専用チェックに限定。外部送信・git操作はしない。"""
import json, os, re, socket, threading, time, datetime, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.environ.get("COUNCIL_API", "http://127.0.0.1:4000/v1/chat/completions")
KEY = open(os.path.expanduser("~/litellm/master_key")).read().strip()
INTERVAL = int(os.environ.get("COUNCIL_INTERVAL", "600"))
MIN_FREE_MB = int(os.environ.get("COUNCIL_MIN_FREE_MB", "1500"))
HEAVY_FREE_MB = int(os.environ.get("COUNCIL_HEAVY_FREE_MB", "5500"))   # 4B/6Bモデルを使う最低空きメモリ
HEAVY = {"yi-1.5-6b", "qwen3-4b", "minicpm3-4b"}
TIMEOUT = int(os.environ.get("COUNCIL_TIMEOUT", "240"))
MAX_TOK = int(os.environ.get("COUNCIL_MAX_TOKENS", "260"))
PORT = int(os.environ.get("COUNCIL_PORT", "8091"))
USER = os.environ.get("COUNCIL_USER", "清継")
WEB = os.path.join(HERE, "web"); THREAD = os.path.join(HERE, "user_thread.md")
ORG = json.load(open(os.path.join(HERE, "org.json"), encoding="utf-8"))
P = {p["id"]: p for p in ORG["people"]}
def kids(pid, tier=None): return [p for p in ORG["people"] if p["parent"] == pid and (tier is None or p["tier"] == tier)]
COMMON = (f"必ず自然な日本語（ひらがな・カタカナ・漢字）だけで、180字以内で答えてください。中国語・英語の文は書かないでください。"
          f"CEOは人間の{USER}さんです。あなたは{USER}さんの発言を代筆・創作してはいけません。自分の役職の立場だけで話してください。"
          "この組織はローカル環境内でファイルに提案を書くことしかできません。外部送信やgit pushは提案しないでください。")
STATE = {"status": "起動", "topic": "", "transcript": [], "updated": "", "speaking": None, "exec": None}
SERVICES = {"Ollama": (11434, "/"), "llama1.5B": (8081, "/health"), "llama3B": (8085, "/health"), "llama7B": (8086, "/health"),
            "LocalAI": (8084, "/readyz"), "llama-swap": (8090, "/v1/models"), "LiteLLM": (4000, "/health/liveliness"), "OpenWebUI": (8080, "/health")}
PENDING, CHAT = [], []
ROT = [0]

def now(): return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
def free_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable"): return int(l.split()[1]) // 1024
    return 0
def port_up(p):
    try:
        with socket.create_connection(("127.0.0.1", p), 2): return True
    except OSError: return False
def log_sys(msg):
    with open(os.path.join(HERE, "logs", "system.log"), "a") as f: f.write(f"{now()} {msg}\n")

def japanese_ok(t):
    kana = len(re.findall(r"[\u3040-\u30ff]", t)); han = len(re.findall(r"[\u4e00-\u9fff]", t))
    return kana >= 8 and kana >= han * 0.25 and not re.search(r"抱歉|我们|您|这|们|吗|的话", t)
def clean(t):
    t = re.sub(r"<think>.*?</think>", "", t, flags=re.S); t = re.sub(r"^.*</think>", "", t, flags=re.S)
    out = []
    for l in t.strip().splitlines():
        if re.match(rf"^\s*\**\s*({USER}|CEO)\s*(さん)?\s*\**\s*[:：]", l): break     # CEOの代筆はそこで打ち切り
        out.append(l)
    t = "\n".join(out).strip()
    t = re.sub(r"^\**[^\n:：]{1,20}[:：]\**\s*", "", t) if re.match(r"^\**(COO|CFO|CHRO|CSO|CIO|CQO|[^\n:：]{1,12}(部長|秘書|担当|室長))", t) else t
    return t.strip()

def ask(model, system, user):
    if model in HEAVY and free_mb() < HEAVY_FREE_MB: model = "qwen3-1.7b"
    for m in dict.fromkeys((model, "fast", "balanced")):
        body = json.dumps({"model": m, "max_tokens": MAX_TOK, "temperature": 0.6, "stop": [f"\n{USER}さん:", f"\n{USER}:", "\nCEO:"],
                           "messages": [{"role": "system", "content": system + COMMON},
                                        {"role": "user", "content": user + ("\n/no_think" if m.startswith("qwen3") else "")}]}).encode()
        req = urllib.request.Request(API, body, {"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                out = clean(json.load(r)["choices"][0]["message"]["content"] or "")
            if out and japanese_ok(out): return m, out
            log_sys(f"{m}: 日本語でない/空の応答を破棄 → 次のモデル")
        except Exception as e:
            log_sys(f"{m} 失敗: {e!r} → フェイルオーバー")
    return "none", "（応答なし）"

def persona(p):
    s = f"あなたはAI組織の{p['title']}（{p['dept']}）です。"
    if p["tier"] == "秘書": s += "役員を補佐し、論点整理・ブリーフィング・リスクの洗い出しを担当します。"
    if p.get("knowledge"): s += "参照知識: " + p["knowledge"]
    return s

def health_summary():
    down = [n for n, (p, _) in SERVICES.items() if not port_up(p)]
    return down, f"空きメモリ {free_mb()}MB / 停止中: {', '.join(down) or 'なし'}"

KEYWORDS = {"cfo": "財務 税 資金 融資 キャッシュ 会計", "chro": "人事 給与 労務 採用 社会保険 人件費", "cso": "戦略 経営 分析 予測 予算 KPI 成長 レポート",
            "cio": "投資 資産 為替 不動産 投信 株 貯蓄", "cqo": "品質 テスト セキュリティ 監査 CI バグ 検証 メモリ サービス 停止 Mamori lint 言語"}
def pick_exec(topic):
    sc = {e: sum(topic.count(w) for w in ws.split()) for e, ws in KEYWORDS.items()}
    best = max(sc, key=sc.get)
    if sc[best] == 0: best = list(KEYWORDS)[ROT[0] % 5]
    return best

def pick_topic():
    if PENDING: return "CEOの指示", PENDING.pop(0)
    inbox = os.path.join(HERE, "inbox.md")
    if os.path.exists(inbox):
        lines = open(inbox, encoding="utf-8").read().splitlines()
        for i, l in enumerate(lines):
            s = l.strip()
            if s.startswith("- ") and not s.startswith("- [済]"):
                lines[i] = l.replace("- ", "- [済] ", 1); open(inbox, "w", encoding="utf-8").write("\n".join(lines) + "\n")
                return "受信箱", s[2:]
    down, h = health_summary(); down = [d for d in down if d != "llama7B"]
    if down: return "サービス健全性", f"ローカルAIサービスが停止中: {', '.join(down)}（{h}）。原因と復旧・予防策。"
    rw = "/workspace/repo-analysis/docs/REMAINING_WORK.md"
    if os.path.exists(rw):
        items = [l.strip() for l in open(rw, encoding="utf-8").read().split("\n## ")[0].splitlines() if l.strip().startswith(("-", "*"))]
        if items: return "リポジトリ残作業", "Service Hubの残作業: " + items[ROT[0] % len(items)][:300]
    return "サービス健全性", f"ローカルAI環境の改善（{h}）"

def session():
    src, topic = pick_topic(); ROT[0] += 1
    ex = P[pick_exec(topic)]
    mgrs = kids(ex["id"], "管理職"); mgr = mgrs[ROT[0] % len(mgrs)]
    staff = kids(mgr["id"], "一般職"); st = staff[ROT[0] % len(staff)]
    sec = kids(ex["id"], "秘書")[0]
    STATE.update(status="会議中", topic=f"[{src}] {topic}", transcript=[], updated=now(), exec=ex["id"])
    path = os.path.join(HERE, "logs", f"{datetime.date.today().isoformat()}.md")
    hist = []
    def speak(p, instr):
        STATE["speaking"] = p["id"]
        ctx = "\n".join(hist[-4:]) or "（なし）"
        m, out = ask("balanced" if p["tier"] in ("COO", "役員") else p["model"], persona(p) + instr,
                     f"議題: {topic}\n{'（CEO ' + USER + 'さんからの直接の指示です。CEOに向けて応えてください）' if src == 'CEOの指示' else ''}\n\nこれまでの発言:\n{ctx}\n\nあなた（{p['name']}）の発言:")
        hist.append(f"{p['name']}: {out}")
        STATE["transcript"].append({"id": p["id"], "role": p["name"], "model": m, "text": out}); STATE["updated"] = now()
        with open(path, "a", encoding="utf-8") as f: f.write(f"**{p['name']}**（{p['tier']}・{m}）\n\n{out}\n\n")
        return out
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"\n## {now()} [{src}] {topic}\n\n担当: {ex['name']} → {mgr['name']} / {st['name']} / {sec['name']}（空きメモリ {free_mb()}MB）\n\n")
    plan = [(P["coo"], f"COOとして議題を{ex['name']}（{ex['dept']}）に割り振る理由と論点を2〜3行で示してください。"),
            (mgr, "部長として具体的な対応案を1〜3個提案してください。"),
            (st, "担当者として、現場の観点から案の実現性と作業手順（読み取り専用の確認を含む）を述べてください。"),
            (sec, "秘書として論点を整理し、リスクと抜けを箇条書きで指摘してください。"),
            (ex, "役員として『決定:』1〜2文と『次のアクション:』箇条書き3つ以内（ローカルで実行できる具体的なもの）を書いてください。"),
            (P["coo"], f"COOとして会議を2〜3文でまとめ、CEOの{USER}さんへの報告文にしてください。")]
    outs = []
    for p, instr in plan:
        if free_mb() < MIN_FREE_MB and p not in (ex, P["coo"]): log_sys(f"空きメモリ不足のため {p['name']} を省略"); continue
        outs.append(speak(p, instr))
    dec, summ = outs[-2], outs[-1]
    with open(os.path.join(HERE, "decisions.md"), "a", encoding="utf-8") as f:
        f.write(f"\n## {now()} [{src}] {topic[:120]}\n\n担当役員: {ex['name']}\n\n{dec}\n\nCOO総括: {summ}\n")
    if src == "CEOの指示": thread_log("COO", summ)
    STATE.update(status=f"待機中（次回まで最大{INTERVAL}秒）", updated=now(), speaking=None)

def thread_log(who, text):
    CHAT.append({"who": who, "text": text, "at": now()}); del CHAT[:-30]
    with open(THREAD, "a", encoding="utf-8") as f: f.write(f"- {now()} **{who}**: {text}\n")

def api_state():
    dp = os.path.join(HERE, "decisions.md")
    decs = [d.strip() for d in open(dp, encoding="utf-8").read().split("\n## ") if d.strip()][-5:] if os.path.exists(dp) else []
    return {k: STATE[k] for k in ("status", "topic", "updated", "speaking", "exec")} | {"free_mb": free_mb(), "transcript": STATE["transcript"][-8:],
            "services": {n: port_up(p) for n, (p, _) in SERVICES.items()}, "decisions": decs, "chat": CHAT[-12:], "user": USER}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, b, ct, code=200):
        self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b)))
        self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers(); self.wfile.write(b)
    def js(self, o): self.send(json.dumps(o, ensure_ascii=False).encode(), "application/json; charset=utf-8")
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state": return self.js(api_state())
        if path == "/api/org": return self.js({"people": [{k: p[k] for k in ("id", "tier", "name", "title", "dept", "parent", "model")} for p in ORG["people"]], "user": USER})
        if path == "/": path = "/index.html"
        f = os.path.realpath(os.path.join(WEB, path.lstrip("/")))
        if f.startswith(WEB + os.sep) and os.path.isfile(f):
            return self.send(open(f, "rb").read(), "text/html; charset=utf-8" if f.endswith(".html") else "text/javascript; charset=utf-8")
        self.send(b"not found", "text/plain", 404)
    def do_POST(self):
        origin = self.headers.get("Origin", "")
        if self.client_address[0] != "127.0.0.1" or (origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}")) \
           or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.send(b"forbidden", "text/plain", 403)
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n > 4096: return self.send(b"too large", "text/plain", 413)
        try: d = json.loads(self.rfile.read(n)); text = str(d.get("text", "")).strip()[:500]
        except Exception: return self.send(b"bad", "text/plain", 400)
        if not text: return self.send(b"empty", "text/plain", 400)
        if self.path == "/api/chat":
            p = P.get(str(d.get("to", "")))
            if not p: return self.send(b"unknown", "text/plain", 404)
            thread_log(USER, f"→{p['name']}: {text}")
            hist = "\n".join(f"{c['who']}: {c['text']}" for c in CHAT[-6:])
            m, out = ask("balanced" if p["tier"] in ("COO", "役員") else p["model"],
                         persona(p) + f"今は村でCEOの{USER}さんと1対1で話しています。役職の立場を保ち、{USER}さんに敬語で答えてください。",
                         f"最近の会話:\n{hist}\n\n{USER}さんの発言: {text}\n\nあなた（{p['name']}）の返答:")
            thread_log(f"{p['name']}（{m}）", out)
            return self.js({"id": p["id"], "who": p["name"], "model": m, "text": out})
        if self.path == "/api/topic":
            thread_log(USER, f"→組織全体（COO）: {text}"); PENDING.append(text)
            return self.js({"ok": True})
        self.send(b"not found", "text/plain", 404)

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
    threading.Thread(target=ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever, daemon=True).start()
    log_sys("AI組織デーモン起動")
    while True:
        if free_mb() < MIN_FREE_MB:
            STATE.update(status=f"空きメモリ不足でスキップ（{free_mb()}MB）", updated=now()); log_sys(STATE["status"])
        else:
            try: session()
            except Exception as ex: log_sys(f"会議失敗: {ex!r}"); STATE.update(status="エラー（次回再試行）", speaking=None)
        for _ in range(INTERVAL):
            if PENDING: break
            time.sleep(1)
