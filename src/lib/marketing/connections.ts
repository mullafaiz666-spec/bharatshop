type Channel = { key: string; label: string; configured: boolean; connected: boolean;
  status: "NOT_CONFIGURED" | "NOT_TESTED" | "VERIFIED" | "BROKEN"; missing: string[]; error?: string };
const fields = {
  google: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"],
  meta: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  facebook: ["META_ACCESS_TOKEN", "META_PAGE_ID"],
  instagram: ["META_ACCESS_TOKEN", "META_INSTAGRAM_ACCOUNT_ID"],
};

export function marketingConnections(): Channel[] {
  const labels = { google: "Google Ads", meta: "Meta Ads (Facebook / Instagram)", facebook: "Facebook Page", instagram: "Instagram Business" };
  return Object.entries(fields).map(([key, names]) => {
    const missing = names.filter(name => !process.env[name]?.trim());
    return { key, label: labels[key as keyof typeof labels], configured: !missing.length,
      connected: false, status: missing.length ? "NOT_CONFIGURED" : "NOT_TESTED", missing };
  });
}

async function checkedJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
  // Do not echo provider responses, which can contain account or credential details.
  if (!response.ok) throw new Error(`Provider rejected the connection check (HTTP ${response.status})`);
  return response.json();
}

export async function verifyMarketingConnections() {
  return Promise.all(marketingConnections().map(async channel => {
    if (!channel.configured) return channel;
    try {
      if (channel.key === "google") {
        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "");
        const version = process.env.GOOGLE_ADS_API_VERSION || "v25";
        if (!/^\d{10}$/.test(customerId) || !/^v\d+$/.test(version)) throw new Error("Invalid Google Ads customer ID or API version");
        const token = await checkedJson("https://oauth2.googleapis.com/token", { method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
            client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN! }),
        });
        if (!token.access_token) throw new Error("Google did not return an access token");
        const managerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
        if (managerId && !/^\d{10}$/.test(managerId)) throw new Error("Invalid Google Ads manager ID");
        const result = await checkedJson(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
          method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json",
            "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, ...(managerId ? { "login-customer-id": managerId } : {}) },
          body: JSON.stringify({ query: "SELECT customer.id, customer.status FROM customer LIMIT 1" }),
        });
        const customer = result.results?.[0]?.customer;
        if (String(customer?.id) !== customerId || customer?.status !== "ENABLED") throw new Error("The selected Google Ads customer is unavailable or not enabled");
      } else {
        const version = process.env.META_GRAPH_API_VERSION || "v26.0";
        const id = channel.key === "meta" ? process.env.META_AD_ACCOUNT_ID!.replace(/^act_/, "")
          : channel.key === "facebook" ? process.env.META_PAGE_ID! : process.env.META_INSTAGRAM_ACCOUNT_ID!;
        if (!/^\d+$/.test(id) || !/^v\d+\.\d+$/.test(version)) throw new Error("Invalid Meta account ID or API version");
        const objectId = channel.key === "meta" ? `act_${id}` : id;
        const requested = channel.key === "meta" ? "id,account_status" : "id";
        const result = await checkedJson(`https://graph.facebook.com/${version}/${objectId}?fields=${requested}`, {
          headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
        });
        if (String(result.id) !== objectId) throw new Error("Meta returned a different account");
        if (channel.key === "meta" && Number(result.account_status) !== 1) throw new Error("The Meta ad account is not active");
      }
      return { ...channel, connected: true, status: "VERIFIED" as const };
    } catch (error) {
      return { ...channel, status: "BROKEN" as const, error: error instanceof Error ? error.message : "Connection check failed" };
    }
  }));
}
