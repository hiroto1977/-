# WebAuthn の応答の検め。署名や形の検めはライブラリ (webauthn) に任せ、ここは「この入口の決まり」を足す。
#
# 足している決まり:
#   - 利用者確認 (PIN / 生体 = UV) は必ず要る。
#   - 鍵の種類は ES256 と EdDSA だけ。
#   - 別のサイトの枠の中 (crossOrigin) からの応答は受けない。
#   - 物理キー: packed の証明書つき・設定した発行元の証明書へつながる・機種 (AAGUID) が一覧に在る・
#     端末に閉じた鍵 (複製できない) であること。発行元か一覧が空なら、物理キーは 1 本も登録させない。
#   - スマホのパスキー: 同期されるパスキー (multi-device) であること。物理キーの機種は受けない
#     (同じ物理キーを 2 つの種類として登録して「二重確認」に見せるのを防ぐ)。
#   - 署名カウンタは、署名を確かめた後に自分で比べる (署名の無いごみで認証器を止めさせない)。
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives.serialization import Encoding
from webauthn import verify_authentication_response, verify_registration_response
from webauthn.helpers import base64url_to_bytes, parse_attestation_object
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from webauthn.helpers.structs import AttestationFormat, CredentialDeviceType

from .store import Kind

ALLOWED_ALGS = [COSEAlgorithmIdentifier.ECDSA_SHA_256, COSEAlgorithmIdentifier.EDDSA]
_AAGUID_EXTENSION = x509.ObjectIdentifier("1.3.6.1.4.1.45724.1.1.4")
_MAX_FIELD_CHARS = 16 * 1024
_MAX_ROOTS_BYTES = 1024 * 1024


class Refused(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class RpConfig:
    rp_id: str
    origin: str
    allowed_aaguids: frozenset[str] = frozenset()
    attestation_roots: tuple[bytes, ...] = ()  # PEM (公開の証明書)

    @property
    def hardware_ready(self) -> bool:
        return bool(self.allowed_aaguids) and bool(self.attestation_roots)


def load_attestation_roots(path: Path | None) -> tuple[bytes, ...]:
    # 物理キーの発行元の証明書 (公開の PEM)。読めないファイルでは起動しない (空と混ぜない)。
    if path is None:
        return ()
    try:
        if path.stat().st_size > _MAX_ROOTS_BYTES:
            raise ValueError("too large")
        certs = x509.load_pem_x509_certificates(path.read_bytes())
    except (OSError, ValueError) as err:
        raise ValueError("ATTESTATION_ROOTS_FILE が読めない") from err
    return tuple(cert.public_bytes(Encoding.PEM) for cert in certs)


@dataclass(frozen=True)
class Registered:
    credential_id: bytes
    public_key: bytes
    sign_count: int
    aaguid: str
    multi_device: bool


@dataclass(frozen=True)
class Asserted:
    new_sign_count: int
    regression: bool


def credential_id_of(credential: Any) -> str:
    # 応答が名乗る認証器の ID (base64url)。読めなければ断る。
    if not isinstance(credential, dict):
        raise Refused("malformed")
    value = credential.get("id")
    if not isinstance(value, str) or not 0 < len(value) <= 2048:
        raise Refused("malformed")
    return value


def _precheck(credential: Any) -> None:
    credential_id_of(credential)
    response = credential.get("response")
    if not isinstance(response, dict):
        raise Refused("malformed")
    for value in response.values():
        if isinstance(value, str) and len(value) > _MAX_FIELD_CHARS:
            raise Refused("too_large")
    try:
        client_data = json.loads(base64url_to_bytes(response["clientDataJSON"]))
    except Exception as err:  # 敵が書ける入力なので、読めない理由は問わず断る
        raise Refused("malformed") from err
    if not isinstance(client_data, dict) or client_data.get("crossOrigin") not in (None, False):
        raise Refused("cross_origin")


def _check_attestation_cert(leaf_der: bytes, aaguid: str) -> None:
    try:
        cert = x509.load_der_x509_certificate(leaf_der)
        constraints = cert.extensions.get_extension_for_class(x509.BasicConstraints).value
        if constraints.ca:
            raise Refused("attestation_cert")
        try:
            extension = cert.extensions.get_extension_for_oid(_AAGUID_EXTENSION).value
        except x509.ExtensionNotFound:
            return
        # 中身は OCTET STRING (04 10 + 16 バイト)。
        if getattr(extension, "value", None) != b"\x04\x10" + uuid.UUID(aaguid).bytes:
            raise Refused("aaguid_mismatch")
    except Refused:
        raise
    except Exception as err:
        raise Refused("attestation_cert") from err


def verify_registration(credential: Any, *, challenge: bytes, rp: RpConfig, kind: Kind) -> Registered:
    _precheck(credential)
    if kind == "hardware_key" and not rp.hardware_ready:
        raise Refused("hardware_not_configured")
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp.rp_id,
            expected_origin=rp.origin,
            require_user_verification=True,
            supported_pub_key_algs=ALLOWED_ALGS,
            pem_root_certs_bytes_by_fmt={AttestationFormat.PACKED: list(rp.attestation_roots)},
        )
        x5c = parse_attestation_object(verified.attestation_object).att_stmt.x5c
    except Exception as err:
        raise Refused("invalid") from err
    multi = verified.credential_device_type == CredentialDeviceType.MULTI_DEVICE
    if kind == "hardware_key":
        if verified.fmt != AttestationFormat.PACKED or not x5c:
            # 証明書の無い証明 (none / self) では、機種を名乗っているだけで確かめようが無い。
            raise Refused("attestation_required")
        if multi:
            raise Refused("not_device_bound")
        if verified.aaguid not in rp.allowed_aaguids:
            raise Refused("aaguid_not_allowed")
        _check_attestation_cert(x5c[0], verified.aaguid)
    else:
        if not multi:
            raise Refused("not_synced_passkey")
        if verified.aaguid in rp.allowed_aaguids:
            raise Refused("hardware_as_phone")
    return Registered(
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        aaguid=verified.aaguid,
        multi_device=multi,
    )


def verify_assertion(
    credential: Any,
    *,
    challenge: bytes,
    rp: RpConfig,
    public_key: bytes,
    stored_sign_count: int,
    multi_device: bool,
) -> Asserted:
    _precheck(credential)
    try:
        # カウンタは 0 を渡して、ライブラリには比べさせない (下で、署名を確かめた後に比べる)。
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=rp.rp_id,
            expected_origin=rp.origin,
            credential_public_key=public_key,
            credential_current_sign_count=0,
            require_user_verification=True,
        )
    except Exception as err:
        raise Refused("invalid") from err
    if (verified.credential_device_type == CredentialDeviceType.MULTI_DEVICE) != multi_device:
        raise Refused("device_type_changed")
    new = verified.new_sign_count
    regression = (stored_sign_count > 0 or new > 0) and new <= stored_sign_count
    return Asserted(new_sign_count=new, regression=regression)
