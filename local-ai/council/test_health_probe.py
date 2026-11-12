"""健全性表示が実応答と一致すること。

精度の梯子:
  L1  probe_ok が、実際に送った GET の状態符号だけを見る（副作用=要求の経路・メソッド）。
  L2  service_snapshot と health_summary が、liveliness 200 かつ /v1/models 500 を停止とする。
      待受が開いていても、宣言した経路以外の 200 では稼働にしない。鍵は LiteLLM にだけ付く。
  L3  実ハンドラの GET /api/state が同じ boolean を JSON で返す（API の断言）。
  L4  村のラベル関数が boolean を 💤 / off に塗る。Node で関数、Chrome で DOM。
      実物の Three.js 村（WebGL）は開いていない。
  L5  実 LiteLLM プロセスには当てていない。500 はローカルのスタブが返した。
"""
import json, os, pathlib, shutil, signal, socket, subprocess, sys, tempfile, threading, time, unittest, urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False
ART = "/opt/cursor/artifacts"
PROBE_KEY = "sk-council-probe-test"


def ensure_import_key():
    """council.py は読込時に鍵ファイルを開く。無いときだけ検査用の仮鍵を作り、終わったら消す。"""
    global _CREATED_KEY
    if os.path.exists(KEY_FILE):
        return
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, b"test-key-not-secret\n")
    os.close(fd)
    _CREATED_KEY = True


ensure_import_key()
import council  # noqa: E402


def tearDownModule():
    if _CREATED_KEY and os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)


class Box:
    def __init__(self, route):
        self.route = route
        self.hits = []
        self.lock = threading.Lock()


