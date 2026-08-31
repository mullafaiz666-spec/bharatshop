#!/usr/bin/env node

const BASE_URL = String(process.env.BASE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");
const AUTOMATION_TOKEN = process.env.BHARATSHOP_AUTOMATION_TOKEN || "";
const RUN_IMAGE_RESOLVER = process.env.RUN_IMAGE_RESOLVER !== "false";
const RUN_CEO = process.env.RUN_CEO !== "false";

const gates = [];
function gate(name, ok, detail) {
  gates.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; }
  return { response, data };
}

function imageStats(data) {
  const rows = Array.isArray(data?.products) ? data.products : [];
  const urls = rows.flatMap(p => Array.isArray(p.imageUrls) ? p.imageUrls : []).filter(Boolean).map(String);
  const https = urls.filter(u => /^https:\/\//i.test(u));
  return { rows, urls, https };
}

async function main() {
  console.log(`Production acceptance target: ${BASE_URL}`);

  try {
    const health = await request("/api/health");
    gate("Render → HTTP → PostgreSQL", health.response.status === 200 && health.data?.ok === true, `HTTP ${health.response.status}, ok=${health.data?.ok}`);
    gate("Provider readiness", health.response.status === 200 && health.data?.providers?.openai === true && health.data?.providers?.anthropic === true, `OpenAI=${health.data?.providers?.openai ?? "?"}, Anthropic=${health.data?.providers?.anthropic ?? "?"}`);
  } catch (error) {
    gate("Render → HTTP → PostgreSQL", false, error.message);
    gate("Provider readiness", false, "health endpoint unavailable");
    console.error("BLOCKED: production hostname is not reachable from this runner.");
    process.exit(2);
  }

  try {
    const products = await request("/api/storefront/products?limit=24");
    const stats = imageStats(products.data);
    const dbBacked = stats.rows.length > 0 && stats.rows.every(p => Number.isInteger(Number(p.id)) && p.title && p.sku);
    gate("Products", products.response.status === 200 && dbBacked, `HTTP ${products.response.status}, returned=${stats.rows.length}, total=${products.data?.total ?? "?"}`);
    gate("Images", stats.urls.length > 0 && stats.https.length === stats.urls.length, `images=${stats.urls.length}, https=${stats.https.length}`);
  } catch (error) {
    gate("Products", false, error.message);
    gate("Images", false, "product endpoint unavailable");
  }

  if (RUN_IMAGE_RESOLVER) {
    if (!AUTOMATION_TOKEN) {
      gate("Image Resolver", false, "RUN_IMAGE_RESOLVER=true but BHARATSHOP_AUTOMATION_TOKEN is missing");
    } else {
      try {
        const resolved = await request("/api/catalog/image-resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTOMATION_TOKEN}` },
          body: JSON.stringify({ limit: 1 }),
        });
        const first = Array.isArray(resolved.data?.results) ? resolved.data.results[0] : null;
        const ok = resolved.response.status === 200 && resolved.data?.status === "COMPLETED" && first?.status === "COMPLETE_MEDIA_RESOLVED" && Number(first?.imageCount || 0) > 0;
        gate("Image Resolver", ok, `HTTP ${resolved.response.status}, status=${resolved.data?.status ?? "?"}, first=${first?.status ?? "?"}, imageCount=${first?.imageCount ?? 0}, error=${first?.error ?? "none"}`);

        const after = await request("/api/storefront/products?limit=24");
        const afterStats = imageStats(after.data);
        gate("Images after Resolver", after.response.status === 200 && afterStats.urls.length > 0 && afterStats.https.length === afterStats.urls.length, `HTTP ${after.response.status}, images=${afterStats.urls.length}, https=${afterStats.https.length}`);
      } catch (error) {
        gate("Image Resolver", false, error.message);
        gate("Images after Resolver", false, "resolver verification did not complete");
      }
    }
  } else {
    gate("Image Resolver", false, "RUN_IMAGE_RESOLVER=false — live resolver execution is required for acceptance");
    gate("Images after Resolver", false, "live resolver execution skipped");
  }

  if (RUN_CEO) {
    try {
      const ceo = await request("/api/ceo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Inspect the live business data and tell me whether the catalogue is healthy.", context: { selectedAgent: "AI CEO" } }),
      });
      const trace = Array.isArray(ceo.data?.toolExecutions) ? ceo.data.toolExecutions : [];
      const live = ceo.response.status === 200 && ceo.data?.mode === "ai-agent-live" && Boolean(ceo.data?.reply);
      gate("CEO/OpenAI → Agent → Tool → Tool Result", live && trace.length > 0, `HTTP ${ceo.response.status}, mode=${ceo.data?.mode ?? "?"}, tools=${trace.length}, error=${ceo.data?.error ?? "none"}`);
      gate("Evidence → Audit", live && trace.length > 0 && trace.every(x => x.auditId), `tool audits=${trace.filter(x => x.auditId).length}/${trace.length}`);
      gate("Natural Response", live && typeof ceo.data?.reply === "string" && ceo.data.reply.trim().length > 0, `replyLength=${String(ceo.data?.reply || "").trim().length}`);

      const audit = await request("/api/agent-audit");
      const records = Array.isArray(audit.data?.records) ? audit.data.records : [];
      const hasDecision = records.some(r => r.event_type === "CEO_DECISION");
      const lastDecision = records.find(r => r.event_type === "CEO_DECISION");
      const evidence = lastDecision?.evidence && typeof lastDecision.evidence === "object" ? lastDecision.evidence : {};
      gate("Decision", audit.response.status === 200 && hasDecision, `HTTP ${audit.response.status}, records=${records.length}, CEO_DECISION=${hasDecision}, lastStatus=${lastDecision?.status ?? "?"}`);
      gate("Persisted evidence reference", Boolean(lastDecision?.evidence_id), `evidence_id=${lastDecision?.evidence_id ?? "missing"}`);
    } catch (error) {
      gate("CEO/OpenAI → Agent → Tool → Tool Result", false, error.message);
      gate("Evidence → Audit", false, "CEO request did not complete");
      gate("Natural Response", false, "CEO request did not complete");
      gate("Decision", false, "CEO request did not complete");
      gate("Persisted evidence reference", false, "CEO request did not complete");
    }
  } else {
    gate("CEO/OpenAI → Agent → Tool → Tool Result", false, "RUN_CEO=false");
    gate("Evidence → Audit", false, "RUN_CEO=false");
    gate("Natural Response", false, "RUN_CEO=false");
    gate("Decision", false, "RUN_CEO=false");
    gate("Persisted evidence reference", false, "RUN_CEO=false");
  }

  try {
    const approvals = await request("/api/ceo-approvals");
    const rows = Array.isArray(approvals.data?.approvals) ? approvals.data.approvals : [];
    gate("Approval", approvals.response.status === 200, `HTTP ${approvals.response.status}, approvals=${rows.length}`);
  } catch (error) {
    gate("Approval", false, error.message);
  }

  // No destructive production action is synthesized by this acceptance runner.
  // Action → Verified Result remains a hard gate until a real, approval-aware
  // action is executed and its resulting state is re-read from production.
  gate("Action → Verified Result", false, "No real approval-aware production action was executed by this acceptance runner");

  const failed = gates.filter(g => !g.ok);
  console.log(`\nAcceptance result: ${failed.length ? "BLOCKED" : "PASS"}`);
  if (failed.length) {
    for (const item of failed) console.log(`- ${item.name}: ${item.detail}`);
    process.exit(1);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
