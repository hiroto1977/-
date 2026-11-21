"""健全性表示が実応答と一致すること。

精度の梯子:
  L1  probe_ok が、実際に送った GET の状態符号だけを見る（副作用=要求の経路・メソッド）。
  L2  service_snapshot と health_summary が、liveliness 200 かつ /v1/models 500 を停止とする。
      待受が開いていても、宣言した経路以外の 200 では稼働にしない。鍵は LiteLLM にだけ付く。
  L3  実ハンドラの GET /api/state が、同じ GET の boolean と service_state を JSON で返す。
  L4  村のランプ関数が healthy / degraded / down を色と札に塗る。Node で関数、
      Chrome で DOM。実物の Three.js 村は Headless Chrome（SwiftShader）で開き、
      ランプの色・直立・チャットや掲示板との重なりを見る。
  L5  実 LiteLLM プロセスには当てていない。500 はローカルのスタブが返した。
      ポートが開いて黙っている相手は、別の待受検査を足していないので down。
"""
import json, os, pathlib, shutil, signal, socket, struct, subprocess, sys, tempfile, threading, time, unittest, urllib.request, zlib
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False
ART = "/opt/cursor/artifacts"
PROBE_KEY = "sk-council-probe-test"
SWIFTSHADER_LAMP_JS = r"""
const ver = JSON.parse(process.argv[1]);
const page = process.argv[2];
const shotDefault = process.argv[3];
const shotRoom = process.argv[4];
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
};
const cdp = (method, params = {}, sessionId) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const target = await cdp('Target.createTarget', { url: 'about:blank' });
const sess = await cdp('Target.attachToTarget', { targetId: target.result.targetId, flatten: true });
const sessionId = sess.result.sessionId;
const send = (method, params) => cdp(method, params, sessionId);
await send('Page.enable');
await send('Runtime.enable');
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error(d.exception?.description || d.text || 'eval failed');
  }
  return r.result?.result?.value;
};
await send('Page.navigate', { url: page });
let ready = null;
for (let i = 0; i < 40; i++) {
  await new Promise((s) => setTimeout(s, 250));
  ready = await evalJs(`(() => {
    const a = window.__agents || {};
    return { n: Object.keys(a).length, has: !!(a['s:LiteLLM'] && a['s:LiteLLM'].lamp), pill: document.getElementById('pill')?.textContent || '' };
  })()`);
  if (ready && ready.has) break;
}
if (!ready || !ready.has) throw new Error('lamps not ready ' + JSON.stringify(ready));
const measure = `(() => {
  const C = window.__C;
  const chat = document.getElementById('chat').getBoundingClientRect();
  const hud = document.getElementById('hud').getBoundingClientRect();
  const side = document.getElementById('side').getBoundingClientRect();
  const inside = (p, r) => !p.behind && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  const services = {};
  for (const [k, A] of Object.entries(window.__agents)) {
    if (!A.svc) continue;
    const head = A.g.position.clone();
    head.y = 3.85;
    head.project(C);
    const screen = { x: (head.x + 1) / 2 * innerWidth, y: (1 - head.y) / 2 * innerHeight, behind: head.z > 1 };
    services[k] = {
      health: A.health, up: A.up, rotZ: A.g.rotation.z, y: A.g.position.y,
      color: A.lamp.material.color.getHex(), emissive: A.lamp.material.emissive.getHex(),
      screen, underChat: inside(screen, chat), underHud: inside(screen, hud), underSide: inside(screen, side),
    };
  }
  let renderer = '';
  try {
    const gl = window.__R.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  } catch (e) { renderer = String(e); }
  return { services, renderer };
})()`;
const before = await evalJs(measure);
const fs = await import('node:fs');
async function shot(path) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path, Buffer.from(r.result.data, 'base64'));
}
await shot(shotDefault);
await evalJs(`(() => {
  const A = window.__agents['s:llama-swap'];
  window.O.target.set(A.g.position.x, 2.2, A.g.position.z);
  window.__C.position.set(A.g.position.x, 9, A.g.position.z + 16);
  return true;
})()`);
await new Promise((s) => setTimeout(s, 700));
const close = await evalJs(measure);
await shot(shotRoom);
console.log(JSON.stringify({ renderer: before.renderer, services: before.services, close: close.services }));
ws.close();
"""


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


