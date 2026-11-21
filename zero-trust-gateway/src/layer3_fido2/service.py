# 第 3 層の窓口。登録と確認の流れを 1 か所で持つ。
#
# 流れ (どの段も、端末の鍵 = DPoP の鍵の指紋 jkt に結び付く):
#   登録: begin_registration → (端末が認証器に作らせる) → finish_registration
#   確認: begin_authentication → (端末が認証器に署名させる) → finish_authentication
#
# 認証器を足せるのは、(a) 5 分以内に強い認証を済ませた人 か、(b) 管理者が出した登録コードを持つ人
# (その人がまだ持っていない種類だけ)。
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

from contracts import AuthnState

from .challenges import CHALLENGE_TTL_SECONDS, ChallengeBook, ChallengeBookFull
from .enrollment import EnrollmentBook
from .sessions import AuthnSessions
from .store import KINDS, MAX_CREDENTIALS_PER_SUBJECT, Credential, CredentialStore, Kind, StoreError
from .verify import Refused, RpConfig, credential_id_of, verify_assertion, verify_registration

RP_NAME = "zero-trust-gateway"
RECENT_STRONG_SECONDS = 300
_TIMEOUT_MS = CHALLENGE_TTL_SECONDS * 1000
_PUB_KEY_PARAMS = [{"type": "public-key", "alg": -7}, {"type": "public-key", "alg": -8}]


class CounterRegression(Exception):
    # 署名は本物なのに、カウンタが進んでいない (認証器の複製の疑い)。
    def __init__(self, subject: str, credential_id: str) -> None:
        super().__init__("counter_regression")
        self.subject = subject
        self.credential_id = credential_id


@dataclass(frozen=True)
class Verified:
    subject: str
    kind: Kind
    credential_id: str
    state: AuthnState


