# 署名つきトークン (JWS) の最小の読み書き。
#
# 受けるのは ES256 (P-256) と EdDSA (Ed25519) だけ。共通鍵の方式と "none" は断る。
# 暗号の計算は `cryptography` に任せ、ここは形の検査と組み立てだけを持つ。
from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

# 証明やトークン 1 つの長さの天井 (これより長い物は解析もしない)。
MAX_JWS_CHARS = 8192
ALLOWED_ALGS = ("ES256", "EdDSA")

PublicKey = ec.EllipticCurvePublicKey | ed25519.Ed25519PublicKey
PrivateKey = ec.EllipticCurvePrivateKey | ed25519.Ed25519PrivateKey

_B64URL = re.compile(r"^[A-Za-z0-9_-]*$")
_P256_BYTES = 32


class JoseError(ValueError):
    # code は記録用の短い名前。利用者への応答には出さない。
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    # 詰め物 (=) と、base64url に無い字は断る。
    if not isinstance(text, str) or _B64URL.match(text) is None or len(text) % 4 == 1:
        raise JoseError("malformed")
    data = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    # 同じ中身を別の綴りで書いた物 (末尾の余りビットが 0 でない) は断る。
    if b64url_encode(data) != text:
        raise JoseError("malformed")
    return data


def _no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in pairs:
        if key in out:
            raise JoseError("malformed")
        out[key] = value
    return out


def _refuse_constant(_: str) -> Any:
    raise JoseError("malformed")


def json_object(raw: bytes) -> dict[str, Any]:
    # 同じ鍵が 2 度出る JSON と、NaN / Infinity は断る (読み手ごとに解釈が割れるため)。
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_no_duplicate_keys,
            parse_constant=_refuse_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as err:
        raise JoseError("malformed") from err
    if not isinstance(value, dict):
        raise JoseError("malformed")
    return value


def _compact_json(value: dict[str, Any]) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def public_key_from_jwk(jwk: Any) -> PublicKey:
    # 公開鍵だけを受ける。秘密の成分 (d) が入っていたら断る。
    if not isinstance(jwk, dict) or "d" in jwk:
        raise JoseError("bad_jwk")
    kty, crv = jwk.get("kty"), jwk.get("crv")
    try:
        if kty == "EC" and crv == "P-256":
            x, y = b64url_decode(jwk.get("x")), b64url_decode(jwk.get("y"))
            if len(x) != _P256_BYTES or len(y) != _P256_BYTES:
                raise JoseError("bad_jwk")
            numbers = ec.EllipticCurvePublicNumbers(
                int.from_bytes(x, "big"), int.from_bytes(y, "big"), ec.SECP256R1()
            )
            return numbers.public_key()
        if kty == "OKP" and crv == "Ed25519":
            return ed25519.Ed25519PublicKey.from_public_bytes(b64url_decode(jwk.get("x")))
    except JoseError:
        raise
    except (ValueError, TypeError) as err:
        raise JoseError("bad_jwk") from err
    raise JoseError("bad_jwk")


def jwk_from_public_key(key: PublicKey) -> dict[str, str]:
    if isinstance(key, ed25519.Ed25519PublicKey):
        return {"kty": "OKP", "crv": "Ed25519", "x": b64url_encode(key.public_bytes_raw())}
    numbers = key.public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": b64url_encode(numbers.x.to_bytes(_P256_BYTES, "big")),
        "y": b64url_encode(numbers.y.to_bytes(_P256_BYTES, "big")),
    }


def jwk_thumbprint(jwk: dict[str, Any]) -> str:
    # 鍵の指紋 (RFC 7638)。必須の欄だけを、決まった順で並べて SHA-256 を取る。
    public_key_from_jwk(jwk)
    names = ("crv", "kty", "x", "y") if jwk["kty"] == "EC" else ("crv", "kty", "x")
    canonical = json.dumps({n: jwk[n] for n in names}, separators=(",", ":"), sort_keys=True)
    return b64url_encode(hashlib.sha256(canonical.encode("utf-8")).digest())


def _alg_fits_key(alg: str, key: PublicKey | PrivateKey) -> bool:
    if alg == "EdDSA":
        return isinstance(key, (ed25519.Ed25519PublicKey, ed25519.Ed25519PrivateKey))
    if alg == "ES256":
        return isinstance(key, (ec.EllipticCurvePublicKey, ec.EllipticCurvePrivateKey))
    return False


def sign_compact(header: dict[str, Any], payload: dict[str, Any], key: PrivateKey) -> str:
    alg = header.get("alg")
    if alg not in ALLOWED_ALGS or not _alg_fits_key(alg, key):
        raise JoseError("bad_alg")
    signing_input = f"{b64url_encode(_compact_json(header))}.{b64url_encode(_compact_json(payload))}"
    data = signing_input.encode("ascii")
    if isinstance(key, ed25519.Ed25519PrivateKey):
        signature = key.sign(data)
    else:
        r, s = decode_dss_signature(key.sign(data, ec.ECDSA(hashes.SHA256())))
        signature = r.to_bytes(_P256_BYTES, "big") + s.to_bytes(_P256_BYTES, "big")
    return f"{signing_input}.{b64url_encode(signature)}"


def split_compact(token: Any) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    # 署名はまだ確かめていない。返すのは (ヘッダ, 中身, 署名の対象, 署名)。
    if not isinstance(token, str) or len(token) > MAX_JWS_CHARS:
        raise JoseError("malformed")
    parts = token.split(".")
    if len(parts) != 3 or any(part == "" for part in parts):
        raise JoseError("malformed")
    header = json_object(b64url_decode(parts[0]))
    payload = json_object(b64url_decode(parts[1]))
    signature = b64url_decode(parts[2])
    return header, payload, f"{parts[0]}.{parts[1]}".encode("ascii"), signature


def verify_signature(alg: Any, key: PublicKey, signing_input: bytes, signature: bytes) -> None:
    if alg not in ALLOWED_ALGS or not _alg_fits_key(alg, key):
        raise JoseError("bad_alg")
    try:
        if isinstance(key, ed25519.Ed25519PublicKey):
            key.verify(signature, signing_input)
            return
        if len(signature) != 2 * _P256_BYTES:
            raise JoseError("bad_signature")
        der = encode_dss_signature(
            int.from_bytes(signature[:_P256_BYTES], "big"),
            int.from_bytes(signature[_P256_BYTES:], "big"),
        )
        key.verify(der, signing_input, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature as err:
        raise JoseError("bad_signature") from err


def sha256_b64url(text: str) -> str:
    return b64url_encode(hashlib.sha256(text.encode("ascii", errors="strict")).digest())
