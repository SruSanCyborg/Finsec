"""PostgreSQL connection pool (asyncpg) against Neon.

Neon is accessed ONLY by this backend. The browser client never sees a
connection string — it talks to the REST + WebSocket API in front of this.

Schema changes (ALTER TABLE) invalidate asyncpg's cached prepared statements
(InvalidCachedStatementError). We catch that and retry once on a fresh
connection so a migration never 500s the first request after boot.
"""

from __future__ import annotations

import logging

import asyncpg
from asyncpg.exceptions import InvalidCachedStatementError

from .config import DATABASE_URL

logger = logging.getLogger("sirius.db")

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=DATABASE_URL, min_size=1, max_size=10)
        logger.info("connected to Neon PostgreSQL")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def _run(fn, query: str, *args):
    pool = await get_pool()
    try:
        async with pool.acquire() as conn:
            return await fn(conn, query, *args)
    except InvalidCachedStatementError:
        # Schema changed under us — retry on a fresh statement (asyncpg
        # re-prepares when the cache is bypassed).
        async with pool.acquire() as conn:
            await conn.execute("DEALLOCATE ALL")
            return await fn(conn, query, *args)


async def fetch(query: str, *args):
    return await _run(lambda c, q, *a: c.fetch(q, *a), query, *args)


async def fetchrow(query: str, *args):
    return await _run(lambda c, q, *a: c.fetchrow(q, *a), query, *args)


async def fetchval(query: str, *args):
    return await _run(lambda c, q, *a: c.fetchval(q, *a), query, *args)


async def execute(query: str, *args):
    return await _run(lambda c, q, *a: c.execute(q, *a), query, *args)