class WebAuthnService:
    def __init__(
        self,
        rp: RpConfig,
        *,
        store: CredentialStore | None = None,
        enrollment: EnrollmentBook | None = None,
    ) -> None:
        self.rp = rp
        self.store = store if store is not None else CredentialStore()
        self.enrollment = enrollment if enrollment is not None else EnrollmentBook(None)
        self.challenges = ChallengeBook()
        self.sessions = AuthnSessions()

    # ---- 第 5 層へ答える口 ----
    def current(self, headers: Mapping[str, str], *, jkt: str, now: float) -> AuthnState | None:
        return self.sessions.state(jkt, now=now)

    # ---- 登録 ----
    def _may_register(
        self, jkt: str, enrollment_code: object, now: float, *, trust_strong: bool
    ) -> tuple[str, str]:
        state = self.sessions.state(jkt, now=now)
        if (
            trust_strong
            and state is not None
            and state.strength == "strong"
            and now - state.verified_at.timestamp() <= RECENT_STRONG_SECONDS
        ):
            return state.subject, "strong"
        subject = self.enrollment.subject_for(enrollment_code, now=now)
        if subject is None:
            raise Refused("not_allowed")
        return subject, "enrollment"

    def _check_room(self, subject: str, kind: Kind, via: str) -> None:
        owned = self.store.for_subject(subject)
        if len(owned) >= MAX_CREDENTIALS_PER_SUBJECT:
            raise Refused("too_many")
        if via == "enrollment" and any(c.kind == kind for c in owned):
            # 登録コードで足せるのは、まだ持っていない種類だけ。
            raise Refused("kind_already_registered")

    def begin_registration(
        self,
        jkt: str,
        kind: object,
        *,
        enrollment_code: object = None,
        now: float,
        trust_strong: bool = True,
    ) -> dict[str, Any]:
        # trust_strong=False: 呼び手が「この端末のセッションは重くしてある」と言うとき。登録コードだけを見る。
        if kind not in KINDS:
            raise Refused("bad_kind")
        if kind == "hardware_key" and not self.rp.hardware_ready:
            raise Refused("hardware_not_configured")
        subject, via = self._may_register(jkt, enrollment_code, now, trust_strong=trust_strong)
        self._check_room(subject, kind, via)  # type: ignore[arg-type]
        try:
            handle = self.store.user_handle(subject)
            challenge = self.challenges.issue(
                jkt, "register", now=now, data={"subject": subject, "kind": kind, "via": via}
            )
        except (ChallengeBookFull, StoreError) as err:
            raise Refused("unavailable") from err
        selection: dict[str, Any] = {
            "residentKey": "required",
            "requireResidentKey": True,
            "userVerification": "required",
        }
        if kind == "hardware_key":
            selection["authenticatorAttachment"] = "cross-platform"
        return {
            "rp": {"id": self.rp.rp_id, "name": RP_NAME},
            "user": {"id": handle, "name": subject, "displayName": subject},
            "challenge": bytes_to_base64url(challenge),
            "pubKeyCredParams": _PUB_KEY_PARAMS,
            "timeout": _TIMEOUT_MS,
            "excludeCredentials": [
                {"type": "public-key", "id": c.credential_id}
                for c in self.store.for_subject(subject, include_disabled=True)
            ],
            "authenticatorSelection": selection,
            "attestation": "direct" if kind == "hardware_key" else "none",
        }

    def finish_registration(self, jkt: str, credential: Any, *, now: float) -> Credential:
        pending = self.challenges.take(jkt, "register", now=now)
        if pending is None:
            raise Refused("no_challenge")
        subject, kind, via = pending.data["subject"], pending.data["kind"], pending.data["via"]
        registered = verify_registration(credential, challenge=pending.challenge, rp=self.rp, kind=kind)
        self._check_room(subject, kind, via)
        record = Credential(
            credential_id=bytes_to_base64url(registered.credential_id),
            subject=subject,
            kind=kind,
            public_key=bytes_to_base64url(registered.public_key),
            sign_count=registered.sign_count,
            aaguid=registered.aaguid,
            multi_device=registered.multi_device,
            added_at=int(now),
        )
        try:
            self.store.add(record)
        except StoreError as err:
            raise Refused("duplicate") from err
        return record

    # ---- 確認 ----
    def begin_authentication(self, jkt: str, *, now: float) -> dict[str, Any]:
        # 利用者の名前は聞かない (認証器が持つパスキーから選ばせる)。名前の当て推量に何も答えない。
        try:
            challenge = self.challenges.issue(jkt, "authenticate", now=now)
        except ChallengeBookFull as err:
            raise Refused("unavailable") from err
        return {
            "challenge": bytes_to_base64url(challenge),
            "rpId": self.rp.rp_id,
            "timeout": _TIMEOUT_MS,
            "userVerification": "required",
            "allowCredentials": [],
        }

    def finish_authentication(self, jkt: str, credential: Any, *, now: float) -> Verified:
        pending = self.challenges.take(jkt, "authenticate", now=now)
        if pending is None:
            raise Refused("no_challenge")
        known = self.store.get(credential_id_of(credential))
        if known is None or known.disabled:
            raise Refused("unknown_credential")
        asserted = verify_assertion(
            credential,
            challenge=pending.challenge,
            rp=self.rp,
            public_key=base64url_to_bytes(known.public_key),
            stored_sign_count=known.sign_count,
            multi_device=known.multi_device,
        )
        if asserted.regression:
            raise CounterRegression(known.subject, known.credential_id)
        self.store.set_sign_count(known.credential_id, asserted.new_sign_count)
        state = self.sessions.record(jkt, known.subject, known.kind, known.credential_id, now=now)
        return Verified(known.subject, known.kind, known.credential_id, state)

    # ---- 止める (呼ぶのは第 6 層) ----
    def disable_authenticator(self, credential_id: str) -> None:
        self.store.disable(credential_id)
        self.sessions.drop_credential(credential_id)

    def revoke_subject(self, subject: str) -> int:
        return self.sessions.revoke_subject(subject)
