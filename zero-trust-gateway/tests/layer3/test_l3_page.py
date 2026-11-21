# 第 3 層の画面 (GET /auth/) の検査。
#
# 画面の動き (鍵を作る・DPoP の証明を組む・認証器を呼ぶ) は本物のブラウザでしか走らないので、
# ここでは「出す物の形」と「書き方の決まり」を見る。ブラウザでの通しは手で回す (README の「知っておく限界」)。
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

import pytest
from fastapi.testclient import TestClient

from app import _AUTH_PATHS, create_app
from helpers import BASE
from layer3_fido2.page import PageError, build_page
from settings import Settings

PAGE_DIR = Path(__file__).resolve().parents[2] / "src" / "layer3_fido2"
SCRIPT = (PAGE_DIR / "page.js").read_text(encoding="utf-8")
TEMPLATE = (PAGE_DIR / "page.html").read_text(encoding="utf-8")


def _app(tmp_path: Path) -> Any:
    settings = Settings(public_base_url=BASE, audit_log_path=tmp_path / "audit.jsonl")
    return create_app(settings, clock=lambda: 1_795_219_200.0)


@pytest.fixture()
def served(tmp_path: Path) -> tuple[Any, Any]:
    app = _app(tmp_path)
    response = TestClient(app, base_url=BASE).get("/auth/")
    return app, response


def _inline(body: str, tag: str) -> list[str]:
    return re.findall(rf"<{tag}>(.*?)</{tag}>", body, flags=re.S)


