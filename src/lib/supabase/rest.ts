const supabaseUrl = () => String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseAnonKey = () => String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const supabaseServiceRoleKey = () => String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export const supabaseRuntimeStatus = () => ({
  urlConfigured: Boolean(supabaseUrl()),
  authConfigured: Boolean(supabaseUrl() && supabaseAnonKey()),
  storageConfigured: Boolean(supabaseUrl() && supabaseServiceRoleKey()),
  digitalBucket: process.env.SUPABASE_DIGITAL_BUCKET || "bharatshop-digital",
});

function requireSupabaseUrl() {
  const url = supabaseUrl();
  if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured");
  return url;
}

export type SupabaseUser = {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export async function verifySupabaseAccessToken(accessToken: string): Promise<SupabaseUser> {
  const token = String(accessToken || "").trim();
  if (!token) throw new Error("Supabase access token is required");
  const anonKey = supabaseAnonKey();
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");

  const response = await fetch(`${requireSupabaseUrl()}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(`Supabase Auth rejected the token (${response.status})`);
  return data as SupabaseUser;
}

export async function createPrivateStorageSignedUrl(objectPath: string, expiresInSeconds = 300) {
  const serviceRole = supabaseServiceRoleKey();
  if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  const normalizedPath = String(objectPath || "").replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.includes("..")) throw new Error("Invalid storage object path");
  const bucket = process.env.SUPABASE_DIGITAL_BUCKET || "bharatshop-digital";
  const expiresIn = Math.min(3600, Math.max(30, Math.floor(Number(expiresInSeconds) || 300)));
  const encodedPath = normalizedPath.split("/").map(encodeURIComponent).join("/");

  const response = await fetch(`${requireSupabaseUrl()}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok || !data?.signedURL) throw new Error(`Supabase Storage signing failed (${response.status})`);

  const signedPath = String(data.signedURL);
  return {
    bucket,
    objectPath: normalizedPath,
    expiresIn,
    signedUrl: signedPath.startsWith("http") ? signedPath : `${requireSupabaseUrl()}${signedPath.startsWith("/") ? "" : "/"}${signedPath}`,
  };
}

export async function checkSupabaseApi() {
  const status = supabaseRuntimeStatus();
  if (!status.urlConfigured) return { ...status, reachable: false, reason: "missing_url" };
  const key = supabaseAnonKey() || supabaseServiceRoleKey();
  if (!key) return { ...status, reachable: false, reason: "missing_api_key" };
  try {
    const response = await fetch(`${requireSupabaseUrl()}/rest/v1/`, {
      method: "GET",
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return { ...status, reachable: response.ok, status: response.status, reason: response.ok ? "reachable" : "provider_rejected" };
  } catch (error) {
    return { ...status, reachable: false, reason: "unreachable", error: error instanceof Error ? error.message : String(error) };
  }
}
