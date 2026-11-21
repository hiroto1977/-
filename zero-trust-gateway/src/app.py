# 入口の組み立て (FastAPI)。層の部品をつなぐだけで、判定は各層が持つ。
#
# いま在る道:
#   POST /token                  … DPoP の証明と引き換えに、5 分のトークンを出す
#   GET  /.well-known/jwks.json  … トークンを検める公開鍵
#   GET  /resource/ping          … 守られた道の見本
#   GET  /audit/verify           … 記録の鎖の検算 (守られた道)
#   POST /auth/webauthn/register/options ・ /register/verify         … 認証器の登録
#   POST /auth/webauthn/authenticate/options ・ /authenticate/verify … 確認
#   GET  /auth/session           … いまの認証の強さ
#
# 認証の強さを答える口 (AuthnProvider) の既定は第 3 層 (WebAuthn)。認証器が 1 つも登録されていない間は
# 「誰も認証済みでない」と答えるので、既定のままではトークンは 1 枚も出ない (迷ったら断る)。
# 第 3 層の道はどれも DPoP の証明が要り、認証の状態はその鍵に結び付く (クッキーや合言葉を配らない)。
from __future__ import annotations

import hashlib
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from typing import Protocol

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from contracts import AttestationResult, AuthnState, Notifier, RiskDecision, SecurityEvent
from layer1_mtd.runner import CommandRunner
from layer3_fido2.enrollment import EnrollmentBook
from layer3_fido2.service import CounterRegression, WebAuthnService
from layer3_fido2.store import CredentialStore
from layer3_fido2.verify import Refused, RpConfig, load_attestation_roots
from layer4_ai_evolution.actions import SessionStore
from layer4_ai_evolution.baseline import build_baseline
from layer4_ai_evolution.events import RequestEvent
from layer4_ai_evolution.scoring import Thresholds, decide
from layer5_ephemeral.dpop import DpopError, verify_dpop_proof
from layer5_ephemeral.jose import JoseError, json_object
from layer5_ephemeral.keys import SigningKeyRing
from layer5_ephemeral.replay import ReplayCache
from layer5_ephemeral.tokens import (
    AccessClaims,
    AuthError,
    IssuanceRefused,
    authorize_request,
    check_issuance,
    mint_access_token,
    parse_dpop_authorization,
    verify_access_token,
)
from layer6_soar.audit_log import AuditLog, fingerprint, verify_file
from layer6_soar.blocklist import BlockPlanner
from layer6_soar.canary import CanarySet
from layer6_soar.issuance_switch import IssuanceSwitch
from layer6_soar.playbooks import LogNotifier, SoarDeps, handle_event
from settings import Settings

_WINDOW_SECONDS = 60
_MAX_EVENTS_PER_SUBJECT = 5000
_UNAUTHORIZED = {"error": "unauthorized"}
_FORBIDDEN = {"error": "forbidden"}
_BAD_REQUEST = {"error": "invalid_request"}
MAX_BODY_BYTES = 64 * 1024
_AUTH_PATHS = {
    "register_options": "/auth/webauthn/register/options",
    "register_verify": "/auth/webauthn/register/verify",
    "authenticate_options": "/auth/webauthn/authenticate/options",
    "authenticate_verify": "/auth/webauthn/authenticate/verify",
}


class AuthnProvider(Protocol):
    # 第 3 層が答える口。「この端末の鍵 (jkt) は、誰として・どの強さで認証済みか」を返す。
    def current(self, headers: Mapping[str, str], *, jkt: str, now: float) -> AuthnState | None: ...


class _Sessions:
    # 第 6 層へ渡す「止める口」。トークンのセッション (第 4 層) と、認証の状態 (第 3 層) の両方を止める。
    def __init__(self, store: SessionStore, webauthn: WebAuthnService) -> None:
        self._store = store
        self._webauthn = webauthn

    def freeze(self, session_id: str, reason: str) -> None:
        self._store.freeze(session_id, reason)

    def revoke_subject(self, subject: str) -> int:
        self._webauthn.revoke_subject(subject)
        return self._store.revoke_subject(subject)


def session_id_for(subject: str, jkt: str) -> str:
    return hashlib.sha256(f"{subject}:{jkt}".encode("utf-8")).hexdigest()[:32]


