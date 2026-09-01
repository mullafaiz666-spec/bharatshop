#!/usr/bin/env node

const BASE_URL = String(process.env.BHARATSHOP_URL || process.env.BASE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");
const AUTOMATION_TOKEN = process.env.BHARATSHOP_AUTOMATION_TOKEN || "";
const RUN_IMAGE_RESOLVER = process.env.RUN_IMAGE_RESOLVER !== "false";
const RUN_CEO = process.env.RUN_CEO !== "false";
const gates = [];
function gate(name, ok, detail) { gates.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`); }
async function request(path, options = {}) { const response = await fetch(`${BASE_URL}${path}`, { ...options, signal: AbortSignal.timeout(30000) }); const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; } return { response, data }; }
function imageStats(data) {
  const rows = Array.isArray(data?.products) ? data.products : [];
  const counts = rows.map(p => Array.isArray(p.imageUrls) ? p.imageUrls.filter(Boolean).map(String).filter(u => /^https:\/\//i.test(u)).length : 0);
  const urls = rows.flatMap(p => Array.isArray(p.imageUrls) ? p.imageUrls : []).filter(Boolean).map(String);
  return { rows, counts, urls, https: urls.filter(u => /^https:\/\//i.test(u)) };
}
function allProductsHaveFourImages(stats) { return stats.rows.length > 0 && stats.counts.every(n => n >= 4); }

async function main() {
  console.log(`Production acceptance target: ${BASE_URL}`);
  try {
    const health = await request("/api/health");
    gate("Render", health.response.status === 200 && health.data?.ok === true, `HTTP ${health.response.status}, ok=${health.data?.ok}`);
    gate("PostgreSQL", health.response.status === 200 && health.data?.readiness?.postgres?.ready === true, `ready=${health.data?.readiness?.postgres?.ready ?? false}`);
    gate("OpenAI", health.response.status === 200 && health.data?.readiness?.openai?.configured === true && health.data?.readiness?.openai?.ready === true, `configured=${health.data?.readiness?.openai?.configured ?? false}, ready=${health.data?.readiness?.openai?.ready ?? false}, status=${health.data?.readiness?.openai?.status ?? "?"}`);
    gate("Anthropic", health.response.status === 200 && health.data?.readiness?.anthropic?.configured === true && health.data?.readiness?.anthropic?.ready === true, `configured=${health.data?.readiness?.anthropic?.configured ?? false}, ready=${health.data?.readiness?.anthropic?.ready ?? false}, status=${health.data?.readiness?.anthropic?.status ?? "?"}`);
  } catch (error) { gate("Render", false, error.message); gate("PostgreSQL", false, "health unavailable"); gate("OpenAI", false, "health unavailable"); gate("Anthropic", false, "health unavailable"); process.exit(2); }

  try {
    const products = await request("/api/storefront/products?limit=24"); const stats = imageStats(products.data);
    gate("Catalog", products.response.status === 200 && stats.rows.length > 0 && stats.rows.every(p => Number.isInteger(Number(p.id)) && p.title && p.sku), `HTTP ${products.response.status}, returned=${stats.rows.length}, total=${products.data?.total ?? "?"}`);
    gate("Storefront", products.response.status === 200 && stats.rows.length > 0 && allProductsHaveFourImages(stats), `HTTP ${products.response.status}, products=${stats.rows.length}, minImages=${stats.counts.length ? Math.min(...stats.counts) : 0}`);
    gate("Images", products.response.status === 200 && allProductsHaveFourImages(stats) && stats.https.length === stats.urls.length, `products=${stats.rows.length}, images=${stats.urls.length}, minPerProduct=${stats.counts.length ? Math.min(...stats.counts) : 0}, https=${stats.https.length}`);
  } catch (error) { gate("Catalog", false, error.message); gate("Storefront", false, "product endpoint unavailable"); gate("Images", false, "product endpoint unavailable"); }

  if (RUN_IMAGE_RESOLVER) {
    if (!AUTOMATION_TOKEN) gate("Image Resolver", false, "RUN_IMAGE_RESOLVER=true but BHARATSHOP_AUTOMATION_TOKEN is missing");
    else {
      try {
        const resolved = await request("/api/catalog/image-resolve", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${AUTOMATION_TOKEN}` }, body: JSON.stringify({ limit: 10 }) });
        const results = Array.isArray(resolved.data?.results) ? resolved.data.results : [];
        const success = resolved.response.status === 200 && resolved.data?.status === "COMPLETED" && results.length > 0 && results.every(r => ["COMPLETE_MEDIA_RESOLVED", "NEEDS_IMAGES"].includes(String(r.status)));
        const resolvedCount = results.filter(r => r.status === "COMPLETE_MEDIA_RESOLVED" && Number(r.imageCount || 0) >= 4).length;
        gate("Image Resolver", success && resolvedCount > 0, `HTTP ${resolved.response.status}, processed=${results.length}, complete>=4=${resolvedCount}, first=${results[0]?.status ?? "?"}, error=${results.find(r => r.error)?.error ?? "none"}`);
        const after = await request("/api/storefront/products?limit=24"); const afterStats = imageStats(after.data);
        gate("Publication Gate", after.response.status === 200 && allProductsHaveFourImages(afterStats), `HTTP ${after.response.status}, published=${afterStats.rows.length}, minVerifiedImages=${afterStats.counts.length ? Math.min(...afterStats.counts) : 0}`);
        gate("Images after Resolver", after.response.status === 200 && allProductsHaveFourImages(afterStats) && afterStats.https.length === afterStats.urls.length, `HTTP ${after.response.status}, products=${afterStats.rows.length}, images=${afterStats.urls.length}, minPerProduct=${afterStats.counts.length ? Math.min(...afterStats.counts) : 0}`);
      } catch (error) { gate("Image Resolver", false, error.message); gate("Publication Gate", false, "resolver verification did not complete"); gate("Images after Resolver", false, "resolver verification did not complete"); }
    }
  } else { gate("Image Resolver", false, "RUN_IMAGE_RESOLVER=false — live resolver execution is required for acceptance"); gate("Publication Gate", false, "live resolver execution skipped"); gate("Images after Resolver", false, "live resolver execution skipped"); }

  if (RUN_CEO) {
    try {
      const ceo = await request("/api/ceo-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Inspect the live business data and tell me whether the catalogue is healthy. Use a permitted tool to verify the current state before answering.", context: { selectedAgent: "AI CEO" } }) });
      const trace = Array.isArray(ceo.data?.toolExecutions) ? ceo.data.toolExecutions : [];
      const live = ceo.response.status === 200 && ceo.data?.mode === "ai-agent-live" && Boolean(ceo.data?.reply);
      gate("CEO", live, `HTTP ${ceo.response.status}, mode=${ceo.data?.mode ?? "?"}, replyLength=${String(ceo.data?.reply || "").trim().length}, providerPath=${ceo.data?.providerPath ?? "responses"}`);
      gate("Agent", live && trace.length > 0 && trace.every(x => x.tool), `toolExecutions=${trace.length}`);
      gate("Tool", live && trace.length > 0 && trace.every(x => x.result !== undefined), `executed=${trace.length}`);
      gate("Evidence", live && trace.length > 0 && trace.every(x => x.auditId), `evidence/audit references=${trace.filter(x => x.auditId).length}/${trace.length}`);
      gate("Natural CEO Response", live && typeof ceo.data?.reply === "string" && ceo.data.reply.trim().length > 0, `replyLength=${String(ceo.data?.reply || "").trim().length}`);
      const audit = await request("/api/agent-audit"); const records = Array.isArray(audit.data?.records) ? audit.data.records : [];
      const decision = records.find(r => r.event_type === "CEO_DECISION");
      gate("Audit", audit.response.status === 200 && records.length > 0 && records.some(r => r.event_type === "TOOL_EXECUTION"), `HTTP ${audit.response.status}, records=${records.length}, toolAudit=${records.filter(r => r.event_type === "TOOL_EXECUTION").length}`);
      gate("Decision", audit.response.status === 200 && Boolean(decision) && Boolean(decision.evidence_id), `CEO_DECISION=${Boolean(decision)}, evidence_id=${decision?.evidence_id ?? "missing"}`);
    } catch (error) { gate("CEO", false, error.message); gate("Agent", false, "CEO request did not complete"); gate("Tool", false, "CEO request did not complete"); gate("Evidence", false, "CEO request did not complete"); gate("Audit", false, "CEO request did not complete"); gate("Decision", false, "CEO request did not complete"); gate("Natural CEO Response", false, "CEO request did not complete"); }
  } else { gate("CEO", false, "RUN_CEO=false"); gate("Agent", false, "RUN_CEO=false"); gate("Tool", false, "RUN_CEO=false"); gate("Evidence", false, "RUN_CEO=false"); gate("Audit", false, "RUN_CEO=false"); gate("Decision", false, "RUN_CEO=false"); gate("Natural CEO Response", false, "RUN_CEO=false"); }

  // Negative approval test: a direct consequential execution without an approved
  // approval record must be blocked before any downstream action runs.
  try {
    const blocked = await request("/api/agent-execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionType: "IMAGE_RESOLVE", payload: { limit: 1 }, agentName: "Production Acceptance" }) });
    gate("Approval Enforcement", blocked.response.status === 403 && blocked.data?.code === "APPROVAL_REQUIRED", `HTTP ${blocked.response.status}, code=${blocked.data?.code ?? "?"}`);
  } catch (error) { gate("Approval Enforcement", false, error.message); }

  let approvalId = null;
  try {
    const title = `Acceptance IMAGE_RESOLVE ${Date.now()}`;
    const approvalRequest = await request("/api/ceo-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: `Create a LOW-risk human approval request titled "${title}" to execute IMAGE_RESOLVE with payload {"limit":1}. This is an acceptance test and must not execute the action yourself. Explain that approval will be requested before execution.`, context: { selectedAgent: "AI CEO" } }) });
    const approvals = await request("/api/ceo-approvals"); const rows = Array.isArray(approvals.data?.approvals) ? approvals.data.approvals : []; const pending = rows.find(x => x.title === title && x.status === "PENDING" && String(x.action_type).toUpperCase() === "IMAGE_RESOLVE"); approvalId = pending?.id ?? null;
    gate("Approval", approvalRequest.response.status === 200 && Boolean(approvalId), `HTTP ${approvalRequest.response.status}, approvalId=${approvalId ?? "missing"}`);
    if (approvalId) {
      const approved = await request("/api/ceo-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", id: approvalId, note: "Production acceptance: approved low-risk IMAGE_RESOLVE execution." }) });
      const executionOk = approved.response.status === 200 && approved.data?.execution === "EXECUTED" && approved.data?.approval?.status === "EXECUTED";
      gate("Action", executionOk, `HTTP ${approved.response.status}, execution=${approved.data?.execution ?? "?"}, status=${approved.data?.approval?.status ?? "?"}`);
      const auditAfter = await request("/api/agent-audit"); const auditRows = Array.isArray(auditAfter.data?.records) ? auditAfter.data.records : []; const actionSuccess = auditRows.some(r => r.event_type === "APPROVAL_EXECUTION_RESULT" && Number(r.approval_id) === Number(approvalId) && r.status === "SUCCESS"); const actionAudit = auditRows.some(r => r.event_type === "ACTION_EXECUTION" && Number(r.approval_id) === Number(approvalId) && r.status === "SUCCESS");
      gate("Verified Result", executionOk && actionSuccess && actionAudit, `approvalId=${approvalId}, approvalResultPersisted=${actionSuccess}, actionExecutionPersisted=${actionAudit}`);
    } else { gate("Action", false, "No pending acceptance approval was created"); gate("Verified Result", false, "No approved action executed"); }
  } catch (error) { gate("Approval", false, error.message); gate("Action", false, "Approval flow did not complete"); gate("Verified Result", false, "Approval flow did not complete"); }

  const failed = gates.filter(g => !g.ok); console.log(`\nAcceptance result: ${failed.length ? "BLOCKED" : "PASS"}`); if (failed.length) { for (const item of failed) console.log(`- ${item.name}: ${item.detail}`); process.exit(1); }
}
main().catch(error => { console.error(error); process.exit(1); });
