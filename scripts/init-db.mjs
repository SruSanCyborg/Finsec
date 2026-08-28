import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = (process.env.DATABASE_URL ?? "").replace("channel_binding=require", "");
const CLERK_SECRET = process.env.CLERK_SECRET_KEY ?? "";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DEMO_EMAIL = "demo@sirius.dev";
const DEMO_PASSWORD = "Demo1234!";

async function clerkFetch(path, init) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${CLERK_SECRET}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function provisionClerkDemo() {
  if (!CLERK_SECRET) {
    console.log("  clerk: CLERK_SECRET_KEY not set — skipping demo account provisioning");
    return null;
  }
  try {
    let user = null;
    const created = await clerkFetch("/users", {
      method: "POST",
      body: JSON.stringify({
        first_name: "Aarav",
        last_name: "Mehta",
        email_address: [DEMO_EMAIL],
        password: DEMO_PASSWORD,
      }),
    });
    if (created.ok) {
      user = created.data;
      console.log(`  clerk: demo user created (${DEMO_EMAIL})`);
    } else {
      const found = await clerkFetch(`/users?email_address=${encodeURIComponent(DEMO_EMAIL)}&limit=1`);
      user = found.data?.[0] ?? null;
      if (user) console.log(`  clerk: demo user already exists (${DEMO_EMAIL})`);
    }

    let org = null;
    if (user) {
      const orgCreated = await clerkFetch("/organizations", {
        method: "POST",
        body: JSON.stringify({ name: "Acme Capital", created_by: user.id }),
      });
      if (orgCreated.ok) {
        org = orgCreated.data;
        console.log(`  clerk: organization created (Acme Capital)`);
      } else {
        const orgs = await clerkFetch("/organizations?limit=10");
        org = (orgs.data ?? []).find((o) => o.name === "Acme Capital") ?? null;
        if (org) {
          await clerkFetch(`/organizations/${org.id}/memberships`, {
            method: "POST",
            body: JSON.stringify({ user_id: user.id, role: "org:admin" }),
          }).catch(() => {});
          console.log("  clerk: organization found, demo user attached");
        }
      }
    }
    return { user, org };
  } catch (e) {
    console.log(`  clerk: provisioning skipped (${e.message})`);
    return null;
  }
}

