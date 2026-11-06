"""村の 1 対 1 と組織全体が、既存の /api/chat と /api/topic に届くこと。

モデルは差し替える。実 LiteLLM は呼ばない。会議ループは起動しない
（議題は PENDING に残り、/api/state の pending で見える）。
"""
import json, os, sys, tempfile, threading, unittest, urllib.request
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False


def ensure_import_key():
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


def post(port, path, payload):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, json.loads(r.read().decode())


class VillageTalkApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        council.THREAD = os.path.join(self.tmp.name, "user_thread.md")
        council.CHAT.clear()
        council.PENDING.clear()
        council.PROBE_TIMEOUT = 0.2
        council.claude_status = lambda: "無効"
        council.STATE.update(status="待機中", topic="", transcript=[], speaking=None)
        self.ask = council.ask
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), council.H)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.shutdown)
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(setattr, council, "ask", self.ask)

    def test_one_to_one_uses_chat_and_returns_the_resident(self):
        council.ask = lambda *a: ("balanced", "現金の残高を先に見ます。今日は確認だけにします。")
        status, body = post(self.port, "/api/chat", {"to": "cfo", "text": "先に見る数字は？"})
        self.assertEqual(status, 200)
        self.assertEqual(body["id"], "cfo")
        self.assertEqual(body["who"], "CFO")
        self.assertEqual(body["model"], "balanced")
        self.assertIn("現金の残高", body["text"])
        self.assertTrue(any(c["who"].startswith("CFO") for c in council.CHAT))

    def test_model_down_is_an_explicit_empty_reply(self):
        council.ask = lambda *a: ("none", "（応答なし）")
        status, body = post(self.port, "/api/chat", {"to": "cfo", "text": "聞こえますか"})
        self.assertEqual(status, 200)
        self.assertEqual(body["model"], "none")
        self.assertEqual(body["text"], "（応答なし）")

    def test_group_topic_is_queued_for_the_existing_meeting(self):
        status, body = post(self.port, "/api/topic", {"to": "", "text": "資金の見える化を役ごとに"})
        self.assertEqual(status, 200)
        self.assertIs(body["ok"], True)
        self.assertEqual(body["pending"], 1)
        self.assertEqual(council.PENDING, ["資金の見える化を役ごとに"])
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/api/state", timeout=5) as r:
            st = json.loads(r.read().decode())
        self.assertEqual(st["pending"], 1)
        self.assertTrue(any("組織全体" in c["text"] for c in st["chat"]))

    def test_page_keeps_meeting_lines_in_the_chat_panel(self):
        with open(os.path.join(HERE, "web", "index.html"), encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="meet"', html)
        self.assertIn("from '/villageTalk.mjs'", html)
        self.assertIn("renderMeeting(", html)
        self.assertIn("oneOutcome(", html)
        self.assertNotIn("失敗: '+e", html)


if __name__ == "__main__":
    unittest.main()
