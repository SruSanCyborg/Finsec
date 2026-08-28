/**
 * The same hazards as the Python gallery, in JavaScript.
 *
 * Eleven of thirteen rules gated on tree-sitter's Python node names — `call`
 * rather than `call_expression` — so every one of them walked a `.js` file,
 * matched nothing, and reported it clean. The catalogue said `languages:
 * python, javascript, typescript` the whole time.
 *
 * A gallery of Python files could never catch that: the rules worked perfectly
 * on every file anyone ever pointed them at. So the planted examples are here
 * too, each beside a correct counterpart doing the same job.
 */

const crypto = require('crypto');
const { exec } = require('child_process');

// --- SIR-SEC-001: a credential in the source ------------------------------
const stripe = require('stripe')('sk_live_51H8xQ2eZvKYlo2Cabcd');

// --- true negative: the same client, from the environment -----------------
const stripeOk = require('stripe')(process.env.STRIPE_SECRET_KEY);

// --- SIR-SEC-010: SQL built from request input ----------------------------
async function findAccount(db, req) {
  const query = 'SELECT * FROM accounts WHERE id = ' + req.query.account_id;
  return db.execute(query);
}

// --- true negative: the same query, bound ---------------------------------
async function findAccountOk(db, req) {
  return db.execute('SELECT * FROM accounts WHERE id = ?', [req.query.account_id]);
}

// --- SIR-SEC-011: a shell command built from request input ----------------
function exportStatement(req) {
  exec('tar -czf /tmp/statement.tar ' + req.body.path);
}

// --- true negative: argv, so no shell is involved -------------------------
function exportStatementOk(req) {
  const { execFile } = require('child_process');
  execFile('tar', ['-czf', '/tmp/statement.tar', req.body.path]);
}

// --- SIR-SEC-030: a card number written to the log ------------------------
function recordPayment(req) {
  console.log('charging card ' + req.body.card_number + ' for ' + req.body.amount);
}

// --- true negative: the same line, with the PAN left out ------------------
function recordPaymentOk(req) {
  console.log('charging card ending ' + String(req.body.card_number).slice(-4));
}

// --- SIR-SEC-040: a weak digest over a PAN --------------------------------
function fingerprintCard(pan) {
  return crypto.createHash('md5').update(pan).digest('hex');
}

// --- true negative: a modern digest, salted -------------------------------
function fingerprintCardOk(pan, salt) {
  return crypto.createHash('sha256').update(salt + pan).digest('hex');
}

module.exports = {
  stripe,
  stripeOk,
  findAccount,
  findAccountOk,
  exportStatement,
  exportStatementOk,
  recordPayment,
  recordPaymentOk,
  fingerprintCard,
  fingerprintCardOk,
};
