type Channel = { key: string; label: string; configured: boolean; connected: boolean;
  status: "NOT_CONFIGURED" | "NOT_TESTED" | "VERIFIED" | "BROKEN"; missing: string[]; error?: string };

function present(name:string){return Boolean(process.env[name]?.trim());}
function pixelId(){return (process.env.META_PIXEL_ID||process.env.NEXT_PUBLIC_META_PIXEL_ID||"").trim();}
function capiToken(){return (process.env.META_CONVERSIONS_API_TOKEN||process.env.META_ACCESS_TOKEN||"").trim();}

export function marketingConnections(): Channel[] {
  const configs = [
    { key:"google", label:"Google Ads", missing:["GOOGLE_ADS_CUSTOMER_ID","GOOGLE_ADS_DEVELOPER_TOKEN","GOOGLE_ADS_REFRESH_TOKEN","GOOGLE_ADS_CLIENT_ID","GOOGLE_ADS_CLIENT_SECRET"].filter(n=>!present(n)) },
    { key:"meta", label:"Meta Ads (Facebook / Instagram)", missing:["META_ACCESS_TOKEN","META_AD_ACCOUNT_ID"].filter(n=>!present(n)) },
    { key:"facebook", label:"Facebook Page", missing:["META_ACCESS_TOKEN","META_PAGE_ID"].filter(n=>!present(n)) },
    { key:"instagram", label:"Instagram Business", missing:["META_ACCESS_TOKEN","META_INSTAGRAM_ACCOUNT_ID","META_PAGE_ID"].filter(n=>!present(n)) },
    { key:"meta-capi", label:"Meta Pixel + Conversions API", missing:[...(pixelId()?[]:["META_PIXEL_ID or NEXT_PUBLIC_META_PIXEL_ID"]),...(capiToken()?[]:["META_CONVERSIONS_API_TOKEN or META_ACCESS_TOKEN"])] },
  ];
  return configs.map(c=>({key:c.key,label:c.label,configured:!c.missing.length,connected:false,status:c.missing.length?"NOT_CONFIGURED":"NOT_TESTED",missing:c.missing}));
}

async function checkedJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15000) });
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
          body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.GOOGLE_ADS_CLIENT_ID!, client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!, refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN! }),
        });
        if (!token.access_token) throw new Error("Google did not return an access token");
        const managerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
        if (managerId && !/^\d{10}$/.test(managerId)) throw new Error("Invalid Google Ads manager ID");
        const result = await checkedJson(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`, {
          method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, ...(managerId ? { "login-customer-id": managerId } : {}) },
          body: JSON.stringify({ query: "SELECT customer.id, customer.status FROM customer LIMIT 1" }),
        });
        const customer = result.results?.[0]?.customer;
        if (String(customer?.id) !== customerId || customer?.status !== "ENABLED") throw new Error("The selected Google Ads customer is unavailable or not enabled");
      } else {
        const version = process.env.META_GRAPH_API_VERSION || "v26.0";
        if (!/^v\d+\.\d+$/.test(version)) throw new Error("Invalid Meta Graph API version");
        const token = channel.key === "meta-capi" ? capiToken() : process.env.META_ACCESS_TOKEN!;
        const headers = { Authorization: `Bearer ${token}` };
        if (channel.key === "meta") {
          const id=process.env.META_AD_ACCOUNT_ID!.replace(/^act_/,"");if(!/^\d+$/.test(id))throw new Error("Invalid Meta ad account ID");
          const result=await checkedJson(`https://graph.facebook.com/${version}/act_${id}?fields=id,account_status`,{headers});
          if(String(result.id)!==`act_${id}`||Number(result.account_status)!==1)throw new Error("The Meta ad account is unavailable or not active");
        } else if (channel.key === "facebook") {
          const id=process.env.META_PAGE_ID!;if(!/^\d+$/.test(id))throw new Error("Invalid Facebook Page ID");
          const result=await checkedJson(`https://graph.facebook.com/${version}/${id}?fields=id,name`,{headers});
          if(String(result.id)!==id)throw new Error("Meta returned a different Facebook Page");
        } else if (channel.key === "instagram") {
          const id=process.env.META_INSTAGRAM_ACCOUNT_ID!,pageId=process.env.META_PAGE_ID!;if(!/^\d+$/.test(id)||!/^\d+$/.test(pageId))throw new Error("Invalid Instagram/Page ID");
          const result=await checkedJson(`https://graph.facebook.com/${version}/${pageId}?fields=instagram_business_account{id,username}`,{headers});
          if(String(result?.instagram_business_account?.id)!==id)throw new Error("Instagram Business account is not linked to the configured Facebook Page");
        } else if (channel.key === "meta-capi") {
          const id=pixelId();if(!/^\d+$/.test(id))throw new Error("Invalid Meta Pixel/Dataset ID");
          const result=await checkedJson(`https://graph.facebook.com/${version}/${id}?fields=id,name`,{headers});
          if(String(result.id)!==id)throw new Error("Meta returned a different Pixel/Dataset");
        }
      }
      return { ...channel, connected: true, status: "VERIFIED" as const };
    } catch (error) {
      return { ...channel, status: "BROKEN" as const, error: error instanceof Error ? error.message : "Connection check failed" };
    }
  }));
}
