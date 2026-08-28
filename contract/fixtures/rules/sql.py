def bound(cur, uid):
    # sirius-ok: SIR-SEC-012
    cur.execute("SELECT * FROM ledger WHERE id = %s", (uid,))

def formatted(cur, uid):
    # sirius-test: SIR-SEC-012
    cur.execute("SELECT * FROM ledger WHERE id = '%s'" % uid)
