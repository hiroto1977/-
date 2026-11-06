#!/usr/bin/env python3
"""ローカルAI組織（村）デーモン。リポジトリのAI組織(registry.json)を縮小移植し、
COO→役員→部長→担当→秘書 の順でローカルLLMが議論する（標準ライブラリのみ）。
行動はこのディレクトリ内へのファイル書き込みと読み取り専用チェックに限定。外部送信・git操作はしない。"""
import json, os, re, shutil, subprocess, tempfile, threading, time, datetime, urllib.request, difflib, collections
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
# ---- 任意参加: Claude（相談役・議長）。Claude Code CLI（サブスクでログイン済み）がある時だけ実際に呼ぶ ----
CLAUDE_ON = os.environ.get("COUNCIL_CLAUDE", "1") != "0"
CLAUDE_MAX_HOUR = int(os.environ.get("COUNCIL_CLAUDE_MAX_PER_HOUR", "6"))
CLAUDE_TIMEOUT = int(os.environ.get("COUNCIL_CLAUDE_TIMEOUT", "120"))
CLAUDE_BIN = os.environ.get("COUNCIL_CLAUDE_BIN") or shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
if CLAUDE_ON:
    ORG["people"].append({"id": "claude", "tier": "相談役", "name": "Claude", "title": "Claude（相談役・議長）", "dept": "議長・相談役",
                          "parent": "coo", "model": "claude"})
P = {p["id"]: p for p in ORG["people"]}
import company_link
COMPANY = company_link.CompanyLink(log=lambda m: log_sys(m))
def kids(pid, tier=None): return [p for p in ORG["people"] if p["parent"] == pid and (tier is None or p["tier"] == tier)]
COMMON = (f"必ず自然な日本語（ひらがな・カタカナ・漢字）だけで、180字以内で答えてください。中国語・英語の文は書かないでください。"
          f"CEOは人間の{USER}さんです。あなたは{USER}さんの発言を代筆・創作してはいけません。自分の役職の立場だけで話してください。"
          "この組織はローカル環境内でファイルに提案を書くことしかできません。外部送信やgit pushは提案しないでください。"
          "他の人の発言をそのまま繰り返さず、自分の役割ならではの内容を書いてください。")
STATE = {"status": "起動", "topic": "", "transcript": [], "updated": "", "speaking": None, "exec": None}
# 健全性は待受ポートではなく、そのサービスが仕事を返す経路の HTTP 状態。
# LiteLLM の /health/liveliness はプロセスが生きていれば 200 で、/v1/models が 500 でも村は稼働と出ていた。
# 表示は /v1/models（llama-swap と同じ機能経路）が 2xx のときだけ稼働。鍵は LiteLLM にだけ付ける。
SERVICES = {"Ollama": (11434, "/"), "llama1.5B": (8081, "/health"), "llama3B": (8085, "/health"), "llama7B": (8086, "/health"),
            "LocalAI": (8084, "/readyz"), "llama-swap": (8090, "/v1/models"), "LiteLLM": (4000, "/v1/models"), "OpenWebUI": (8080, "/health")}
PROBE_TIMEOUT = float(os.environ.get("COUNCIL_PROBE_TIMEOUT", "3"))
PENDING, CHAT = [], []
ADVICE = os.path.join(HERE, "advice_inbox.md")      # パートB: クラウドの助言（現在はGrokのみ）（追記された行を最優先の議題にする）
import advice_guard
import decision_lock
import decision_loop
GUARD_ON = os.environ.get("COUNCIL_ADVICE_GUARD", "1") != "0"          # 0で助言ガードを無効化
GUARD_LLM = os.environ.get("COUNCIL_ADVICE_GUARD_LLM", "0") == "1"     # 1で検証モデル(fast)にも矛盾確認させる（メモリ節約のため既定は無効）
LOCK_ON = os.environ.get("COUNCIL_DECISION_LOCK", "1") != "0"          # 0で固定決定ロックを無効化（通常は使わない）
REJECTED = os.path.join(HERE, "rejected_decisions.md"); REJ = collections.deque(maxlen=10)
_CL = {"checked": 0.0, "status": "確認前", "calls": collections.deque()}
def claude_status():
    """'利用可' / '未ログイン' / 'CLI未導入' / '無効'。auth status は5分キャッシュ。"""
    if not CLAUDE_ON: return "無効"
    if not (CLAUDE_BIN and os.path.isfile(CLAUDE_BIN) and os.access(CLAUDE_BIN, os.X_OK)): return "CLI未導入"
    if time.time() - _CL["checked"] > 300:
        _CL["checked"] = time.time()
        try:
            r = subprocess.run([CLAUDE_BIN, "auth", "status"], capture_output=True, text=True, timeout=20, stdin=subprocess.DEVNULL)
            _CL["status"] = "利用可" if json.loads(r.stdout or "{}").get("loggedIn") else "未ログイン"
        except Exception as e: _CL["status"] = "未ログイン"; log_sys(f"claude auth status 失敗: {e!r}")
    return _CL["status"]
