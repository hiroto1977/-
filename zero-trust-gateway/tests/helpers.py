# 検査の道具。鍵は検査のたびに作る (検査用でも、鍵をファイルに書かない —— 規則 1)。
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric import ec, ed25519

from layer5_ephemeral.jose import b64url_encode, jwk_from_public_key, sha256_b64url, sign_compact

# 2026-11-21T00:00:00Z。検査の中の「いま」。
NOW = 1_795_219_200.0
BASE = "https://gw.example.test"


def at(now: float = NOW) -> datetime:
    return datetime.fromtimestamp(now, tz=timezone.utc)


def new_key(kind: str = "ed25519") -> Any:
    if kind == "p256":
        return ec.generate_private_key(ec.SECP256R1())
    return ed25519.Ed25519PrivateKey.generate()


def alg_of(key: Any) -> str:
    return "EdDSA" if isinstance(key, ed25519.Ed25519PrivateKey) else "ES256"


def make_proof(
    key: Any,
    *,
    method: str = "GET",
    url: str = f"{BASE}/resource/ping",
    now: float = NOW,
    token: str | None = None,
    header: dict[str, Any] | None = None,
    claims: dict[str, Any] | None = None,
    drop: tuple[str, ...] = (),
) -> str:
    # 正しい証明を作り、header / claims で一部だけ差し替える (drop は欄を消す)。
    head: dict[str, Any] = {
        "typ": "dpop+jwt",
        "alg": alg_of(key),
        "jwk": jwk_from_public_key(key.public_key()),
    }
    body: dict[str, Any] = {
        "jti": secrets.token_urlsafe(16),
        "htm": method,
        "htu": url,
        "iat": int(now),
    }
    if token is not None:
        body["ath"] = sha256_b64url(token)
    head.update(header or {})
    body.update(claims or {})
    for name in drop:
        head.pop(name, None)
        body.pop(name, None)
    return sign_compact(head, body, key)


def forge(header: dict[str, Any], claims: dict[str, Any], signature: bytes = b"x" * 64) -> str:
    # 署名を確かめずに組んだ、形だけのトークン (断られることを確かめるために使う)。
    def part(value: dict[str, Any]) -> str:
        return b64url_encode(json.dumps(value, separators=(",", ":")).encode("utf-8"))

    return f"{part(header)}.{part(claims)}.{b64url_encode(signature)}"
