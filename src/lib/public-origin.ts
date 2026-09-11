const LEGACY_FALLBACK = "https://bharatshop-9w4a.onrender.com";

function validPublicOrigin(value: string | undefined) {
  try {
    if (!value) return null;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (/^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Keep public URLs host-agnostic. Netlify supplies URL/DEPLOY_PRIME_URL; the
// explicit BharatShop variable wins so production can move again without code
// changes. Render remains a legacy fallback only until the approved cutover.
export function publicOrigin() {
  for (const value of [
    process.env.BHARATSHOP_PUBLIC_ORIGIN,
    process.env.PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.RENDER_EXTERNAL_URL,
  ]) {
    const origin = validPublicOrigin(value);
    if (origin) return origin;
  }
  return LEGACY_FALLBACK;
}