def claude_ask(system, user):
    """ツール全無効・空の作業ディレクトリ・入力6000字/出力1200字・時間当たり回数制限つきで claude -p を呼ぶ。失敗時 None。"""
    if claude_status() != "利用可": return None
    q = _CL["calls"]
    while q and time.time() - q[0] > 3600: q.popleft()
    if len(q) >= CLAUDE_MAX_HOUR: log_sys("Claude: 1時間あたりの上限に達したため省略"); return None
    q.append(time.time())
    prompt = (system + "\n\n" + user)[:6000]
    try:
        with tempfile.TemporaryDirectory(prefix="council-claude-") as d:
            r = subprocess.run([CLAUDE_BIN, "-p", "--output-format", "text", "--tools", "",
                                "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
                               input=prompt, capture_output=True, text=True, timeout=CLAUDE_TIMEOUT, cwd=d,
                               env={k: v for k, v in os.environ.items() if k in ("HOME", "PATH", "LANG", "USER", "TERM")})
        out = (r.stdout or "").strip()
        if r.returncode != 0 or not out:
            log_sys(f"Claude 呼び出し失敗 rc={r.returncode}: {(r.stderr or out)[:200]}")
            if re.search(r"log ?in|auth|credential", (r.stderr or "") + out, re.I): _CL["status"] = "未ログイン"; _CL["checked"] = time.time()
            return None
        return out[:1200]
    except Exception as e:
        log_sys(f"Claude 呼び出し失敗: {e!r}"); return None
def advice_lines():
    if not os.path.exists(ADVICE): return []
    return open(ADVICE, encoding="utf-8").read()[-20000:].splitlines()
ROT = [0]

def now(): return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
def free_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable"): return int(l.split()[1]) // 1024
    return 0
class _KeepStatus(urllib.request.HTTPErrorProcessor):
    """3xx/4xx/5xx を例外や別URLへの追跡にせず、その応答の状態だけを返す。"""
    def http_response(self, request, response):
        return response
    https_response = http_response
_OPENER = urllib.request.build_opener(_KeepStatus)

def probe_headers(name):
    """認証が要る機能経路にだけ鍵を付ける。他のローカルサービスへは出さない。"""
    if name == "LiteLLM" and KEY:
        return {"Authorization": "Bearer " + KEY}
    return {}

def probe_ok(port, path, headers=None, timeout=None):
    """127.0.0.1 の機能経路が 2xx のときだけ稼働。待受だけでは稼働にしない。"""
    timeout = PROBE_TIMEOUT if timeout is None else timeout
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        return False
    if not isinstance(path, str) or not path.startswith("/") or "://" in path or re.search(r"[\x00-\x20]", path):
        return False
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        headers={"Connection": "close", **(headers or {})},
        method="GET")
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return 200 <= int(getattr(r, "status", 0)) < 300
    except Exception:
        return False

