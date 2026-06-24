"""Tests for the Claude re-auth signal (agent/claude_reauth_signal.py).

이 신호는 Claude 토큰 만료+갱신 실패를 '조용한 실패 → 가시 경고 + 마커'로 바꾼다.
부수효과 전용이며 어떤 예외도 호출자에게 전파하지 않아야 한다.
"""
import json
import logging

import pytest

import agent.claude_reauth_signal as sig


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """HERMES_HOME을 tmp로 격리하고 dedup 타이머를 리셋한다."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    monkeypatch.setattr(sig, "_last_warn_ts", 0.0, raising=False)
    yield


def test_signal_writes_marker(tmp_path):
    sig.signal_claude_reauth_needed("refresh_failed")
    marker = tmp_path / ".claude_reauth_needed"
    assert marker.exists()
    data = json.loads(marker.read_text(encoding="utf-8"))
    assert data["reason"] == "refresh_failed"
    assert "message" in data and data["message"]
    assert isinstance(data["ts"], (int, float))


def test_read_marker_roundtrip(tmp_path):
    assert sig.read_claude_reauth_signal() is None
    sig.signal_claude_reauth_needed("no_refresh_token")
    got = sig.read_claude_reauth_signal()
    assert got is not None and got["reason"] == "no_refresh_token"


def test_clear_removes_marker(tmp_path):
    sig.signal_claude_reauth_needed("refresh_failed")
    assert (tmp_path / ".claude_reauth_needed").exists()
    sig.clear_claude_reauth_signal()
    assert not (tmp_path / ".claude_reauth_needed").exists()
    assert sig.read_claude_reauth_signal() is None


def test_warning_is_deduped(caplog):
    """5분 내 반복 호출은 경고를 1회만 찍는다(스팸 방지). 마커는 매번 갱신."""
    with caplog.at_level(logging.WARNING, logger=sig.logger.name):
        sig.signal_claude_reauth_needed("refresh_failed")
        sig.signal_claude_reauth_needed("refresh_failed")
        sig.signal_claude_reauth_needed("refresh_failed")
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1


def test_clear_resets_dedup_so_next_failure_warns_again(caplog):
    with caplog.at_level(logging.WARNING, logger=sig.logger.name):
        sig.signal_claude_reauth_needed("refresh_failed")
        sig.clear_claude_reauth_signal()
        sig.signal_claude_reauth_needed("refresh_failed")
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 2


def test_signal_never_raises(monkeypatch):
    """마커 쓰기가 실패해도(권한 등) 예외를 전파하지 않아야 한다."""
    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr(sig, "_write_marker_atomic", boom)
    # 예외 없이 반환되어야 함.
    sig.signal_claude_reauth_needed("refresh_failed")


def test_clear_never_raises(monkeypatch, tmp_path):
    sig.signal_claude_reauth_needed("refresh_failed")

    class BadPath:
        def unlink(self, *a, **k):
            raise OSError("nope")

    monkeypatch.setattr(sig, "_marker_path", lambda: BadPath())
    sig.clear_claude_reauth_signal()  # 예외 없이 반환


# --- 통합: anthropic_adapter 경로가 신호를 올바르게 켜고 끄는지 ------------------

def test_adapter_signals_when_no_refresh_token(tmp_path):
    from agent.anthropic_adapter import _resolve_claude_code_token_from_credentials

    expired_no_refresh = {"accessToken": "x", "expiresAt": 1, "refreshToken": ""}
    result = _resolve_claude_code_token_from_credentials(expired_no_refresh)
    assert result is None
    got = sig.read_claude_reauth_signal()
    assert got is not None and got["reason"] == "no_refresh_token"


def test_adapter_clears_when_token_valid(tmp_path):
    from agent.anthropic_adapter import _resolve_claude_code_token_from_credentials

    # 먼저 마커를 남겨둔 뒤, 유효 토큰 해석 시 제거되는지 확인.
    sig.signal_claude_reauth_needed("refresh_failed")
    assert sig.read_claude_reauth_signal() is not None

    far_future_ms = 9_999_999_999_000
    valid = {"accessToken": "good", "expiresAt": far_future_ms, "refreshToken": "r"}
    result = _resolve_claude_code_token_from_credentials(valid)
    assert result == "good"
    assert sig.read_claude_reauth_signal() is None


def test_hermes_home_honors_env_and_profile(tmp_path, monkeypatch):
    """마커 경로는 HERMES_HOME(및 profile-aware get_hermes_home)을 따라야 한다."""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    sig.signal_claude_reauth_needed("refresh_failed")
    assert (tmp_path / ".claude_reauth_needed").exists()


def test_env_token_does_not_clear_marker_after_failed_refresh(tmp_path, monkeypatch):
    """회귀방지(Codex P1-a): 만료 creds의 refresh가 실패해 마커가 켜진 뒤,
    static env 토큰을 반환하더라도 같은 호출에서 마커를 지우면 안 된다."""
    import agent.anthropic_adapter as ad

    expired_creds = {
        "accessToken": "old",
        "expiresAt": 1,            # 만료
        "refreshToken": "rt",      # refresh 시도하지만
    }
    monkeypatch.setattr(ad, "read_claude_code_credentials", lambda: expired_creds)
    # refresh 엔드포인트가 실패하도록 강제 → signal('refresh_failed')
    monkeypatch.setattr(
        ad, "refresh_anthropic_oauth_pure",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("network down")),
    )
    # oauth 형식의 static env 토큰(_prefer가 creds refresh를 시도하는 조건)
    monkeypatch.setenv("ANTHROPIC_TOKEN", "sk-ant-oat01-static")
    monkeypatch.delenv("CLAUDE_CODE_OAUTH_TOKEN", raising=False)

    token = ad.resolve_anthropic_token()
    assert token == "sk-ant-oat01-static"           # static 토큰은 반환되지만
    got = sig.read_claude_reauth_signal()
    assert got is not None and got["reason"] == "refresh_failed"  # 마커는 유지
