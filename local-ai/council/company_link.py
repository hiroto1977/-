#!/usr/bin/env python3
"""企業データ連携（任意・既定OFF）。企業のBS/PL・従業員数・取引先数を読み取り専用で取り込み、
村の規模（住民・家・屋台・工房・倉庫・区画・荒れ地）に変換する。標準ライブラリのみ（SQLAlchemyは任意）。

設定: company_link.json（無ければ環境変数）。
  COMPANY_LINK=1 で有効化 / COMPANY_DEMO=example|small|large|deficit|off（同梱の架空JSON。DB不要）
  COMPANY_SOURCE=json|csv|sqlite|sql / COMPANY_PATH / COMPANY_DB_URL / COMPANY_REFRESH_SEC
秘密（DB URLのパスワード等）はログ・APIに出さない（mask_url）。
デモ中の札は「架空（デモ）」。未設定・demo=off のときは「未連携」（linked は false）。"""
import csv, json, math, os, re, sqlite3, threading, time, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CONF_PATH = os.environ.get("COMPANY_LINK_CONF", os.path.join(HERE, "company_link.json"))
METRICS = ("revenue", "operating_income", "net_income", "total_assets", "net_assets", "liabilities", "cash", "employees", "partners")
LABELS = {"revenue": "売上高", "operating_income": "営業利益", "net_income": "純利益", "total_assets": "総資産", "net_assets": "純資産",
          "liabilities": "負債", "cash": "現金", "employees": "従業員数", "partners": "取引先数"}

class ReadOnlyViolation(Exception): pass
class LinkError(Exception): pass

# ---------------- 読み取り専用の検査 ----------------
_WRITE = re.compile(r"\b(insert|update|delete|replace|merge|upsert|create|drop|alter|truncate|grant|revoke|attach|detach|pragma|vacuum|reindex|copy|call|exec|execute|lock|set|commit|rollback|savepoint|into)\b", re.I)
def assert_select_only(sql):
    """SELECT/WITH 1文のみ許可。コメント・複文・書き込み語を拒否。"""
    s = (sql or "").strip().rstrip(";").strip()
    if not s: raise ReadOnlyViolation("空のSQL")
    if ";" in s or "--" in s or "/*" in s: raise ReadOnlyViolation("複文・コメントは禁止")
    if not re.match(r"(?is)^(select|with)\b", s): raise ReadOnlyViolation("SELECT/WITHのみ許可")
    body = re.sub(r"'(?:[^']|'')*'", "''", s)       # 文字列リテラル内は無視
    m = _WRITE.search(body)
    if m: raise ReadOnlyViolation(f"書き込み系キーワード禁止: {m.group(1)}")
    return s

_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_\.]*$")
def build_query(mapping):
    """mapping: {"table": "...", "columns": {metric: column}, "where": 任意, "order_by": 任意} または {"query": "SELECT ..."}"""
    if mapping.get("query"): return assert_select_only(mapping["query"])
    t = mapping.get("table", "")
    if not _IDENT.match(t): raise LinkError("table名が不正")
    cols = []
    for k, c in (mapping.get("columns") or {}).items():
        if k not in METRICS: raise LinkError(f"未知の指標: {k}")
        if not _IDENT.match(str(c)): raise LinkError(f"列名が不正: {c}")
        cols.append(f"{c} AS {k}")
    if not cols: raise LinkError("columns が空")
    q = f"SELECT {', '.join(cols)} FROM {t}"
    if mapping.get("order_by"):
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*( (ASC|DESC))?$", mapping["order_by"], re.I): raise LinkError("order_byが不正")
        q += f" ORDER BY {mapping['order_by']}"
    return assert_select_only(q + " LIMIT 1")

def mask_url(u):
    return re.sub(r"(//[^:/@]+):[^@]*@", r"\1:***@", u or "")

def _num(v):
    if v is None or v == "": return None
    try: return float(str(v).replace(",", "").replace("_", ""))
    except ValueError: return None

def _normalize(row, columns=None):
    """row(dict) → METRICSのdict。columns={metric: 元の列名} があれば列名を対応付け。"""
    inv = {v: k for k, v in (columns or {}).items()}
    out = {}
    for k, v in row.items():
        key = inv.get(k, k)
        if key in METRICS: out[key] = _num(v)
    return {k: out.get(k) for k in METRICS}

