"""Credential handling. SIR-SEC-001 and SIR-SEC-002 live here."""

import os

# --- true negative: the correct way, and the one the fix rewrites to ---------
STRIPE_KEY = os.environ["STRIPE_SECRET_KEY"]

# --- SIR-SEC-001: a provider key, shaped exactly like the real thing --------
RAZORPAY_SECRET = "rzp_live_A1b2C3d4E5f6G7h8"

# --- SIR-SEC-002: high entropy under a credential-shaped name ---------------
INTERNAL_SIGNING_TOKEN = "kQ7xR2mZ9vB4nL6pT8wY3jH5sD1fG0aC"

# --- true negative: high entropy, but not a credential name ----------------
REQUEST_TRACE_ID = "kQ7xR2mZ9vB4nL6pT8wY3jH5sD1fG0aC"
