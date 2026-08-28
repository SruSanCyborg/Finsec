"""Money-movement endpoints. SIR-SEC-050 and SIR-SEC-051."""

from flask import Blueprint, request
from .deps import login_required, limiter

bp = Blueprint("transfers", __name__)


# --- true negative: rate limited, idempotent, authenticated -----------------
@bp.route("/transfers", methods=["POST"])
@login_required
@limiter.limit("5/minute")
def create_transfer():
    idempotency_key = request.headers["Idempotency-Key"]
    return {"status": "queued", "key": idempotency_key}


# --- SIR-SEC-050 and SIR-SEC-051: neither throttled nor idempotent ---------
@bp.route("/payouts", methods=["POST"])
@login_required
def create_payout():
    return {"status": "queued"}
