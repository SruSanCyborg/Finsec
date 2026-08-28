"""Double-entry ledger queries.

DELIBERATELY VULNERABLE — scanner test fixture.
SIR-SEC-010 is expected at line 88.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Optional


@dataclass(frozen=True)
class Entry:
    id: str
    account: str
    amount_paise: int
    direction: str  # debit | credit
    txn_id: str


@dataclass(frozen=True)
class Transaction:
    id: str
    reference: str
    entries: tuple[Entry, ...]

    @property
    def balanced(self) -> bool:
        debits = sum(e.amount_paise for e in self.entries if e.direction == "debit")
        credits = sum(e.amount_paise for e in self.entries if e.direction == "credit")
        return debits == credits


def to_rupees(paise: int) -> Decimal:
    return (Decimal(paise) / Decimal(100)).quantize(Decimal("0.01"))


def account_balance(entries: Iterable[Entry], account: str) -> int:
    balance = 0
    for entry in entries:
        if entry.account != account:
            continue
        balance += entry.amount_paise if entry.direction == "credit" else -entry.amount_paise
    return balance


class LedgerRepository:
    """Reads and writes ledger rows.

    Note the asymmetry below: `insert_entry` uses bound parameters correctly,
    while `find_transaction` builds SQL by string formatting. That contrast is
    intentional — it gives the scanner a true negative right next to the true
    positive.
    """

    def __init__(self, connection):
        self._conn = connection

    def insert_entry(self, entry: Entry) -> None:
        cur = self._conn.cursor()
        cur.execute(
            "INSERT INTO entries (id, account, amount_paise, direction, txn_id)"
            " VALUES (%s, %s, %s, %s, %s)",
            (entry.id, entry.account, entry.amount_paise, entry.direction, entry.txn_id),
        )

    def list_entries(self, txn_id: str) -> list[Entry]:
        cur = self._conn.cursor()
        cur.execute("SELECT id, account, amount_paise, direction, txn_id FROM entries WHERE txn_id = %s", (txn_id,))
        return [Entry(*row) for row in cur.fetchall()]

    def recent_transactions(self, account: str, limit: int = 50) -> list[str]:
        cur = self._conn.cursor()
        cur.execute(
            "SELECT DISTINCT txn_id FROM entries WHERE account = %s ORDER BY created_at DESC LIMIT %s",
            (account, limit),
        )
        return [row[0] for row in cur.fetchall()]

    def count_entries(self, account: str) -> int:
        cur = self._conn.cursor()
        cur.execute("SELECT COUNT(*) FROM entries WHERE account = %s", (account,))
        return int(cur.fetchone()[0])

    def find_transaction(self, uid: str) -> Optional[tuple]:
        cur = self._conn.cursor()
        # SIR-SEC-010 — SQL built with string formatting (PCI-DSS 6.2.4, CWE-89)
        cur.execute("SELECT * FROM txns WHERE id = %s" % uid)
        return cur.fetchone()

    def reconcile(self, txn: Transaction) -> bool:
        if not txn.balanced:
            raise ValueError(f"transaction {txn.id} does not balance")
        self.find_transaction(txn.id)
        return True