def service_snapshot(timeout=None):
    """名前 → 機能経路が 2xx か。並列。時間内に答えが無ければ停止。"""
    timeout = PROBE_TIMEOUT if timeout is None else timeout
    items = list(SERVICES.items())
    result = {}
    lock = threading.Lock()
    def one(name, port, path):
        ok = probe_ok(port, path, probe_headers(name), timeout)
        with lock:
            result[name] = True if ok is True else False
    threads = []
    for name, (port, path) in items:
        t = threading.Thread(target=one, args=(name, port, path), daemon=True)
        t.start(); threads.append(t)
    end = time.monotonic() + timeout + 1.0
    for t in threads:
        t.join(max(0.0, end - time.monotonic()))
    return {name: True if result.get(name) is True else False for name, _ in items}

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

TIER_ROLE = {
    "COO": "全社を統括し、議題を適切な役員に割り振り、結論を短く報告にまとめます。細部より優先順位と責任の所在を示します。",
    "役員": "担当部門の最終責任者として、選択肢を比べて一つに決め、理由を一言添えます。曖昧な表現は避けます。",
    "秘書": "役員を補佐し、論点整理・ブリーフィング・リスクと抜けの洗い出しを担当します。箇条書きで簡潔に書きます。",
    "管理職": "部長として、実行可能な具体策を担当者・手順・確認方法つきで提案します。",
    "一般職": "現場の担当者として、実際の作業手順、かかる手間、つまずきやすい点を具体的に述べます。",
}
RECENT = collections.defaultdict(lambda: collections.deque(maxlen=6))   # 住民ごとの最近の発言（プロフィール表示用）
def remember(pid, kind, text): RECENT[pid].append({"at": now(), "kind": kind, "text": text[:400]})
def too_similar(out, hist):
    return any(difflib.SequenceMatcher(None, out, h.split(": ", 1)[-1]).ratio() > 0.55 for h in hist)

def persona(p):
    s = f"あなたはAI組織の{p['title']}（{p['dept']}）です。" + TIER_ROLE.get(p["tier"], "")
    if p.get("knowledge"): s += "参照知識: " + p["knowledge"]
    if LOCK_ON and decision_lock.locks():
        s += "【CEO固定決定・覆禁止】" + decision_lock.digest().replace("\n", " / ")
    return s

def health_summary():
    up = service_snapshot()
    locked = decision_lock.forced_down_services() if LOCK_ON else set()
    down = [n for n, ok in up.items() if not ok and n not in locked]
    fixed = [n for n in locked if n in up and not up[n]]
    parts = [f"空きメモリ {free_mb()}MB"]
    if fixed: parts.append("固定停止: " + ", ".join(fixed))
    parts.append("停止中: " + (", ".join(down) if down else "なし"))
    return down, " / ".join(parts)

KEYWORDS = {"cfo": "財務 税 資金 融資 キャッシュ 会計", "chro": "人事 給与 労務 採用 社会保険 人件費", "cso": "戦略 経営 分析 予測 予算 KPI 成長 レポート",
            "cio": "投資 資産 為替 不動産 投信 株 貯蓄", "cqo": "品質 テスト セキュリティ 監査 CI バグ 検証 メモリ サービス 停止 Mamori lint 言語"}
def pick_exec(topic):
    sc = {e: sum(topic.count(w) for w in ws.split()) for e, ws in KEYWORDS.items()}
    best = max(sc, key=sc.get)
    if sc[best] == 0: best = list(KEYWORDS)[ROT[0] % 5]
    return best

RSTATE = os.path.join(HERE, "recurring_state.json")   # 継続議題の進捗（実行時ファイル）
REC_RE = re.compile(r"^- \[(?:〜|~|継続[:：])\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2})\]\s*(.+)$")
def _deadline(date_s, hm):
    h, m = map(int, hm.split(":")); n = datetime.datetime.now()
    if date_s: return datetime.datetime.strptime(f"{date_s} {h:02d}:{m:02d}", "%Y-%m-%d %H:%M")
    d = n.replace(hour=h, minute=m, second=0, microsecond=0)
    return d if d > n else d + datetime.timedelta(days=1)       # 「〜07:00」は次に来る07:00
def sub_items(text):
    m = re.search(r"(?:候補|項目)[:：]\s*([^。\n]+)", text)
    return [x.strip() for x in re.split(r"[、,/／]", m.group(1)) if x.strip()] if m else []
