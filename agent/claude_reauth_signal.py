"""Claude(Anthropic) 토큰 재인증 필요 신호.

배경: hermes의 Claude 호출은 Claude Code OAuth 토큰(``~/.claude/.credentials.json``)에
의존한다. 토큰이 만료됐는데 자동 갱신이 실패하면(refresh token 없음 / refresh 엔드포인트
실패) 기존 코드는 ``logger.debug``만 남기고 ``None``을 반환해 **조용히 실패**했다.
사용자는 "왜 Claude가 안 되는지" 알 수 없었다.

이 모듈은 그 실패를 **가시적이고 실행 가능한 신호**로 바꾼다:
  - dedup된 ``logger.warning`` (매 API 호출마다 스팸 방지: 기본 5분당 1회)
  - ``~/.hermes/.claude_reauth_needed`` 마커 파일(JSON) 기록 — 후속 표면(TUI/CLI/진단)이
    읽어서 "재로그인 필요"를 노출할 수 있다.
토큰이 다시 정상 해석되면 :func:`clear_claude_reauth_signal` 로 마커를 지운다.

설계 원칙: **인증 경로를 절대 깨지 않는다.** 모든 함수는 best-effort이며 어떤 예외도
호출자에게 전파하지 않는다(부수효과 전용 — 반환값/제어흐름에 영향 없음).
"""
from __future__ import annotations

import json
import logging
import os
import stat
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# 같은 메시지를 매 API 호출마다 찍지 않도록 경고 dedup 간격(초).
_WARN_INTERVAL_SEC = 300
# 프로세스 전역 마지막 경고 시각(단조 증가 비교용 wall-clock).
_last_warn_ts: float = 0.0

_REASON_HELP = (
    "Claude 토큰이 만료되어 자동 갱신에 실패했습니다 — Claude Code에서 다시 로그인하거나 "
    "`claude setup-token`을 실행해 재인증하세요. "
    "(Claude token expired and auto-refresh failed; re-login in Claude Code "
    "or run `claude setup-token`.)"
)


def _hermes_home() -> Path:
    # Use Hermes' profile/context-aware home resolver (honors HERMES_HOME env,
    # active_profile, and platform-native defaults) so the marker lands in the
    # *current* profile's home, not a hardcoded ~/.hermes. Best-effort: never
    # let home resolution crash the signal path.
    try:
        from hermes_constants import get_hermes_home

        return get_hermes_home()
    except Exception:  # noqa: BLE001
        return Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))


def _marker_path() -> Path:
    return _hermes_home() / ".claude_reauth_needed"


def signal_claude_reauth_needed(reason: str) -> None:
    """Claude 재인증이 필요함을 신호한다(경고 로그 dedup + 마커 기록).

    best-effort: 어떤 예외도 전파하지 않는다. ``reason`` 은 진단용 짧은 식별자
    (예: ``"refresh_failed"``, ``"no_refresh_token"``).
    """
    global _last_warn_ts
    try:
        now = time.time()
        # 1) dedup된 사용자 가시 경고
        if now - _last_warn_ts >= _WARN_INTERVAL_SEC:
            _last_warn_ts = now
            logger.warning("%s (reason=%s)", _REASON_HELP, reason)
        # 2) 머신 판독 가능한 마커(후속 표면용). 원자적 0o600 쓰기.
        _write_marker_atomic(reason, now)
    except Exception:  # noqa: BLE001 — 신호는 절대 인증 경로를 깨면 안 됨
        logger.debug("signal_claude_reauth_needed failed", exc_info=True)


def _write_marker_atomic(reason: str, ts: float) -> None:
    marker = _marker_path()
    payload = json.dumps(
        {"ts": ts, "reason": reason, "message": _REASON_HELP},
        ensure_ascii=False,
    )
    marker.parent.mkdir(parents=True, exist_ok=True)
    tmp = marker.with_suffix(f".tmp.{os.getpid()}")
    try:
        fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                     stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, marker)
    except OSError:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def clear_claude_reauth_signal() -> None:
    """Claude 토큰이 다시 정상 해석됐을 때 재인증 마커를 제거한다.

    best-effort: 마커가 없거나 삭제 실패해도 조용히 무시한다. 경고 dedup 타이머도
    리셋해 다음 실패 시 즉시 경고가 다시 나오도록 한다.
    """
    global _last_warn_ts
    try:
        _marker_path().unlink(missing_ok=True)
        _last_warn_ts = 0.0
    except Exception:  # noqa: BLE001
        logger.debug("clear_claude_reauth_signal failed", exc_info=True)


def read_claude_reauth_signal() -> Optional[dict]:
    """재인증 마커를 읽어 dict로 반환(없으면 None). 표면(TUI/CLI/진단)용 헬퍼."""
    try:
        marker = _marker_path()
        if not marker.exists():
            return None
        return json.loads(marker.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        logger.debug("read_claude_reauth_signal: unreadable marker", exc_info=True)
        return None
