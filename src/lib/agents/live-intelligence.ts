import { createHash } from "node:crypto";
import { pool } from "@/db";

export type AgentEvidence = {
  id?: number;
  source: "GOOGLE_TRENDS" | "GOOGLE_NEWS";
  sourceUrl: string;
  topic: string;
  title: string;
  snippet: string;
  metric: string;
  observedAt: string | null;
  fetchedAt?: string;
  evidenceHash: string;
};

const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=IN";
const NEWS_QUERIES = [
  "India ecommerce fashion",
  "India streetwear fashion",
  "India online shopping consumer trends",
  "India ecommerce COD returns RTO",
  "India digital advertising ecommerce",
];
const REFRESH_MS = Math.max(15 * 60_000, Number(process.env.AGENT_GOOGLE_REFRESH_MS || 30 * 60_000));
let lastAttemptAt = 0;
let refreshPromise: Promise<RefreshResult> | null = null;

type RefreshResult = {
  status: "REFRESHED" | "FRESH" | "PARTIAL";
  fetched: number;
  inserted: number;
  errors: string[];
  newestFetchedAt?: string | null;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function hashEvidence(source: string, sourceUrl: string, title: string, observedAt: string | null) {
  return createHash("sha256").update(`${source}\n${sourceUrl}\n${title}\n${observedAt || ""}`).digest("hex");
}

function parseRss(xml: string, source: AgentEvidence["source"], topic: string, feedUrl: string): AgentEvidence[] {
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 20).map((block) => {
    const title = tag(block, "title");
    const link = tag(block, "link") || feedUrl;
    const pubDate = tag(block, "pubDate");
    const metric = tag(block, "ht:approx_traffic");
    const description = tag(block, "description") || tag(block, "ht:news_item_snippet");
    const observed = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : null;
    return {
      source,
      sourceUrl: link,
      topic,
      title,
      snippet: description.slice(0, 900),
      metric,
      observedAt: observed,
      evidenceHash: hashEvidence(source, link, title, observed),
    };
  }).filter((item) => item.title && /^https:\/\//i.test(item.sourceUrl));
}

async function fetchText(url: string, timeoutMs = 12_000) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, text/plain;q=0.8",
      "Accept-Language": "en-IN,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (compatible; BharatShop-Research/3.0; +https://bharatshop-9w4a.onrender.com)",
    },
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  return response.text();
}

function googleNewsRss(query: string) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-IN");
  url.searchParams.set("gl", "IN");
  url.searchParams.set("ceid", "IN:en");
  return url.toString();
}

