import pg from "pg";

const c = new pg.Client({
  connectionString: (process.env.DATABASE_URL ?? "").replace("channel_binding=require", ""),
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const show = async (label, sql) => {
  const r = await c.query(sql);
  console.log(`\n== ${label} ==`);
  for (const row of r.rows) console.log(JSON.stringify(row));
};
await show("tenants", "select * from tenants");
await show("users", "select id, tenant_id, email, name, role, clerk_user_id, on_call, status from users");
await show("projects", "select * from projects");
await show("api_keys", "select id, project_id, name, prefix, scopes, expires_at, created_by from api_keys");
await show("scans (last 3)", "select id, project_id, status, source, trigger, compliance_score, money_at_risk_inr, exit_code, created_by, created_at from scans order by created_at desc limit 3");
await show("findings (2)", "select id, scan_id, file, line, severity, rule_id, category, compliance_ref, message, validity, money_at_risk_inr, triage_state, fix_action from findings order by created_at desc limit 2");
await show("reports (2)", "select id, scan_id, format, signed_at from reports order by created_at desc limit 2");
await show("policy", "select * from policies");
await c.end();
