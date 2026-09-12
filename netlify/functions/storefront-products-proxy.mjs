const UPSTREAM = "https://bharatshop-9w4a.onrender.com/api/storefront/products";

export default async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(UPSTREAM);
  upstream.search = incoming.search;

  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers: {
        accept: request.headers.get("accept") || "application/json",
        "user-agent": "bharatshop-netlify-storefront/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(55_000),
    });

    const headers = new Headers();
    headers.set("content-type", response.headers.get("content-type") || "application/json; charset=utf-8");
    headers.set("cache-control", response.ok ? "public, max-age=10, stale-while-revalidate=120" : "no-store");
    headers.set("x-bharatshop-upstream", "render-transition");

    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Storefront catalogue upstream unavailable", error instanceof Error ? error.message : error);
    return Response.json(
      {
        error: "Catalogue is waking up. Please retry shortly.",
        products: [],
        categoryCount: {},
        total: 0,
        totalPages: 1,
      },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "3" } },
    );
  }
};
