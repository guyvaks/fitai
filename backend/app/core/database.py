from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# pool_pre_ping: issues a lightweight SELECT 1 before handing out a pooled
# connection, so a connection the pool believes is fine but that actually
# went stale/dropped (e.g. silently closed by the Supabase pooler after
# sitting idle) is detected and transparently replaced instead of hanging
# on first real use -- see the 2026-08-11 staging E2E investigation (a lost
# register request, zero CPU activity, a decade-old idle connection still
# open in pg_stat_activity).
# pool_recycle=1800: proactively refreshes connections before they get old
# enough to go stale in the first place, rather than relying solely on
# pre_ping to catch it after the fact.
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
