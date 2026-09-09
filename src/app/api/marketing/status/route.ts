import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

export async function GET() {
  const paidAdsEnabled = process.env.ALLOW_PAID_AD_SPEND === "YES";
  return NextResponse.json({
    mode: "ZERO_PAID_API_DEFAULT",
    paidAds: {
      enabled: paidAdsEnabled,
      policy: paidAdsEnabled ? "Explicitly enabled by owner environment setting." : "Hard-disabled. BharatShop will not spend on Meta or Google Ads automatically.",
    },
    freeGrowth: {
      seo: true,
      structuredData: true,
      sitemap: `${SITE_URL}/sitemap.xml`,
      googleMerchantFeed: `${SITE_URL}/api/feeds/google-merchant`,
      metaCatalogFeed: `${SITE_URL}/api/feeds/meta-catalog`,
      organicSocialPack: `${SITE_URL}/api/marketing/organic-pack`,
    },
    optionalTracking: {
      googleAnalytics4: Boolean(process.env.NEXT_PUBLIC_GA_ID),
      googleAdsConversionTag: Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID),
      metaPixel: Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID),
      googleSiteVerification: Boolean(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION),
      metaDomainVerification: Boolean(process.env.NEXT_PUBLIC_META_DOMAIN_VERIFICATION),
    },
    principle: "No paid API is required for the default marketing stack. External platform accounts and IDs are only needed to connect those platforms to BharatShop.",
  });
}
