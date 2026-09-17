const CONTROL_ORIGINS = new Set([
  "https://preview--nimble-bharatshop-control.apper.so",
]);

function isLoopbackHostname(hostname: string) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

export function machineControlHeaders(request: Request) {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
  };
  const origin = request.headers.get("origin") || "";
  if (CONTROL_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type, accept";
    headers["access-control-allow-private-network"] = "true";
    headers["vary"] = "Origin, Access-Control-Request-Private-Network";
  }
  return headers;
}

export function machineControlOptions(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (!CONTROL_ORIGINS.has(origin)) {
    return Response.json({ error: "Origin is not authorized for Machine AI control." }, { status: 403 });
  }
  return new Response(null, { status: 204, headers: machineControlHeaders(request) });
}

export function authorizeMachineControl(request: Request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    const origin = request.headers.get("origin") || "";

    // The service itself must remain bound to this laptop.
    if (!isLoopbackHostname(hostname)) return false;

    // Local CLI/server calls and localhost UI are trusted.
    if (!origin) return true;
    try {
      if (isLoopbackHostname(new URL(origin).hostname)) return true;
    } catch {
      return false;
    }

    // The owned private Apper Control Center is the only remote browser origin
    // allowed to command this loopback service. No copy/paste pairing token is
    // required, so the cockpit becomes operational as soon as the laptop
    // runtime is online and Local Network access is allowed in the browser.
    return CONTROL_ORIGINS.has(origin);
  } catch {
    return false;
  }
}