def _rstate():
    try: return json.load(open(RSTATE, encoding="utf-8"))
    except Exception: return {}
def refuse_topic(src, topic):
    """固定決定または助言ガードに反する議題なら理由リスト。
    status が locked の間は、CEOの丁寧な言い換えでも文言では解除できない。"""
    if not LOCK_ON and not GUARD_ON: return []
    raw = advice_guard.screen(topic, locks=LOCK_ON, guard=GUARD_ON)
    return [f"{n}: {why}（該当: {frag}）" for n, why, frag in raw]

def pick_topic():
    def accept(src, topic):
        hits = refuse_topic(src, topic)
        if not hits: return src, topic
        log_sys(f"固定決定により議題却下 [{src}]: {' / '.join(hits)[:200]}")
        reject_log(topic, f"（議題自体を却下・会議せず）{topic[:300]}", hits, False)
        return None
    if os.path.exists(ADVICE):                       # クラウドの助言（Grok）を最優先
        lines = advice_lines()
        for i, l in enumerate(lines):
            s = l.strip()
            if s.startswith("- ") and not s.startswith("- [済]") and s[2:].strip():
                lines[i] = l.replace("- ", "- [済] ", 1)
                open(ADVICE, "w", encoding="utf-8").write("\n".join(lines) + "\n")
                got = accept("クラウドの助言（Grok）", s[2:].strip()[:1000])
                if got: return got
    while PENDING:
        text = PENDING.pop(0)
        got = accept("CEOの指示", text)
        if got: return got
        thread_log("COO", "固定決定に反するため議題を受け付けませんでした: " + text[:120] + "（解除は locked_decisions.md の status を unlocked に）")
    inbox = os.path.join(HERE, "inbox.md")
    if os.path.exists(inbox):
        lines = open(inbox, encoding="utf-8").read().splitlines(); changed = False; pick = None
        for i, l in enumerate(lines):
            s = l.strip(); rm = REC_RE.match(s)
            if rm:
                dl = _deadline(rm.group(1), rm.group(2)); body = rm.group(3)
                if datetime.datetime.now() >= dl:
                    lines[i] = f"- [済] {body}（期限 {dl:%Y-%m-%d %H:%M} 到達）"; changed = True; continue
                if not rm.group(1):                                  # 相対期限は絶対日時に書き換えて固定
                    lines[i] = f"- [継続:{dl:%Y-%m-%d %H:%M}] {body}"; changed = True
                if pick is None:
                    items = sub_items(body); st = _rstate(); key = body[:80]; n = st.get(key, 0)
                    if items:
                        item = items[n % len(items)]
                        topic = (f"{body}\n\n【今回の設計項目 {n % len(items) + 1}/{len(items)}（通算{n + 1}回目）: {item}】"
                                 f"この回は「{item}」だけを具体的に設計してください（構文例・意味・安全チェック・テスト例）。")
                    else: topic = body
                    if refuse_topic("継続議題", topic):
                        log_sys(f"固定決定により継続議題の当該項目をスキップ: {topic[:120]}")
                        st[key] = n + 1; json.dump(st, open(RSTATE, "w", encoding="utf-8"), ensure_ascii=False)
                        changed = True; continue
                    st[key] = n + 1; json.dump(st, open(RSTATE, "w", encoding="utf-8"), ensure_ascii=False)
                    pick = ("継続議題", topic)
                continue
            if pick is None and s.startswith("- ") and not s.startswith("- [済]"):
                if refuse_topic("受信箱", s[2:]):
                    lines[i] = l.replace("- ", "- [済] ", 1) + "（固定決定により却下）"
                    changed = True
                    reject_log(s[2:], f"（議題自体を却下・会議せず）{s[2:][:300]}",
                               [f"{n}: {why}（該当: {frag}）" for n, why, frag in decision_lock.check_topic(s[2:])], False)
                    continue
                lines[i] = l.replace("- ", "- [済] ", 1); changed = True; pick = ("受信箱", s[2:])
        if changed: open(inbox, "w", encoding="utf-8").write("\n".join(lines) + "\n")
        if pick: return pick
    down, h = health_summary()
    if down: return "サービス健全性", f"ローカルAIサービスが停止中: {', '.join(down)}（{h}）。原因と復旧・予防策。固定停止のサービスは起動しないこと。"
    rw = "/workspace/repo-analysis/docs/REMAINING_WORK.md"
    if os.path.exists(rw):
        items = [l.strip() for l in open(rw, encoding="utf-8").read().split("\n## ")[0].splitlines() if l.strip().startswith(("-", "*"))]
        if items: return "リポジトリ残作業", "Service Hubの残作業: " + items[ROT[0] % len(items)][:300]
    return "サービス健全性", f"ローカルAI環境の改善（{h}）。固定停止のサービスは起動・再構築しないこと。"


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
        if out != "（応答なし）" and too_similar(out, hist):      # 前の発言の繰り返しは1回だけ言い直させる
            log_sys(f"{p['name']}: 前の発言と似ているため言い直し")
            m2, out2 = ask("balanced" if p["tier"] in ("COO", "役員") else p["model"], persona(p) + instr + "これまでの発言を繰り返さず、必ず新しい観点や具体例を加えてください。",
                           f"議題: {topic}\n\nこれまでの発言:\n{ctx}\n\nあなた（{p['name']}）の、これまでと違う新しい発言:")
            if out2 != "（応答なし）" and not too_similar(out2, hist): m, out = m2, out2
        hist.append(f"{p['name']}: {out}"); remember(p["id"], "会議", out)
        STATE["transcript"].append({"id": p["id"], "role": p["name"], "model": m, "text": out}); STATE["updated"] = now(); tick()
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
    hits = guard_check(dec)
    if hits:                                                   # 助言と矛盾 → 却下を記録し、役員にやり直させる（1回）
        reject_log(topic, dec, hits, False)
        STATE["transcript"].append({"id": "claude" if "claude" in P else "coo", "role": "助言ガード", "model": "guard",
                                    "text": "この決定は助言またはCEO固定決定と食い違うため記録しません。やり直してください: " + " / ".join(hits)})
        dec = speak(ex, "役員として、前の決定は相談役の助言またはCEO固定決定と食い違うため却下されました。理由: " + " / ".join(hits) +
                    "。固定決定と助言に従い『決定:』1〜2文と『次のアクション:』箇条書き3つ以内を書き直してください。llama7Bは起動せず、dataCrypto/IV更新には触らず、asやwhileをMamoriに足さないこと。")
        hits2 = guard_check(dec)
        if hits2:
            reject_log(topic, dec, hits2, True)
            STATE.update(status=f"待機中（決定は助言/固定決定と矛盾のため不記録・次回まで最大{INTERVAL}秒）", updated=now(), speaking=None)
            return
        summ = speak(P["coo"], f"COOとして、助言に沿って修正した決定を2〜3文でまとめ、CEOの{USER}さんへの報告文にしてください。")
    review = chair_review(topic, hist, dec)
    review_text = review[1] if review else ""
    topic_line = topic[:120] if src != "継続議題" else topic.split(chr(10))[0][:60] + " " + topic.split(chr(10))[-1][:80]
    outcome, hits3 = decision_lock.commit_decision(
        dec, decisions_path=os.path.join(HERE, "decisions.md"), rejected_path=REJECTED,
        topic=topic_line, summary=summ, review=review_text, src=src, officer=ex["name"])
    if outcome == "reject":
        reasons = [f"{n}: {why}（該当: {frag}）" for n, why, frag in hits3]
        rec = {"at": now(), "topic": topic.split(chr(10))[0][:80], "decision": dec[:400], "reasons": reasons, "retry": True}
        REJ.append(rec)
        log_sys("保存前検査: 決定を不記録（" + "; ".join(reasons)[:200] + "）")
        try:
            decision_loop.record_rejection(HERE, topic, dec, reasons)
        except Exception as ex:  # noqa: 却下の本体は commit_decision が書いた。ログ失敗で会議を止めない
            log_sys(f"閉ループ却下記録の失敗: {ex!r}")
        STATE.update(status=f"待機中（決定は助言/固定決定と矛盾のため不記録・次回まで最大{INTERVAL}秒）", updated=now(), speaking=None)
        return
    # 本文は保存前検査が decisions.md に書いた。閉ループはマーカーを読み戻し、次のアクションを実行・検証する。
    try:
        block = "\n" + decision_loop.marker_for(decision_loop.decision_id(topic, dec)) + "\n"
        loop_rec = decision_loop.accept_and_verify(root=HERE, topic=topic, decision=dec, block=block)
        if loop_rec.get("status") != "verified":
            log_sys(f"閉ループ未完了: {loop_rec.get('status')} {str(loop_rec.get('detail',''))[:180]}")
    except Exception as ex:  # noqa: 会議スレッドは閉じない。記録の成否は execution_log が持つ
        log_sys(f"閉ループ失敗: {ex!r}")
    if src == "CEOの指示": thread_log("COO", summ)
    STATE.update(status=f"待機中（次回まで最大{INTERVAL}秒）", updated=now(), speaking=None)

