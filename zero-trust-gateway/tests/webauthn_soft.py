# 検査用の、ソフトで作った認証器 (本物の物理キーやスマホの代わり)。
#
# 鍵と証明書は検査のたびに作る (ファイルに書かない —— 規則 1)。
# 既定は正しい応答を作り、引数で 1 か所だけ崩す (断られることを確かめるために使う)。
from __future__ import annotations

import datetime as dt
import hashlib
import json
import secrets
import uuid
from typing import Any

import cbor2
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import NameOID

from layer5_ephemeral.jose import b64url_decode, b64url_encode

UP, UV, BE, BS, AT = 0x01, 0x04, 0x08, 0x10, 0x40
AAGUID_OID = x509.ObjectIdentifier("1.3.6.1.4.1.45724.1.1.4")
HARDWARE_AAGUID = uuid.UUID("11111111-2222-4333-8444-555555555555")
OTHER_AAGUID = uuid.UUID("99999999-8888-4777-8666-555555555555")
PHONE_AAGUID = uuid.UUID("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")


def _name(common: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test Authenticators"),
            x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Authenticator Attestation"),
            x509.NameAttribute(NameOID.COMMON_NAME, common),
        ]
    )


class TestCa:
    # 物理キーの発行元の代わり。証明書は「いま」から前後 1 日だけ有効。
    __test__ = False

    def __init__(self, common: str = "Test Root") -> None:
        self.key = ec.generate_private_key(ec.SECP256R1())
        now = dt.datetime.now(dt.timezone.utc)
        self._window = (now - dt.timedelta(days=1), now + dt.timedelta(days=1))
        self.cert = (
            x509.CertificateBuilder()
            .subject_name(_name(common))
            .issuer_name(_name(common))
            .public_key(self.key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(self._window[0])
            .not_valid_after(self._window[1])
            .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
            .sign(self.key, hashes.SHA256())
        )

    @property
    def pem(self) -> bytes:
        return self.cert.public_bytes(Encoding.PEM)

    def leaf(self, aaguid: uuid.UUID | None, *, ca: bool = False) -> tuple[Any, bytes]:
        # (認証器の証明用の鍵, その証明書)。aaguid を渡すと、証明書の拡張に機種を書く。
        key = ec.generate_private_key(ec.SECP256R1())
        builder = (
            x509.CertificateBuilder()
            .subject_name(_name("Test Authenticator"))
            .issuer_name(self.cert.subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(self._window[0])
            .not_valid_after(self._window[1])
            .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        )
        if aaguid is not None:
            builder = builder.add_extension(
                x509.UnrecognizedExtension(AAGUID_OID, b"\x04\x10" + aaguid.bytes), critical=False
            )
        return key, builder.sign(self.key, hashes.SHA256()).public_bytes(Encoding.DER)


def _client_data(kind: str, challenge: str, origin: str, cross_origin: bool) -> bytes:
    data = {"type": kind, "challenge": challenge, "origin": origin, "crossOrigin": cross_origin}
    return json.dumps(data, separators=(",", ":")).encode("utf-8")


class SoftAuthenticator:
    def __init__(
        self,
        *,
        aaguid: uuid.UUID = PHONE_AAGUID,
        multi_device: bool = True,
        ca: TestCa | None = None,
        cert_aaguid: uuid.UUID | None | str = "same",
        counter: bool = False,
    ) -> None:
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = secrets.token_bytes(32)
        self.aaguid = aaguid
        self.multi_device = multi_device
        self.ca = ca
        self.cert_aaguid = aaguid if cert_aaguid == "same" else cert_aaguid
        self.counter = counter
        self.sign_count = 0
        self.user_handle = ""

    @property
    def id(self) -> str:
        return b64url_encode(self.credential_id)

    def _flags(self, uv: bool, multi_device: bool | None = None) -> int:
        multi = self.multi_device if multi_device is None else multi_device
        return UP | (UV if uv else 0) | ((BE | BS) if multi else 0)

    def _cose_key(self) -> bytes:
        numbers = self.key.public_key().public_numbers()
        return cbor2.dumps(
            {1: 2, 3: -7, -1: 1, -2: numbers.x.to_bytes(32, "big"), -3: numbers.y.to_bytes(32, "big")}
        )

    def _next_count(self) -> int:
        if self.counter:
            self.sign_count += 1
        return self.sign_count

    def register(
        self,
        options: dict[str, Any],
        *,
        origin: str,
        uv: bool = True,
        fmt: str | None = None,
        rp_id: str | None = None,
        challenge: str | None = None,
        cross_origin: bool = False,
        leaf_is_ca: bool = False,
    ) -> dict[str, Any]:
        # fmt: None なら、発行元が在れば "packed" (証明書つき)、無ければ "none"。"self" は自分の鍵での証明。
        self.user_handle = options["user"]["id"]
        client_data = _client_data(
            "webauthn.create", challenge or options["challenge"], origin, cross_origin
        )
        rp_hash = hashlib.sha256((rp_id or options["rp"]["id"]).encode("utf-8")).digest()
        auth_data = (
            rp_hash
            + bytes([self._flags(uv) | AT])
            + self._next_count().to_bytes(4, "big")
            + self.aaguid.bytes
            + len(self.credential_id).to_bytes(2, "big")
            + self.credential_id
            + self._cose_key()
        )
        signed = auth_data + hashlib.sha256(client_data).digest()
        chosen = fmt or ("packed" if self.ca is not None else "none")
        statement: dict[str, Any]
        if chosen == "packed" and self.ca is not None:
            leaf_key, leaf_der = self.ca.leaf(self.cert_aaguid, ca=leaf_is_ca)
            statement = {"alg": -7, "sig": leaf_key.sign(signed, ec.ECDSA(hashes.SHA256())), "x5c": [leaf_der]}
        elif chosen in ("packed", "self"):
            chosen = "packed"
            statement = {"alg": -7, "sig": self.key.sign(signed, ec.ECDSA(hashes.SHA256()))}
        else:
            statement = {}
        attestation = cbor2.dumps({"fmt": chosen, "attStmt": statement, "authData": auth_data})
        return {
            "id": self.id,
            "rawId": self.id,
            "type": "public-key",
            "response": {
                "clientDataJSON": b64url_encode(client_data),
                "attestationObject": b64url_encode(attestation),
            },
            "clientExtensionResults": {},
        }

    def assertion(
        self,
        options: dict[str, Any],
        *,
        origin: str,
        uv: bool = True,
        rp_id: str | None = None,
        challenge: str | None = None,
        cross_origin: bool = False,
        sign_count: int | None = None,
        multi_device: bool | None = None,
        key: Any = None,
    ) -> dict[str, Any]:
        client_data = _client_data(
            "webauthn.get", challenge or options["challenge"], origin, cross_origin
        )
        rp_hash = hashlib.sha256((rp_id or options["rpId"]).encode("utf-8")).digest()
        count = self._next_count() if sign_count is None else sign_count
        auth_data = rp_hash + bytes([self._flags(uv, multi_device)]) + count.to_bytes(4, "big")
        signature = (key or self.key).sign(
            auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256())
        )
        return {
            "id": self.id,
            "rawId": self.id,
            "type": "public-key",
            "response": {
                "clientDataJSON": b64url_encode(client_data),
                "authenticatorData": b64url_encode(auth_data),
                "signature": b64url_encode(signature),
                "userHandle": self.user_handle,
            },
            "clientExtensionResults": {},
        }


def challenge_of(options: dict[str, Any]) -> bytes:
    return b64url_decode(options["challenge"])
