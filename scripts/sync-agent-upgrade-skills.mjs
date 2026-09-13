import fs from "node:fs/promises";
import path from "node:path";

const TARGET = path.resolve(process.cwd(), ".agents", "skills");
const MARKER = path.join(TARGET, ".bharatshop-agent-upgrades.json");
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--check") ? "check" : "help";

const SOURCES = [
  {
    id: "browser-use",
    repository: "browser-use/browser-use",
    commit: "6e1977daa0f67c9de0bc0e16aaec8b5833eeb8e0",
    prefixes: ["skills/browser-use"],
  },
  {
    id: "diagram-design",
    repository: "cathrynlavery/diagram-design",
    commit: "8d8b2993ee2256ee7dfc0eeb3b5713aba3b60792",
    prefixes: ["skills/diagram-design"],
  },
  {
    id: "scientific-agent-skills",
    repository: "K-Dense-AI/scientific-agent-skills",
    commit: "0b2afe68a5f9379097ad815e028af664f1e222b7",
    prefixes: ["skills/statsmodels", "skills/scientific-visualization"],
  },
];

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readMarker() {
  try {
    return JSON.parse(await fs.readFile(MARKER, "utf8"));
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "BharatShop-agent-upgrade-sync",
    },
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function skillNameFromPrefix(prefix) {
  return prefix.split("/").filter(Boolean).at(-1);
}

async function check() {
  const marker = await readMarker();
  const expected = new Map(SOURCES.map((source) => [source.id, source]));
  const installed = Array.isArray(marker?.sources) ? marker.sources : [];
  let ok = installed.length === SOURCES.length;

  for (const item of installed) {
    const source = expected.get(item.id);
    if (!source || item.repository !== source.repository || item.commit !== source.commit) ok = false;
  }

  for (const source of SOURCES) {
    for (const prefix of source.prefixes) {
      const skill = skillNameFromPrefix(prefix);
      if (!skill || !(await exists(path.join(TARGET, skill, "SKILL.md")))) ok = false;
    }
  }

  console.log(JSON.stringify({ installed: ok, target: TARGET, expected: SOURCES, marker }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function downloadSource(source) {
  const tree = await fetchJson(`https://api.github.com/repos/${source.repository}/git/trees/${source.commit}?recursive=1`);
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const copied = [];

  for (const prefix of source.prefixes) {
    const skill = skillNameFromPrefix(prefix);
    if (!skill) throw new Error(`Invalid skill prefix: ${prefix}`);
    const files = entries.filter((entry) => entry?.type === "blob" && typeof entry.path === "string" && (entry.path === prefix || entry.path.startsWith(`${prefix}/`)));
    if (!files.some((entry) => entry.path.endsWith("/SKILL.md"))) {
      throw new Error(`${source.repository}@${source.commit} did not contain ${prefix}/SKILL.md`);
    }

    const destinationRoot = path.join(TARGET, skill);
    await fs.rm(destinationRoot, { recursive: true, force: true });
    await fs.mkdir(destinationRoot, { recursive: true });

    for (const entry of files) {
      const relative = entry.path.slice(prefix.length).replace(/^\//, "");
      if (!relative) continue;
      const destination = path.join(destinationRoot, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const rawUrl = `https://raw.githubusercontent.com/${source.repository}/${source.commit}/${entry.path}`;
      const response = await fetch(rawUrl, { headers: { "User-Agent": "BharatShop-agent-upgrade-sync" } });
      if (!response.ok) throw new Error(`Failed to download ${entry.path}: HTTP ${response.status}`);
      await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
      copied.push(entry.path);
    }
  }

  return copied.length;
}

async function apply() {
  await fs.mkdir(TARGET, { recursive: true });
  const installed = [];
  for (const source of SOURCES) {
    const files = await downloadSource(source);
    installed.push({ ...source, files });
    console.log(`Installed ${source.id}: ${files} pinned files`);
  }

  await fs.writeFile(MARKER, `${JSON.stringify({
    version: 1,
    installedAt: new Date().toISOString(),
    policy: "Only reviewed workstation skills are installed. Browser execution and scientific package dependencies remain opt-in; no storefront dependency is added.",
    sources: installed,
  }, null, 2)}\n`);
}

if (mode === "apply") {
  await apply();
} else if (mode === "check") {
  await check();
} else {
  console.log("Usage: node scripts/sync-agent-upgrade-skills.mjs --apply | --check");
  console.log("Installs Browser Use, Diagram Design, Statsmodels and Scientific Visualization as pinned workstation Agent Skills without touching existing marketing skills.");
}