def guard_check(dec):
    """助言・固定決定と食い違う決定なら違反リストを返す（空なら記録してよい）。"""
    hits = []
    if LOCK_ON:
        hits.extend(f"{n}: {why}（該当: {frag}）" for n, why, frag in decision_lock.check(dec))
    if GUARD_ON:
        hits.extend(f"{n}: {why}（該当: {frag}）" for n, why, frag in advice_guard.check(dec))
        if not hits and GUARD_LLM and free_mb() >= MIN_FREE_MB:
            _, v = ask("fast", "あなたは検証係です。助言と決定が矛盾するかだけを判定し、矛盾なら『矛盾: 理由』、なければ『問題なし』とだけ答えてください。",
                       f"助言:\n{advice_guard.advice_digest(advice_lines())}\n\n決定:\n{dec}\n\n判定:")
            if v.strip().startswith("矛盾"): hits.append("検証モデル: " + v.strip()[:200])
    return hits

def reject_log(topic, dec, hits, retry):
    rec = {"at": now(), "topic": topic.split(chr(10))[0][:80], "decision": dec[:400], "reasons": hits, "retry": retry}
    REJ.append(rec); log_sys(f"助言ガード: 決定を不記録（{'; '.join(hits)[:200]}）")
    decision_lock.append_rejection(REJECTED, rec["topic"], dec, hits, retry=retry)
    try:
        decision_loop.record_rejection(HERE, topic, dec, hits)
    except Exception as ex:  # noqa: 却下の本体は append_rejection。ログ失敗で会議を止めない
        log_sys(f"閉ループ却下記録の失敗: {ex!r}")