class Stub(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        auth = self.headers.get("Authorization")
        with self.server.box.lock:
            self.server.box.hits.append({"path": path, "auth": auth, "method": self.command})
        code, body, extra = self.server.box.route(path, auth)
        data = body if isinstance(body, bytes) else str(body).encode()
        self.send_response(code)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


@contextmanager
def serve(route):
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
    httpd.box = Box(route)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        yield httpd
    finally:
        httpd.shutdown()
        httpd.server_close()


@contextmanager
def use(**kw):
    old = {k: getattr(council, k) for k in kw}
    try:
        for k, v in kw.items():
            setattr(council, k, v)
        yield
    finally:
        for k, v in old.items():
            setattr(council, k, v)


def closed_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def paths(httpd):
    with httpd.box.lock:
        return [h["path"] for h in httpd.box.hits]


def auths(httpd):
    with httpd.box.lock:
        return [h["auth"] for h in httpd.box.hits]


class HealthProbeTest(unittest.TestCase):
    def setUp(self):
        self._claude = council.CLAUDE_ON
        council.CLAUDE_ON = False

    def tearDown(self):
        council.CLAUDE_ON = self._claude

    def test_l1_configured_path_is_models_not_liveliness(self):
        self.assertEqual(council.SERVICES["LiteLLM"], (4000, "/v1/models"))
        self.assertEqual(council.SERVICES["llama-swap"][1], "/v1/models")
        self.assertEqual(council.SERVICES["LocalAI"][1], "/readyz")
        self.assertNotIn("/health/liveliness", [p for _, p in council.SERVICES.values()])

    def test_l1_status_and_request_side_effect(self):
        table = {"/ok": 200, "/empty": 204, "/nope": 401, "/boom": 500, "/soon": 503}

        def route(path, auth):
            if path not in table:
                return 404, b"missing", {}
            return table[path], b"body", {}

        with serve(route) as httpd:
            port = httpd.server_address[1]
            expect = {"/ok": True, "/empty": True, "/nope": False, "/boom": False, "/soon": False, "/missing": False}
            for path, ok in expect.items():
                self.assertIs(council.probe_ok(port, path, timeout=1), ok, path)
            self.assertEqual(paths(httpd), list(expect))
            self.assertTrue(all(h["method"] == "GET" for h in httpd.box.hits))

    def test_l1_redirect_is_not_followed(self):
        def route(path, auth):
            if path == "/health/liveliness":
                return 302, b"", {"Location": "/v1/models"}
            if path == "/v1/models":
                return 200, b'{"data":[]}', {}
            return 404, b"no", {}

        with serve(route) as httpd:
            port = httpd.server_address[1]
            self.assertIs(council.probe_ok(port, "/health/liveliness", timeout=1), False)
            self.assertEqual(paths(httpd), ["/health/liveliness"])

    def test_l1_refuses_non_local_path(self):
        self.assertIs(council.probe_ok(80, "http://example.test/v1/models", timeout=0.2), False)
        self.assertIs(council.probe_ok(True, "/v1/models", timeout=0.2), False)
        self.assertIs(council.probe_ok(0, "/v1/models", timeout=0.2), False)
        self.assertIs(council.probe_ok(1, "/v1/models\r\nX: 1", timeout=0.2), False)

    def test_l1_connection_refused_is_down(self):
        self.assertIs(council.probe_ok(closed_port(), "/v1/models", timeout=1), False)

    def test_l1_open_port_without_http_is_down(self):
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 0))
        s.listen(8)
        port = s.getsockname()[1]
        stop = threading.Event()

        def hold():
            s.settimeout(0.2)
            while not stop.is_set():
                try:
                    conn, _ = s.accept()
                except socket.timeout:
                    continue
                try:
                    stop.wait(3)
                finally:
                    conn.close()

        threading.Thread(target=hold, daemon=True).start()
        try:
            started = time.monotonic()
            self.assertIs(council.probe_ok(port, "/v1/models", timeout=0.4), False)
            self.assertLess(time.monotonic() - started, 2.0)
            live = socket.create_connection(("127.0.0.1", port), 1)
            live.close()
        finally:
            stop.set()
            s.close()

    def test_l2_models_500_is_down_even_when_liveliness_is_200(self):
        def litellm(path, auth):
            if path == "/health/liveliness":
                return 200, b"I'm alive!", {}
            if path == "/v1/models":
                return 500, b'{"error":"db"}', {}
            return 404, b"no", {}

        def swap(path, auth):
            if path == "/v1/models":
                return 500, b"no", {}
            return 404, b"no", {}

        def localai(path, auth):
            if path == "/":
                return 200, b"decoy", {}
            if path == "/readyz":
                return 503, b"not ready", {}
            return 404, b"no", {}

        with serve(litellm) as llm, serve(swap) as sw, serve(localai) as lai:
            services = {
                "LiteLLM": (llm.server_address[1], "/v1/models"),
                "llama-swap": (sw.server_address[1], "/v1/models"),
                "LocalAI": (lai.server_address[1], "/readyz"),
                "llama7B": (closed_port(), "/health"),
            }
            with use(SERVICES=services, KEY=PROBE_KEY, PROBE_TIMEOUT=1):
                snap = council.service_snapshot()
                self.assertIs(snap["LiteLLM"], False)
                self.assertIs(snap["llama-swap"], False)
                self.assertIs(snap["LocalAI"], False)
                self.assertIs(snap["llama7B"], False)
                down, text = council.health_summary()
                self.assertEqual(down, ["LiteLLM", "llama-swap", "LocalAI"])
                self.assertNotIn("llama7B", down)
                self.assertIn("停止中: LiteLLM, llama-swap, LocalAI", text)
                self.assertIn("固定停止: llama7B", text)
            self.assertEqual(paths(llm), ["/v1/models", "/v1/models"])
            self.assertEqual(auths(llm), ["Bearer " + PROBE_KEY, "Bearer " + PROBE_KEY])
            self.assertNotIn("/health/liveliness", paths(llm))
            self.assertEqual(paths(sw), ["/v1/models", "/v1/models"])
            self.assertEqual(auths(sw), [None, None])
            self.assertEqual(paths(lai), ["/readyz", "/readyz"])
            self.assertNotIn("/", paths(lai))

    def test_l2_models_200_with_bearer_is_up_and_401_without_key_is_down(self):
        def route(path, auth):
            if path == "/health/liveliness":
                return 200, b"I'm alive!", {}
            if path == "/v1/models" and auth == "Bearer " + PROBE_KEY:
                return 200, b'{"data":[{"id":"auto"}]}', {}
            if path == "/v1/models":
                return 401, b"no", {}
            return 404, b"no", {}

        with serve(route) as httpd:
            port = httpd.server_address[1]
            services = {"LiteLLM": (port, "/v1/models")}
            with use(SERVICES=services, KEY=PROBE_KEY, PROBE_TIMEOUT=1):
                self.assertIs(council.service_snapshot()["LiteLLM"], True)
            with use(SERVICES=services, KEY="", PROBE_TIMEOUT=1):
                self.assertIs(council.service_snapshot()["LiteLLM"], False)
            self.assertEqual(paths(httpd), ["/v1/models", "/v1/models"])
            self.assertEqual(auths(httpd), ["Bearer " + PROBE_KEY, None])

    def test_l2_snapshot_timeout_is_not_treated_as_open_port(self):
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 0))
        s.listen(8)
        port = s.getsockname()[1]
        stop = threading.Event()

        def hold():
            s.settimeout(0.2)
            while not stop.is_set():
                try:
                    conn, _ = s.accept()
                except socket.timeout:
                    continue
                try:
                    stop.wait(3)
                finally:
                    conn.close()

        threading.Thread(target=hold, daemon=True).start()
        try:
            with use(SERVICES={"LiteLLM": (port, "/v1/models")}, KEY=PROBE_KEY, PROBE_TIMEOUT=0.4):
                started = time.monotonic()
                snap = council.service_snapshot()
                self.assertIs(snap["LiteLLM"], False)
                self.assertLess(time.monotonic() - started, 2.5)
            live = socket.create_connection(("127.0.0.1", port), 1)
            live.close()
        finally:
            stop.set()
            s.close()

    def test_l3_api_state_json_matches_probe(self):
        def litellm(path, auth):
            if path == "/health/liveliness":
                return 200, b"I'm alive!", {}
            if path == "/v1/models":
                return 500, b'{"error":"db"}', {}
            return 404, b"no", {}

        def swap(path, auth):
            if path == "/":
                return 200, b"decoy", {}
            if path == "/v1/models":
                return 500, b"no", {}
            return 404, b"no", {}

        with serve(litellm) as llm, serve(swap) as sw:
            services = {
                "LiteLLM": (llm.server_address[1], "/v1/models"),
                "llama-swap": (sw.server_address[1], "/v1/models"),
            }
            api = ThreadingHTTPServer(("127.0.0.1", 0), council.H)
            api.daemon_threads = True
            threading.Thread(target=api.serve_forever, daemon=True).start()
            try:
                with use(SERVICES=services, KEY=PROBE_KEY, PROBE_TIMEOUT=1):
                    url = f"http://127.0.0.1:{api.server_address[1]}/api/state"
                    with urllib.request.urlopen(url, timeout=5) as r:
                        raw = r.read()
                        self.assertEqual(r.status, 200)
                        self.assertIn("application/json", r.headers.get("Content-Type", ""))
                    body = json.loads(raw.decode())
                    self.assertIs(body["services"]["LiteLLM"], False)
                    self.assertIs(body["services"]["llama-swap"], False)
                    self.assertEqual(set(body["services"]), set(services))
                    with urllib.request.urlopen(f"http://127.0.0.1:{api.server_address[1]}/serviceHealth.mjs", timeout=5) as r:
                        js = r.read()
                        self.assertEqual(r.status, 200)
                        self.assertIn("javascript", r.headers.get("Content-Type", ""))
                    self.assertIn(b"export function applyServiceHealth", js)
            finally:
                api.shutdown()
                api.server_close()
            self.assertEqual(paths(llm), ["/v1/models"])
            self.assertEqual(auths(llm), ["Bearer " + PROBE_KEY])
            self.assertNotIn("/health/liveliness", paths(llm))
            self.assertEqual(paths(sw), ["/v1/models"])
            self.assertEqual(auths(sw), [None])

    def test_l4_village_source_paints_from_api_boolean(self):
        html = open(os.path.join(HERE, "web", "index.html"), encoding="utf-8").read()
        mjs = open(os.path.join(HERE, "web", "serviceHealth.mjs"), encoding="utf-8").read()
        self.assertEqual(html.count("applyServiceHealth(agents,st.services,mat)"), 2)
        self.assertNotIn("textContent=s+(up?'':' 💤')", html)
        self.assertNotIn("/health/liveliness", html)
        self.assertIn("up === true", mjs)
        self.assertIn("💤", mjs)

    def test_l4_node_apply_service_health(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("L4: node が無い")
        mjs = os.path.join(HERE, "web", "serviceHealth.mjs")
        script = r"""
import { applyServiceHealth } from %s;
function make() {
  const classes = new Set();
  const lab = {
    classList: {
      toggle(cls, on) { if (on) classes.add(cls); else classes.delete(cls); },
      contains(cls) { return classes.has(cls); },
    },
    textContent: '未反映',
  };
  return { lab, body: { material: null }, up: true };
}
const agents = { 's:LiteLLM': make(), 's:llama-swap': make() };
const paints = [];
const paint = (c) => { paints.push(c); return { color: c }; };
applyServiceHealth(agents, { LiteLLM: false, 'llama-swap': true }, paint);
const out = {
  litellm: agents['s:LiteLLM'].lab.textContent,
  swap: agents['s:llama-swap'].lab.textContent,
  litellmOff: agents['s:LiteLLM'].lab.classList.contains('off'),
  swapOff: agents['s:llama-swap'].lab.classList.contains('off'),
  litellmUp: agents['s:LiteLLM'].up,
  swapUp: agents['s:llama-swap'].up,
  paints: paints.slice(0, 2),
};
applyServiceHealth(agents, { LiteLLM: 'true', 'llama-swap': 1 }, paint);
out.truthy = agents['s:LiteLLM'].lab.textContent;
out.truthyOff = agents['s:LiteLLM'].lab.classList.contains('off');
applyServiceHealth(agents, null, paint);
applyServiceHealth({}, { Ghost: false }, paint);
out.extraOk = true;
console.log(JSON.stringify(out));
""" % json.dumps(pathlib.Path(mjs).as_uri())
        proc = subprocess.run([node, "--input-type=module", "-e", script], capture_output=True, text=True, timeout=20)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        got = json.loads(proc.stdout)
        self.assertEqual(got["litellm"], "LiteLLM 💤")
        self.assertEqual(got["swap"], "llama-swap")
        self.assertIs(got["litellmOff"], True)
        self.assertIs(got["swapOff"], False)
        self.assertIs(got["litellmUp"], False)
        self.assertIs(got["swapUp"], True)
        self.assertEqual(got["paints"], [0x616161, 0x90a4ae])
        self.assertEqual(got["truthy"], "LiteLLM 💤")
        self.assertIs(got["truthyOff"], True)
        self.assertIs(got["extraOk"], True)

    def test_l4_chrome_paints_sleep_mark(self):
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
        if not chrome:
            self.skipTest("L4: Chrome が無い")
        mjs = os.path.join(HERE, "web", "serviceHealth.mjs")
        html = """<!doctype html><meta charset="utf-8"><title>機械室の健全性</title>
<style>
body{margin:24px;background:#f4f7fb;font-family:sans-serif;color:#243042}
h1{font-size:18px}
.lab{display:inline-block;margin:8px 8px 0 0;font-size:16px;border:2px solid #888;border-radius:8px;padding:4px 10px;background:#fff}
.lab.off{background:#ccc;color:#555}
</style>
<h1>機械室（/api/state の boolean）</h1>
<div id="labels"></div>
<script type="module">
import { applyServiceHealth } from '/serviceHealth.mjs';
function make(name) {
  const lab = document.createElement('div');
  lab.className = 'lab';
  lab.textContent = '未反映';
  document.getElementById('labels').appendChild(lab);
  return { lab, body: { material: null }, up: true };
}
const agents = { 's:LiteLLM': make('LiteLLM'), 's:llama-swap': make('llama-swap') };
applyServiceHealth(agents, { LiteLLM: false, 'llama-swap': true }, (c) => ({ color: c }));
document.body.dataset.litellm = agents['s:LiteLLM'].lab.textContent;
document.body.dataset.swap = agents['s:llama-swap'].lab.textContent;
document.body.dataset.litellmOff = agents['s:LiteLLM'].lab.classList.contains('off') ? '1' : '0';
document.body.dataset.swapOff = agents['s:llama-swap'].lab.classList.contains('off') ? '1' : '0';
document.body.dataset.done = '1';
</script>"""
        self.assertNotIn("💤", html)

        class Files(BaseHTTPRequestHandler):
            def do_GET(self):
                path = self.path.split("?", 1)[0]
                if path == "/serviceHealth.mjs":
                    with open(mjs, "rb") as f:
                        data = f.read()
                    ctype = "text/javascript; charset=utf-8"
                elif path in ("/", "/favicon.ico"):
                    data = b"" if path == "/favicon.ico" else html.encode()
                    ctype = "image/x-icon" if path == "/favicon.ico" else "text/html; charset=utf-8"
                else:
                    self.send_response(404); self.end_headers(); return
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            def log_message(self, *a):
                pass

        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Files)
        httpd.daemon_threads = True
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        port = httpd.server_address[1]
        os.makedirs(ART, exist_ok=True)
        shot = os.path.join(ART, "village-health-litellm-down.png")
        dom_path = os.path.join(ART, "village-health-litellm-down.html")
        try:
            def run_chrome(extra):
                # この Chrome は DOM を出したあと終了しない。プロセスグループごと止めて、そこまでの出力を使う。
                profile = tempfile.mkdtemp(prefix="chrome-health-")
                cmd = [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                       f"--user-data-dir={profile}", "--window-size=720,280", *extra, f"http://127.0.0.1:{port}/"]
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
                try:
                    try:
                        out, err = proc.communicate(timeout=8)
                    except subprocess.TimeoutExpired:
                        os.killpg(proc.pid, signal.SIGKILL)
                        out, err = proc.communicate()
                    return out or "", err or ""
                finally:
                    shutil.rmtree(profile, ignore_errors=True)

            dom, err = run_chrome(["--dump-dom"])
            with open(dom_path, "w", encoding="utf-8") as f:
                f.write(dom)
            self.assertIn('data-done="1"', dom, err[-500:])
            self.assertIn('data-litellm="LiteLLM 💤"', dom)
            self.assertIn('data-swap="llama-swap"', dom)
            self.assertIn('data-litellm-off="1"', dom)
            self.assertIn('data-swap-off="0"', dom)
            self.assertIn('<div class="lab off">LiteLLM 💤</div>', dom)
            self.assertIn('<div class="lab">llama-swap</div>', dom)
            self.assertNotIn(">未反映<", dom)
            run_chrome([f"--screenshot={shot}"])
            self.assertTrue(os.path.isfile(shot))
            self.assertGreater(os.path.getsize(shot), 1000)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_l5_live_litellm_not_claimed(self):
        self.skipTest("L5 空白: 実 LiteLLM には当てていない。/v1/models の 500 はスタブ。liveliness 200 と同時に返している。")


if __name__ == "__main__":
    unittest.main()
