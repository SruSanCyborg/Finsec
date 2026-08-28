"""Untrusted input reaching an interpreter. SIR-SEC-010 and SIR-SEC-011."""

import subprocess


def settled_rows(cur, merchant_id):
    # --- true negative: bound parameters, the same call shape ---------------
    cur.execute("SELECT amount FROM settlements WHERE merchant = %s", (merchant_id,))
    return cur.fetchall()


def refunded_rows(cur, merchant_id):
    # --- SIR-SEC-010: the query is built, not bound -------------------------
    cur.execute("SELECT amount FROM refunds WHERE merchant = '%s'" % merchant_id)
    return cur.fetchall()


def export_statement(account_id):
    # --- true negative: argument list, no shell ----------------------------
    subprocess.run(["/usr/bin/statement", "--account", account_id], check=True)


def archive_statement(account_id):
    # --- SIR-SEC-011: a shell, and the account id is in the string ----------
    subprocess.run("tar czf /tmp/%s.tgz /var/statements/%s" % (account_id, account_id), shell=True)
