import { NextResponse } from "next/server";
import { cashfreeCredentials, gatewayMode } from "@/lib/payments/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function automationToken() {
  return process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || process.env.CRON_SECRET || "";
}

function authorized(req: Request) {
  const expected = automationToken();
  if (!expected) return false;
  return req.headers.get("authorization") === `Bearer ${expected}` || req.headers.get("x-automation-token") === expected;
}

async function probeRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const configured = Boolean(keyId && keySecret);
  const keyMode = keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown";
  if (!configured) return { configured, authenticated: false, httpStatus: null, keyMode, webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) };
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return {
      configured,
      authenticated: response.ok,
      httpStatus: response.status,
      keyMode,
      webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    };
  } catch {
    return { configured, authenticated: false, httpStatus: null, keyMode, webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) };
  }
}

async function probeCashfreeEnvironment(mode: "live" | "test", clientId: string, clientSecret: string) {
  const base = mode === "live" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
  const diagnosticOrderId = `BS_DIAGNOSTIC_${Date.now()}`;
  try {
    const response = await fetch(`${base}/orders/${diagnosticOrderId}`, {
      headers: {
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const authenticated = response.ok || [400, 404, 409, 422].includes(response.status);
    return { mode, authenticated, httpStatus: response.status };
  } catch {
    return { mode, authenticated: false, httpStatus: null };
  }
}

async function probeCashfree() {
  const { clientId = "", clientSecret = "" } = cashfreeCredentials();
  const configured = Boolean(clientId && clientSecret);
  const selectedMode = gatewayMode();
  if (!configured) return { configured, authenticated: false, selectedMode, detectedMode: null, httpStatus: null, webhookConfigured: false };
  const selected = await probeCashfreeEnvironment(selectedMode, clientId, clientSecret);
  if (selected.authenticated) {
    return { configured, authenticated: true, selectedMode, detectedMode: selectedMode, httpStatus: selected.httpStatus, webhookConfigured: true };
  }
  const alternateMode = selectedMode === "live" ? "test" : "live";
  const alternate = await probeCashfreeEnvironment(alternateMode, clientId, clientSecret);
  return {
    configured,
    authenticated: alternate.authenticated,
    selectedMode,
    detectedMode: alternate.authenticated ? alternateMode : null,
    httpStatus: alternate.authenticated ? alternate.httpStatus : selected.httpStatus,
    webhookConfigured: true,
    modeMismatch: alternate.authenticated,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [razorpay, cashfree] = await Promise.all([probeRazorpay(), probeCashfree()]);
  const allAuthenticated = razorpay.authenticated && cashfree.authenticated;
  const selectedModeReady = cashfree.authenticated && cashfree.detectedMode === cashfree.selectedMode;
  return NextResponse.json({
    status: allAuthenticated && selectedModeReady ? "READY" : "ACTION_REQUIRED",
    allAuthenticated,
    selectedModeReady,
    razorpay,
    cashfree,
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