export async function ensureAgentEvidenceTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_external_evidence (
    id BIGSERIAL PRIMARY KEY,
    evidence_hash TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT,
    metric TEXT,
    observed_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_external_evidence_fetched_at ON agent_external_evidence (fetched_at DESC)`);
}

async function newestFetchedAt() {
  await ensureAgentEvidenceTable();
  const result = await pool.query(`SELECT MAX(fetched_at) AS newest FROM agent_external_evidence`);
  return result.rows[0]?.newest ? new Date(result.rows[0].newest).toISOString() : null;
}

async function persist(items: AgentEvidence[]) {
  let inserted = 0;
  for (const item of items) {
    const result = await pool.query(
      `INSERT INTO agent_external_evidence
       (evidence_hash,source,source_url,topic,title,snippet,metric,observed_at,metadata_json,fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW())
       ON CONFLICT (evidence_hash) DO UPDATE SET
         snippet=EXCLUDED.snippet,
         metric=EXCLUDED.metric,
         fetched_at=NOW(),
         metadata_json=EXCLUDED.metadata_json`,
      [item.evidenceHash, item.source, item.sourceUrl, item.topic, item.title, item.snippet, item.metric, item.observedAt, JSON.stringify({ region: "IN", publicMarketContextOnly: true })]
    );
    inserted += Number(result.rowCount || 0);
  }
  return inserted;
}

async function doRefresh(force = false): Promise<RefreshResult> {
  await ensureAgentEvidenceTable();
  const newest = await newestFetchedAt();
  if (!force && newest && Date.now() - new Date(newest).getTime() < REFRESH_MS) {
    return { status: "FRESH", fetched: 0, inserted: 0, errors: [], newestFetchedAt: newest };
  }

  const errors: string[] = [];
  const collected: AgentEvidence[] = [];
  try {
    const xml = await fetchText(GOOGLE_TRENDS_RSS);
    collected.push(...parseRss(xml, "GOOGLE_TRENDS", "India trending searches", GOOGLE_TRENDS_RSS));
  } catch (error) {
    errors.push(`Google Trends: ${error instanceof Error ? error.message : String(error)}`);
  }

  const newsResults = await Promise.allSettled(NEWS_QUERIES.map(async (query) => {
    const url = googleNewsRss(query);
    const xml = await fetchText(url);
    return parseRss(xml, "GOOGLE_NEWS", query, url).slice(0, 8);
  }));
  for (let i = 0; i < newsResults.length; i++) {
    const result = newsResults[i];
    if (result.status === "fulfilled") collected.push(...result.value);
    else errors.push(`Google News ${NEWS_QUERIES[i]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  }

  const deduped = Array.from(new Map(collected.map((x) => [x.evidenceHash, x])).values()).slice(0, 50);
  const inserted = deduped.length ? await persist(deduped) : 0;
  const latest = await newestFetchedAt();
  return { status: errors.length ? "PARTIAL" : "REFRESHED", fetched: deduped.length, inserted, errors, newestFetchedAt: latest };
}

export async function refreshGoogleIntelligence(force = false) {
  if (!force && Date.now() - lastAttemptAt < 60_000 && refreshPromise) return refreshPromise;
  lastAttemptAt = Date.now();
  refreshPromise = doRefresh(force).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function tokens(value: string) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9₹]{3,}/g) || []);
}

export async function loadSharedAgentKnowledge(limit = 12, query = "") {
  await ensureAgentEvidenceTable();
  try { await refreshGoogleIntelligence(false); } catch {}
  const result = await pool.query(
    `SELECT id,source,source_url,topic,title,snippet,metric,observed_at,fetched_at,evidence_hash
     FROM agent_external_evidence
     WHERE fetched_at > NOW() - INTERVAL '14 days'
     ORDER BY fetched_at DESC, observed_at DESC NULLS LAST
     LIMIT 80`
  );
  const q = tokens(query);
  const rows = result.rows.map((row: any) => {
    const hay = tokens(`${row.topic} ${row.title} ${row.snippet || ""}`);
    let score = 0;
    for (const token of q) if (hay.has(token)) score++;
    return {
      id: Number(row.id),
      source: String(row.source),
      sourceUrl: String(row.source_url),
      topic: String(row.topic),
      title: String(row.title),
      snippet: String(row.snippet || ""),
      metric: String(row.metric || ""),
      observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
      fetchedAt: row.fetched_at ? new Date(row.fetched_at).toISOString() : null,
      evidenceHash: String(row.evidence_hash),
      relevanceScore: score,
    };
  });
  rows.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore || String(b.fetchedAt).localeCompare(String(a.fetchedAt)));
  return rows.slice(0, Math.max(1, Math.min(30, limit)));
}

export const GOOGLE_INTELLIGENCE_POLICY = {
  sources: ["Google Trends India RSS", "Google News RSS search"],
  purpose: "Fresh public market context for BharatShop agents",
  restrictions: [
    "Never treat trend/news context as proof of supplier price, stock, shipping, product rights or campaign performance.",
    "Transactional decisions still require live source evidence and existing BharatShop hard gates.",
    "External evidence may strengthen prioritization and hypotheses; it cannot weaken approval, safety, margin or production-truth rules.",
  ],
};
