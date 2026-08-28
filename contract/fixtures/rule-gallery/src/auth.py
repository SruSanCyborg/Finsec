"""Who is allowed to move money. SIR-SEC-020 and SIR-SEC-021."""

import jwt
from flask import Blueprint, request
from .deps import login_required, JWT_PUBLIC_KEY

bp = Blueprint("accounts", __name__)


# --- true negative: the same route shape, authenticated ---------------------
@bp.route("/accounts/<account_id>/balance", methods=["GET"])
@login_required
def balance(account_id):
    return {"account": account_id}


# --- SIR-SEC-020: no authentication decorator ------------------------------
@bp.route("/accounts/<account_id>/statements", methods=["GET"])
def statements(account_id):
    return {"account": account_id, "statements": []}


def session_claims(token):
    # --- true negative: verified, with the algorithm pinned -----------------
    return jwt.decode(token, JWT_PUBLIC_KEY, algorithms=["RS256"])


def preview_claims(token):
    # --- SIR-SEC-021: signature not checked --------------------------------
    return jwt.decode(token, options={"verify_signature": False})
