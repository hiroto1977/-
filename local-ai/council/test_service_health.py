"""村の /api/state が、ポート開通ではなく実応答を健全性にすること。

精度の対応:
  L1 ポートも /health/liveliness も生きていて /v1/models が 500 → services は false
  L2 タイムアウト・5xx・接続拒否、および本物の 200 → true
  L3 プロセスはいるが /v1/models が壊れている → 非健全。brief も sustained も表示は非健全。成功で戻る
  L4 main のポート判定との差分。healthy と unhealthy は同時に真にならない
  L5 200 でも途中までの JSON・違う Content-Type・形の違う JSON → 非健全
"""
import json, os, sys, threading, time, unittest, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_KEY = os.path.expanduser("~/litellm/master_key")
_MADE_KEY = False
if not os.path.isfile(_KEY):
    os.makedirs(os.path.dirname(_KEY), exist_ok=True)
    fd = os.open(_KEY, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("sk-test-probe\n")
    _MADE_KEY = True

import council as c  # noqa: E402

MODELS = {"object": "list", "data": [{"id": "fast", "object": "model", "owned_by": "openai"}]}
MODELS_BYTES = json.dumps(MODELS).encode()


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _handler(behavior, hits):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def do_GET(self):
            path = self.path.split("?")[0]
            with hits["lock"]:
                hits["rows"].append({"path": path, "authorization": self.headers.get("Authorization")})
            spec = behavior(path)
            try:
                if spec == "sleep":
                    time.sleep(hits.get("sleep", 5))
                    return
                if isinstance(spec, tuple) and spec and spec[0] == "redirect":
                    self.send_response(302)
                    self.send_header("Location", spec[1])
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status, ctype, body = spec
                raw = body if isinstance(body, bytes) else str(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            except Exception:
                pass
    return H


def start_upstream(behavior, sleep=5):
    hits = {"rows": [], "lock": threading.Lock(), "sleep": sleep}
    httpd = _Server(("127.0.0.1", 0), _handler(behavior, hits))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, hits


def stop(httpd):
    httpd.shutdown()
    httpd.server_close()


def closed_port():
    hits = {"rows": [], "lock": threading.Lock()}
    httpd = _Server(("127.0.0.1", 0), _handler(lambda path: (404, "text/plain", "x"), hits))
    port = httpd.server_address[1]
    httpd.server_close()
    return port


class ServiceHealthTest(unittest.TestCase):
    def setUp(self):
        self._servers = []
        self._old_services = dict(c.SERVICES)
        self._old_timeout = c.PROBE_TIMEOUT
        self._old_cache = c.PROBE_CACHE_SEC
        self._old_sustained = c.PROBE_SUSTAINED
        self._old_claude = c.claude_status
        c.claude_status = lambda: "無効"
        c.PROBE_CACHE_SEC = 0
        c.PROBE_SUSTAINED = 3
        c.PROBE_TIMEOUT = 1.0
        c.reset_service_probes()
        self.api = None

    def tearDown(self):
        if self.api is not None:
            stop(self.api)
            self.api = None
        for httpd in self._servers:
            stop(httpd)
        c.SERVICES = self._old_services
        c.PROBE_TIMEOUT = self._old_timeout
        c.PROBE_CACHE_SEC = self._old_cache
        c.PROBE_SUSTAINED = self._old_sustained
        c.claude_status = self._old_claude
        c.reset_service_probes()

    def upstream(self, behavior, sleep=5):
        httpd, hits = start_upstream(behavior, sleep=sleep)
        self._servers.append(httpd)
        return httpd.server_address[1], hits

    def get_state(self, timeout=4):
        if self.api is None:
            self.api = _Server(("127.0.0.1", 0), c.H)
            threading.Thread(target=self.api.serve_forever, daemon=True).start()
        port = self.api.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/state", timeout=timeout) as r:
            self.assertEqual(r.status, 200)
            ctype = r.headers.get("Content-Type", "")
            self.assertIn("application/json", ctype)
            return json.load(r)

    def assert_exclusive(self, body):
        self.assertEqual(set(body["services"]), set(body["service_probes"]))
        for name, up in body["services"].items():
            pr = body["service_probes"][name]
            self.assertIs(pr["healthy"], (not pr["unhealthy"]), name)
            self.assertIs(up, pr["healthy"], name)
            self.assertIs(pr["state"] == "healthy", pr["healthy"], name)
            self.assertIn(pr["state"], ("healthy", "degraded", "down"), name)
            if pr["healthy"]:
                self.assertEqual(pr["state"], "healthy", name)
            else:
                self.assertIn(pr["state"], ("degraded", "down"), name)
                self.assertNotEqual(pr["failure_class"], "none", name)

    def test_l1_liveliness_200_and_models_500_is_not_healthy(self):
        """フィクスチャ: TCP 待受あり、/health/liveliness は 200、/v1/models は 500。
        期待: /api/state の services.LiteLLM は false（degraded）。
        main のポート判定なら true。"""
        def behavior(path):
            if path == "/health/liveliness":
                return 200, "text/plain; charset=utf-8", "I'm alive!"
            if path == "/v1/models":
                return 500, "text/plain", "internal error"
            return 404, "text/plain", "no"

        port, hits = self.upstream(behavior)
        c.SERVICES = {"LiteLLM": (port, "/v1/models", "models")}
        body = self.get_state()
        main_would = c.port_up(port)
        got = body["services"]["LiteLLM"]
        self.assertTrue(main_would, "fixture port open; main port_up actual should be true")
        self.assertIs(got, False, "fixture models 500; expected services.LiteLLM false; actual %r" % got)
        pr = body["service_probes"]["LiteLLM"]
        self.assertEqual(pr["state"], "degraded")
        self.assertEqual(pr["reason"], "http_500")
        self.assertEqual(pr["http_status"], 500)
        self.assertIs(pr["port_open"], True)
        self.assertEqual(pr["path"], "/v1/models")
        self.assertEqual(pr["consecutive_failures"], 1)
        self.assertEqual(pr["failure_class"], "brief")
        self.assert_exclusive(body)
        paths = [row["path"] for row in hits["rows"]]
        self.assertIn("/v1/models", paths)
        self.assertNotIn("/health/liveliness", paths)
        self.assertTrue(all(row["authorization"] == "Bearer " + c.KEY for row in hits["rows"]))
        down, summary = c.health_summary()
        self.assertEqual(down, ["LiteLLM"])
        self.assertIn("応答異常: LiteLLM", summary)
        self.assertNotIn("/health/liveliness", [row["path"] for row in hits["rows"]])

    def test_l2_l4_failure_modes_negative_control_and_port_differential(self):
        """L2: timeout / 5xx / connection refused は false。本物の 200 は true。
        L4: 500 は main の port_up と食い違う。200 と接続拒否は一致する。
        healthy と unhealthy はどのサービスでも排他。"""
        def models_ok(path):
            if path == "/v1/models":
                return 200, "application/json; charset=utf-8", MODELS_BYTES
            return 404, "text/plain", "no"

        def models_500(path):
            if path == "/health/liveliness":
                return 200, "text/plain", "alive"
            if path == "/v1/models":
                return 500, "application/json", b'{"object":"list","data":[{"id":"fast"}]}'
            return 404, "text/plain", "no"

        def ready_ok(path):
            if path == "/readyz":
                return 200, "text/plain", "ready"
            return 404, "text/plain", "no"

        def stall(path):
            return "sleep"

        ok_port, ok_hits = self.upstream(models_ok)
        bad_port, bad_hits = self.upstream(models_500)
        http_port, http_hits = self.upstream(ready_ok)
        stall_port, _stall_hits = self.upstream(stall, sleep=5)
        refused = closed_port()
        c.PROBE_TIMEOUT = 0.5
        c.SERVICES = {
            "llama-swap": (ok_port, "/v1/models", "models"),
            "LiteLLM": (bad_port, "/v1/models", "models"),
            "LocalAI": (http_port, "/readyz", "http"),
            "OpenWebUI": (stall_port, "/health", "http"),
            "Ollama": (refused, "/", "http"),
        }
        started = time.monotonic()
        body = self.get_state(timeout=3)
        elapsed = time.monotonic() - started
        self.assertLess(elapsed, 2.5, "timeout probe waited too long: %.2fs" % elapsed)

        swap = body["service_probes"]["llama-swap"]
        self.assertIs(body["services"]["llama-swap"], True, "fixture real 200 models; expected true")
        self.assertEqual(swap["reason"], "ok")
        self.assertEqual(swap["http_status"], 200)
        self.assertEqual(swap["failure_class"], "none")
        self.assertEqual(swap["consecutive_failures"], 0)
        self.assertTrue(all(row["authorization"] is None for row in ok_hits["rows"]))
        self.assertEqual([row["path"] for row in ok_hits["rows"]], ["/v1/models"])

        litellm = body["service_probes"]["LiteLLM"]
        self.assertIs(body["services"]["LiteLLM"], False, "fixture /v1/models 500 with a models body; expected false")
        self.assertEqual(litellm["reason"], "http_500")
        self.assertEqual(litellm["state"], "degraded")
        self.assertNotIn("/health/liveliness", [row["path"] for row in bad_hits["rows"]])
        self.assertTrue(all(row["authorization"] == "Bearer " + c.KEY for row in bad_hits["rows"]))

        local = body["service_probes"]["LocalAI"]
        self.assertIs(body["services"]["LocalAI"], True, "fixture /readyz 200 text; expected true")
        self.assertEqual(local["reason"], "ok")
        self.assertEqual([row["path"] for row in http_hits["rows"]], ["/readyz"])

        web = body["service_probes"]["OpenWebUI"]
        self.assertIs(body["services"]["OpenWebUI"], False, "fixture timeout; expected false")
        self.assertEqual(web["reason"], "timeout")
        self.assertEqual(web["state"], "degraded")
        self.assertIs(web["http_status"], None)

        down = body["service_probes"]["Ollama"]
        self.assertIs(body["services"]["Ollama"], False, "fixture connection refused; expected false")
        self.assertEqual(down["reason"], "connection_refused")
        self.assertEqual(down["state"], "down")
        self.assertIs(down["port_open"], False)

        # L4: main は port_up だけを services にしていた。
        differential = {
            "llama-swap": (c.port_up(ok_port), body["services"]["llama-swap"]),
            "LiteLLM": (c.port_up(bad_port), body["services"]["LiteLLM"]),
            "LocalAI": (c.port_up(http_port), body["services"]["LocalAI"]),
            "Ollama": (c.port_up(refused), body["services"]["Ollama"]),
        }
        self.assertEqual(differential["llama-swap"], (True, True))
        self.assertEqual(differential["LiteLLM"], (True, False))
        self.assertEqual(differential["LocalAI"], (True, True))
        self.assertEqual(differential["Ollama"], (False, False))
        self.assert_exclusive(body)

    def test_l3_process_up_but_models_broken_brief_then_sustained_then_recovered(self):
        mode = {"v": "500"}

        def behavior(path):
            if path == "/health/liveliness":
                return 200, "text/plain", "alive"
            if path != "/v1/models":
                return 404, "text/plain", "no"
            if mode["v"] == "500":
                return 500, "application/json", b'{"error":{"message":"db"}}'
            return 200, "application/json; charset=utf-8", MODELS_BYTES

        port, hits = self.upstream(behavior)
        c.SERVICES = {"LiteLLM": (port, "/v1/models", "models"), "llama-swap": (closed_port(), "/v1/models", "models")}
        seen = []
        for _ in range(3):
            body = self.get_state()
            self.assertTrue(c.port_up(port))
            pr = body["service_probes"]["LiteLLM"]
            self.assertIs(body["services"]["LiteLLM"], False)
            self.assertEqual(pr["state"], "degraded")
            self.assertIs(pr["healthy"], False)
            seen.append((pr["consecutive_failures"], pr["failure_class"]))
            swap = body["service_probes"]["llama-swap"]
            self.assertEqual(swap["reason"], "connection_refused")
            self.assertIs(body["services"]["llama-swap"], False)
        self.assertEqual(seen, [(1, "brief"), (2, "brief"), (3, "sustained")])
        mode["v"] = "ok"
        body = self.get_state()
        pr = body["service_probes"]["LiteLLM"]
        self.assertIs(body["services"]["LiteLLM"], True, "fixture next /v1/models 200; expected true")
        self.assertEqual(pr["consecutive_failures"], 0)
        self.assertEqual(pr["failure_class"], "none")
        self.assertEqual(pr["state"], "healthy")
        self.assert_exclusive(body)
        self.assertNotIn("/health/liveliness", [row["path"] for row in hits["rows"]])

    def test_l5_adversarial_200_is_not_a_model_list(self):
        queue = []

        def behavior(path):
            if path == "/v1/models/real":
                return 200, "application/json; charset=utf-8", MODELS_BYTES
            if path != "/v1/models":
                return 200, "text/plain", "alive"
            return queue.pop(0)

        port, hits = self.upstream(behavior)
        c.SERVICES = {"LiteLLM": (port, "/v1/models", "models")}
        cases = [
            ("partial", (200, "application/json", b'{"object":"list","data":[{"id":"fast"}'), "partial_json"),
            ("html", (200, "text/html; charset=utf-8", MODELS_BYTES), "content_type"),
            ("plain", (200, "text/plain", MODELS_BYTES), "content_type"),
            ("missing_type", (200, "", MODELS_BYTES), "content_type"),
            ("shape_status", (200, "application/json", b'{"status":"ok"}'), "shape"),
            ("error_object", (200, "application/json", b'{"error":{"message":"nope"}}'), "shape"),
            ("string_rows", (200, "application/json", b'{"object":"list","data":["fast"]}'), "shape"),
            ("numeric_id", (200, "application/json", b'{"object":"list","data":[{"id":1}]}'), "shape"),
            ("blank_id", (200, "application/json", b'{"object":"list","data":[{"id":"  "}]}'), "shape"),
            ("null", (200, "application/json", b"null"), "shape"),
            ("top_list", (200, "application/json", b'[{"id":"fast"}]'), "shape"),
            ("binary", (200, "application/json", b"\xff\xfe"), "partial_json"),
            ("redirect", ("redirect", "/v1/models/real"), "http_302"),
        ]
        for name, spec, reason in cases:
            queue.append(spec)
            body = self.get_state()
            got = body["services"]["LiteLLM"]
            pr = body["service_probes"]["LiteLLM"]
            self.assertIs(got, False, "fixture %s; expected false; actual %r reason=%s" % (name, got, pr["reason"]))
            self.assertEqual(pr["reason"], reason, name)
            self.assertEqual(pr["state"], "degraded", name)
            self.assertIs(pr["unhealthy"], True, name)
            self.assert_exclusive(body)

        queue.append((200, "application/json; charset=utf-8", b"\xef\xbb\xbf" + MODELS_BYTES))
        body = self.get_state()
        self.assertIs(body["services"]["LiteLLM"], True, "fixture utf-8 bom + models json; expected true")
        queue.append((200, "application/json", b'{"object":"list","data":[]}'))
        body = self.get_state()
        self.assertIs(body["services"]["LiteLLM"], True, "fixture empty data array; expected true")
        self.assertEqual(body["service_probes"]["LiteLLM"]["reason"], "ok")
        self.assertGreaterEqual(len(hits["rows"]), 1)
        self.assertTrue(all(row["path"] != "/health/liveliness" for row in hits["rows"]))

    def test_locked_down_service_is_unhealthy_but_not_a_restart_topic(self):
        self.assertIn("llama7B", c.decision_lock.forced_down_services())

        def behavior(path):
            return 500, "text/plain", "no"

        port, _hits = self.upstream(behavior)
        ok_port, _ok = self.upstream(lambda path: (200, "application/json; charset=utf-8", MODELS_BYTES) if path == "/v1/models" else (404, "text/plain", "no"))
        c.SERVICES = {"llama7B": (port, "/health", "http"), "LiteLLM": (ok_port, "/v1/models", "models")}
        body = self.get_state()
        self.assertIs(body["services"]["llama7B"], False)
        self.assertIs(body["services"]["LiteLLM"], True)
        self.assert_exclusive(body)
        down, summary = c.health_summary()
        self.assertNotIn("llama7B", down)
        self.assertNotIn("LiteLLM", down)
        self.assertIn("固定停止: llama7B", summary)
        self.assertNotIn("応答異常", summary)

    def test_served_village_marks_degraded_separately_from_down(self):
        if self.api is None:
            self.api = _Server(("127.0.0.1", 0), c.H)
            threading.Thread(target=self.api.serve_forever, daemon=True).start()
        port = self.api.server_address[1]
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=3) as r:
            html = r.read().decode("utf-8")
        self.assertIn("function paintSvc", html)
        self.assertIn("degraded", html)
        self.assertIn("⚠", html)
        self.assertIn("💤", html)


def tearDownModule():
    if _MADE_KEY:
        try:
            os.remove(_KEY)
        except OSError:
            pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
