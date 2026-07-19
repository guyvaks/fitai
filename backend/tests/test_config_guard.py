"""Regression tests for the dev/test DATABASE_URL allowlist guard in
app.core.config. Settings are evaluated at import time as a module-level
singleton, so each case runs in a fresh subprocess rather than reloading the
module in-process.

INCIDENT 2026-07-19: the allowlist introduced in commit ebec777 only listed
the staging *public proxy* host, not the *internal* Railway network hostname
(postgres.railway.internal) that Railway's own deployed backends actually use
for DATABASE_URL. Both production and staging crashed at startup as a result.
These tests pin the fix (commit after 3bfbf18) so it can't regress silently.
"""
import os
import subprocess
import sys

_CHECK = "from app.core.config import settings; print('OK')"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run(environment: str, database_url: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["ENVIRONMENT"] = environment
    env["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-c", _CHECK],
        capture_output=True,
        text=True,
        cwd=_BACKEND_DIR,
        env=env,
    )


def test_internal_railway_host_allowed_in_dev():
    # This is the exact host Railway's own production/staging backends use —
    # the crash scenario from the 2026-07-19 incident.
    result = _run("development", "postgresql://u:p@postgres.railway.internal:5432/railway")
    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


def test_staging_public_proxy_allowed_in_dev():
    result = _run("development", "postgresql://u:p@reseau.proxy.rlwy.net:58448/railway")
    assert result.returncode == 0, result.stderr


def test_localhost_allowed_in_dev():
    result = _run("development", "postgresql://u:p@localhost:5432/fitai")
    assert result.returncode == 0, result.stderr


def test_production_public_proxy_refused_in_dev():
    result = _run("development", "postgresql://u:p@reseau.proxy.rlwy.net:31062/railway")
    assert result.returncode != 0
    assert "Refusing to start" in result.stderr


def test_unrecognised_host_refused_in_dev():
    result = _run("development", "postgresql://u:p@some-random-host:5432/db")
    assert result.returncode != 0
    assert "Refusing to start" in result.stderr


def test_production_environment_bypasses_guard_entirely():
    # A genuine ENVIRONMENT=production run (e.g. Railway's own production
    # deploy) must never be blocked, regardless of DATABASE_URL host.
    result = _run("production", "postgresql://u:p@reseau.proxy.rlwy.net:31062/railway")
    assert result.returncode == 0, result.stderr