# ---------------- コネクタ（差し替え可能） ----------------
class JsonConnector:
    def __init__(self, path, columns=None): self.path, self.columns = path, columns
    def fetch(self):
        d = json.load(open(self.path, encoding="utf-8"))
        name = d.get("name", "")
        m = d.get("metrics", d)
        return name, _normalize(m, self.columns)

class CsvConnector:
    """1行目ヘッダ。最後の行（最新期）を使う。"""
    def __init__(self, path, columns=None): self.path, self.columns = path, columns
    def fetch(self):
        rows = list(csv.DictReader(open(self.path, encoding="utf-8-sig")))
        if not rows: raise LinkError("CSVが空")
        return rows[-1].get("name", ""), _normalize(rows[-1], self.columns)

class SqliteConnector:
    def __init__(self, path, mapping): self.path, self.mapping = path, mapping
    def fetch(self):
        q = build_query(self.mapping)
        if not os.path.exists(self.path): raise LinkError("SQLiteファイルが無い")
        con = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=5)   # OSレベルでも読み取り専用
        try:
            con.execute("PRAGMA query_only = ON")
            con.row_factory = sqlite3.Row
            r = con.execute(q).fetchone()
        finally: con.close()
        if r is None: raise LinkError("該当行なし")
        return self.mapping.get("name", ""), _normalize(dict(r))

class SqlConnector:
    """任意のSQL DB（SQLAlchemy URL）。SQLAlchemy/ドライバが無ければ丁寧にエラー。"""
    def __init__(self, url, mapping): self.url, self.mapping = url, mapping
    def fetch(self):
        q = build_query(self.mapping)
        if not self.url: raise LinkError("COMPANY_DB_URL が未設定です")
        try: import sqlalchemy
        except ImportError: raise LinkError("SQLAlchemy が未インストールです（pip install sqlalchemy と各DBドライバが必要）")
        try: eng = sqlalchemy.create_engine(self.url, pool_pre_ping=True)
        except Exception as ex: raise LinkError(f"DBドライバを読み込めません: {type(ex).__name__}（{mask_url(str(ex))[:160]}）")
        try:
            with eng.connect() as c:
                try: c.execute(sqlalchemy.text("SET TRANSACTION READ ONLY"))
                except Exception: pass
                r = c.execute(sqlalchemy.text(q)).mappings().first()
                c.rollback()
        except Exception as ex: raise LinkError(f"DB読み取り失敗: {type(ex).__name__}（{mask_url(str(ex))[:160]}）")
        finally: eng.dispose()
        if r is None: raise LinkError("該当行なし")
        return self.mapping.get("name", ""), _normalize(dict(r))

def load_conf():
    c = {}
    if os.path.exists(CONF_PATH):
        try: c = json.load(open(CONF_PATH, encoding="utf-8"))
        except Exception as ex: c = {"_conf_error": f"company_link.json を読めません: {ex}"}
    e = os.environ
    if "COMPANY_LINK" in e: c["enabled"] = e["COMPANY_LINK"] == "1"
    for k, ek in (("source", "COMPANY_SOURCE"), ("path", "COMPANY_PATH"), ("db_url", "COMPANY_DB_URL")):
        if e.get(ek): c[k] = e[ek]
    if e.get("COMPANY_REFRESH_SEC"): c["refresh_sec"] = int(e["COMPANY_REFRESH_SEC"])
    if "COMPANY_DEMO" in e: c["demo"] = e["COMPANY_DEMO"]   # 空や off も上書き（ファイルの demo より優先）
    c.setdefault("enabled", False); c.setdefault("source", "json"); c.setdefault("refresh_sec", 600)
    return c

def make_connector(c):
    src, path = c.get("source", "json"), c.get("path", "")
    if path and not os.path.isabs(path): path = os.path.join(HERE, path)
    m = c.get("mapping") or {}
    if src == "json": return JsonConnector(path, m.get("columns"))
    if src == "csv": return CsvConnector(path, m.get("columns"))
    if src == "sqlite": return SqliteConnector(path, m)
    if src == "sql": return SqlConnector(c.get("db_url") or os.environ.get("COMPANY_DB_URL", ""), m)
    raise LinkError(f"未知のsource: {src}")