class Gateway:
    def __init__(
        self,
        settings: Settings,
        *,
        authn: AuthnProvider | None = None,
        clock: Callable[[], float] = time.time,
        runner: CommandRunner | None = None,
        notifier: Notifier | None = None,
    ) -> None:
        self.settings = settings
        self.clock = clock
        # 入口は 1 度に 1 つずつ通す (使い捨ての番号の「見た・控えた」の間に、別の要求を割り込ませない)。
        self.lock = threading.RLock()
        self.webauthn = WebAuthnService(
            RpConfig(
                rp_id=settings.rp_id,
                origin=settings.webauthn_origin,
                allowed_aaguids=frozenset(settings.allowed_aaguids),
                attestation_roots=load_attestation_roots(settings.attestation_roots_file),
            ),
            store=CredentialStore(settings.credentials_file),
            enrollment=EnrollmentBook(settings.enrollment_file),
        )
        self.authn: AuthnProvider = authn if authn is not None else self.webauthn
        now = clock()
        self.ring = SigningKeyRing(
            now=now,
            rotate_seconds=settings.signing_key_rotate_hours * 3600,
            grace_seconds=settings.token_ttl_seconds,
        )
        self.replay = ReplayCache()
        self.sessions = SessionStore()
        self.thresholds = Thresholds(settings.risk_step_up, settings.risk_freeze)
        self.audit = AuditLog(settings.audit_log_path)
        self.canaries = CanarySet.from_file(settings.canary_hashes_file)
        self.issuance = IssuanceSwitch(settings.issuance_halt_file)
        self.notifier: Notifier = notifier if notifier is not None else LogNotifier()
        self.soar = SoarDeps(
            audit=self.audit,
            planner=BlockPlanner(
                admin_allowlist=settings.admin_allowlist,
                rate_limit_per_minute=settings.block_rate_limit_per_min,
                timeout_hours=settings.block_timeout_hours,
            ),
            runner=runner if runner is not None else CommandRunner(execute=settings.firewall_execute),
            sessions=_Sessions(self.sessions, self.webauthn),
            notifier=self.notifier,
            issuance=self.issuance,
            disable_authenticator=self.webauthn.disable_authenticator,
        )
        self._events: dict[str, deque[RequestEvent]] = {}

    # ---- 小さな道具 ----
    def at(self, now: float) -> datetime:
        return datetime.fromtimestamp(now, tz=timezone.utc)

    def url(self, path: str) -> str:
        return f"{self.settings.issuer}{path}"

    def record(self, now: float, *, actor: str, action: str, target: str, result: str) -> None:
        self.audit.append(
            actor=actor, action=action, target=target, result=result, at=self.at(now)  # type: ignore[arg-type]
        )

    def attestation(self) -> AttestationResult:
        # 第 2 層がまだ無い。off 以外では「通っていない」と答える (enforce なら発行しない)。
        mode = self.settings.attestation_mode
        return AttestationResult(mode=mode, passed=mode == "off")

    # ---- おとりの鍵 ----
    def canary_touched(self, headers: Mapping[str, str], ip: str | None, now: float) -> bool:
        presented = [headers.get("x-api-key")]
        authorization = headers.get("authorization")
        if isinstance(authorization, str):
            presented.append(authorization.partition(" ")[2] or authorization)
        if not any(self.canaries.is_canary(p) for p in presented):
            return False
        handle_event(
            SecurityEvent(kind="canary_touched", at=self.at(now), source_ip=ip), self.soar
        )
        return True

    # ---- ふるまい ----
    def observe(self, event: RequestEvent, now: float) -> RiskDecision:
        events = self._events.setdefault(event.subject, deque(maxlen=_MAX_EVENTS_PER_SUBJECT))
        events.append(event)
        return self.risk_for(event.subject, event.session_id, now)

    def risk_for(self, subject: str, session_id: str, now: float) -> RiskDecision:
        events = list(self._events.get(subject, ()))
        window = [e for e in events if now - e.at.timestamp() < _WINDOW_SECONDS]
        history = [e for e in events if now - e.at.timestamp() >= _WINDOW_SECONDS]
        decision = decide(session_id, window, build_baseline(history), self.thresholds)
        before = self.sessions.state(session_id)
        after = self.sessions.apply(decision)
        if after == "frozen" and before != "frozen":
            handle_event(
                SecurityEvent(
                    kind="risk_freeze", at=self.at(now), subject=subject, session_id=session_id
                ),
                self.soar,
            )
        return decision

    def effective_risk(self, decision: RiskDecision) -> RiskDecision:
        # いったん重くした扱いは、点数が下がっても残る。
        state = self.sessions.state(decision.session_id)
        if state == "active":
            return decision
        action = "step_up" if state == "step_up_required" else "freeze"
        return decision.model_copy(update={"action": action})

    # ---- 重くした扱いを解く (呼ぶのは第 3 層の確認と、管理者の承認) ----
    def _forget_recent(self, subject: str) -> None:
        # 解いた直後に、同じ出来事でまた重くならないように、その人の直近 1 分の出来事だけを捨てる
        # (普段の履歴は残す)。
        events = self._events.get(subject)
        if events is None:
            return
        now = self.clock()
        kept = [e for e in events if now - e.at.timestamp() >= _WINDOW_SECONDS]
        self._events[subject] = deque(kept, maxlen=_MAX_EVENTS_PER_SUBJECT)

    def complete_step_up(self, subject: str, session_id: str) -> bool:
        done = self.sessions.complete_step_up(session_id)
        if done:
            self._forget_recent(subject)
        return done

    def approve(self, subject: str, session_id: str) -> bool:
        done = self.sessions.approve(session_id)
        if done:
            self._forget_recent(subject)
        return done

    # ---- 守られた道の入口 ----
    def authorize(self, request: Request, path: str, now: float) -> AccessClaims | None:
        with self.lock:
            return self._authorize(request, path, now)

    def _authorize(self, request: Request, path: str, now: float) -> AccessClaims | None:
        headers = request.headers
        ip = request.client.host if request.client is not None else None
        if self.canary_touched(headers, ip, now):
            return None
        authorization = headers.get("authorization")
        try:
            claims = authorize_request(
                self.ring,
                self.replay,
                authorization=authorization,
                dpop=headers.get("dpop"),
                method=request.method,
                url=self.url(path),
                issuer=self.settings.issuer,
                now=now,
            )
        except AuthError as err:
            self._failed(authorization, path, ip, err.code, now)
            return None
        self.sessions.touch(claims.session_id, claims.subject)
        token = parse_dpop_authorization(authorization)
        state = self.sessions.state(claims.session_id)
        event = RequestEvent(
            at=self.at(now),
            subject=claims.subject,
            session_id=claims.session_id,
            path=path,
            ok=state == "active",
            ip=ip,
            token_fp=fingerprint(token),
        )
        self.observe(event, now)
        if self.sessions.state(claims.session_id) != "active":
            self.record(now, actor=claims.subject, action="request", target=path, result="denied")
            return None
        self.record(now, actor=claims.subject, action="request", target=path, result="ok")
        return claims

    def _failed(
        self, authorization: object, path: str, ip: str | None, code: str, now: float
    ) -> None:
        # トークン自体が本物なら、失敗をその人のふるまいとして数える (盗まれたトークンの試し打ち)。
        actor = "anonymous"
        token_fp: str | None = None
        try:
            token = parse_dpop_authorization(authorization)
            claims = verify_access_token(self.ring, token, issuer=self.settings.issuer, now=now)
            token_fp = fingerprint(token)
        except AuthError:
            claims = None
        if claims is not None:
            actor = claims.subject
            self.sessions.touch(claims.session_id, claims.subject)
            self.observe(
                RequestEvent(
                    at=self.at(now),
                    subject=claims.subject,
                    session_id=claims.session_id,
                    path=path,
                    ok=False,
                    ip=ip,
                    token_fp=token_fp,
                ),
                now,
            )
        self.record(now, actor=actor, action=f"request.{code}", target=path, result="denied")

    # ---- トークンの発行 ----
    def issue(self, request: Request, now: float) -> tuple[int, dict[str, object]]:
        with self.lock:
            return self._issue(request, now)

    def _issue(self, request: Request, now: float) -> tuple[int, dict[str, object]]:
        headers = request.headers
        ip = request.client.host if request.client is not None else None
        if self.canary_touched(headers, ip, now):
            return 401, _UNAUTHORIZED
        try:
            proof = verify_dpop_proof(
                headers.get("dpop"),
                method="POST",
                url=self.url("/token"),
                now=now,
                replay=self.replay,
            )
        except DpopError as err:
            self.record(now, actor="anonymous", action=f"token.{err.code}", target="/token", result="denied")
            return 401, _UNAUTHORIZED
        authn = self.authn.current(headers, jkt=proof.jkt, now=now)
        subject = authn.subject if authn is not None else "anonymous"
        session_id = session_id_for(subject, proof.jkt)
        if authn is not None:
            self.sessions.touch(session_id, subject)
            risk = self.effective_risk(self.risk_for(subject, session_id, now))
        else:
            # 認証済みでない相手には点数を付けない (下の check_issuance が必ず断る)。
            risk = RiskDecision(session_id=session_id, score=0.0, action="allow")
        try:
            check_issuance(
                authn, risk, self.attestation(), now=now, halted=self.issuance.halted()
            )
        except IssuanceRefused as err:
            self.record(now, actor=subject, action=f"token.{err.code}", target="/token", result="denied")
            status = 503 if err.code == "issuance_halted" else 403 if err.code == "risk" else 401
            body = {"error": "unavailable"} if status == 503 else {"error": "forbidden"} if status == 403 else _UNAUTHORIZED
            return status, body
        token = mint_access_token(
            self.ring,
            issuer=self.settings.issuer,
            subject=subject,
            session_id=session_id,
            jkt=proof.jkt,
            now=now,
            ttl_seconds=self.settings.token_ttl_seconds,
        )
        self.record(now, actor=subject, action="token.issue", target=session_id, result="ok")
        return 200, {
            "access_token": token,
            "token_type": "DPoP",
            "expires_in": self.settings.token_ttl_seconds,
        }


    # ---- 第 3 層の道 ----
    def _auth_proof(self, request: Request, method: str, path: str, now: float) -> str | None:
        # DPoP の証明を検めて、端末の鍵の指紋を返す。通らなければ None (記録は残す)。
        headers = request.headers
        ip = request.client.host if request.client is not None else None
        if self.canary_touched(headers, ip, now):
            return None
        try:
            proof = verify_dpop_proof(
                headers.get("dpop"), method=method, url=self.url(path), now=now, replay=self.replay
            )
        except DpopError as err:
            self.record(now, actor="anonymous", action=f"authn.{err.code}", target=path, result="denied")
            return None
        return proof.jkt

    def webauthn_call(self, name: str, request: Request, raw: bytes, now: float) -> tuple[int, dict[str, object]]:
        with self.lock:
            return self._webauthn_call(name, request, raw, now)

    def _webauthn_call(
        self, name: str, request: Request, raw: bytes, now: float
    ) -> tuple[int, dict[str, object]]:
        path = _AUTH_PATHS[name]
        jkt = self._auth_proof(request, "POST", path, now)
        if jkt is None:
            return 401, _UNAUTHORIZED
        try:
            body = json_object(raw if raw.strip() != b"" else b"{}")
        except JoseError:
            self.record(now, actor="anonymous", action="authn.malformed", target=path, result="denied")
            return 400, _BAD_REQUEST
        known = self.webauthn.current(request.headers, jkt=jkt, now=now)
        actor = known.subject if known is not None else "anonymous"
        ip = request.client.host if request.client is not None else None
        try:
            if name.startswith("register") and self.issuance.halted():
                # 発行を止めている間は、認証器も足させない。
                raise Refused("issuance_halted")
            if name == "register_options":
                # 追加の確認待ち・凍結・取り消しのセッションでは、強い認証だけを根拠に足させない。
                calm = known is None or self.sessions.state(session_id_for(known.subject, jkt)) == "active"
                options = self.webauthn.begin_registration(
                    jkt,
                    body.get("kind"),
                    enrollment_code=body.get("enrollment_code"),
                    now=now,
                    trust_strong=calm,
                )
                subject = options["user"]["name"]
                self.record(now, actor=subject, action="authn.register.options", target=path, result="ok")
                return 200, options
            if name == "register_verify":
                added = self.webauthn.finish_registration(jkt, body.get("credential"), now=now)
                self.record(
                    now,
                    actor=added.subject,
                    action=f"authn.register.{added.kind}",
                    target=fingerprint(added.credential_id),
                    result="ok",
                )
                self.notifier.notify("認証器を登録しました", f"利用者: {added.subject} / 種類: {added.kind}")
                return 200, {"registered": added.kind}
            if name == "authenticate_options":
                return 200, self.webauthn.begin_authentication(jkt, now=now)
            verified = self.webauthn.finish_authentication(jkt, body.get("credential"), now=now)
        except Refused as err:
            self.record(now, actor=actor, action=f"authn.{name}.{err.code}", target=path, result="denied")
            if name.startswith("register"):
                return 403, _FORBIDDEN
            return 401, _UNAUTHORIZED
        except CounterRegression as err:
            handle_event(
                SecurityEvent(
                    kind="counter_regression",
                    at=self.at(now),
                    source_ip=ip,
                    subject=err.subject,
                    detail={"credential_id": err.credential_id},
                ),
                self.soar,
            )
            return 401, _UNAUTHORIZED
        strength = verified.state.strength
        self.record(
            now,
            actor=verified.subject,
            action=f"authn.verify.{verified.kind}",
            target=fingerprint(verified.credential_id),
            result="ok",
        )
        if strength == "strong":
            # 2 つがそろった。追加の確認を待っていたセッションは、これで解ける (凍結は解けない)。
            self.complete_step_up(verified.subject, session_id_for(verified.subject, jkt))
        return 200, {"strength": strength}

    def auth_session(self, request: Request, now: float) -> tuple[int, dict[str, object]]:
        with self.lock:
            jkt = self._auth_proof(request, "GET", "/auth/session", now)
            if jkt is None:
                return 401, _UNAUTHORIZED
            state = self.authn.current(request.headers, jkt=jkt, now=now)
            return 200, {"strength": state.strength if state is not None else "none"}