async function main() {
  await client.connect();
  console.log("connected to neon");

  const schema = readFileSync(join(here, "..", "backend", "schema.sql"), "utf8");
  await client.query(schema);
  console.log("schema applied (18 tables)");

  const existing = await client.query("select id from organizations limit 1");
  if (existing.rows.length > 0) {
    console.log("seed: data already present — skipping");
    await client.end();
    return;
  }

  const clerk = await provisionClerkDemo();

  const org = await client.query(
    "insert into organizations (clerk_org_id, name, plan) values ($1, $2, $3) returning id",
    [clerk?.org?.id ?? null, "Acme Capital", "pro"]
  );
  const orgId = org.rows[0].id;

  const demoClerkId = clerk?.user?.id ?? null;
  const members = [
    ["demo@sirius.dev", "Aarav Mehta", "Founder & CTO", "owner", true, true, demoClerkId, "+91 90000 00001"],
    ["priya@acme.io", "Priya Sharma", "Platform Lead", "admin", true, false, null, "+91 90000 00002"],
    ["alex@acme.io", "Alex Rivera", "Security Analyst", "analyst", true, true, null, "+91 90000 00003"],
    ["sam@acme.io", "Sam Iyer", "Backend Developer", "member", false, false, null, "+91 90000 00004"],
    ["morgan@acme.io", "Morgan Cole", "Compliance Observer", "viewer", false, false, null, "+91 90000 00005"],
  ];
  for (const [email, name, title, role, mfa, onCall, clerkId, phone] of members) {
    await client.query(
      "insert into users (org_id, clerk_user_id, email, name, title, role, mfa, on_call, phone, joined_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - ($10 || ' days')::interval)",
      [orgId, clerkId, email, name, title, role, mfa, onCall, phone, Math.floor(Math.random() * 200) + 30]
    );
  }
  console.log(`seed: 5 team members (clerk demo: ${demoClerkId ? "linked" : "pending"})`);

  await client.query(
    "insert into api_keys (org_id, name, prefix, scopes, created_by, expires_at) values ($1,$2,$3,$4,$5, now() + interval '365 days'), ($1,$6,$7,$8,$9, now() + interval '90 days')",
    [orgId, "Demo console key", process.env.DEMO_API_KEY ?? "sirius_demo_key", ["scans:read", "scans:write", "findings:read", "findings:write", "reports:read"], "Aarav Mehta", "CI pipeline", "sir_ci_key", ["scans:read", "findings:read", "reports:read"], "Priya Sharma"]
  );

  const project = await client.query(
    "insert into projects (org_id, name, repo_url) values ($1, $2, $3) returning id",
    [orgId, "fintech-core", "https://github.com/acme/fintech-core"]
  );
  const projectId = project.rows[0].id;

  await client.query(
    "insert into policies (org_id, name, description, severity_floor, fail_on_severity, max_new_findings, require_no_verified_secrets, min_compliance_score) values ($1,$2,$3,$4,$5,$6,$7,$8), ($1,$9,$10,$11,$12,$13,$14,$15)",
    [orgId, "Default gate", "Fail the build on high or critical findings", "high", "high", 0, true, 80, "Relaxed", "Warn on medium, fail on verified secrets only", "medium", "critical", 10, true, 60]
  );

  const rules = [
    ["SIR-SEC-001", "secrets", "critical", ["python", "javascript", "go"], "Hardcoded payment-provider secret key detected.", { pci_dss: ["8.6.2"], rbi_dpsc: ["card-payment-security"], dpdp: ["8"] }, ["CWE-798"], "env_lookup"],
    ["SIR-SEC-002", "secrets", "high", ["python", "javascript", "go"], "High-entropy string in source or config.", { pci_dss: ["8.6.2"], dpdp: ["8"] }, ["CWE-798"], "env_lookup"],
    ["SIR-SEC-010", "injection", "critical", ["python", "javascript"], "SQL query built via string concatenation or f-string.", { pci_dss: ["6.2.4"], rbi_dpsc: ["card-payment-security"] }, ["CWE-89"], "parameterize_query"],
    ["SIR-SEC-011", "injection", "critical", ["python"], "OS command executed with user-controlled input (shell=True).", { pci_dss: ["6.2.4"] }, ["CWE-78"], "sanitize_input"],
    ["SIR-SEC-020", "auth", "high", ["python", "javascript"], "Route handling money data is missing an auth decorator.", { pci_dss: ["8.4.2"], rbi_dpsc: ["2fa-mandate"] }, ["CWE-306"], "add_auth_decorator"],
    ["SIR-SEC-021", "auth", "critical", ["python"], "JWT verified with verify=False or alg=none.", { pci_dss: ["8.4.2", "8.3.1"] }, ["CWE-347"], "enforce_jwt_verify"],
    ["SIR-SEC-030", "pii", "high", ["python", "javascript"], "PAN / Aadhaar / PII written to logs.", { pci_dss: ["3.4.1"], dpdp: ["8"], gdpr: ["Art.5"] }, ["CWE-532"], "redact_pii_log"],
    ["SIR-SEC-031", "pii", "critical", ["python"], "Full PAN stored unmasked in a database model.", { pci_dss: ["3.5.1", "3.4.1"], rbi_dpsc: ["tokenization"] }, ["CWE-312"], "tokenize_pan"],
    ["SIR-SEC-040", "crypto", "high", ["python", "javascript", "go"], "Weak hash (MD5/SHA1), ECB mode or static IV.", { pci_dss: ["6.2.4", "3.6.1"] }, ["CWE-327"], "upgrade_crypto"],
    ["SIR-SEC-041", "crypto", "high", ["python", "javascript"], "Cardholder data sent over plain HTTP.", { pci_dss: ["4.2.1"] }, ["CWE-319"], "enforce_tls"],
    ["SIR-SEC-050", "ratelimit", "medium", ["python", "javascript"], "Money endpoint has no rate limit.", { pci_dss: ["6.2.4"] }, ["CWE-770"], "add_rate_limit"],
    ["SIR-SEC-051", "ratelimit", "medium", ["python", "javascript"], "Money POST without an idempotency key.", {}, ["CWE-837"], "add_idempotency_key"],
    ["SIR-SEC-060", "supplychain", "high", ["python", "javascript", "go"], "Dependency with install script or obfuscation detected.", { pci_dss: ["6.3.2"] }, ["CWE-1104"], "pin_or_remove_dep"],
  ];
  for (const [id, cat, sev, langs, msg, comp, cwe, fix] of rules) {
    await client.query(
      "insert into rules (id, category, severity, languages, message, compliance, cwe, fix_action) values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing",
      [id, cat, sev, langs, msg, JSON.stringify(comp), cwe, fix]
    );
  }
  console.log("seed: 13 rules catalogued");

  const scan1 = await client.query(
    "insert into scans (org_id, project_id, status, source, target, trigger, initiated_by, compliance_score, money_at_risk_inr, counts, exit_code, total_files, findings_count, started_at, finished_at, created_at) values ($1,$2,'completed','git','refs/heads/main','manual','Aarav Mehta',72.50,$3,$4,1,128,12, now() - interval '3 hours', now() - interval '3 hours' + interval '48 seconds', now() - interval '3 hours') returning id",
    [orgId, projectId, 23250000, JSON.stringify({ critical: 5, high: 4, medium: 2, low: 1, info: 0 })]
  );
  const scanId1 = scan1.rows[0].id;

  const scan2 = await client.query(
    "insert into scans (org_id, project_id, status, source, target, trigger, initiated_by, compliance_score, money_at_risk_inr, counts, exit_code, total_files, findings_count, started_at, finished_at, created_at) values ($1,$2,'completed','inline','.','ci','github-action',91.20,$3,$4,0,128,4, now() - interval '26 hours', now() - interval '26 hours' + interval '21 seconds', now() - interval '26 hours') returning id",
    [orgId, projectId, 4600000, JSON.stringify({ critical: 1, high: 1, medium: 1, low: 1, info: 0 })]
  );

  await client.query(
    "insert into scans (org_id, project_id, status, source, target, trigger, initiated_by, total_files, findings_count, started_at, created_at) values ($1,$2,'running','git','refs/pull/42/head','manual','Priya Sharma',128,0, now() - interval '4 minutes', now() - interval '4 minutes')"
  );

  const findings1 = [
    ["src/config.py", 14, 14, "critical", "SIR-SEC-001", "secrets", ["PCI-DSS:8.6.2", "RBI-DPSC", "DPDP:8"], "Hardcoded Stripe secret key — VERIFIED LIVE", "sk_live_••••••••••••42f9", "verified_live", 4200000, "env_lookup"],
    ["src/ledger.py", 88, 92, "critical", "SIR-SEC-010", "injection", ["PCI-DSS:6.2.4"], "SQL query built via f-string interpolation", 'cur.execute(f"SELECT * FROM ledger WHERE id = {tx_id}")', null, 6500000, "parameterize_query"],
    ["src/injection.py", 12, 12, "critical", "SIR-SEC-011", "injection", ["PCI-DSS:6.2.4"], "OS command executed with user-controlled input", 'subprocess.run(cmd, shell=True)', null, 3200000, "sanitize_input"],
    ["src/auth.py", 41, 44, "critical", "SIR-SEC-021", "auth", ["PCI-DSS:8.4.2"], "JWT decoded with verify=False", "jwt.decode(token, verify=False)", null, 2400000, "enforce_jwt_verify"],
    ["src/ledger.py", 132, 140, "critical", "SIR-SEC-031", "pii", ["PCI-DSS:3.5.1"], "Full PAN stored unmasked in DB model", "pan = db.Column(db.String(19))", null, 1850000, "tokenize_pan"],
    ["src/webhooks.py", 23, 25, "high", "SIR-SEC-020", "auth", ["PCI-DSS:8.4.2"], "Money route missing auth decorator", "@app.route('/payout')", null, 900000, "add_auth_decorator"],
    ["src/payments.js", 67, 70, "high", "SIR-SEC-030", "pii", ["PCI-DSS:3.4.1"], "PAN written to application log", "console.log('card', pan)", null, 1100000, "redact_pii_log"],
    ["src/crypto.py", 19, 22, "high", "SIR-SEC-040", "crypto", ["PCI-DSS:6.2.4", "PCI-DSS:3.6.1"], "MD5 used for cardholder data digest", "hashlib.md5(pan.encode())", null, 800000, "upgrade_crypto"],
    ["src/webhooks.py", 95, 98, "high", "SIR-SEC-041", "crypto", ["PCI-DSS:4.2.1"], "Card data posted over plain HTTP", "axios.post('http://internal/settle', card)", null, 600000, "enforce_tls"],
    ["package.json", 12, 12, "high", "SIR-SEC-060", "supplychain", ["PCI-DSS:6.3.2"], "Dependency with obfuscated install script", '"node-vortex-kit": "^2.1.0"', null, 700000, "pin_or_remove_dep"],
    ["src/money.py", 210, 212, "medium", "SIR-SEC-050", "ratelimit", ["PCI-DSS:6.2.4"], "Money endpoint has no rate limit", "@app.route('/transfer')", null, 250000, "add_rate_limit"],
    ["src/payments.js", 143, 146, "medium", "SIR-SEC-051", "ratelimit", [], "Money POST without idempotency key", "await pay(amount, to)", null, 150000, "add_idempotency_key"],
  ];
  const inserted = [];
  for (const [file, line, endLine, sev, rule, cat, comp, msg, snippet, validity, money, fix] of findings1) {
    const r = await client.query(
      "insert into findings (org_id, scan_id, file, line, end_line, severity, rule_id, category, compliance_ref, message, snippet, fingerprint, validity, money_at_risk_inr, fix_action, detected_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now() - interval '3 hours') returning id",
      [orgId, scanId1, file, line, endLine, sev, rule, cat, JSON.stringify(comp), msg, snippet, `${rule}:${file}:${line}`, validity, money, fix]
    );
    inserted.push(r.rows[0].id);
  }

  const scanId2 = scan2.rows[0].id;
  await client.query(
    "insert into findings (org_id, scan_id, file, line, end_line, severity, rule_id, category, compliance_ref, message, snippet, fingerprint, validity, money_at_risk_inr, fix_action, detected_at) values ($1,$2,'src/config.py',14,14,'critical','SIR-SEC-001','secrets',$3,'Hardcoded Stripe secret key — VERIFIED LIVE','sk_live_••••••••••••42f9','SIR-SEC-001:src/config.py:14','verified_live',4200000,'env_lookup', now() - interval '26 hours'), ($1,$2,'src/ledger.py',88,92,'high','SIR-SEC-010','injection',$4,'SQL query built via f-string interpolation','cur.execute(f\"...\")','SIR-SEC-010:src/ledger.py:88',null,400000,'parameterize_query', now() - interval '26 hours')",
    [orgId, scanId2, JSON.stringify(["PCI-DSS:8.6.2"]), JSON.stringify(["PCI-DSS:6.2.4"])]
  );

  const fix = await client.query("select id from findings where rule_id = 'SIR-SEC-001' and scan_id = $1 limit 1", [scanId1]);
  if (fix.rows[0]) {
    await client.query(
      "insert into fix_suggestions (finding_id, action, diff, verifier_status, accepted) values ($1, 'env_lookup', $2, 'pass', false)",
      [fix.rows[0].id, "--- a/src/config.py\n+++ b/src/config.py\n@@ -14 +14 @@\n-STRIPE_KEY = \"sk_live_••••\" \n+STRIPE_KEY = os.environ[\"STRIPE_KEY\"]"]
    );
  }
  console.log("seed: 14 findings, 1 verified fix suggestion");

  await client.query(
    "insert into call_alerts (org_id, title, severity, recipient, phone, policy, status, triggered_at, acknowledged_at, finding_id, transcript, duration_sec) values ($1,$2,'critical',$3,$4,$5,'resolved', now() - interval '2 hours', now() - interval '2 hours' + interval '42 seconds', $6, $7, 74), ($1,$8,'high',$9,$10,$11,'acknowledged', now() - interval '30 minutes', now() - interval '28 minutes', null, $12, 51)",
    [
      orgId,
      "Sev-1 · Hardcoded live provider key on money-mover",
      "Alex Rivera (on-call lead)",
      "+91 90000 00003",
      "Critical finding on money-mover asset → call on-call lead",
      inserted[0],
      ["SIRIUS: Sirius alert. Verified live provider key in fintech-core.", "SIRIUS: ₹42,00,000 at risk. PCI-DSS 8.6.2.", "SIRIUS: Press one to acknowledge.", "Alex: acknowledged."],
      "Sev-2 · SQL injection pattern in ledger service",
      "Aarav Mehta (on-call)",
      "+91 90000 00001",
      "High finding → call service owner",
      ["SIRIUS: Sirius alert. SQL injection pattern detected.", "SIRIUS: Press one to acknowledge.", "Aarav: acknowledged."],
    ]
  );

  const integrations = [
    ["Slack", "messaging", "Triage actions and daily digests to #security", true, 412],
    ["GitHub", "code", "PR annotations, Security-tab SARIF, CI gating", true, 1284],
    ["PagerDuty", "alerting", "Escalation when voice calls go unanswered", true, 26],
    ["Jira", "tickets", "Auto-create remediation tickets per finding", false, 0],
    ["Twilio Voice", "voice", "The voice in sirius voice-call alerts", true, 58],
  ];
  for (const [name, cat, desc, connected, events] of integrations) {
    await client.query("insert into integrations (org_id, name, category, description, connected, events) values ($1,$2,$3,$4,$5,$6)", [orgId, name, cat, desc, connected, events]);
  }

  const audits = [
    ["Aarav Mehta", "scan.started", "fintech-core · full scan", "trigger=manual"],
    ["sirius", "finding.emitted", "SIR-SEC-001 · src/config.py:14", "validity=verified_live"],
    ["sirius", "alert.triggered", "Voice call → +91 90000 00003", "voice"],
    ["Alex Rivera", "alert.acknowledged", "Sev-1 call alert", "42s"],
    ["Priya Sharma", "scan.started", "fintech-core · targeted scan", "trigger=manual"],
  ];
  for (const [actor, action, target, meta] of audits) {
    await client.query("insert into audit_log (org_id, actor, action, target, meta) values ($1,$2,$3,$4,$5)", [orgId, actor, action, target, meta]);
  }

  const notifs = [
    ["Verified live secret detected", "SIR-SEC-001 · src/config.py:14 · ₹42,00,000 at risk", "alert", false],
    ["Scan completed", "fintech-core · score 72.5 · 12 findings", "scan", true],
    ["Alex acknowledged the Sev-1 call", "Voice escalation resolved in 42s", "team", true],
  ];
  for (const [title, body, kind, read] of notifs) {
    await client.query("insert into notifications (org_id, title, body, kind, read) values ($1,$2,$3,$4,$5)", [orgId, title, body, kind, read]);
  }

  const paths = [
    ["Public payout → unauthed ledger write", 0.86, 6500000, ["T1190", "T1505"], false],
    ["Webhook SSRF → cloud metadata → key theft", 0.64, 4200000, ["T1552", "T1618"], false],
    ["Dependency install script → CI secret exfil", 0.31, 1800000, ["T1195", "T1078"], true],
  ];
  for (const [name, prob, impact, tech, blocked] of paths) {
    await client.query("insert into attack_paths (org_id, name, node_ids, probability, impact_usd, techniques, blocked) values ($1,$2,$3,$4,$5,$6,$7)", [orgId, name, ["internet", "edge", "app", "data"], prob, impact, tech, blocked]);
  }

  const assets = [
    ["payments-api", "service", 5, "public"],
    ["ledger-core", "service", 5, "internal"],
    ["auth-gateway", "service", 4, "public"],
    ["card-vault", "datastore", 5, "internal"],
    ["webhook-relay", "service", 3, "public"],
    ["ci-pipeline", "pipeline", 4, "internal"],
  ];
  for (const [name, kind, crit, exposure] of assets) {
    await client.query("insert into assets (org_id, name, kind, criticality, exposure) values ($1,$2,$3,$4,$5)", [orgId, name, kind, crit, exposure]);
  }

  await client.query(
    "insert into suppressions (org_id, rule_id, reason, expires_at, created_by) values ($1, 'SIR-SEC-051', 'Accepted risk until idempotency middleware lands (Q3)', now() + interval '45 days', 'Aarav Mehta')",
    [orgId]
  );

  await client.query(
    "insert into sbom_components (scan_id, purl, version, risk_score, behaviors) values ($1,'pkg:npm/node-vortex-kit@2.1.0','2.1.0',8.4,$2), ($1,'pkg:pypi/stripe@7.8.0','7.8.0',1.2,$3)",
    [scanId1, JSON.stringify(["install_script", "obfuscation"]), JSON.stringify(["network"])]
  );

  console.log("seed: alerts, audit, notifications, paths, assets, integrations, sbom done");
  console.log("\ndemo login (clerk):");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log("demo api key: Bearer " + (process.env.DEMO_API_KEY ?? "sirius_demo_key"));

  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await client.end(); } catch {}
  process.exit(1);
});