def chair_review(topic, hist, dec):
    """役員決定のあとに議長が講評。Claudeが使えればClaude（1会議1回）、無理ならbalancedが代理議長。"""
    instr = ("あなたはこの会議の議長・相談役です。役員の決定を検証し、誤り（事実誤認、Mamori言語の構文ミス、実行できない手順、安全上の問題）を具体的に指摘し、"
             "最後に『改善案:』として簡潔な推奨を1〜3行で示してください。日本語で300字以内。ツールやファイル操作は使わず文章だけで答えてください。")
    ctx = "\n".join(hist[-6:])[:3500]
    STATE["speaking"] = "claude" if "claude" in P else "coo"
    out, m = claude_ask(instr, f"議題: {topic[:1200]}\n\n会議の発言:\n{ctx}\n\n役員の決定:\n{dec}\n\n議長としての講評:"), "claude"
    if out is None:
        m, out = ask("balanced", "あなたはAI組織の会議の代理議長です。" + instr, f"議題: {topic[:1200]}\n\n会議の発言:\n{ctx}\n\n役員の決定:\n{dec}\n\n議長としての講評:")
        m = f"{m}（代理議長）"
        if out == "（応答なし）": return None
    out = re.sub(r"^\**議長(としての)?講評\**[:：]\s*", "", out.strip())
    pid = "claude" if "claude" in P else "coo"; who = "Claude（相談役）" if m == "claude" else "代理議長"
    STATE["transcript"].append({"id": pid, "role": who, "model": m, "text": out}); STATE["updated"] = now(); tick()
    remember(pid, "議長講評", out)
    with open(os.path.join(HERE, "logs", f"{datetime.date.today().isoformat()}.md"), "a", encoding="utf-8") as f: f.write(f"**{who}**（{m}）\n\n{out}\n\n")
    return f"議長講評（{who}・{m}）", out

