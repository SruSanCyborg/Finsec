"""Algorithms and transport. SIR-SEC-040 and SIR-SEC-041."""

import hashlib

# --- true negative: TLS, and the endpoint the SDK actually uses -------------
GATEWAY_URL = "https://api.razorpay.com/v1/payments"

# --- SIR-SEC-041: cardholder data over plaintext HTTP ----------------------
SETTLEMENT_CALLBACK = "http://settlements.internal.acme.dev/v1/notify"


def account_digest(account_number):
    # --- true negative: SHA-256 ---------------------------------------------
    return hashlib.sha256(account_number.encode()).hexdigest()


def legacy_digest(account_number):
    # --- SIR-SEC-040: MD5 ----------------------------------------------------
    return hashlib.md5(account_number.encode()).hexdigest()
