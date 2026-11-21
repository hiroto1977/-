# 設定の読み方と、「秘密を書かない」(規則 1) の検査。
from __future__ import annotations

import re
from pathlib import Path

import pytest

from helpers import BASE, forge
from settings import Settings, SettingsError, load_settings

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"PUBLIC_BASE_URL": BASE, "AUDIT_LOG_PATH": "/var/lib/zt/audit.jsonl"}


# ---- 設定 ----
def test_必須の_2_つだけで読め_既定は安全側() -> None:
    s = load_settings(REQUIRED)
    assert (s.token_ttl_seconds, s.firewall_execute, s.attestation_mode) == (300, False, "off")
    assert (s.risk_step_up, s.risk_freeze, s.block_timeout_hours) == (0.6, 0.85, 24)
    assert s.issuer == BASE


def test_必須が欠けていれば起動しない() -> None:
    for missing in REQUIRED:
        with pytest.raises(SettingsError):
            load_settings({k: v for k, v in REQUIRED.items() if k != missing})


@pytest.mark.parametrize(
    "over",
    [
        {"TOKEN_TTL_SECONDS": "301"},
        {"TOKEN_TTL_SECONDS": "0"},
        {"TOKEN_TTL_SECONDS": "five"},
        {"RISK_STEP_UP": "0.9", "RISK_FREEZE": "0.8"},
        {"RISK_FREEZE": "1.5"},
        {"FIREWALL_EXECUTE": "yes"},
        {"FIREWALL_EXECUTE": "1"},
        {"ATTESTATION_MODE": "maybe"},
        {"PUBLIC_BASE_URL": "http://gw.example.test"},
        {"PUBLIC_BASE_URL": "https://gw.example.test/api"},
        {"PUBLIC_BASE_URL": "ftp://gw.example.test"},
        {"SIGNING_KEY_ROTATE_HOURS": "0"},
    ],
)
def test_読めない設定では起動しない(over: dict[str, str]) -> None:
    with pytest.raises(SettingsError):
        load_settings({**REQUIRED, **over})


def test_ファイアウォールを動かすのは_true_と書いたときだけ() -> None:
    assert load_settings({**REQUIRED, "FIREWALL_EXECUTE": "true"}).firewall_execute is True
    assert load_settings({**REQUIRED, "FIREWALL_EXECUTE": " TRUE "}).firewall_execute is True
    for off in ("", "false", "False"):
        assert load_settings({**REQUIRED, "FIREWALL_EXECUTE": off}).firewall_execute is False


def test_手元の試しだけ_http_の_localhost_を許す() -> None:
    assert Settings(public_base_url="http://localhost:8000", audit_log_path=Path("a")).issuer == "http://localhost:8000"


def test_管理用の_IP_は_カンマ区切りで読む() -> None:
    s = load_settings({**REQUIRED, "ADMIN_ALLOWLIST": "203.0.113.10, 2001:db8:aa::/48 ,"})
    assert s.admin_allowlist == ("203.0.113.10", "2001:db8:aa::/48")


# ---- 秘密を書かない ----
# 値を書いてよいのは、秘密でない既定値だけ。
ENV_DEFAULTS_ALLOWED = {
    "ATTESTATION_MODE": "off",
    "TOKEN_TTL_SECONDS": "300",
    "SIGNING_KEY_ROTATE_HOURS": "24",
    "RISK_STEP_UP": "0.6",
    "RISK_FREEZE": "0.85",
    "BLOCK_TIMEOUT_HOURS": "24",
    "BLOCK_RATE_LIMIT_PER_MIN": "20",
    "FIREWALL_EXECUTE": "false",
}
PEM = re.compile("-----" + "BEGIN [A-Z ]*PRIVATE KEY")
JWS = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}")
# 引用符の中の、長い英数字の並び (鍵やトークンの書き込みらしい物)。
LONG_LITERAL = re.compile(r"""["'][A-Za-z0-9+/_-]{40,}={0,2}["']""")
# 名前が秘密を指す代入に、空でない文字列を直に書いた形。
ASSIGNED = re.compile(r"""(?i)\b\w*(password|passwd|secret|api_?key|private_?key)\w*\s*=\s*["'][^"']{6,}["']""")
SCANNED_SUFFIXES = {".py", ".md", ".txt", ".in", ".ini", ".nft", ".example", ".toml", ".yml", ".json"}


def findings(text: str) -> list[str]:
    hits = []
    for name, pattern in (("pem", PEM), ("jws", JWS), ("long", LONG_LITERAL), ("assigned", ASSIGNED)):
        if pattern.search(text):
            hits.append(name)
    return hits


def project_files() -> list[Path]:
    skip = {"__pycache__", ".pytest_cache", ".hypothesis", ".venv"}
    files = [
        p
        for p in ROOT.rglob("*")
        if p.is_file() and not skip.intersection(p.parts) and (p.suffix in SCANNED_SUFFIXES or p.name == ".env.example")
    ]
    # requirements.txt はハッシュの一覧 (秘密ではない) なので、長い並びの検査から外す。
    return [p for p in files if p.name != "requirements.txt"]


def test_検査の針は_秘密らしい書き方に当たる() -> None:
    # 標本はその場で組む (このファイルに秘密らしい文字列を書いておかない)。
    assert findings("-----" + "BEGIN PRIVATE KEY-----") == ["pem"]
    assert findings(forge({"alg": "EdDSA", "typ": "at+jwt"}, {"sub": "alice"}, b"signature-bytes")) == ["jws"]
    assert findings('KEY = "' + "A1b2C3d4" * 6 + '"') == ["long"]
    assert findings("api" + '_key = "' + "hunter2-hunter2" + '"') == ["assigned"]
    assert findings('password = ""') == []
    assert findings("token = secrets.token_urlsafe(32)") == []


def test_プロジェクトのどのファイルにも_秘密らしい書き込みが無い() -> None:
    files = project_files()
    assert len(files) >= 30
    bad = {str(p.relative_to(ROOT)): findings(p.read_text(encoding="utf-8")) for p in files}
    assert {name: hits for name, hits in bad.items() if hits} == {}


def test_env_example_は_名前だけ_値は秘密でない既定値だけ() -> None:
    rows = [
        line.split("=", 1)
        for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
        if line.strip() != "" and not line.startswith("#")
    ]
    assert len(rows) >= 12
    for name, value in rows:
        assert value == ENV_DEFAULTS_ALLOWED.get(name, ""), name
    # 設定が読む名前は、全部ここに載っている。
    source = (ROOT / "src" / "settings.py").read_text(encoding="utf-8")
    read = set(re.findall(r'"([A-Z][A-Z0-9_]{3,})"', source))
    assert read - {name for name, _ in rows} == set()


def test_本物の_env_は追跡しない() -> None:
    assert ".env" in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
