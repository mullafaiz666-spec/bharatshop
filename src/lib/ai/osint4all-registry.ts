/**
 * JARVIS / BharatShop OSINT4ALL integration registry.
 *
 * Source: OSINT4ALL moderated directory, currently 188 published profiles.
 * This registry stores tool metadata and routing policy; it does not grant
 * credentials or bypass access controls. Execution must remain public/authorized
 * and evidence must be attached to the existing audit trail.
 */

export type OsintCategory =
  | "domain-dns" | "threat-triage" | "company-research" | "people-social"
  | "maps-geolocation" | "archives" | "image-media" | "documents-analysis"
  | "news-monitoring" | "blockchain" | "procurement";

export type OsintAccess = "browser" | "api" | "self-hosted" | "desktop";
export type OsintPricing = "free" | "freemium" | "paid" | "enterprise";

export type OsintTool = {
  id: string;
  name: string;
  url: string;
  category: OsintCategory;
  workflow: string[];
  access: OsintAccess[];
  pricing: OsintPricing;
  selfHosted: boolean;
  description: string;
  allowedAgents: string[];
  policy: "public-authorized" | "authorized-security" | "public-records";
};

const RESEARCH_AGENTS = [
  "ceo", "source-discovery", "source-verification", "seller-discovery",
  "image-media", "listing", "marketing", "learning", "automation", "web-design",
];

export const OSINT4ALL_SOURCE = {
  name: "OSINT4ALL",
  directoryUrl: "https://osint4all.com/tool/",
  publishedProfiles: 188,
  checked: "2026-09-26",
} as const;

