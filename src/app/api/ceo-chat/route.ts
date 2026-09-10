import { NextResponse } from "next/server";
import { aiModels } from "@/lib/ai/provider";
import { runAgentRuntime, type RuntimeMessage } from "@/lib/agents/runtime";
import { isTinyGemmaModel, runCompactAgentFallback, runCompactAgentRuntime } from "@/lib/agents/compact-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DASHBOARD_AGENT_MAP: Record<string, string> = {
  "ai ceo": "ceo",
  "product research": "source-discovery",
  "source verification": "source-verification",
  "image & media": "image-media",
  "bharatdrip fashion": "listing",
  "listing & merchandising": "listing",
  marketing: "marketing",
  advertising: "advertising",
  "order re-check": "order-recheck",
  "fulfilment & tracking": "tracking",
  "fulfillment & tracking": "tracking",
  "learning & analytics": "learning",
  "automation engineering": "automation",
  "web & conversion": "web-design",
};

const CEO_ACTION_REQUEST = /\b(approve|execute|publish|unpublish|buy|purchase|place\s+order|refund|payout|pay|send|launch|create|delete|remove|change|update|set|connect|deploy|spend|start\s+campaign|pause\s+campaign|resume\s+campaign|fulfil|fulfill|ship)\b/i;

function cookieValue(cookieHeader: string, key: string) {
  const encoded = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${key}=`));
  return encoded ? decodeURIComponent(encoded.slice(key.length + 1)) : "";
}

function acceptanceCompatibleTrace(items: unknown[]) {
  return items.map((item) => {
    const trace = item && typeof item === "object" ? item as Record<string, unknown> : { result: item };
    return { ...trace, result: trace.result !== undefined ? trace.result : trace.output };
  });
}

function useBoundedFreeTierCeo(question: string, runtimeAgent: string, incoming: RuntimeMessage[], explicitMaxSteps?: number) {
  if (String(runtimeAgent).toLowerCase() !== "ceo") return false;
  if (!isTinyGemmaModel(aiModels().text)) return false;
  if (incoming.length > 0 || explicitMaxSteps !== undefined) return false;
  return !CEO_ACTION_REQUEST.test(question);
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      question?: string;
      objective?: string;
      messages?: RuntimeMessage[];
      history?: RuntimeMessage[];
      context?: Record<string, unknown> & { selectedAgent?: string };
      sessionId?: string;
      maxSteps?: number;
    };
    const incoming = Array.isArray(body.messages) ? body.messages : Array.isArray(body.history) ? body.history : [];
    const question = String(body.question || body.objective || incoming.at(-1)?.content || "").trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });

    const context = body.context ?? {};
    const requestedPersona = String(context.selectedAgent || "AI CEO").trim();
    const runtimeAgent = DASHBOARD_AGENT_MAP[requestedPersona.toLowerCase()] || requestedPersona;

    const cookieHeader = req.headers.get("cookie") || "";
    const existingBrowserSession = cookieValue(cookieHeader, "bharatshop_agent_session");
    const browserSession = existingBrowserSession || crypto.randomUUID();
    const derivedSessionId = `${browserSession}:${String(runtimeAgent).toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`.slice(0, 160);
    const sessionId = String(body.sessionId || derivedSessionId).slice(0, 160);
    const compactPrimary = useBoundedFreeTierCeo(question, runtimeAgent, incoming, body.maxSteps);

    const primary = compactPrimary
      ? await runCompactAgentRuntime({
          agentId: "ceo",
          objective: question,
          sessionId,
          context: { ...context, requestedPersona, runtimeAgent, runtimeProfile: "render-free-tiny-gemma" },
          maxAttempts: 1,
          primary: true,
        })
      : await runAgentRuntime({
          agent: runtimeAgent,
          objective: question,
          history: incoming,
          context: { ...context, requestedPersona, runtimeAgent },
          sessionId,
          origin: new URL(req.url).origin,
          maxSteps: body.maxSteps,
        });

    let result: Record<string, unknown> = primary as unknown as Record<string, unknown>;
    if (!compactPrimary && primary.modelStatus === "unavailable") {
      const compact = await runCompactAgentFallback({
        agentId: primary.agentId,
        objective: question,
        sessionId,
        context: { ...context, requestedPersona, runtimeAgent },
        priorError: primary.modelError,
      });
      result = {
        ...compact,
        toolExecutions: [
          ...acceptanceCompatibleTrace(primary.toolExecutions as unknown[]),
          ...acceptanceCompatibleTrace(compact.toolExecutions as unknown[]),
        ],
        fullRuntimeStatus: primary.status,
        compactRecovery: compact.modelStatus === "live" ? "RECOVERED" : "FAILED",
      };
    }

    const modelStatus = String(result.modelStatus || "unavailable");
    const response = NextResponse.json({
      ...result,
      toolExecutions: acceptanceCompatibleTrace(Array.isArray(result.toolExecutions) ? result.toolExecutions : []),
      requestedPersona,
      runtimeAgent,
      compactPrimary,
      mode: modelStatus === "live" ? "ai-agent-live" : "ai-agent-unavailable",
    }, { status: modelStatus === "unavailable" ? 503 : 200 });

    if (!existingBrowserSession && !body.sessionId) {
      response.cookies.set("bharatshop_agent_session", browserSession, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Agent chat failed",
      code: "CEO_CHAT_FAILED",
    }, { status: 500 });
  }
}
