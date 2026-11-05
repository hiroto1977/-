"""Claude 相談役の縮退動作のテスト（CLI 未導入・未ログインでも会議が止まらないこと）。"""
import os, stat, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


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