def thread_log(who, text):
    CHAT.append({"who": who, "text": text, "at": now()}); del CHAT[:-30]
    with open(THREAD, "a", encoding="utf-8") as f: f.write(f"- {now()} **{who}**: {text}\n")

def api_state():
    dp = os.path.join(HERE, "decisions.md")
    decs = [d.strip() for d in open(dp, encoding="utf-8").read().split("\n## ") if d.strip()][-5:] if os.path.exists(dp) else []
    return {k: STATE[k] for k in ("status", "topic", "updated", "speaking", "exec")} | {"free_mb": free_mb(), "transcript": STATE["transcript"][-8:],
            "services": service_snapshot(), "decisions": decs, "chat": CHAT[-12:], "user": USER,
            "claude": {"status": claude_status(), "calls_last_hour": sum(1 for t in _CL["calls"] if time.time() - t < 3600), "max_per_hour": CLAUDE_MAX_HOUR},
            "advice": [l.strip()[2:][:600] for l in advice_lines() if l.strip().startswith("- ")][-5:],
            "company": {k: COMPANY.st.get(k) for k in ("linked", "name", "scale", "last_fetch", "error")},
            "guard": {"on": GUARD_ON, "llm": GUARD_LLM, "rejected": list(REJ)[-5:]},
            "locks": {"on": LOCK_ON, "items": decision_lock.public()},
            "loop": decision_loop.public(HERE)}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, b, ct, code=200):
        self.send_response(code); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(b)))
        self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers(); self.wfile.write(b)
    def js(self, o): self.send(json.dumps(o, ensure_ascii=False).encode(), "application/json; charset=utf-8")
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/state": return self.js(api_state())
        if path == "/api/loop": return self.js(decision_loop.public(HERE))
        if path == "/api/company": return self.js(COMPANY.public())
        if path == "/api/org": return self.js({"people": [{k: p[k] for k in ("id", "tier", "name", "title", "dept", "parent", "model")} for p in ORG["people"]], "user": USER})
        if path.startswith("/api/person/"):
            p = P.get(path.rsplit("/", 1)[-1])
            if not p: return self.send(b"unknown", "text/plain", 404)
            return self.js({k: p.get(k, "") for k in ("id", "tier", "name", "title", "dept", "parent", "model")} | {"recent": list(RECENT[p["id"]])[::-1]})
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
        if self.path == "/api/company/refresh":
            try: d = json.loads(self.rfile.read(n) or b"{}")
            except Exception: return self.send(b"bad", "text/plain", 400)
            if "demo" in d and not COMPANY.set_demo(d.get("demo")): return self.send(b"unknown demo", "text/plain", 400)
            st = COMPANY.refresh()
            if d.get("instant"):   # テスト用: 目標まで一気に
                with COMPANY.lock:
                    if COMPANY.st["target"]: COMPANY.st["scale"] = dict(COMPANY.st["target"], converged=True)
                st = COMPANY.public()
            return self.js(st)
        try: d = json.loads(self.rfile.read(n)); text = str(d.get("text", "")).strip()[:500]
        except Exception: return self.send(b"bad", "text/plain", 400)
        if not text: return self.send(b"empty", "text/plain", 400)
        if self.path == "/api/chat":
            p = P.get(str(d.get("to", "")))
            if not p: return self.send(b"unknown", "text/plain", 404)
            thread_log(USER, f"→{p['name']}: {text}")
            hist = "\n".join(f"{c['who']}: {c['text']}" for c in CHAT[-6:])
            if p["id"] == "claude":
                out = claude_ask(f"あなたはローカルAI組織の相談役Claudeです。CEOの{USER}さんと1対1で話しています。日本語で300字以内、敬語で簡潔に答えてください。ツールは使えません。",
                                 f"最近の会話:\n{hist[:2500]}\n\n{USER}さんの発言: {text}\n\nあなたの返答:")
                if out is None:
                    m, out = ask("balanced", f"あなたはAI組織の相談役（Claudeの代理）です。{USER}さんに敬語で短く答えてください。", f"{USER}さんの発言: {text}\n\n返答:")
                    out = f"（Claudeは{claude_status()}のため代理で回答）" + out; m = f"{m}（代理）"
                else: m = "claude"
                thread_log(f"{p['name']}（{m}）", out); remember(p["id"], "清継さんへの返答", out)
                return self.js({"id": p["id"], "who": p["name"], "model": m, "text": out})
            m, out = ask("balanced" if p["tier"] in ("COO", "役員") else p["model"],
                         persona(p) + f"今は村でCEOの{USER}さんと1対1で話しています。役職の立場を保ち、{USER}さんに敬語で答えてください。",
                         f"最近の会話:\n{hist}\n\n{USER}さんの発言: {text}\n\nあなた（{p['name']}）の返答:")
            thread_log(f"{p['name']}（{m}）", out); remember(p["id"], "清継さんへの返答", out)
            return self.js({"id": p["id"], "who": p["name"], "model": m, "text": out})
        if self.path == "/api/topic":
            thread_log(USER, f"→組織全体（COO）: {text}"); PENDING.append(text)
            return self.js({"ok": True})
        self.send(b"not found", "text/plain", 404)

