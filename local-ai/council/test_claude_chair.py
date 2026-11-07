"""議長は Claude、相談役は Grok のまま。CLI 未導入でも会議は止まらない。

CI では Claude のログインも Grok の API キーも使わない。
議長は claude コマンドのスタブ（または claude_ask の差し替え）、相談役は advice_inbox の行。
"""
import os, stat, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
KEY_FILE = os.path.expanduser("~/litellm/master_key")
_CREATED_KEY = False


def ensure_import_key():
    """council.py は読込時に鍵ファイルを開く。無いときだけ検査用の仮鍵を作る。"""
    global _CREATED_KEY
    if os.path.exists(KEY_FILE):
        return
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, b"test-key-not-secret\n")
    os.close(fd)
    _CREATED_KEY = True


ensure_import_key()


def tearDownModule():
    if _CREATED_KEY and os.path.exists(KEY_FILE):
        os.remove(KEY_FILE)


def load(env):
    with mock.patch.dict(os.environ, env):
        sys.modules.pop("council", None)
        import council  # noqa: E402
        return council


class ClaudeChairTest(unittest.TestCase):
    def test_disabled(self):
        c = load({"COUNCIL_CLAUDE": "0"})
        self.assertEqual(c.claude_status(), "無効")
        self.assertIsNone(c.claude_ask("s", "u"))
        self.assertNotIn("claude", c.P)
        self.assertEqual(c.P["grok"]["tier"], "相談役")
        self.assertEqual(c.P["grok"]["model"], "grok")

    def test_roles_split(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        claude = c.P["claude"]
        grok = c.P["grok"]
        self.assertEqual(claude["tier"], "議長")
        self.assertEqual(claude["title"], "Claude（議長）")
        self.assertEqual(claude["model"], "claude")
        self.assertNotIn("相談役", claude["title"])
        self.assertEqual(grok["tier"], "相談役")
        self.assertEqual(grok["title"], "Grok（相談役）")
        self.assertEqual(grok["model"], "grok")
        self.assertEqual([p["id"] for p in c.ORG["people"] if p["tier"] == "相談役"], ["grok"])
        self.assertEqual([p["id"] for p in c.ORG["people"] if p["tier"] == "議長"], ["claude"])

    def test_chair_turn_is_claude_not_advisor(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        seen = {}

        def fake(system, user):
            seen["system"] = system
            return "議長の講評です。改善案: このまま残す。"

        c.STATE["transcript"].clear()
        with mock.patch.object(c, "claude_ask", side_effect=fake), mock.patch.object(c, "ask", side_effect=AssertionError("local model must not chair")):
            label, text = c.chair_review("議題の確認", ["COO: 進める"], "決定: 現状維持")
        turn = c.STATE["transcript"][-1]
        self.assertEqual(turn["id"], "claude")
        self.assertEqual(turn["role"], "Claude（議長）")
        self.assertEqual(turn["model"], "claude")
        self.assertNotIn("相談役", turn["role"])
        self.assertIn("Claude（議長）", label)
        self.assertIn("claude", label)
        self.assertNotRegex(seen["system"], r"あなたは[^。]{0,80}相談役です")
        self.assertIn("議長", seen["system"])
        self.assertIn(text, turn["text"])

    def test_chair_fallback_is_not_advisor(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        c.STATE["transcript"].clear()
        with mock.patch.object(c, "claude_ask", return_value=None), mock.patch.object(
            c, "ask", return_value=("balanced", "代理の講評です。ひらがなを含めた文章として十分です。")
        ):
            label, _ = c.chair_review("議題", [], "決定: 現状維持")
        turn = c.STATE["transcript"][-1]
        self.assertEqual(turn["role"], "代理議長")
        self.assertIn("代理議長", turn["model"])
        self.assertNotIn("相談役", turn["role"])
        self.assertNotIn("Claude", turn["role"])
        self.assertIn("代理議長", label)

    def test_advisor_turn_stays_grok(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "advice_inbox.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write("- 来期の会議室の椅子を2脚買い足す\n")
            c.ADVICE = path
            with mock.patch.object(c, "claude_ask", side_effect=AssertionError("claude must not advise")), mock.patch.object(
                c, "ask", side_effect=AssertionError("local model must not advise")
            ):
                src, topic = c.pick_topic()
                self.assertEqual(src, "クラウドの助言（Grok）")
                self.assertNotIn("Claude", topic)
                hist = []
                c.STATE["transcript"].clear()
                c.note_advisor(src, topic, hist)
                saved = open(path, encoding="utf-8").read()
            self.assertIn("[済]", saved)
            self.assertNotIn("Claude", saved)
        turn = c.STATE["transcript"][-1]
        self.assertEqual(turn["id"], "grok")
        self.assertEqual(turn["role"], "Grok（相談役）")
        self.assertEqual(turn["model"], "grok")
        self.assertIn("Grok:", hist[-1])
        self.assertIsNone(c.note_advisor("受信箱", "別の議題", []))

    def test_grok_chat_does_not_call_claude(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "advice_inbox.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write("- [済] 相談役としての助言は椅子を買い足すだけ\n")
            c.ADVICE = path
            with mock.patch.object(c, "claude_ask", side_effect=AssertionError("claude must not advise")), mock.patch.object(
                c, "ask", side_effect=AssertionError("local model must not advise")
            ):
                reply = c.chat_reply(c.P["grok"], "相談役としてどう思いますか")
        self.assertEqual(reply["role"], "相談役")
        self.assertEqual(reply["model"], "grok")
        self.assertEqual(reply["who"], "Grok（相談役）")
        self.assertIn("椅子を買い足す", reply["text"])
        self.assertNotIn("Claude", reply["text"])

    def test_claude_chat_is_chair(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        seen = {}

        def fake(system, user):
            seen["system"] = system
            return "議長として確認しました。"

        with mock.patch.object(c, "claude_ask", side_effect=fake):
            reply = c.chat_reply(c.P["claude"], "議長の見解は")
        self.assertEqual(reply["role"], "議長")
        self.assertEqual(reply["who"], "Claude（議長）")
        self.assertEqual(reply["model"], "claude")
        self.assertIn("議長Claude", seen["system"])
        self.assertNotIn("相談役Claude", seen["system"])
        self.assertNotRegex(seen["system"], r"あなたは[^。]{0,80}相談役です")

    def test_ui_labels(self):
        html = open(os.path.join(HERE, "web", "index.html"), encoding="utf-8").read()
        self.assertIn("Claude（議長）", html)
        self.assertIn("Grok（相談役）", html)
        self.assertIn("クラウドの助言（Grok）", html)
        self.assertNotIn("Claude（相談役）", html)
        self.assertNotIn("クラウドの助言（Claude）", html)
        self.assertNotRegex(html, r"相談役にClaude|Claudeを相談役")

    def test_cli_missing(self):
        c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": "/nonexistent/claude"})
        c.CLAUDE_BIN = "/nonexistent/claude"
        self.assertEqual(c.claude_status(), "CLI未導入")
        self.assertIsNone(c.claude_ask("s", "u"))
        self.assertIn("claude", c.P)

    def test_not_logged_in(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "claude")
            with open(fake, "w") as f:
                f.write('#!/bin/sh\necho \'{"loggedIn": false}\'\n')
            os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
            c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": fake})
            c.CLAUDE_BIN = fake
            c._CL["checked"] = 0.0
            with mock.patch.object(c, "log_sys"):
                self.assertEqual(c.claude_status(), "未ログイン")
                self.assertIsNone(c.claude_ask("s", "u"))

    def test_logged_in_and_rate_limit(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "claude")
            with open(fake, "w") as f:
                f.write('#!/bin/sh\nif [ "$1" = auth ]; then echo \'{"loggedIn": true}\'; else cat >/dev/null; echo 講評です; fi\n')
            os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
            c = load({"COUNCIL_CLAUDE": "1", "COUNCIL_CLAUDE_BIN": fake})
            c.CLAUDE_BIN = fake
            c._CL["checked"] = 0.0
            c._CL["calls"].clear()
            c.CLAUDE_MAX_HOUR = 1
            with mock.patch.object(c, "log_sys"):
                self.assertEqual(c.claude_status(), "利用可")
                self.assertEqual(c.claude_ask("s", "u"), "講評です")
                self.assertIsNone(c.claude_ask("s", "u"))


if __name__ == "__main__":
    unittest.main()
