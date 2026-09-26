import { OSINT4ALL_SOURCE, OSINT_TOOLS, assertOsintAgentAccess, searchOsintTools } from "@/lib/ai/osint4all-registry";

const ids = new Set(OSINT_TOOLS.map((tool) => tool.id));
if (ids.size !== OSINT_TOOLS.length) throw new Error("duplicate OSINT tool id");

if (OSINT4ALL_SOURCE.publishedProfiles !== 188) {
  throw new Error("unexpected OSINT4ALL published profile count");
}

for (const tool of OSINT_TOOLS) {
  if (!/^https:\/\//.test(tool.url)) throw new Error(`non-HTTPS URL: ${tool.id}`);
  if (!tool.allowedAgents.length) throw new Error(`no agent policy: ${tool.id}`);
  if (!tool.policy) throw new Error(`no policy: ${tool.id}`);
}

if (!assertOsintAgentAccess("sherlock", "seller-discovery")) {
  throw new Error("seller-discovery should be able to route username discovery");
}
if (assertOsintAgentAccess("shodan", "tracking")) {
  throw new Error("tracking agent must not receive infrastructure OSINT by default");
}

const supplier = searchOsintTools("supplier company due diligence", 5);
if (!supplier.length) throw new Error("supplier routing returned no tools");

const image = searchOsintTools("image media C2PA", 5);
if (!image.some((tool) => tool.id === "c2patool")) throw new Error("image routing missed c2patool");

console.log(`OSINT registry acceptance PASS: ${OSINT_TOOLS.length} curated tools; source directory ${OSINT4ALL_SOURCE.publishedProfiles} profiles.`);