def png_rgb(path):
    """PNG を (幅, 高さ, 行の RGB) にする。色型は RGB。フィルタは標準の 5 種。"""
    with open(path, "rb") as fh:
        data = fh.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError("png")
    pos, w, h, idat = 8, None, None, b""
    while pos < len(data):
        n, typ = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if typ == b"IHDR":
            w, h, _bit, color = struct.unpack(">IIBB", chunk[:10])
            if color != 2:
                raise AssertionError("png color " + str(color))
        elif typ == b"IDAT":
            idat += chunk
        elif typ == b"IEND":
            break
    raw = zlib.decompress(idat)
    bpp, rows, i, stride, prev = 3, [], 0, w * 3, bytearray(w * 3)

    def paeth(a, b, c):
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if pa <= pb and pa <= pc else b if pb <= pc else c

    for _y in range(h):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i:i + stride])
        i += stride
        for x in range(stride):
            left = row[x - bpp] if x >= bpp else 0
            up, ul = prev[x], prev[x - bpp] if x >= bpp else 0
            if filt == 1:
                row[x] = (row[x] + left) & 255
            elif filt == 2:
                row[x] = (row[x] + up) & 255
            elif filt == 3:
                row[x] = (row[x] + ((left + up) // 2)) & 255
            elif filt == 4:
                row[x] = (row[x] + paeth(left, up, ul)) & 255
            elif filt != 0:
                raise AssertionError("png filter " + str(filt))
        prev = row
        rows.append(row)
    return w, h, rows


def count_rgb(pixels, x0, x1, y0, y1, pred):
    _w, h, rows = pixels
    n = 0
    for y in range(max(0, y0), min(h, y1)):
        row = rows[y]
        for x in range(x0, x1):
            o = x * 3
            if pred(row[o], row[o + 1], row[o + 2]):
                n += 1
    return n


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
                report = council.service_report()
                self.assertEqual(report["LiteLLM"], "down")
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
                    self.assertEqual(body["service_state"]["LiteLLM"], "degraded")
                    self.assertEqual(body["service_state"]["llama-swap"], "degraded")
                    self.assertEqual(set(body["services"]), set(services))
                    self.assertEqual(set(body["service_state"]), set(body["services"]))
                    self.assertTrue(all(body["services"][n] is (body["service_state"][n] == "healthy") for n in services))
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
        self.assertEqual(html.count("applyServiceHealth(agents,st.service_state||st.services,mat)"), 2)
        self.assertNotIn("applyServiceHealth(agents,st.services,mat)", html)
        self.assertNotIn("textContent=s+(up?'':' 💤')", html)
        self.assertNotIn("A.g.rotation.z=A.up?0:1.4", html)
        self.assertIn("function mkLamp", html)
        self.assertIn("A.g.rotation.z=0", html)
        self.assertNotIn("/health/liveliness", html)
        self.assertIn("value === true", mjs)
        self.assertIn("degraded", mjs)
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
  return { lab, body: { material: null }, up: true, g: { rotation: { z: 1.4 }, position: { y: 0.3 } } };
}
const agents = { 's:LiteLLM': make(), 's:llama-swap': make(), 's:LocalAI': make() };
const paints = [];
const paint = (c) => { paints.push(c); return { color: c }; };
applyServiceHealth(agents, { LiteLLM: false, 'llama-swap': true, LocalAI: 'degraded' }, paint);
const out = {
  litellm: agents['s:LiteLLM'].lab.textContent,
  swap: agents['s:llama-swap'].lab.textContent,
  local: agents['s:LocalAI'].lab.textContent,
  litellmOff: agents['s:LiteLLM'].lab.classList.contains('off'),
  swapOff: agents['s:llama-swap'].lab.classList.contains('off'),
  localWarn: agents['s:LocalAI'].lab.classList.contains('warn'),
  litellmUp: agents['s:LiteLLM'].up,
  swapUp: agents['s:llama-swap'].up,
  localUp: agents['s:LocalAI'].up,
  health: [agents['s:LiteLLM'].health, agents['s:llama-swap'].health, agents['s:LocalAI'].health],
  rot: agents['s:LiteLLM'].g.rotation.z,
  paints: paints.slice(0, 3),
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
        self.assertEqual(got["local"], "LocalAI ⚠")
        self.assertIs(got["litellmOff"], True)
        self.assertIs(got["swapOff"], False)
        self.assertIs(got["localWarn"], True)
        self.assertIs(got["litellmUp"], False)
        self.assertIs(got["swapUp"], True)
        self.assertIs(got["localUp"], False)
        self.assertEqual(got["health"], ["down", "healthy", "degraded"])
        self.assertEqual(got["rot"], 0)
        self.assertEqual(got["paints"], [0xc62828, 0x43a047, 0xffb300])
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
const agents = { 's:LiteLLM': make('LiteLLM'), 's:llama-swap': make('llama-swap'), 's:LocalAI': make('LocalAI') };
applyServiceHealth(agents, { LiteLLM: 'down', 'llama-swap': 'healthy', LocalAI: 'degraded' }, (c) => ({ color: c }));
document.body.dataset.litellm = agents['s:LiteLLM'].lab.textContent;
document.body.dataset.swap = agents['s:llama-swap'].lab.textContent;
document.body.dataset.local = agents['s:LocalAI'].lab.textContent;
document.body.dataset.litellmOff = agents['s:LiteLLM'].lab.classList.contains('off') ? '1' : '0';
document.body.dataset.swapOff = agents['s:llama-swap'].lab.classList.contains('off') ? '1' : '0';
document.body.dataset.localWarn = agents['s:LocalAI'].lab.classList.contains('warn') ? '1' : '0';
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
            self.assertIn('data-local="LocalAI ⚠"', dom)
            self.assertIn('data-litellm-off="1"', dom)
            self.assertIn('data-swap-off="0"', dom)
            self.assertIn('data-local-warn="1"', dom)
            self.assertIn('<div class="lab off">LiteLLM 💤</div>', dom)
            self.assertIn('<div class="lab">llama-swap</div>', dom)
            self.assertIn('<div class="lab warn">LocalAI ⚠</div>', dom)
            self.assertNotIn(">未反映<", dom)
            run_chrome([f"--screenshot={shot}"])
            self.assertTrue(os.path.isfile(shot))
            self.assertGreater(os.path.getsize(shot), 1000)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_l2_http_status_is_degraded_and_silence_is_down(self):
        def litellm(path, auth):
            if path == "/health/liveliness":
                return 200, b"I'm alive!", {}
            if path == "/v1/models":
                return 500, b'{"error":"db"}', {}
            return 404, b"no", {}

        def swap(path, auth):
            if path == "/v1/models":
                return 200, b'{"data":[{"id":"auto"}]}', {}
            return 404, b"no", {}

        with serve(litellm) as llm, serve(swap) as sw:
            services = {
                "LiteLLM": (llm.server_address[1], "/v1/models"),
                "llama-swap": (sw.server_address[1], "/v1/models"),
                "LocalAI": (closed_port(), "/readyz"),
            }
            with use(SERVICES=services, KEY=PROBE_KEY, PROBE_TIMEOUT=0.8):
                report = council.service_report()
            self.assertEqual(report, {"LiteLLM": "degraded", "llama-swap": "healthy", "LocalAI": "down"})
            self.assertEqual(paths(llm), ["/v1/models"])
            self.assertEqual(auths(llm), ["Bearer " + PROBE_KEY])
            self.assertNotIn("/health/liveliness", paths(llm))
            self.assertEqual(paths(sw), ["/v1/models"])
            self.assertEqual(auths(sw), [None])

    def test_l4_swiftshader_lamps_follow_service_state(self):
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
        node = shutil.which("node")
        if not chrome or not node:
            self.skipTest("L4: Chrome か node が無い")

        def litellm(path, auth):
            if path == "/health/liveliness":
                return 200, b"I'm alive!", {}
            if path == "/v1/models":
                return 500, b'{"error":"db"}', {}
            return 404, b"no", {}

        def swap(path, auth):
            if path == "/v1/models":
                return 200, b'{"data":[{"id":"auto"}]}', {}
            return 404, b"no", {}

        with serve(litellm) as llm, serve(swap) as sw:
            services = {
                "LiteLLM": (llm.server_address[1], "/v1/models"),
                "llama-swap": (sw.server_address[1], "/v1/models"),
                "LocalAI": (closed_port(), "/readyz"),
            }
            api = ThreadingHTTPServer(("127.0.0.1", 0), council.H)
            api.daemon_threads = True
            threading.Thread(target=api.serve_forever, daemon=True).start()
            port = api.server_address[1]
            try:
                with use(SERVICES=services, KEY=PROBE_KEY, PROBE_TIMEOUT=0.8, CLAUDE_ON=False):
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/state", timeout=8) as r:
                        state = json.loads(r.read().decode())
                    self.assertEqual(state["service_state"]["LiteLLM"], "degraded")
                    self.assertEqual(state["service_state"]["llama-swap"], "healthy")
                    self.assertEqual(state["service_state"]["LocalAI"], "down")
                    self.assertIs(state["services"]["LiteLLM"], False)
                    self.assertIs(state["services"]["llama-swap"], True)
                    self.assertIs(state["services"]["LocalAI"], False)
                    self.assertEqual(paths(llm), ["/v1/models"])
                    os.makedirs(ART, exist_ok=True)
                    shot_default = os.path.join(ART, "village-lamps-after-default.png")
                    shot_room = os.path.join(ART, "village-lamps-after-room.png")
                    profile = tempfile.mkdtemp(prefix="chrome-lamps-after-")
                    dbg = port + 1
                    proc = subprocess.Popen(
                        [chrome, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
                         "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                         f"--remote-debugging-port={dbg}", f"--user-data-dir={profile}",
                         "--window-size=1280,800", "about:blank"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                    try:
                        ver = None
                        for _ in range(50):
                            try:
                                with urllib.request.urlopen(f"http://127.0.0.1:{dbg}/json/version", timeout=1) as r:
                                    ver = json.loads(r.read().decode())
                                    break
                            except Exception:
                                time.sleep(0.15)
                        self.assertIsNotNone(ver, "Chrome のデバッグポートが開かない")
                        script = SWIFTSHADER_LAMP_JS
                        proc_js = subprocess.run(
                            [node, "--input-type=module", "-e", script,
                             json.dumps(ver),
                             f"http://127.0.0.1:{port}/?hour=12&selftest=nochat&lowgpu",
                             shot_default, shot_room],
                            capture_output=True, text=True, timeout=90)
                        self.assertEqual(proc_js.returncode, 0, proc_js.stderr[-1500:] + proc_js.stdout[-1500:])
                        got = json.loads(proc_js.stdout)
                    finally:
                        os.killpg(proc.pid, signal.SIGKILL)
                        proc.wait(timeout=5)
                        shutil.rmtree(profile, ignore_errors=True)
                self.assertIn("SwiftShader", got["renderer"])
                colors = {"healthy": 0x43a047, "degraded": 0xffb300, "down": 0xc62828}
                for name, state_name in (("LiteLLM", "degraded"), ("llama-swap", "healthy"), ("LocalAI", "down")):
                    row = got["services"]["s:" + name]
                    self.assertEqual(row["health"], state_name, name)
                    self.assertEqual(row["color"], colors[state_name], name)
                    self.assertEqual(row["emissive"], { "healthy": 0x2e7d32, "degraded": 0xef6c00, "down": 0x4a0000 }[state_name], name)
                    self.assertEqual(row["rotZ"], 0, name)
                    self.assertEqual(row["y"], 0, name)
                    self.assertFalse(row["underChat"], name)
                    self.assertFalse(row["underHud"], name)
                    self.assertFalse(row["underSide"], name)
                    self.assertFalse(row["screen"]["behind"], name)
                self.assertGreater(os.path.getsize(shot_default), 1000)
                self.assertGreater(os.path.getsize(shot_room), 1000)
                # 近づけた絵のランプ頭が、材質の色で実際に描かれている（草や空と分ける）。
                pixels = png_rgb(shot_room)
                self.assertGreater(count_rgb(pixels, 300, 920, 120, 450, lambda R, G, B: R > 200 and 70 < G < 160 and B < 40), 500)
                self.assertGreater(count_rgb(pixels, 520, 760, 180, 360, lambda R, G, B: 40 < R < 120 and G > 120 and G > R + 30 and B < G), 200)
                self.assertGreater(count_rgb(pixels, 300, 920, 180, 400, lambda R, G, B: R > 140 and G < 80 and B < 80), 500)
                # 近づけた視点でもチャットの下に入らない
                for name in ("LiteLLM", "llama-swap", "LocalAI"):
                    row = got["close"]["s:" + name]
                    self.assertEqual(row["rotZ"], 0, name)
                    self.assertFalse(row["underChat"], name)
                    self.assertFalse(row["underHud"], name)
                    self.assertFalse(row["underSide"], name)
            finally:
                api.shutdown()
                api.server_close()

    def test_l5_live_litellm_not_claimed(self):
        self.skipTest("L5 空白: 実 LiteLLM には当てていない。/v1/models の 500 はスタブ。liveliness 200 と同時に返している。")


if __name__ == "__main__":
    unittest.main()