export const OSINT_TOOLS: OsintTool[] = [
  { id:"shodan", name:"Shodan", url:"https://www.shodan.io/", category:"domain-dns", workflow:["discovery","verification"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Public-internet exposure search for scoped hosts and services.", allowedAgents:RESEARCH_AGENTS, policy:"authorized-security" },
  { id:"maltego", name:"Maltego", url:"https://www.maltego.com/", category:"people-social", workflow:["mapping","verification"], access:["desktop","browser"], pricing:"paid", selfHosted:false, description:"Entity relationship and link-analysis workflows.", allowedAgents:["ceo","seller-discovery","learning","automation"], policy:"public-authorized" },
  { id:"wayback", name:"Internet Archive / Wayback Machine", url:"https://web.archive.org/", category:"archives", workflow:["archiving","verification"], access:["browser"], pricing:"free", selfHosted:false, description:"Historical web captures and source preservation.", allowedAgents:RESEARCH_AGENTS, policy:"public-authorized" },
  { id:"archivebox", name:"ArchiveBox", url:"https://archivebox.io/", category:"archives", workflow:["archiving","verification"], access:["self-hosted"], pricing:"free", selfHosted:true, description:"Self-hosted preservation of permitted web sources.", allowedAgents:["ceo","source-verification","learning","automation"], policy:"public-authorized" },
  { id:"duckdb", name:"DuckDB", url:"https://duckdb.org/", category:"documents-analysis", workflow:["analysis","reporting"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Local SQL analysis for research CSV/Parquet datasets.", allowedAgents:["ceo","source-verification","learning","automation"], policy:"public-authorized" },
  { id:"google-pinpoint", name:"Google Pinpoint", url:"https://journaliststudio.google.com/pinpoint/", category:"documents-analysis", workflow:["analysis","discovery"], access:["browser"], pricing:"free", selfHosted:false, description:"Search and organize a permitted document collection.", allowedAgents:["ceo","source-verification","learning"], policy:"public-authorized" },
  { id:"solscan", name:"Solscan", url:"https://solscan.io/", category:"blockchain", workflow:["analysis","verification"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Inspect public Solana transactions, accounts and tokens.", allowedAgents:["ceo","source-verification","learning"], policy:"public-authorized" },
  { id:"arkham", name:"Arkham", url:"https://www.arkhamintelligence.com/", category:"blockchain", workflow:["analysis","verification"], access:["browser"], pricing:"freemium", selfHosted:false, description:"Public on-chain activity and entity-label research.", allowedAgents:["ceo","source-verification","learning"], policy:"public-authorized" },
  { id:"blockchair", name:"Blockchair", url:"https://blockchair.com/", category:"blockchain", workflow:["analysis","verification"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Public blockchain transaction and address records.", allowedAgents:["ceo","source-verification","learning"], policy:"public-authorized" },
  { id:"dune", name:"Dune", url:"https://dune.com/", category:"blockchain", workflow:["analysis","reporting"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Inspectable public blockchain queries and dashboards.", allowedAgents:["ceo","learning"], policy:"public-authorized" },
  { id:"feedly", name:"Feedly", url:"https://feedly.com/", category:"news-monitoring", workflow:["discovery","monitoring"], access:["browser"], pricing:"freemium", selfHosted:false, description:"Recurring source-feed and topic monitoring.", allowedAgents:["ceo","marketing","learning"], policy:"public-authorized" },
  { id:"importyeti", name:"ImportYeti", url:"https://www.importyeti.com/", category:"company-research", workflow:["discovery","verification"], access:["browser"], pricing:"freemium", selfHosted:false, description:"Supplier/importer relationship clues from available shipment records.", allowedAgents:["source-discovery","seller-discovery","source-verification"], policy:"public-records" },
  { id:"intelowl", name:"IntelOwl", url:"https://intelowlproject.github.io/", category:"threat-triage", workflow:["enrichment","triage"], access:["api","self-hosted"], pricing:"free", selfHosted:true, description:"Controlled enrichment of permitted indicators.", allowedAgents:["source-verification","learning","automation"], policy:"authorized-security" },
  { id:"mapwarper", name:"Map Warper", url:"https://mapwarper.net/", category:"maps-geolocation", workflow:["mapping","verification"], access:["browser","self-hosted"], pricing:"free", selfHosted:true, description:"Align historical maps with modern coordinates.", allowedAgents:["source-verification","learning"], policy:"public-authorized" },
  { id:"opencti", name:"OpenCTI", url:"https://filigran.io/solutions/opencti/", category:"threat-triage", workflow:["enrichment","triage"], access:["browser","self-hosted"], pricing:"freemium", selfHosted:true, description:"Structured cyber-threat intelligence relationships.", allowedAgents:["source-verification","learning","automation"], policy:"authorized-security" },
  { id:"foca", name:"FOCA", url:"https://github.com/ElevenPaths/FOCA", category:"documents-analysis", workflow:["discovery","enrichment"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Document metadata analysis for permitted public documents.", allowedAgents:["source-verification","learning"], policy:"public-authorized" },
  { id:"ghunt", name:"GHunt", url:"https://github.com/mxrch/GHunt", category:"people-social", workflow:["discovery","enrichment"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Public Google-account signals for authorized research.", allowedAgents:["seller-discovery","source-verification"], policy:"public-authorized" },
  { id:"sherlock", name:"Sherlock", url:"https://github.com/sherlock-project/sherlock", category:"people-social", workflow:["discovery","pivoting"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Public username discovery across services.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-authorized" },
  { id:"maigret", name:"Maigret", url:"https://github.com/soxoj/maigret", category:"people-social", workflow:["discovery","pivoting"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Broad public username search and reporting.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-authorized" },
  { id:"holehe", name:"Holehe", url:"https://github.com/megadose/holehe", category:"people-social", workflow:["discovery","enrichment"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Public account-registration signal checks; use only for authorized research.", allowedAgents:["seller-discovery","source-verification"], policy:"public-authorized" },
  { id:"subfinder", name:"Subfinder", url:"https://github.com/projectdiscovery/subfinder", category:"domain-dns", workflow:["discovery","pivoting"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Passive subdomain discovery from configured public sources.", allowedAgents:["source-verification","automation"], policy:"authorized-security" },
  { id:"threatfox", name:"ThreatFox", url:"https://threatfox.abuse.ch/", category:"threat-triage", workflow:["enrichment","triage"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Community-shared malware indicator lookup.", allowedAgents:["source-verification","learning","automation"], policy:"authorized-security" },
  { id:"c2patool", name:"c2patool", url:"https://opensource.contentauthenticity.org/docs/c2patool/", category:"image-media", workflow:["verification","analysis"], access:["desktop","self-hosted"], pricing:"free", selfHosted:true, description:"Inspect C2PA content-authenticity manifests.", allowedAgents:["image-media","source-verification","listing"], policy:"public-authorized" },
  { id:"documentcloud", name:"DocumentCloud", url:"https://www.documentcloud.org/", category:"documents-analysis", workflow:["analysis","reporting"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Search, annotate and publish permitted source documents.", allowedAgents:["source-verification","learning"], policy:"public-authorized" },
  { id:"gephi", name:"Gephi", url:"https://gephi.org/", category:"documents-analysis", workflow:["mapping","analysis"], access:["desktop"], pricing:"free", selfHosted:false, description:"Network visualization for documented relationships.", allowedAgents:["ceo","learning"], policy:"public-authorized" },
  { id:"sam-gov", name:"SAM.gov", url:"https://sam.gov/", category:"procurement", workflow:["verification","discovery"], access:["browser","api"], pricing:"free", selfHosted:false, description:"U.S. federal entity registration and award-management records.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-records" },
  { id:"ted", name:"TED – Tenders Electronic Daily", url:"https://ted.europa.eu/", category:"procurement", workflow:["discovery","verification"], access:["browser","api"], pricing:"free", selfHosted:false, description:"EU public procurement notices and awarded-contract records.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-records" },
  { id:"usaspending", name:"USAspending.gov", url:"https://www.usaspending.gov/", category:"procurement", workflow:["discovery","verification"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Public U.S. federal award spending records.", allowedAgents:["seller-discovery","learning"], policy:"public-records" },
  { id:"global-forest-watch", name:"Global Forest Watch", url:"https://www.globalforestwatch.org/", category:"maps-geolocation", workflow:["mapping","monitoring"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Environmental geospatial data and satellite alerts.", allowedAgents:["learning","source-verification"], policy:"public-authorized" },
  { id:"nasa-worldview", name:"NASA Worldview", url:"https://worldview.earthdata.nasa.gov/", category:"maps-geolocation", workflow:["mapping","verification"], access:["browser"], pricing:"free", selfHosted:false, description:"Public satellite imagery browsing.", allowedAgents:["source-verification","learning"], policy:"public-authorized" },
  { id:"openaerialmap", name:"OpenAerialMap", url:"https://openaerialmap.org/", category:"maps-geolocation", workflow:["discovery","mapping"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Open aerial imagery catalog for mapping workflows.", allowedAgents:["source-verification","learning"], policy:"public-authorized" },
  { id:"suncalc", name:"SunCalc", url:"https://www.suncalc.org/", category:"maps-geolocation", workflow:["verification"], access:["browser"], pricing:"free", selfHosted:false, description:"Sunlight and shadow checks for visual verification.", allowedAgents:["source-verification","image-media"], policy:"public-authorized" },
  { id:"courtlistener", name:"CourtListener", url:"https://www.courtlistener.com/", category:"company-research", workflow:["discovery","verification"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Public U.S. legal opinions and docket context.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-records" },
  { id:"geonames", name:"GeoNames", url:"https://www.geonames.org/", category:"maps-geolocation", workflow:["discovery","verification"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Geographic names and location reference data.", allowedAgents:["source-verification","seller-discovery"], policy:"public-authorized" },
  { id:"gdelt", name:"GDELT Project", url:"https://www.gdeltproject.org/", category:"news-monitoring", workflow:["monitoring","analysis"], access:["api","browser"], pricing:"free", selfHosted:false, description:"Global news and event monitoring datasets.", allowedAgents:["ceo","marketing","learning"], policy:"public-authorized" },
  { id:"google-trends", name:"Google Trends", url:"https://trends.google.com/", category:"news-monitoring", workflow:["monitoring","discovery"], access:["browser"], pricing:"free", selfHosted:false, description:"Directional public search-interest analysis.", allowedAgents:["source-discovery","marketing","learning"], policy:"public-authorized" },
  { id:"media-cloud", name:"Media Cloud", url:"https://mediacloud.org/", category:"news-monitoring", workflow:["monitoring","analysis"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Open media ecosystem research platform.", allowedAgents:["marketing","learning"], policy:"public-authorized" },
  { id:"binaryedge", name:"BinaryEdge", url:"https://www.binaryedge.io/", category:"domain-dns", workflow:["enrichment","discovery"], access:["browser","api"], pricing:"paid", selfHosted:false, description:"Internet scanning and risk intelligence.", allowedAgents:["source-verification","automation"], policy:"authorized-security" },
  { id:"dnslytics", name:"DNSlytics", url:"https://dnslytics.com/", category:"domain-dns", workflow:["enrichment","pivoting"], access:["browser"], pricing:"freemium", selfHosted:false, description:"Reverse analytics, DNS and domain intelligence.", allowedAgents:["source-verification","seller-discovery"], policy:"authorized-security" },
  { id:"fofa", name:"FOFA", url:"https://en.fofa.info/", category:"domain-dns", workflow:["discovery","enrichment"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Cyberspace asset mapping and search.", allowedAgents:["source-verification","automation"], policy:"authorized-security" },
  { id:"netlas", name:"Netlas", url:"https://netlas.io/", category:"domain-dns", workflow:["discovery","enrichment"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Internet asset and attack-surface search.", allowedAgents:["source-verification","automation"], policy:"authorized-security" },
  { id:"onyphe", name:"ONYPHE", url:"https://www.onyphe.io/", category:"domain-dns", workflow:["discovery","enrichment"], access:["browser","api"], pricing:"freemium", selfHosted:false, description:"Cyber-defense search and attack-surface data.", allowedAgents:["source-verification","automation"], policy:"authorized-security" },
  { id:"whatsmyname", name:"WhatsMyName", url:"https://whatsmyname.app/", category:"people-social", workflow:["discovery"], access:["browser","self-hosted"], pricing:"free", selfHosted:true, description:"Public username discovery.", allowedAgents:["seller-discovery","source-verification"], policy:"public-authorized" },
  { id:"advanced-search-operators", name:"Advanced Search Operators Workflow", url:"https://www.google.com/advanced_search", category:"archives", workflow:["discovery"], access:["browser"], pricing:"free", selfHosted:false, description:"Precise public-web discovery using search operators and scoped domains.", allowedAgents:RESEARCH_AGENTS, policy:"public-authorized" },
  { id:"occrop-aleph", name:"OCCRP Aleph", url:"https://aleph.occrp.org/", category:"company-research", workflow:["discovery","analysis"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Document-led research across public datasets.", allowedAgents:["seller-discovery","source-verification","learning"], policy:"public-records" },
  { id:"hibp", name:"Have I Been Pwned", url:"https://haveibeenpwned.com/", category:"threat-triage", workflow:["verification"], access:["browser","api"], pricing:"free", selfHosted:false, description:"Defensive breach-exposure checks for permitted email/domain security workflows.", allowedAgents:["source-verification","learning"], policy:"authorized-security" },
];

export function getOsintTool(id: string) {
  return OSINT_TOOLS.find((tool) => tool.id === id) ?? null;
}

export function listOsintTools(filter: Partial<Pick<OsintTool, "category" | "pricing" | "policy">> = {}) {
  return OSINT_TOOLS.filter((tool) =>
    (!filter.category || tool.category === filter.category) &&
    (!filter.pricing || tool.pricing === filter.pricing) &&
    (!filter.policy || tool.policy === filter.policy)
  );
}

export function searchOsintTools(task: string, limit = 12) {
  const q = task.toLowerCase();
  const scored = OSINT_TOOLS.map((tool) => {
    const haystack = [tool.name, tool.description, tool.category, ...tool.workflow].join(" ").toLowerCase();
    let score = 0;
    for (const token of q.split(/[^a-z0-9]+/).filter((x) => x.length >= 3)) {
      if (haystack.includes(token)) score += 2;
    }
    if (/image|photo|media|exif|c2pa/.test(q) && tool.category === "image-media") score += 8;
    if (/domain|dns|ip|subdomain|host|website/.test(q) && tool.category === "domain-dns") score += 8;
    if (/supplier|seller|company|vendor|business|due diligence/.test(q) && tool.category === "company-research") score += 8;
    if (/username|social|handle|profile/.test(q) && tool.category === "people-social") score += 8;
    if (/map|geo|location|satellite|shadow/.test(q) && tool.category === "maps-geolocation") score += 8;
    if (/archive|history|deleted|old page/.test(q) && tool.category === "archives") score += 8;
    if (/breach|malware|threat|indicator|ioc/.test(q) && tool.category === "threat-triage") score += 8;
    if (/trend|news|media|market/.test(q) && tool.category === "news-monitoring") score += 6;
    return { tool, score };
  }).filter((x) => x.score > 0).sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 25)));
  return scored.map(({tool, score}) => ({
    id: tool.id, name: tool.name, url: tool.url, category: tool.category,
    workflow: tool.workflow, access: tool.access, pricing: tool.pricing,
    selfHosted: tool.selfHosted, policy: tool.policy, score,
  }));
}

export function assertOsintAgentAccess(toolId: string, agentId: string) {
  const tool = getOsintTool(toolId);
  return Boolean(tool && tool.allowedAgents.includes(agentId));
}
