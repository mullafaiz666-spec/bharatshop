const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://bharatshop-9w4a.onrender.com").replace(/\/$/, "");

function socialProfiles() {
  return [
    process.env.NEXT_PUBLIC_FACEBOOK_URL,
    process.env.NEXT_PUBLIC_INSTAGRAM_URL,
    process.env.NEXT_PUBLIC_YOUTUBE_URL,
  ].map(v => String(v || "").trim()).filter(Boolean);
}

export default function StructuredData() {
  const sameAs = socialProfiles();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": `${SITE_URL}/#store`,
        name: "BharatShop",
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        image: `${SITE_URL}/icons/icon-512.png`,
        description: "BharatShop is an AI-assisted Indian online store with verified supplier products and made-to-order BharatShop Studio fashion.",
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "BharatShop",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/store?search={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
