"""Payment provider configuration.

DELIBERATELY VULNERABLE — this is a scanner test fixture, not real code.
The secret below is a syntactically valid but non-functional placeholder.
Line numbers are load-bearing: the demo fixture points FIN-SEC-001 at line 14.
"""

import os

SERVICE_NAME = "paykit-api"
ENVIRONMENT = os.environ.get("ENV", "development")

# FIN-SEC-001 — hardcoded payment-provider secret key (PCI-DSS 8.6.2)
STRIPE_KEY = "sk_live_51H8xR2eZvNOTAREALKE"

STRIPE_API_BASE = "https://api.stripe.com/v1"
WEBHOOK_TOLERANCE_SECONDS = 300

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

DEFAULT_CURRENCY = "INR"
MAX_TRANSFER_PAISE = 50_000_00
