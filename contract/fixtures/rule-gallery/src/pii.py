"""Cardholder data at rest and in logs. SIR-SEC-030 and SIR-SEC-031."""

import logging
from sqlalchemy import Column, String

log = logging.getLogger(__name__)


def record_charge(card):
    # --- true negative: last four only, which is what PCI permits ----------
    log.info("charge on card ending %s", card["number"][-4:])


def trace_charge(card):
    # --- SIR-SEC-030: the full number reaches the log -----------------------
    log.info("charge on card %s", card.get("number"))


class StoredCard:
    id = Column(String(36), primary_key=True)

    # --- true negative: a vault reference, not the number itself ------------
    card_number_token = Column(String(64))

    # --- SIR-SEC-031: the PAN itself, in a plain string column --------------
    card_number = Column(String(19))
