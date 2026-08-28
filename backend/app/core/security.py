"""Auth dependencies — legacy bridge.

Routers previously used `require_api_key` / `get_current_project_id` (Bearer API
key auth). That logic now lives in core/clerk.py as `get_current_user`, which
verifies Clerk session tokens first and falls back to API keys. These aliases
keep the existing routers working without per-route changes.
"""

from __future__ import annotations

import hmac

from fastapi import Depends

from .clerk import get_current_user


def _constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# Bearer API key / Clerk session auth → returns the authenticated user dict.
require_api_key = get_current_user

# Returns the project id for the authenticated tenant (demo project for now).
async def get_current_project_id(user: dict = Depends(get_current_user)) -> str:
    from .config import SIRIUS_PROJECT_ID

    return SIRIUS_PROJECT_ID
