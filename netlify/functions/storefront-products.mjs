export default async (request) => {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }

  try {
    const incoming = new URL(request.url);
    const upstream = new URL("https://bharatshop-9w4a.onrender.com/api/storefront/products");
    upstream.search = incoming.search;

    const response = await fetch(upstream, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("BharatShop catalogue proxy failed", error);
    return Response.json(
      { error: "Catalogue temporarily unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