async def _read_body(request: Request) -> bytes | None:
    # 本文は 64 KiB まで。超えたら読むのをやめる (大きな本文でメモリを使わせない)。
    declared = request.headers.get("content-length")
    if declared is not None and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
        return None
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def create_app(
    settings: Settings,
    *,
    authn: AuthnProvider | None = None,
    clock: Callable[[], float] = time.time,
    runner: CommandRunner | None = None,
    notifier: Notifier | None = None,
) -> FastAPI:
    gateway = Gateway(settings, authn=authn, clock=clock, runner=runner, notifier=notifier)
    app = FastAPI(title="zero-trust-gateway", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.gateway = gateway
    denied = {"WWW-Authenticate": "DPoP", "Cache-Control": "no-store"}

    @app.post("/token")
    def token(request: Request) -> JSONResponse:
        status, body = gateway.issue(request, gateway.clock())
        headers = {"Cache-Control": "no-store"} if status == 200 else denied
        return JSONResponse(body, status_code=status, headers=headers)

    @app.get("/.well-known/jwks.json")
    def jwks() -> JSONResponse:
        return JSONResponse(gateway.ring.jwks(gateway.clock()))

    @app.get("/resource/ping")
    def ping(request: Request) -> JSONResponse:
        claims = gateway.authorize(request, "/resource/ping", gateway.clock())
        if claims is None:
            return JSONResponse(_UNAUTHORIZED, status_code=401, headers=denied)
        return JSONResponse({"ok": True, "subject": claims.subject})

    @app.get("/audit/verify")
    def audit_verify(request: Request) -> JSONResponse:
        now = gateway.clock()
        claims = gateway.authorize(request, "/audit/verify", now)
        if claims is None:
            return JSONResponse(_UNAUTHORIZED, status_code=401, headers=denied)
        result = verify_file(settings.audit_log_path)
        if not result.ok:
            with gateway.lock:
                handle_event(SecurityEvent(kind="audit_chain_broken", at=gateway.at(now)), gateway.soar)
        return JSONResponse({"ok": result.ok, "count": result.count, "head": result.head})

    def _auth_route(name: str) -> None:
        async def route(request: Request) -> JSONResponse:
            raw = await _read_body(request)
            if raw is None:
                return JSONResponse({"error": "too_large"}, status_code=413, headers=denied)
            status, body = await run_in_threadpool(
                gateway.webauthn_call, name, request, raw, gateway.clock()
            )
            headers = {"Cache-Control": "no-store"} if status == 200 else denied
            return JSONResponse(body, status_code=status, headers=headers)

        app.post(_AUTH_PATHS[name])(route)

    for name in _AUTH_PATHS:
        _auth_route(name)

    @app.get("/auth/session")
    def auth_session(request: Request) -> JSONResponse:
        status, body = gateway.auth_session(request, gateway.clock())
        headers = {"Cache-Control": "no-store"} if status == 200 else denied
        return JSONResponse(body, status_code=status, headers=headers)

    return app
