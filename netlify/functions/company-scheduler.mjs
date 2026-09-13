const resolveOrigin = () => String(
  process.env.BHARATSHOP_PUBLIC_ORIGIN ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  ""
).replace(/\/+$/, "");

export default async () => {
  const origin = resolveOrigin();
  const token = String(process.env.BHARATSHOP_AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN || "").trim();

  if (!origin) {
    console.error("BharatShop company autopilot skipped: public origin is not configured");
    return new Response("Missing public origin", { status: 503 });
  }
  if (!token) {
    console.error("BharatShop company autopilot skipped: automation token is not configured");
    return new Response("Missing automation token", { status: 503 });
  }

  try {
    const response = await fetch(`${origin}/api/automation/free-stack-schedule`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-automation-token": token,
        "content-type": "application/json",
        "user-agent": "bharatshop-company-autopilot/2.0",
      },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`BharatShop company autopilot endpoint failed (${response.status}): ${body.slice(0, 1000)}`);
      return new Response("Company autopilot endpoint failed", { status: 502 });
    }
    console.log(`BharatShop company autopilot queued successfully: ${body.slice(0, 1600)}`);
    return new Response("Company autopilot queued", { status: 200 });
  } catch (error) {
    console.error("BharatShop company autopilot request failed", error instanceof Error ? error.message : error);
    return new Response("Company autopilot request failed", { status: 502 });
  }
};

export const config = {
  // Daily 02:10 UTC (07:40 IST). The scheduled function only creates the
  // idempotent operating plan. Long-running agent execution remains on the
  // authenticated company worker/CEO runtime.
  schedule: "10 2 * * *",
};
