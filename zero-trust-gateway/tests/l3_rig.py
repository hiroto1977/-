# 第 3 層の検査の土台。発行元 (検査用)・登録コード・窓口を、検査のたびに作る。
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from helpers import BASE, NOW
from layer3_fido2.enrollment import EnrollmentBook, new_enrollment
from layer3_fido2.service import WebAuthnService
from layer3_fido2.store import CredentialStore
from layer3_fido2.verify import RpConfig, load_attestation_roots
from webauthn_soft import HARDWARE_AAGUID, SoftAuthenticator, TestCa

RP_ID = "gw.example.test"
JKT = "jkt-of-alice-device"


class Rig:
    def __init__(self, tmp_path: Path, *, hardware_ready: bool = True, subject: str = "alice") -> None:
        self.tmp = tmp_path
        self.now = NOW
        self.ca = TestCa()
        self.roots_file = tmp_path / "roots.pem"
        self.roots_file.write_bytes(self.ca.pem)
        self.enroll_file = tmp_path / "enroll.jsonl"
        self.credentials_file = tmp_path / "credentials.json"
        self.code = self.new_code(subject)
        self.rp = RpConfig(
            rp_id=RP_ID,
            origin=BASE,
            allowed_aaguids=frozenset({str(HARDWARE_AAGUID)}) if hardware_ready else frozenset(),
            attestation_roots=load_attestation_roots(self.roots_file) if hardware_ready else (),
        )
        self.service = self.new_service()

    def new_service(self) -> WebAuthnService:
        return WebAuthnService(
            self.rp,
            store=CredentialStore(self.credentials_file),
            enrollment=EnrollmentBook(self.enroll_file),
        )

    def new_code(self, subject: str, *, ttl_minutes: int = 15) -> str:
        code, row = new_enrollment(subject, now=self.now, ttl_minutes=ttl_minutes)
        with self.enroll_file.open("a", encoding="utf-8") as out:
            out.write(json.dumps(row) + "\n")
        return code

    def hardware(self, **over: Any) -> SoftAuthenticator:
        args: dict[str, Any] = {"aaguid": HARDWARE_AAGUID, "multi_device": False, "ca": self.ca, "counter": True}
        args.update(over)
        return SoftAuthenticator(**args)

    def phone(self, **over: Any) -> SoftAuthenticator:
        return SoftAuthenticator(**over)

    def register(self, device: SoftAuthenticator, kind: str, *, jkt: str = JKT, code: Any = "default", **over: Any):
        options = self.service.begin_registration(
            jkt, kind, enrollment_code=self.code if code == "default" else code, now=self.now
        )
        return self.service.finish_registration(
            jkt, device.register(options, origin=BASE, **over), now=self.now
        )

    def verify(self, device: SoftAuthenticator, *, jkt: str = JKT, **over: Any):
        options = self.service.begin_authentication(jkt, now=self.now)
        return self.service.finish_authentication(
            jkt, device.assertion(options, origin=BASE, **over), now=self.now
        )

    def enrolled(self) -> tuple[SoftAuthenticator, SoftAuthenticator]:
        # 物理キーとスマホを 1 つずつ登録した状態。
        key, phone = self.hardware(), self.phone()
        self.register(key, "hardware_key")
        self.register(phone, "phone_passkey")
        return key, phone
