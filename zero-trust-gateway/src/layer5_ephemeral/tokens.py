# 5 分のトークンの発行と検証。
#
# 出す条件: 強い認証済み (第 3 層)・ふるまいの点数が低い (第 4 層)・端末の証明が通っている (第 2 層・
# enforce のとき)・発行が止められていない (第 6 層)。1 つでも欠ければ出さない。
from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any

from contracts import AttestationResult, AuthnState, RiskDecision

from .dpop import DpopError, verify_dpop_proof
from .jose import JoseError, sign_compact, split_compact, verify_signature
from .keys import SigningKeyRing
from .replay import ReplayCache

# 寿命の天井。設定でこれより長くはできない。
MAX_TOKEN_TTL_SECONDS = 300
# 強い認証済みの状態が効く長さ。
MAX_STRONG_AUTH_AGE_SECONDS = 12 * 3600
TOKEN_TYP = "at+jwt"
_CLOCK_SKEW_SECONDS = 5


class IssuanceRefused(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AuthError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class AccessClaims:
    subject: str
    session_id: str
    jkt: str
    jti: str
    issued_at: int
    expires_at: int


def check_issuance(
    authn: AuthnState | None,
    risk: RiskDecision,
    attestation: AttestationResult,
    *,
    now: float,
    halted: bool,
) -> None:
    if halted:
        raise IssuanceRefused("issuance_halted")
    if authn is None or authn.strength != "strong":
        raise IssuanceRefused("weak_authn")
    age = now - authn.verified_at.timestamp()
    if age < -_CLOCK_SKEW_SECONDS or age > MAX_STRONG_AUTH_AGE_SECONDS:
        raise IssuanceRefused("stale_authn")
    if risk.action != "allow":
        raise IssuanceRefused("risk")
    if attestation.mode == "enforce" and not attestation.passed:
        raise IssuanceRefused("attestation")


def mint_access_token(
    ring: SigningKeyRing,
    *,
    issuer: str,
    subject: str,
    session_id: str,
    jkt: str,
    now: float,
    ttl_seconds: int = MAX_TOKEN_TTL_SECONDS,
) -> str:
    if not 1 <= ttl_seconds <= MAX_TOKEN_TTL_SECONDS:
        raise ValueError(f"ttl_seconds は 1〜{MAX_TOKEN_TTL_SECONDS}")
    key = ring.current(now)
    issued = int(now)
    header = {"typ": TOKEN_TYP, "alg": "EdDSA", "kid": key.kid}
    payload = {
        "iss": issuer,
        "sub": subject,
        "sid": session_id,
        "iat": issued,
        "exp": issued + ttl_seconds,
        "jti": secrets.token_urlsafe(16),
        "cnf": {"jkt": jkt},
    }
    return sign_compact(header, payload, key.private)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def verify_access_token(
    ring: SigningKeyRing, token: Any, *, issuer: str, now: float
) -> AccessClaims:
    try:
        header, claims, signing_input, signature = split_compact(token)
        if header.get("typ") != TOKEN_TYP or header.get("alg") != "EdDSA":
            raise AuthError("bad_token_header")
        public = ring.find(header.get("kid"), now)
        if public is None:
            raise AuthError("unknown_key")
        verify_signature("EdDSA", public, signing_input, signature)
    except JoseError as err:
        raise AuthError(err.code) from err

    sub, sid, jti = claims.get("sub"), claims.get("sid"), claims.get("jti")
    iat, exp, cnf = claims.get("iat"), claims.get("exp"), claims.get("cnf")
    jkt = cnf.get("jkt") if isinstance(cnf, dict) else None
    if claims.get("iss") != issuer:
        raise AuthError("bad_issuer")
    if not all(isinstance(v, str) and v != "" for v in (sub, sid, jti, jkt)):
        raise AuthError("bad_claims")
    if not _is_int(iat) or not _is_int(exp):
        raise AuthError("bad_claims")
    if exp - iat > MAX_TOKEN_TTL_SECONDS or exp <= iat:
        raise AuthError("bad_lifetime")
    if iat > now + _CLOCK_SKEW_SECONDS:
        raise AuthError("not_yet_valid")
    if now >= exp:
        raise AuthError("expired")
    return AccessClaims(
        subject=sub, session_id=sid, jkt=jkt, jti=jti, issued_at=iat, expires_at=exp
    )


def parse_dpop_authorization(authorization: Any) -> str:
    # `Authorization: DPoP <token>` だけを受ける (Bearer は受けない)。
    if not isinstance(authorization, str):
        raise AuthError("no_authorization")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "dpop" or token == "" or " " in token:
        raise AuthError("bad_scheme")
    return token


def authorize_request(
    ring: SigningKeyRing,
    replay: ReplayCache,
    *,
    authorization: Any,
    dpop: Any,
    method: str,
    url: str,
    issuer: str,
    now: float,
) -> AccessClaims:
    # 守られた道の入口。トークン・証明・両者の結び付きを全部確かめる。
    token = parse_dpop_authorization(authorization)
    claims = verify_access_token(ring, token, issuer=issuer, now=now)
    try:
        proof = verify_dpop_proof(
            dpop, method=method, url=url, now=now, replay=replay, access_token=token
        )
    except DpopError as err:
        raise AuthError(err.code) from err
    if proof.jkt != claims.jkt:
        raise AuthError("key_mismatch")
    return claims
