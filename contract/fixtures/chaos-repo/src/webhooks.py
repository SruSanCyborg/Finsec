"""Inbound payment webhook handling.

DELIBERATELY VULNERABLE — scanner test fixture.
FIN-SEC-030 is expected at line 52.
"""

import hashlib
import hmac
import logging

from flask import Blueprint, request

from .config import WEBHOOK_TOLERANCE_SECONDS

log = logging.getLogger(__name__)
bp = Blueprint("webhooks", __name__)


def _verify_signature(raw_body: bytes, header: str, secret: str) -> bool:
    """Constant-time HMAC-SHA256 check over the raw request body.

    Modeled on Razorpay's X-Razorpay-Signature and GitHub's
    X-Hub-Signature-256. This part is correct — the bug is further down.
    """
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


def _parse_event(payload: dict) -> dict:
    return {
        "id": payload.get("id"),
        "type": payload.get("type"),
        "created": payload.get("created"),
        "data": payload.get("data", {}).get("object", {}),
    }


@bp.route("/webhooks/payments", methods=["POST"])
def handle_payment_webhook():
    raw = request.get_data()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not _verify_signature(raw, signature, _webhook_secret()):
        log.warning("rejected webhook with bad signature")
        return "", 400

    event = _parse_event(request.get_json(silent=True) or {})
    log.debug("received event %s of type %s", event["id"], event["type"])
    card = event["data"].get("card", {})

    # FIN-SEC-030 — PAN written to application log (PCI-DSS 3.4.1, GDPR Art.5)
    log.info("charge for card %s", card.get("number"))

    return "", 204


def _webhook_secret() -> str:
    import os

    return os.environ["RAZORPAY_WEBHOOK_SECRET"]
