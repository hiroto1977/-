# nftables の命令を「組み立てる」だけの関数。実行は runner.py が持つ。
#
# IP は ipaddress で検めてから入れる (文字列をそのまま命令に入れない)。
# 足す要素は必ず期限つき (規則 6)。
from __future__ import annotations

import ipaddress
from typing import Literal

SetKind = Literal["allowed", "blocked"]

_FAMILY = "inet"
_TABLE = "spa"
# 期限の天井 (7 日)。これより長い遮断は人が決める。
MAX_TIMEOUT_SECONDS = 7 * 24 * 3600

IpAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


def parse_ip(text: object) -> IpAddress:
    # IPv4 を包んだ IPv6 (::ffff:a.b.c.d) は、中の IPv4 として扱う。
    if not isinstance(text, str):
        raise ValueError("IP は文字列で渡す")
    addr = ipaddress.ip_address(text.strip())
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return addr.ipv4_mapped
    return addr


def set_name(kind: SetKind, addr: IpAddress) -> str:
    if kind not in ("allowed", "blocked"):
        raise ValueError("kind は allowed か blocked")
    return kind if addr.version == 4 else f"{kind}6"


def add_element_argv(kind: SetKind, ip: str, timeout_seconds: int) -> list[str]:
    addr = parse_ip(ip)
    if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int):
        raise ValueError("timeout_seconds は整数")
    if not 1 <= timeout_seconds <= MAX_TIMEOUT_SECONDS:
        raise ValueError(f"timeout_seconds は 1〜{MAX_TIMEOUT_SECONDS}")
    return [
        "nft", "add", "element", _FAMILY, _TABLE, set_name(kind, addr),
        "{", str(addr), "timeout", f"{timeout_seconds}s", "}",
    ]


def delete_element_argv(kind: SetKind, ip: str) -> list[str]:
    addr = parse_ip(ip)
    return ["nft", "delete", "element", _FAMILY, _TABLE, set_name(kind, addr), "{", str(addr), "}"]


def flush_set_argv(kind: SetKind, version: Literal[4, 6]) -> list[str]:
    if kind not in ("allowed", "blocked") or version not in (4, 6):
        raise ValueError("kind は allowed / blocked・version は 4 / 6")
    return ["nft", "flush", "set", _FAMILY, _TABLE, kind if version == 4 else f"{kind}6"]