# ---------------- 指標 → 村の規模（純粋関数） ----------------
BASE = {"residents": 0, "houses": 0, "stalls": 0, "roads": 0, "workshops": 0, "plots": 0, "radius": 0.0,
        "warehouses": 0, "wasteland": 0, "vacant": 0, "health": "normal"}
LIMITS = {"residents": (0, 60), "houses": (0, 30), "stalls": (0, 24), "roads": (0, 8), "workshops": (0, 12),
          "plots": (2, 24), "warehouses": (0, 8), "wasteland": (0, 12), "vacant": (0, 30)}

def _lg(x, unit):
    """対数スケール: x<=0 は0。unit 倍ごとに +1 程度。"""
    return math.log10(1 + max(0.0, x or 0) / unit)

def _clamp(k, v):
    lo, hi = LIMITS[k]; return int(max(lo, min(hi, round(v))))

def metrics_to_scale(m):
    """企業指標 → 目標規模。金額の単位は円。None は0扱い。"""
    g = lambda k: (m or {}).get(k) or 0.0
    emp, prt, rev, cash = g("employees"), g("partners"), g("revenue"), g("cash")
    ta, na, li, oi, ni = g("total_assets"), g("net_assets"), g("liabilities"), g("operating_income"), g("net_income")
    if not li and ta and na: li = max(0.0, ta - na)
    debt_ratio = li / ta if ta > 0 else 0.0
    s = {}
    s["residents"] = _clamp("residents", 12 * _lg(emp, 1))                 # 1人≈3, 10人≈12, 100≈24, 1万≈48
    s["houses"] = _clamp("houses", s["residents"] / 2)
    s["stalls"] = _clamp("stalls", 6 * _lg(prt, 1))                        # 取引先→市場の屋台
    s["roads"] = _clamp("roads", 2 * _lg(prt, 3))                          # 取引先→市場への道
    s["workshops"] = _clamp("workshops", 3.5 * _lg(rev, 1e7))              # 売上1千万単位→店・工房
    s["plots"] = _clamp("plots", 2 + 6 * _lg(max(ta, 0) + max(na, 0), 1e8))  # 総資産+純資産→区画
    s["warehouses"] = _clamp("warehouses", 2.5 * _lg(cash, 1e7))           # 現金→倉庫
    stress = 0.0                                                            # 0..1: 縮小（荒れ地・空き家）の強さ
    if debt_ratio > 0.6: stress += min(0.5, (debt_ratio - 0.6) * 1.25)
    if na < 0: stress += 0.3                                                # 債務超過
    if oi < 0: stress += 0.2
    if ni < 0: stress += 0.2
    stress = min(1.0, stress)
    s["wasteland"] = _clamp("wasteland", stress * s["plots"] * 0.5)
    s["vacant"] = _clamp("vacant", stress * s["houses"] * 0.6)
    s["houses"] = _clamp("houses", s["houses"] - s["vacant"] * 0.3)
    s["residents"] = _clamp("residents", s["residents"] * (1 - 0.4 * stress))
    s["workshops"] = _clamp("workshops", s["workshops"] * (1 - 0.3 * stress))
    s["radius"] = round(8 + 1.6 * s["plots"], 1)                            # 企業区画の帯の幅（村の外周）
    s["health"] = "crisis" if stress >= 0.6 else "warning" if stress > 0 else "normal"
    s["debt_ratio"] = round(debt_ratio, 3); s["stress"] = round(stress, 2)
    return s

def step_toward(prev, target, max_step=0.25, min_step=1):
    """急変を避け、前回値から段階的に近づける（1回で差の max_step 割合、最低 min_step）。"""
    if not prev: prev = {k: (LIMITS[k][0] if k in LIMITS else v) for k, v in BASE.items()}
    out = dict(target)
    for k in LIMITS:
        p, t = int(prev.get(k, 0) or 0), int(target.get(k, 0))
        d = t - p
        if d == 0: out[k] = t; continue
        st = max(min_step, int(math.ceil(abs(d) * max_step)))
        out[k] = p + (min(st, d) if d > 0 else max(-st, d))
    pr, tr = float(prev.get("radius", 0) or 0), float(target.get("radius", 0))
    out["radius"] = round(pr + max(-3.0, min(3.0, tr - pr)), 1) if pr else tr
    out["converged"] = all(out[k] == target[k] for k in LIMITS) and out["radius"] == tr
    return out

# ---------------- 定期取り込み ----------------
_DEMO_OFF = {"", "off", "0", "false", "none"}

