"""
Snapshot database connection - separate from main database to avoid locks
"""
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import OperationalError
import os
import logging

logger = logging.getLogger(__name__)

# Snapshot database URL from environment or default
SNAPSHOT_DATABASE_URL = os.environ.get('SNAPSHOT_DATABASE_URL', "postgresql://alpha_user:alpha_pass@localhost/alpha_snapshots")

# Reuse the same pool tuning knobs as the primary database
POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "20"))
POOL_MAX_OVERFLOW = int(os.environ.get("DB_POOL_MAX_OVERFLOW", "20"))
POOL_RECYCLE = int(os.environ.get("DB_POOL_RECYCLE", "1800"))
POOL_TIMEOUT = int(os.environ.get("DB_POOL_TIMEOUT", "30"))

def _ensure_snapshot_engine():
    """Create snapshot database if it does not already exist."""
    if os.environ.get("ALPHA_TRACE_DOMAIN_STORE", "").lower() == "mysql" and not os.environ.get("SNAPSHOT_DATABASE_URL"):
        logger.info("Snapshot PostgreSQL skipped in AlphaTrace MySQL profile")
        return None

    url = make_url(SNAPSHOT_DATABASE_URL)
    db_name = url.database
    connect_args = {"connect_timeout": int(os.environ.get("SNAPSHOT_DB_CONNECT_TIMEOUT", "2"))}

    try:
        engine = create_engine(
            SNAPSHOT_DATABASE_URL,
            pool_size=POOL_SIZE,
            max_overflow=POOL_MAX_OVERFLOW,
            pool_recycle=POOL_RECYCLE,
            pool_timeout=POOL_TIMEOUT,
            connect_args=connect_args,
        )
        with engine.connect():
            logger.debug("Snapshot database %s reachable", db_name)
        return engine
    except OperationalError as exc:
        message = str(exc).lower()
        if "does not exist" not in message:
            logger.warning("Snapshot database %s unavailable: %s", db_name, exc)
            return None

        logger.warning("Snapshot database %s missing – creating it", db_name)
        admin_url = url.set(database='postgres')
        admin_engine = create_engine(admin_url, connect_args=connect_args)
        try:
            with admin_engine.connect() as conn:
                conn = conn.execution_options(isolation_level='AUTOCOMMIT')
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                logger.info("Snapshot database %s created", db_name)
        except OperationalError as create_exc:
            logger.warning("Snapshot database %s could not be created: %s", db_name, create_exc)
            return None
        finally:
            admin_engine.dispose()

        engine = create_engine(
            SNAPSHOT_DATABASE_URL,
            pool_size=POOL_SIZE,
            max_overflow=POOL_MAX_OVERFLOW,
            pool_recycle=POOL_RECYCLE,
            pool_timeout=POOL_TIMEOUT,
            connect_args=connect_args,
        )
        with engine.connect():
            logger.debug("Snapshot database %s ready after creation", db_name)
        return engine


# Create engine for snapshot database
snapshot_engine = _ensure_snapshot_engine()

# Session factory for snapshot database
_SnapshotSessionFactory = (
    sessionmaker(autocommit=False, autoflush=False, bind=snapshot_engine)
    if snapshot_engine is not None
    else None
)


def SnapshotSessionLocal():
    """Return a snapshot DB session, or fail only when the snapshot feature is used."""
    if _SnapshotSessionFactory is None:
        raise RuntimeError("Snapshot database is not configured or unavailable")
    return _SnapshotSessionFactory()

# Base class for snapshot models
SnapshotBase = declarative_base()

def get_snapshot_db():
    """Get snapshot database session"""
    db = SnapshotSessionLocal()
    try:
        yield db
    finally:
        db.close()
