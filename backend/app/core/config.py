from typing import Optional
from urllib.parse import urlparse

from pydantic_settings import BaseSettings

# Hosts/ports a development or test process is allowed to connect to (see
# fitai_deployment_links memory / Session Log 2026-07-03,17). This is an
# ALLOWLIST, not a production-port denylist: Railway proxy ports can be
# regenerated on rotation, and a denylist keyed on today's production port
# would silently stop protecting the moment that port changes. An allowlist
# fails loud instead — if staging's port ever rotates, dev/test refuses to
# start until this list is updated, rather than quietly trusting an unknown
# host that might now be production.
#
# INCIDENT 2026-07-19: an earlier version of this allowlist only recognised
# the public staging proxy (reseau.proxy.rlwy.net:58448), which is what a
# local laptop connects through. Railway's own deployed services (production
# AND staging) instead reach Postgres over the *internal* network hostname
# (e.g. postgres.railway.internal:5432) for speed/cost reasons — that host
# was never on the allowlist, so both backends crashed at startup the moment
# this guard shipped. Internal *.railway.internal hostnames are not publicly
# resolvable, so a local machine can never reach one by accident — allowing
# the whole suffix here doesn't weaken the guard's actual purpose (stopping
# a laptop's DATABASE_URL from pointing at the public production proxy).
_ALLOWED_DEV_DB_INTERNAL_SUFFIX = ".railway.internal"

ALLOWED_DEV_DB_HOSTS = {
    ("localhost", 5432),
    ("127.0.0.1", 5432),
    ("reseau.proxy.rlwy.net", 58448),  # staging (public proxy, used from a local machine)
}


def _is_allowed_dev_db(database_url: str) -> bool:
    parsed = urlparse(database_url)
    if parsed.hostname and parsed.hostname.endswith(_ALLOWED_DEV_DB_INTERNAL_SUFFIX):
        return True
    return (parsed.hostname, parsed.port) in ALLOWED_DEV_DB_HOSTS


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/fitai"
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ENVIRONMENT: str = "development"
    ANTHROPIC_API_KEY: Optional[str] = None
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = ""
    RESEND_API_KEY: Optional[str] = None
    # Resend's shared, unverified sender -- works with zero setup but can only
    # deliver to the Resend account's own owner email until a domain is
    # verified (Resend dashboard -> Domains -> add DNS records). Once a real
    # domain is verified, override via env to an address on it.
    RESEND_FROM_EMAIL: str = "FitAI <onboarding@resend.dev>"
    # Temporary workaround while RESEND_FROM_EMAIL is still the shared sandbox
    # sender above: if set, all user-facing emails are redirected to this
    # address instead of the real recipient (whose email is included in the
    # subject/body), since the sandbox sender can only deliver to the Resend
    # account owner. Unset once a verified domain replaces RESEND_FROM_EMAIL.
    RESEND_SANDBOX_OVERRIDE_EMAIL: Optional[str] = None
    # Base URL used to build the password-reset link sent by email -- must be
    # the deployed frontend origin in staging/production (set via env), not
    # this localhost default.
    FRONTEND_URL: str = "http://localhost:5173"
    # WebAuthn Relying Party identity. RP_ID must be the frontend's exact
    # hostname (no scheme/port) and must match what the browser's
    # navigator.credentials calls see as document.location.hostname -- a
    # credential registered under one RP ID is refused under another, so
    # this can't be left to drift from FRONTEND_URL. Defaults derive from
    # FRONTEND_URL so local dev/most deployments need zero extra config;
    # override only if a deployment's actual browser-facing origin differs
    # from FRONTEND_URL (e.g. a CDN in front of it).
    WEBAUTHN_RP_ID: Optional[str] = None
    WEBAUTHN_RP_NAME: str = "FitAI"
    WEBAUTHN_ORIGIN: Optional[str] = None

    class Config:
        # .env holds safe placeholder defaults (committed-safe); .env.local holds
        # real local secrets (gitignored) and overrides .env when present.
        env_file = (".env", ".env.local")


settings = Settings()

# Derive WebAuthn RP ID/origin from FRONTEND_URL when not explicitly set --
# see the field comments above for why these must track the real
# browser-facing origin rather than have their own independent defaults.
if not settings.WEBAUTHN_RP_ID:
    settings.WEBAUTHN_RP_ID = urlparse(settings.FRONTEND_URL).hostname
if not settings.WEBAUTHN_ORIGIN:
    settings.WEBAUTHN_ORIGIN = settings.FRONTEND_URL

if settings.ENVIRONMENT in ("development", "test") and not _is_allowed_dev_db(settings.DATABASE_URL):
    raise RuntimeError(
        f"Refusing to start: ENVIRONMENT={settings.ENVIRONMENT!r} but DATABASE_URL "
        f"({urlparse(settings.DATABASE_URL).hostname}:{urlparse(settings.DATABASE_URL).port}) "
        "is not on the dev/test allowlist (localhost or the staging proxy). Point .env.local "
        "at staging or a local DB — if staging's port legitimately changed, update "
        "ALLOWED_DEV_DB_HOSTS in config.py."
    )
