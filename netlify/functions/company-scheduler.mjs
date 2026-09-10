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
    console.error("BharatShop scheduler skipped: public origin is not configured");
    return new Response("Missing public origin", { status: 503 });
  }
  if (!token) {
    console.error("BharatShop scheduler skipped: automation token is not configured");
    return new Response("Missing automation token", { status: 503 });
  }

  try {
    const response = await fetch(`${origin}/api/automation/free-stack-schedule`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "bharatshop-netlify-scheduler/1.0",
      },
      body: "{}",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`BharatShop scheduler endpoint failed (${response.status}): ${body.slice(0, 1000)}`);
      return new Response("Scheduler endpoint failed", { status: 502 });
    }
    console.log(`BharatShop daily agent work queued successfully: ${body.slice(0, 1200)}`);
    return new Response("Queued", { status: 200 });
  } catch (error) {
    console.error("BharatShop scheduler request failed", error instanceof Error ? error.message : error);
    return new Response("Scheduler request failed", { status: 502 });
  }
};

export const config = {
  // Daily 02:10 UTC (07:40 IST). Keep the scheduled function short: it queues
  // bounded work; long AI execution happens through the existing company worker.
  schedule: "10 2 * * *",
};
