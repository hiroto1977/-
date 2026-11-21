# ブラウザで画面を通す検査 (tests/browser/) の形を見る。
#
# 本体の検査は gateway-browser.yml が本物の Chromium で回す。ここで見るのは、その検査が
# 「画面のボタンを全部押す」「入口に抜け道を作らない」「秘密を刷らない」「CI で走る」を保っていること。
from __future__ import annotations

import re
import secrets
from pathlib import Path

import pytest

from browser.serve import prepare

ROOT = Path(__file__).resolve().parents[3]
GATEWAY = ROOT / "zero-trust-gateway"
DRIVER = (GATEWAY / "tests" / "browser" / "auth_page.cjs").read_text(encoding="utf-8")
SERVE = (GATEWAY / "tests" / "browser" / "serve.py").read_text(encoding="utf-8")
TEMPLATE = (GATEWAY / "src" / "layer3_fido2" / "page.html").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github" / "workflows" / "gateway-browser.yml").read_text(encoding="utf-8")
E2E = (ROOT / ".github" / "workflows" / "e2e.yml").read_text(encoding="utf-8")


def test_driver_presses_every_button_on_the_page() -> None:
    in_page = set(re.findall(r'<button type="button" id="([\w-]+)"', TEMPLATE))
    pressed = set(re.findall(r"page\.click\('#([\w-]+)'\)", DRIVER))
    assert in_page and in_page == pressed
    radios = set(re.findall(r'type="radio" name="kind" value="(\w+)"', TEMPLATE))
    checked = set(re.findall(r"input\[value=\"(\w+)\"\]", DRIVER))
    assert radios == checked == {"hardware_key", "phone_passkey"}


def test_driver_checks_every_state_the_page_can_show() -> None:
    page_js = (GATEWAY / "src" / "layer3_fido2" / "page.js").read_text(encoding="utf-8")
    states = set(re.findall(r"^\s+(\w+): '", page_js.split("const STATE_TEXT = {", 1)[1].split("};", 1)[0], flags=re.M))
    assert states == {"none", "single", "strong"}
    for state in states:
        assert f"'{state}')" in DRIVER, state


def test_driver_never_prints_the_codes_or_the_key() -> None:
    printing = re.findall(r"console\.(?:log|error)\(([^;]*)\);", DRIVER)
    assert printing, "刷る所が見つからない (下の不在が空の検査になる)"
    for line in printing:
        for secret in ("codes", "hardware", "privateKey", "credentialId", "userHandle"):
            assert re.search(rf"\b{secret}\b", line) is None, line
    assert re.search(r"\bcodes\b", "console.log(codes[0])")  # 標本: 針は当たる


def test_driver_cleans_up_and_stays_local() -> None:
    assert "fs.mkdtempSync(path.join(os.tmpdir(), 'zt-browser-'))" in DRIVER
    assert "fs.rmSync(state, { recursive: true, force: true })" in DRIVER
    assert "child.kill('SIGTERM')" in DRIVER
    assert re.findall(r"https?://[^\s'`]+", DRIVER) == ["http://localhost:${PORT}/auth/"]
    assert "fetch(" not in DRIVER


def test_serve_uses_the_real_settings_and_app() -> None:
    # 本物の設定の読み (load_settings) と create_app を通す。入口に試しのための抜け道を作らない。
    assert "create_app(load_settings(env))" in SERVE
    assert "Settings(" not in SERVE
    assert 'host="127.0.0.1"' in SERVE
    assert "uvicorn.run(app," in SERVE


def test_prepare_writes_only_hashes_of_the_codes_and_only_the_public_key(tmp_path: Path) -> None:
    handoff = prepare(tmp_path, now=1_795_219_200.0)
    codes = handoff["codes"]
    assert isinstance(codes, list) and len(codes) == 2 and codes[0] != codes[1]
    on_disk = "".join(p.read_text(encoding="utf-8") for p in tmp_path.iterdir())
    for code in codes:
        assert code not in on_disk
    hardware = handoff["hardware"]
    assert isinstance(hardware, dict)
    assert hardware["privateKey"] not in on_disk
    assert sorted(p.name for p in tmp_path.iterdir()) == ["credentials.json", "enroll.jsonl", "roots.pem"]


def test_prepare_makes_new_values_every_time(tmp_path: Path) -> None:
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    first, second = prepare(a, now=1.0), prepare(b, now=1.0)
    assert first["codes"] != second["codes"]
    assert first["hardware"] != second["hardware"]
    assert (a / "roots.pem").read_bytes() != (b / "roots.pem").read_bytes()
    assert len(secrets.token_urlsafe(32)) == len(first["codes"][0])  # type: ignore[index]


@pytest.mark.parametrize(
    "needle",
    [
        "'zero-trust-gateway/**'",
        "permissions:\n  contents: read",
        "--only-binary=:all: --require-hashes -r zero-trust-gateway/requirements.txt",
        "node scripts/verify-e2e-playwright-pin.cjs --self-test && node scripts/verify-e2e-playwright-pin.cjs",
        'ZT_PYTHON="$RUNNER_TEMP/zt-venv/bin/python" node zero-trust-gateway/tests/browser/auth_page.cjs',
        "persist-credentials: false",
    ],
)
def test_workflow_runs_the_driver_on_gateway_changes(needle: str) -> None:
    assert needle in WORKFLOW, needle


def test_workflow_pins_the_same_playwright_as_e2e() -> None:
    pin = re.compile(r"playwright@(\d+\.\d+\.\d+)")
    assert pin.findall(WORKFLOW) == pin.findall(E2E) and len(pin.findall(WORKFLOW)) == 1
