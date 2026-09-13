import fs from "node:fs/promises";
import path from "node:path";

const REPO = "coreyhaines31/marketingskills";
const PIN = "5b2c0007766c6a1cf1d53fd8fc73e979e0821022";
const TARGET = path.resolve(process.cwd(), ".agents", "skills");
const MARKER = path.join(TARGET, ".bharatshop-marketingskills.json");
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--check") ? "check" : "help";

async function readMarker() {
  try {
    return JSON.parse(await fs.readFile(MARKER, "utf8"));
  } catch {
    return null;
  }
}

async function check() {
  const marker = await readMarker();
  const ok = marker?.repository === REPO && marker?.commit === PIN && Number(marker?.files || 0) > 0;
  console.log(JSON.stringify({
    installed: ok,
    repository: REPO,
    expectedCommit: PIN,
    installedCommit: marker?.commit || null,
    files: marker?.files || 0,
    target: TARGET,
  }, null, 2));
  if (!ok) process.exitCode = 1;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "BharatShop-upstream-sync",
    },
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function apply() {
  const tree = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${PIN}?recursive=1`);
  const files = (Array.isArray(tree.tree) ? tree.tree : [])
    .filter((entry) => entry?.type === "blob" && typeof entry.path === "string" && entry.path.startsWith("skills/"));
  if (!files.length) throw new Error("Pinned marketing-skills tree did not contain any skills files");

  await fs.rm(TARGET, { recursive: true, force: true });
  await fs.mkdir(TARGET, { recursive: true });

  for (const entry of files) {
    const relative = entry.path.slice("skills/".length);
    const destination = path.join(TARGET, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const rawUrl = `https://raw.githubusercontent.com/${REPO}/${PIN}/${entry.path}`;
    const response = await fetch(rawUrl, { headers: { "User-Agent": "BharatShop-upstream-sync" } });
    if (!response.ok) throw new Error(`Failed to download ${entry.path}: HTTP ${response.status}`);
    await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }

  await fs.writeFile(MARKER, `${JSON.stringify({
    repository: REPO,
    commit: PIN,
    files: files.length,
    installedAt: new Date().toISOString(),
  }, null, 2)}\n`);

  console.log(`Installed ${files.length} pinned marketing skill files into ${TARGET}`);
}

if (mode === "apply") {
  await apply();
} else if (mode === "check") {
  await check();
} else {
  console.log("Usage: node scripts/sync-marketing-skills.mjs --apply | --check");
  console.log(`Pinned source: https://github.com/${REPO}/tree/${PIN}`);
}
