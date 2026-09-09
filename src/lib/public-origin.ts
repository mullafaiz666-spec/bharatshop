const FALLBACK = "https://bharatshop-9w4a.onrender.com";

// Public links must never use Next's internal 0.0.0.0 bind address or request Host.
export function publicOrigin() {
  for (const value of [process.env.PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.RENDER_EXTERNAL_URL]) {
    try {
      if (!value) continue;
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      if (/^(?:0\.0\.0\.0|127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i.test(url.hostname)) continue;
      return url.origin;
    } catch { /* Try the next configured public URL. */ }
  }
  return FALLBACK;
}
