# 層の間でやり取りする型 (ARCHITECTURE_V2.md §4)。
#
# 各層は他の層の中身を直接読まない (規則 2)。渡すのはここの型と、下の Protocol だけ。
from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class _Frozen(BaseModel):
    # 欄の取り違えを黙って通さない (知らない欄は断る・作った後は書き換えない)。
    model_config = ConfigDict(frozen=True, extra="forbid")


class AuthnState(_Frozen):
    # 第 3 層 → 第 5 層。
    subject: str = Field(min_length=1, max_length=128)
    strength: Literal["none", "single", "strong"]
    verified_at: datetime


class AttestationResult(_Frozen):
    # 第 2 層 → 第 5 層。
    mode: Literal["off", "report", "enforce"]
    passed: bool
    device_id: str | None = None
    # 通らなかった規則の名前 (自由文ではない)。
    reasons: tuple[str, ...] = ()


class RiskDecision(_Frozen):
    # 第 4 層 → 第 5 層・第 6 層。reasons は規則の名前 (自由文ではない)。
    session_id: str
    score: float = Field(ge=0.0, le=1.0)
    action: Literal["allow", "step_up", "freeze"]
    reasons: tuple[str, ...] = ()


EventKind = Literal[
    "canary_touched",
    "risk_freeze",
    "counter_regression",
    "attestation_failed",
    "device_compromised",
    "device_cleared",
    "audit_chain_broken",
    "knock_rejected",
]


class SecurityEvent(_Frozen):
    # 全層 → 第 6 層。detail に秘密を入れない (規則 8)。
    kind: EventKind
    at: datetime
    source_ip: str | None = None
    subject: str | None = None
    session_id: str | None = None
    detail: dict[str, str] = Field(default_factory=dict)


class AuditRecord(_Frozen):
    # 第 6 層の記録 1 行。
    seq: int = Field(ge=1)
    at: datetime
    actor: str
    action: str
    target: str
    result: Literal["ok", "denied", "error"]
    prev_hash: str
    hash: str


class SessionControl(Protocol):
    # 第 6 層が第 4 層のセッションを止めるための口 (中身は見ない)。
    def freeze(self, session_id: str, reason: str) -> None: ...

    def revoke_subject(self, subject: str) -> int: ...


class Notifier(Protocol):
    # 人への知らせ。秘密を渡さない。
    def notify(self, title: str, body: str) -> None: ...
