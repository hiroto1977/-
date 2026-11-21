# トークンの発行を止める印。停止スイッチの段 1 と、「記録の鎖が合わない」ときに使う。
#
# 印はファイル 1 つ (在れば止まっている)。別のプロセス (停止スイッチの道具) からも止められる。
# 置き場所を渡さなければメモリの中だけ (検査用)。
from __future__ import annotations

from pathlib import Path


class IssuanceSwitch:
    def __init__(self, path: Path | None = None) -> None:
        self._path = Path(path) if path is not None else None
        self._memory = False

    def halted(self) -> bool:
        if self._path is None:
            return self._memory
        return self._path.exists()

    def halt(self, reason: str) -> None:
        if self._path is None:
            self._memory = True
            return
        self._path.write_text(reason[:200] + "\n", encoding="utf-8")

    def resume(self) -> None:
        if self._path is None:
            self._memory = False
            return
        self._path.unlink(missing_ok=True)
