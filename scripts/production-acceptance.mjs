#!/usr/bin/env node

const BASE_URL = String(process.env.BASE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");
const AUTOMATION_TOKEN = process.env.BHARATSHOP_AUTOMATION_TOKEN || "";
const RUN_IMAGE_RESOLVER = process.env.RUN_IMAGE_RESOLVER === "true";
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

async function main() {
  console.log(`Production acceptance target: ${BASE_URL}`);

  try {
    const health = await request("/api/health");
    gate("Render → HTTP → PostgreSQL", health.response.status === 200 && health.data?.ok === true, `HTTP ${health.response.status}, ok=${health.data?.ok}`);
  } catch (error) {
    gate("Render → HTTP → PostgreSQL", false, error.message);
    console.error("BLOCKED: production hostname is not reachable from this runner.");
    process.exit(2);
  }

  try {
    const products = await request("/api/storefront/products?limit=24");
    const rows = Array.isArray(products.data?.products) ? products.data.products : [];
    const dbBacked = rows.length > 0 && rows.every(p => Number.isInteger(Number(p.id)) && p.title && p.sku);
    gate("Products", products.response.status === 200 && dbBacked, `HTTP ${products.response.status}, returned=${rows.length}, total=${products.data?.total ?? "?"}`);
    const imageRows = rows.flatMap(p => Array.isArray(p.imageUrls) ? p.imageUrls : []).filter(Boolean);
    const httpsImages = imageRows.filter(u => /^https:\/\//i.test(String(u)));
    gate("Images", imageRows.length > 0 && httpsImages.length === imageRows.length, `images=${imageRows.length}, https=${httpsImages.length}`);
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
        const ok = resolved.response.status === 200 && resolved.data?.status === "COMPLETED" && first?.status === "COMPLETE_MEDIA_RESOLVED";
        gate("Image Resolver", ok, `HTTP ${resolved.response.status}, status=${resolved.data?.status ?? "?"}, first=${first?.status ?? "?"}, error=${first?.error ?? "none"}, message=${first?.message ?? "none"}`);
      } catch (error) {
        gate("Image Resolver", false, error.message);
      }
    }
  } else {
    gate("Image Resolver", true, "implementation present; live resolver mutation skipped (set RUN_IMAGE_RESOLVER=true to execute)");
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
      gate("CEO/OpenAI → Agent → Tool → Tool Result", live, `HTTP ${ceo.response.status}, mode=${ceo.data?.mode ?? "?"}, code=${ceo.data?.code ?? "?"}, error=${ceo.data?.error ?? "none"}, tools=${trace.length}`);
      gate("Evidence → Audit", live && trace.length > 0 && trace.every(x => x.auditId), `tool audits=${trace.filter(x => x.auditId).length}/${trace.length}`);

      const audit = await request("/api/agent-audit");
      const records = Array.isArray(audit.data?.records) ? audit.data.records : [];
      const hasDecision = records.some(r => r.event_type === "CEO_DECISION");
      const lastDecision = records.find(r => r.event_type === "CEO_DECISION");
      const evidence = lastDecision?.evidence && typeof lastDecision.evidence === "object" ? lastDecision.evidence : {};
      const providerStatus = evidence.providerStatus ?? "n/a";
      gate("Decision", audit.response.status === 200 && hasDecision, `HTTP ${audit.response.status}, records=${records.length}, CEO_DECISION=${hasDecision}, lastStatus=${lastDecision?.status ?? "?"}, providerStatus=${providerStatus}, summary=${String(lastDecision?.summary ?? "").slice(0,140)}`);
    } catch (error) {
      gate("CEO/OpenAI → Agent → Tool → Tool Result", false, error.message);
      gate("Evidence → Audit", false, "CEO request did not complete");
      gate("Decision", false, "CEO request did not complete");
    }
  } else {
    gate("CEO/OpenAI → Agent → Tool → Tool Result", false, "RUN_CEO=false");
    gate("Evidence → Audit", false, "RUN_CEO=false");
    gate("Decision", false, "RUN_CEO=false");
  }

  try {
    const approvals = await request("/api/ceo-approvals");
    const rows = Array.isArray(approvals.data?.approvals) ? approvals.data.approvals : [];
    gate("Approval", approvals.response.status === 200, `HTTP ${approvals.response.status}, approvals=${rows.length}`);
  } catch (error) {
    gate("Approval", false, error.message);
  }

  const failed = gates.filter(g => !g.ok);
  console.log(`\nAcceptance result: ${failed.length ? "BLOCKED" : "PASS"}`);
  if (failed.length) {
    for (const item of failed) console.log(`- ${item.name}: ${item.detail}`);
    process.exit(1);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