LAST_TICK = [time.monotonic()]; GEN = [0]
def tick(): LAST_TICK[0] = time.monotonic()
def loop(gen):
    """会議ループ。待機は壁時計とモノトニックの両方で判定（ボックス一時停止中はモノトニックが進まないため）。"""
    while GEN[0] == gen:
        tick()
        try:
            if free_mb() < MIN_FREE_MB:
                STATE.update(status=f"空きメモリ不足でスキップ（{free_mb()}MB）", updated=now()); log_sys(STATE["status"])
            else: session()
        except BaseException as ex:  # noqa: スレッドを絶対に死なせない
            log_sys(f"会議失敗: {ex!r}"); STATE.update(status="エラー（次回再試行）", speaking=None)
        w0, m0 = time.time(), time.monotonic()
        while GEN[0] == gen and not PENDING:
            tick()
            if time.time() - w0 >= INTERVAL or time.monotonic() - m0 >= INTERVAL: break
            if time.time() - w0 < -60: break                       # 時計が巻き戻った
            if int(time.time()) % 10 < 2 and any(l.strip().startswith("- ") and not l.strip().startswith("- [済]") for l in advice_lines()): break   # 助言が届いたらすぐ会議
            time.sleep(2)
def start_loop(reason):
    GEN[0] += 1; tick(); log_sys(f"会議ループ開始 gen={GEN[0]}（{reason}）")
    threading.Thread(target=loop, args=(GEN[0],), daemon=True, name=f"council-loop-{GEN[0]}").start()

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
    threading.Thread(target=ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever, daemon=True).start()
    threading.Thread(target=COMPANY.run, args=(int(os.environ.get("COMPANY_STEP_SEC", "20")),), daemon=True, name="company-link").start()
    log_sys("AI組織デーモン起動")
    start_loop("起動")
    STALL = int(os.environ.get("COUNCIL_STALL_SEC", str(max(2 * INTERVAL, 3 * TIMEOUT + 60))))
    while True:   # ウォッチドッグ: STALL秒（モノトニック）tick が無い／スレッド死亡なら作り直す
        time.sleep(15)
        alive = any(t.name == f"council-loop-{GEN[0]}" and t.is_alive() for t in threading.enumerate())
        if not alive: start_loop("ループスレッド停止を検知")
        elif time.monotonic() - LAST_TICK[0] > STALL: start_loop(f"{STALL}秒以上tickなし")
