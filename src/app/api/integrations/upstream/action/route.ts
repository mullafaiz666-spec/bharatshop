import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { UPSTREAM_SPECS, type UpstreamIntegrationId } from "@/lib/integrations/upstream-ai";

export const dynamic = "force-dynamic";

function textEnv(name?: string) {
  return name ? String(process.env[name] || "").trim() : "";
}

function joinUrl(base: string, suffix: string) {
  return `${base.replace(/\/$/, "")}/${suffix.replace(/^\//, "")}`;
}

function specFor(id: string) {
  return UPSTREAM_SPECS.find((item) => item.id === id);
}

async function callService(id: UpstreamIntegrationId, path: string, init: RequestInit = {}) {
  const spec = specFor(id);
  if (!spec || spec.mode !== "external-service") throw new Error("Integration does not expose a service endpoint");
  if (spec.commercialApprovalEnv && !/^(1|true|yes|on)$/i.test(textEnv(spec.commercialApprovalEnv))) {
    throw new Error("Integration is blocked by policy");
  }
  const endpoint = textEnv(spec.endpointEnv);
  if (!endpoint) throw new Error("Integration endpoint is not configured");
  const token = textEnv(spec.tokenEnv);
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(joinUrl(endpoint, path), {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(typeof body === "string" ? body.slice(0, 500) : body?.error || `HTTP ${response.status}`);
  return body;
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const integration = String(body?.integration || "") as UpstreamIntegrationId;
  const action = String(body?.action || "");
  const spec = specFor(integration);
  if (!spec) return NextResponse.json({ error: "Unknown integration" }, { status: 400 });

  try {
    if (action === "open") {
      if (spec.mode !== "external-service") return NextResponse.json({ error: "This integration has no service UI" }, { status: 400 });
      if (spec.commercialApprovalEnv && !/^(1|true|yes|on)$/i.test(textEnv(spec.commercialApprovalEnv))) {
        return NextResponse.json({ error: "Commercial/model rights approval is required before this service can be opened." }, { status: 423 });
      }
      const endpoint = textEnv(spec.endpointEnv);
      if (!endpoint) return NextResponse.json({ error: "Service endpoint is not configured" }, { status: 409 });
      return NextResponse.json({ ok: true, url: endpoint });
    }

    if (integration === "remotion" && action === "render-product-ad") {
      const result = await callService("remotion", "/render", {
        method: "POST",
        body: JSON.stringify({
          title: String(body?.payload?.title || "BharatShop AI Drop"),
          subtitle: String(body?.payload?.subtitle || "Streetwear trend creative generated from the AI command centre"),
          cta: String(body?.payload?.cta || "Shop the drop"),
          imageUrl: String(body?.payload?.imageUrl || ""),
          accent: String(body?.payload?.accent || "#f97316"),
        }),
      });
      return NextResponse.json({ ok: true, integration, action, result });
    }

    if (action === "health") {
      const result = await callService(integration, spec.probePath || "/", { method: "GET" });
      return NextResponse.json({ ok: true, integration, action, result });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
