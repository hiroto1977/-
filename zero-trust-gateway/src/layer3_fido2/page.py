# 第 3 層の画面: 利用者が物理キーとスマホのパスキーを登録し、確認するページ (1 枚の HTML)。
#
# page.html の印 (@@STYLE@@ / @@SCRIPT@@) へ page.css と page.js をそのまま差し込み、起動時に 1 度だけ組む。
#   - 外のファイルを 1 つも読まない (CSP の default-src 'none')。スクリプトと見た目は中身のハッシュだけを許す。
#   - 通信は同じオリジンだけ (connect-src 'self')。ほかのページの枠に入れさせない (frame-ancestors 'none')。
#   - 画面は誰でも開ける (秘密を持たない)。守っているのは、画面が叩く入口の道のほう。
from __future__ import annotations

import base64
import hashlib
from pathlib import Path

_HERE = Path(__file__).parent
_STYLE_MARK = "@@STYLE@@"
_SCRIPT_MARK = "@@SCRIPT@@"


class PageError(RuntimeError):
    pass


def _csp_hash(text: str) -> str:
    return "'sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode("ascii") + "'"


def build_page(directory: Path = _HERE) -> tuple[bytes, dict[str, str]]:
    # (本文, 応答ヘッダ)。組めない形なら起動を止める (壊れた画面を出さない)。
    template = (directory / "page.html").read_text(encoding="utf-8")
    style = (directory / "page.css").read_text(encoding="utf-8")
    script = (directory / "page.js").read_text(encoding="utf-8")
    if template.count(_STYLE_MARK) != 1 or template.count(_SCRIPT_MARK) != 1:
        raise PageError("画面の雛形の印が 1 つずつではない")
    # 差し込む中身が自分のタグを閉じると、その先が別の物として読まれる。
    if "</style" in style.lower() or "</script" in script.lower() or "<!--" in script:
        raise PageError("差し込む中身がタグを閉じている")
    if _STYLE_MARK in style + script or _SCRIPT_MARK in style + script:
        raise PageError("差し込む中身に印が入っている")
    html = template.replace(_STYLE_MARK, style).replace(_SCRIPT_MARK, script)
    csp = "; ".join(
        (
            "default-src 'none'",
            f"script-src {_csp_hash(script)}",
            f"style-src {_csp_hash(style)}",
            "connect-src 'self'",
            "img-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
            "require-trusted-types-for 'script'",
            "trusted-types 'none'",
        )
    )
    headers = {
        "Content-Security-Policy": csp,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Permissions-Policy": (
            "publickey-credentials-create=(self), publickey-credentials-get=(self), "
            "camera=(), microphone=(), geolocation=()"
        ),
    }
    return html.encode("utf-8"), headers