def normalize_demo(v):
    """設定の demo。off / 空 / false は無し。名前はそのまま（未知かは呼び出し側）。"""
    if v is None or v is False: return None
    s = str(v).strip()
    if s.lower() in _DEMO_OFF: return None
    return s

def link_label(demo, linked):
    """画面と /api/state が同じ札を使う。デモ中は実在企業と取り違えない語にする。"""
    if demo: return "架空（デモ）" if linked else "架空（デモ）・未取得"
    return "連携中" if linked else "未連携"

class CompanyLink:
    def __init__(self, log=print):
        self.log, self.lock = log, threading.Lock()
        self.st = {"enabled": False, "linked": False, "name": "", "source": "", "metrics": None, "target": None, "scale": None,
                   "last_fetch": None, "error": None, "refresh_sec": 600, "demo": None, "fictional": False, "label": "未連携"}
        self._wake = threading.Event(); self.demo = None

    DEMOS = {"example": "example_company.json", "large": "examples/large.json", "small": "examples/small.json", "deficit": "examples/deficit.json"}
    def set_demo(self, name):
        """デモ切替（メモリ上のみ。設定ファイルは書き換えない）。None/"off" で設定ファイルに戻す。"""
        if name in (None, "", "off"): self.demo = None; return True
        if name not in self.DEMOS: return False
        self.demo = name; return True

    def active_demo(self, c):
        """メモリ上のデモが優先。無ければ設定・COMPANY_DEMO（off は無し）。"""
        if self.demo: return self.demo
        return normalize_demo(c.get("demo"))

    def public(self):
        with self.lock:
            d = dict(self.st); d["labels"] = LABELS; return d

    def _use_demo_seed(self, c, demo):
        """同梱の架空JSONだけを読む。DB URLもSQLの列対応も使わない。"""
        c.update(enabled=True, source="json", path=self.DEMOS[demo], mapping={})
        c.pop("db_url", None); c.pop("_conf_error", None)

    def refresh(self):
        c = load_conf()
        demo = self.active_demo(c)
        if demo and demo not in self.DEMOS:
            with self.lock:
                self.st.update(demo=demo, fictional=True, enabled=True, linked=False, metrics=None, target=None, scale=None,
                               name="", source="demo", error=f"未知のデモ: {demo}", label=link_label(demo, False),
                               refresh_sec=int(c.get("refresh_sec") or 600))
            return self.public()
        if demo: self._use_demo_seed(c, demo)
        with self.lock:
            self.st.update(demo=demo, fictional=bool(demo), enabled=bool(c["enabled"]), refresh_sec=int(c["refresh_sec"]),
                           source=("demo" if demo else c.get("source", "")))
        if c.get("_conf_error"):
            with self.lock: self.st.update(error=c["_conf_error"], label=link_label(demo, bool(self.st.get("linked"))))
            return self.public()
        if not c["enabled"]:
            with self.lock:
                self.st.update(linked=False, metrics=None, target=None, scale=None, error=None, name="",
                               demo=None, fictional=False, label=link_label(None, False))
            return self.public()
        try:
            name, m = make_connector(c).fetch()
            tgt = metrics_to_scale(m)
            with self.lock:
                self.st.update(name=name or c.get("name", ""), metrics=m, target=tgt, linked=True, error=None,
                               demo=demo, fictional=bool(demo), label=link_label(demo, True),
                               scale=step_toward(self.st["scale"], tgt), last_fetch=datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        except Exception as ex:
            msg = mask_url(f"{type(ex).__name__}: {ex}")[:300]
            with self.lock: self.st.update(error=msg, label=link_label(demo, bool(self.st.get("linked"))))
            self.log(f"企業連携エラー: {msg}")
        return self.public()

    def step(self):
        """取り込み間の段階的な増減（目標に向けて少しずつ）。"""
        with self.lock:
            if self.st["linked"] and self.st["target"] and not (self.st["scale"] or {}).get("converged"):
                self.st["scale"] = step_toward(self.st["scale"], self.st["target"])

    def run(self, step_sec=20):
        last = 0.0
        while True:
            if time.time() - last >= self.st["refresh_sec"]:
                self.refresh(); last = time.time()
            self.step()
            if self._wake.wait(step_sec): self._wake.clear(); last = 0.0

    def kick(self): self._wake.set()
