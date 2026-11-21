# DPoP の証明 (RFC 9449) の検証。
#
# 端末は要求のたびに、自分の秘密鍵で「どのメソッドで・どの URL へ・いつ」を署名して付ける。
# トークンはその鍵の指紋に結び付くので、トークンだけ盗んでも別の端末からは使えない。
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from .jose import (
    JoseError,
    jwk_thumbprint,
    public_key_from_jwk,
    sha256_b64url,
    split_compact,
    verify_signature,
)
from .replay import ReplayCache, ReplayCacheFull

DPOP_TYP = "dpop+jwt"
MAX_SKEW_SECONDS = 60
_MIN_JTI_CHARS = 16
_MAX_JTI_CHARS = 128
_DEFAULT_PORTS = {"https": 443, "http": 80}


class DpopError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class DpopProof:
    jkt: str
    jti: str
    iat: int


def _target(url: Any, *, allow_query: bool) -> tuple[str, str, int | None, str] | None:
    # 比べるのは scheme・ホスト・ポート・パス。証明の htu は query と fragment を持たない。
    if not isinstance(url, str):
        return None
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS or parts.hostname is None or parts.username is not None:
        return None
    if not allow_query and (parts.query != "" or parts.fragment != "" or "?" in url or "#" in url):
        return None
    if port == _DEFAULT_PORTS[scheme]:
        port = None
    return scheme, parts.hostname.lower(), port, parts.path or "/"


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def verify_dpop_proof(
    proof: Any,
    *,
    method: str,
    url: str,
    now: float,
    replay: ReplayCache,
    access_token: str | None = None,
    max_skew_seconds: int = MAX_SKEW_SECONDS,
) -> DpopProof:
    # 1 つでも外れたら DpopError。番号の控えは署名を確かめた後 (署名の無いごみで控えを埋めさせない)。
    try:
        header, claims, signing_input, signature = split_compact(proof)
        if header.get("typ") != DPOP_TYP:
            raise DpopError("bad_typ")
        jwk = header.get("jwk")
        key = public_key_from_jwk(jwk)
        verify_signature(header.get("alg"), key, signing_input, signature)
        jkt = jwk_thumbprint(jwk)
    except JoseError as err:
        raise DpopError(err.code) from err

    jti, htm, htu, iat = claims.get("jti"), claims.get("htm"), claims.get("htu"), claims.get("iat")
    if not isinstance(jti, str) or not _MIN_JTI_CHARS <= len(jti) <= _MAX_JTI_CHARS:
        raise DpopError("bad_claims")
    if not isinstance(htm, str) or htm != method.upper():
        raise DpopError("htm_mismatch")
    wanted = _target(url, allow_query=True)
    if wanted is None or _target(htu, allow_query=False) != wanted:
        raise DpopError("htu_mismatch")
    if not _is_int(iat) or abs(now - iat) > max_skew_seconds:
        raise DpopError("stale")
    if access_token is not None:
        try:
            expected = sha256_b64url(access_token)
        except UnicodeEncodeError as err:
            raise DpopError("ath_mismatch") from err
        if claims.get("ath") != expected:
            raise DpopError("ath_mismatch")
    try:
        fresh = replay.check_and_store(
            f"{jkt}:{jti}", now=now, expires_at=iat + 2 * max_skew_seconds
        )
    except ReplayCacheFull as err:
        raise DpopError("replay_cache_full") from err
    if not fresh:
        raise DpopError("replayed")
    return DpopProof(jkt=jkt, jti=jti, iat=iat)
