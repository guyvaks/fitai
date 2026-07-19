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

    class Config:
        # .env holds safe placeholder defaults (committed-safe); .env.local holds
        # real local secrets (gitignored) and overrides .env when present.
        env_file = (".env", ".env.local")


settings = Settings()

if settings.ENVIRONMENT in ("development", "test") and not _is_allowed_dev_db(settings.DATABASE_URL):
    raise RuntimeError(
        f"Refusing to start: ENVIRONMENT={settings.ENVIRONMENT!r} but DATABASE_URL "
        f"({urlparse(settings.DATABASE_URL).hostname}:{urlparse(settings.DATABASE_URL).port}) "
        "is not on the dev/test allowlist (localhost or the staging proxy). Point .env.local "
        "at staging or a local DB — if staging's port legitimately changed, update "
        "ALLOWED_DEV_DB_HOSTS in config.py."
    )