def _sha(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii") + "'"


def _csp(response: Any) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in response.headers["content-security-policy"].split(";"):
        name, _, value = part.strip().partition(" ")
        assert name not in out, f"CSP の {name} が 2 度ある"
        out[name] = value
    return out


# ---- 出す物 ----
def test_page_is_served_without_proof_and_with_every_header(served: tuple[Any, Any], tmp_path: Path) -> None:
    _, response = served
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    _, headers = build_page()
    for name, value in headers.items():
        assert response.headers[name] == value, name
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-frame-options"] == "DENY"
    assert "publickey-credentials-get=(self)" in response.headers["permissions-policy"]
    # 静的な 1 枚なので記録を残さない (開いただけで記録が増えると、記録の量で入口を詰まらせられる)。
    assert not (tmp_path / "audit.jsonl").exists() or (tmp_path / "audit.jsonl").read_text() == ""


def test_trailing_slash_less_path_redirects_to_the_page(tmp_path: Path) -> None:
    response = TestClient(_app(tmp_path), base_url=BASE).get("/auth", follow_redirects=False)
    assert response.status_code in (307, 308)
    assert urlsplit(response.headers["location"]).path == "/auth/"


def test_csp_allows_only_the_inline_script_and_style_by_hash(served: tuple[Any, Any]) -> None:
    _, response = served
    body = response.text
    scripts, styles = _inline(body, "script"), _inline(body, "style")
    assert len(scripts) == 1 and len(styles) == 1
    csp = _csp(response)
    assert csp["default-src"] == "'none'"
    assert csp["script-src"] == _sha(scripts[0])
    assert csp["style-src"] == _sha(styles[0])
    assert csp["connect-src"] == "'self'"
    for name in ("img-src", "base-uri", "form-action", "frame-ancestors", "trusted-types"):
        assert csp[name] == "'none'", name
    assert csp["require-trusted-types-for"] == "'script'"
    joined = response.headers["content-security-policy"]
    assert "unsafe" not in joined and "*" not in joined and "http" not in joined


def test_page_loads_nothing_from_outside(served: tuple[Any, Any]) -> None:
    body = served[1].text
    needles = (r"<script[^>]*\bsrc=", r"<link\b", r"<iframe\b", r"<img\b", r"\bhref=", r"https?://", r"@import")
    # 針が実際に当たることを、同じ検査の中で標本に確かめる (綴りが 1 つ違えば黙る検査にしない)。
    samples = ('<script src="x.js">', '<link rel="x">', "<iframe>", "<img alt>", 'href="x"', "https://x", "@import url(x)")
    for needle, sample in zip(needles, samples, strict=True):
        assert re.search(needle, sample), needle
        assert re.search(needle, body) is None, needle


def test_the_page_is_japanese_first_with_english_in_parentheses(served: tuple[Any, Any]) -> None:
    body = served[1].text
    assert '<html lang="ja">' in body
    assert "<title>二重確認 (Two-step sign-in)</title>" in body


# ---- 組み立ての守り ----
def _copy(tmp_path: Path, **over: str) -> Path:
    for name in ("page.html", "page.css", "page.js"):
        (tmp_path / name).write_text(over.get(name.replace(".", "_"), (PAGE_DIR / name).read_text(encoding="utf-8")), encoding="utf-8")
    return tmp_path


def test_build_refuses_a_template_without_exactly_one_of_each_mark(tmp_path: Path) -> None:
    with pytest.raises(PageError):
        build_page(_copy(tmp_path, page_html=TEMPLATE.replace("@@SCRIPT@@", "")))
    with pytest.raises(PageError):
        build_page(_copy(tmp_path, page_html=TEMPLATE + "@@STYLE@@"))


@pytest.mark.parametrize(
    "over",
    [
        {"page_js": SCRIPT + "\n// </script><script>alert(1)</script>"},
        {"page_js": SCRIPT + "\n// </SCRIPT >"},
        {"page_js": SCRIPT + "\n// <!-- x"},
        {"page_css": "body{}</style><script>x</script>"},
        {"page_js": SCRIPT + "\n// @@STYLE@@"},
    ],
)
def test_build_refuses_contents_that_close_their_own_tag(tmp_path: Path, over: dict[str, str]) -> None:
    with pytest.raises(PageError):
        build_page(_copy(tmp_path, **over))


def test_build_of_the_real_files_succeeds() -> None:
    body, headers = build_page()
    assert b"@@" not in body
    assert "sha256-" in headers["Content-Security-Policy"]


# ---- 画面の動きの書き方 ----
def _code(text: str) -> str:
    # 行の注記を落とす (注記の中の言及は数えない)。文字列の中の // は URL にしか出ないので、出現は無い前提で確かめる。
    assert "://" not in text
    return "\n".join(line.split("//")[0] for line in text.splitlines())


CODE = _code(SCRIPT)


def test_script_writes_to_the_screen_only_through_text_content() -> None:
    sinks = ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setTimeout('", "srcdoc")
    for sink in sinks:
        assert sink in f"el.{sink}x", sink  # 標本: 針は綴りどおりに当たる
        assert sink not in CODE, sink
    assert "textContent" in CODE


def test_device_key_is_created_non_extractable_and_never_exported() -> None:
    created = re.findall(r"crypto\.subtle\.generateKey\(ALG, (\w+),", CODE)
    assert created == ["false"]
    assert re.search(r"generateKey\(ALG, (\w+),", "crypto.subtle.generateKey(ALG, true, [])")  # 標本
    exported = re.findall(r"exportKey\('jwk', ([\w.]+)\)", CODE)
    assert exported == ["pair.publicKey"]


def test_token_and_key_never_go_to_page_wide_storage() -> None:
    for place in ("localStorage", "sessionStorage", "document.cookie", "console.", "postMessage"):
        assert place in f"x.{place}y" or place in f"{place}y", place  # 標本
        assert place not in CODE, place
    assert "access_token" in CODE  # 許可を受け取る所は在る (上の不在が空の検査でない)


def test_requests_send_no_cookies_and_follow_no_redirects() -> None:
    for option in ("credentials: 'omit'", "redirect: 'error'", "cache: 'no-store'"):
        assert option in CODE, option
    assert CODE.count("fetch(") == 1


def test_proof_has_the_claims_the_gateway_checks() -> None:
    for part in ("typ: 'dpop+jwt'", "alg: 'ES256'", "htm: method", "htu: url.href", "iat: Math.floor(Date.now() / 1000)", "claims.ath ="):
        assert part in CODE, part
    # 番号 (jti) は 16〜128 字 (入口の決まり)。24 バイトの乱数は base64url で 32 字。
    assert "jti: b64url(crypto.getRandomValues(new Uint8Array(24)))" in CODE
    assert len(base64.urlsafe_b64encode(bytes(24)).rstrip(b"=")) == 32


def test_every_path_the_page_calls_is_a_real_route(tmp_path: Path) -> None:
    calls = re.findall(r"call\('(GET|POST)', '([^']+)'", CODE)
    assert calls, "画面が叩く道が見つからない"
    routes = {(m, r.path) for r in _app(tmp_path).routes for m in getattr(r, "methods", set())}
    page_url = f"{BASE}/auth/"
    resolved = set()
    for method, path in calls:
        target = urlsplit(urljoin(page_url, path)).path
        assert (method, target) in routes, (method, target)
        resolved.add(target)
    # 逆向き: 第 3 層の道はどれも画面から押せる。
    assert set(_AUTH_PATHS.values()) | {"/auth/session"} <= resolved
    assert {"/token", "/resource/ping"} <= resolved


def test_every_button_has_a_handler_and_every_handler_has_a_button() -> None:
    in_html = set(re.findall(r'<button type="button" id="([\w-]+)"', TEMPLATE))
    bound = set(re.findall(r"\$\('([\w-]+)'\)\.addEventListener\('click'", CODE))
    listed = set(re.findall(r"'(btn-[\w-]+)'", CODE.split("const buttons = [", 1)[1].split("]", 1)[0]))
    assert in_html and in_html == bound == listed
    assert "<form" not in TEMPLATE  # 送るのはボタンの処理だけ (送信先の無い form を作らない)


def test_forget_button_deletes_the_device_key() -> None:
    # 逃げ口: この端末の鍵を、画面から消せる。
    assert "$('btn-forget').addEventListener('click', () => guarded(forgetKey))" in CODE
    body = CODE.split("async function forgetKey()", 1)[1].split("\n  }\n", 1)[0]
    assert "store.delete(KEY_NAME)" in body
    assert "window.confirm(" in body
    assert "token = null" in body


def test_every_input_has_a_label() -> None:
    ids = re.findall(r'<input id="([\w-]+)"', TEMPLATE)
    for input_id in ids:
        assert f'<label for="{input_id}">' in TEMPLATE, input_id
    radios = re.findall(r"<label[^>]*>\s*<input type=\"radio\"", TEMPLATE)
    assert len(radios) == TEMPLATE.count('type="radio"') == 2
