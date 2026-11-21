# 遮断の計画。「この IP を遮断してよいか」を決め、よければ命令を組み立てる。
#
# 迷ったら遮断しない (規則 5 の逆側)。自分を締め出さない歯止めを 3 つ持つ:
#   ① 管理用の IP と loopback は対象にしない  ② 遮断は必ず期限つき
#   ③ 1 分あたりの件数に天井 (送信元を偽った嫌がらせで、正しい利用者を巻き込まない)
from __future__ import annotations

import ipaddress
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from layer1_mtd.firewall import add_element_argv, parse_ip

SkipReason = Literal["invalid_ip", "loopback", "unroutable", "admin", "rate_limited"]
_WINDOW_SECONDS = 60


@dataclass(frozen=True)
class BlockDecision:
    action: Literal["block", "skip"]
    reason: str
    argv: tuple[str, ...] = ()
    needs_human: bool = False


class BlockPlanner:
    def __init__(
        self,
        *,
        admin_allowlist: Iterable[str],
        rate_limit_per_minute: int = 20,
        timeout_hours: int = 24,
    ) -> None:
        if rate_limit_per_minute < 1:
            raise ValueError("rate_limit_per_minute は 1 以上")
        if not 1 <= timeout_hours <= 7 * 24:
            raise ValueError("timeout_hours は 1〜168")
        # 読めない設定のまま動かさない (管理用の IP が空になって自分を遮断しうるため)。
        self._admin = tuple(ipaddress.ip_network(n.strip(), strict=False) for n in admin_allowlist)
        self._limit = rate_limit_per_minute
        self._timeout_seconds = timeout_hours * 3600
        self._recent: deque[float] = deque()

    def plan(self, ip: object, *, now: float) -> BlockDecision:
        try:
            addr = parse_ip(ip)
        except ValueError:
            return BlockDecision("skip", "invalid_ip")
        if addr.is_loopback:
            return BlockDecision("skip", "loopback")
        if addr.is_unspecified or addr.is_multicast or addr.is_link_local:
            return BlockDecision("skip", "unroutable")
        if any(addr.version == net.version and addr in net for net in self._admin):
            return BlockDecision("skip", "admin")
        while self._recent and now - self._recent[0] >= _WINDOW_SECONDS:
            self._recent.popleft()
        if len(self._recent) >= self._limit:
            return BlockDecision("skip", "rate_limited", needs_human=True)
        self._recent.append(now)
        argv = add_element_argv("blocked", str(addr), self._timeout_seconds)
        return BlockDecision("block", "ok", tuple(argv))
