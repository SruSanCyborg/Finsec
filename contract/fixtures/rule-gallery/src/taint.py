"""Dataflow, not shape. SIR-SEC-010 and SIR-SEC-011 traced to their source.

Every flaw in the other files is visible in one line. These are not: the value
is made untrusted in one statement and reaches the sink in another, which is how
injection is actually written. A rule that matches the shape of the sink cannot
see them, and a rule that matches interpolation flags the constant below.
"""

import subprocess

from flask import Blueprint, request
from .deps import login_required

bp = Blueprint("statements", __name__)

# --- true negative: a module constant, interpolated ------------------------
# Nothing an attacker touches reaches this string. Shape alone called it
# attacker-controlled SQL.
LEDGER_TABLE = "ledger_lines"


@bp.route("/statements/summary", methods=["GET"])
@login_required
def summary(cur):
    cur.execute(f"SELECT count(*) FROM {LEDGER_TABLE}")
    return {}


# --- true negative: untrusted, but bound ------------------------------------
@bp.route("/statements/bound", methods=["GET"])
@login_required
def bound(cur):
    account = request.args["account"]
    cur.execute("SELECT amount FROM ledger_lines WHERE account = %s", (account,))
    return {}


# --- STILL REPORTED, and deliberately: coerced, but interpolated -----------
# `int()` clears the taint, so no source-to-sink path is proven and the finding
# carries no trace. The shape rule reports it anyway, because the alternative is
# an injection scanner that goes quiet when it cannot prove harm — and the
# dataflow here is intra-procedural, so "no path found" is a limit of the
# analysis, not a certificate. Conservative in the safe direction.
@bp.route("/statements/page", methods=["GET"])
@login_required
def page(cur):
    offset = int(request.args["offset"])
    cur.execute(f"SELECT amount FROM ledger_lines LIMIT 50 OFFSET {offset}")
    return {}


# --- SIR-SEC-010: three statements from the request to the query -----------
@bp.route("/statements/search", methods=["GET"])
@login_required
def search(cur):
    account = request.args["account"]
    query = "SELECT amount FROM ledger_lines WHERE account = '%s'" % account
    cur.execute(query)
    return {}


# --- SIR-SEC-011: the same, into a shell ------------------------------------
@bp.route("/statements/export", methods=["POST"])
@login_required
def export():
    account = request.form["account"]
    path = "/var/statements/%s.csv" % account
    subprocess.run("gzip " + path, shell=True)
    return {}


# --- SIR-SEC-010, across two functions -------------------------------------
# Neither line looks wrong on its own. `run_query` is correct code that
# executes what it is handed; the caller is what hands it something untrusted.
# A rule matching the shape of a statement cannot see this; a function summary
# can, and reports it at the call, which is the line somebody has to change.
def run_query(cur, statement):
    cur.execute(statement)


@bp.route("/statements/by-account", methods=["GET"])
@login_required
def by_account(cur):
    account = request.args["account"]
    run_query(cur, "SELECT amount FROM ledger_lines WHERE account = '%s'" % account)
    return {}
