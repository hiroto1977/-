# 点数に応じたセッションの扱い。
#
#   allow   … 何もしない
#   step_up … 追加の確認 (第 3 層をもう一度) を済ませるまで、トークンを出さない
#   freeze  … 管理者が承認するまで、何も通さない
#
# いったん重くした扱いは、点数が下がっても自動では軽くしない (軽くするのは確認か承認)。
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from contracts import RiskDecision

SessionState = Literal["active", "step_up_required", "frozen", "revoked"]
_RANK: dict[str, int] = {"active": 0, "step_up_required": 1, "frozen": 2, "revoked": 3}


@dataclass
class _Session:
    subject: str
    state: SessionState = "active"
    reason: str = ""


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, _Session] = {}

    def touch(self, session_id: str, subject: str) -> None:
        # 取り消したセッションは、同じ番号で作り直させない。
        self._sessions.setdefault(session_id, _Session(subject=subject))

    def state(self, session_id: str) -> SessionState:
        session = self._sessions.get(session_id)
        return "active" if session is None else session.state

    def _raise_to(self, session_id: str, state: SessionState, reason: str) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            session = self._sessions[session_id] = _Session(subject="unknown")
        if _RANK[state] > _RANK[session.state]:
            session.state, session.reason = state, reason

    def require_step_up(self, session_id: str, reason: str) -> None:
        self._raise_to(session_id, "step_up_required", reason)

    def freeze(self, session_id: str, reason: str) -> None:
        self._raise_to(session_id, "frozen", reason)

    def revoke_subject(self, subject: str) -> int:
        count = 0
        for session in self._sessions.values():
            if session.subject == subject and session.state != "revoked":
                session.state, session.reason = "revoked", "revoked"
                count += 1
        return count

    def complete_step_up(self, session_id: str) -> bool:
        # 追加の確認が済んだ。凍結と取り消しは、これでは解けない。
        session = self._sessions.get(session_id)
        if session is None or session.state != "step_up_required":
            return False
        session.state, session.reason = "active", ""
        return True

    def approve(self, session_id: str) -> bool:
        # 管理者の承認。取り消しは解けない。
        session = self._sessions.get(session_id)
        if session is None or session.state != "frozen":
            return False
        session.state, session.reason = "active", ""
        return True

    def apply(self, decision: RiskDecision) -> SessionState:
        # 決まった数の結果だけで動く。説明の文 (explain.py) はここへ来ない。
        if decision.action == "freeze":
            self.freeze(decision.session_id, "risk")
        elif decision.action == "step_up":
            self.require_step_up(decision.session_id, "risk")
        return self.state(decision.session_id)
