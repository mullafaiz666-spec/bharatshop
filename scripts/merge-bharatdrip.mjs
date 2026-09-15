#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zipArg = process.argv[2];
const ZIP = zipArg ? resolve(zipArg) : join(process.env.USERPROFILE || process.cwd(), 'Downloads', 'bharatdrip-streetwear-e-commerce-site.zip');
const COMPONENT_DEST = join(ROOT, 'src', 'components', 'bharatdrip');
const LIB_DEST = join(ROOT, 'src', 'lib', 'bharatdrip');
const APP_DEST = join(ROOT, 'src', 'app', 'bharatdrip');
const REPORT = join(ROOT, 'ops', 'BHARATDRIP_MERGE_REPORT.md');
const MARKETPLACE_HOME = join(ROOT, 'src', 'components', 'storefront', 'MarketplaceHome.tsx');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  return result;
}

function commandOk(command, args) {
  const result = run(command, args, { capture: true });
  return { ok: result.status === 0, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function fail(message) {
  console.error(`BharatDrip merge stopped: ${message}`);
  process.exit(1);
}

function assertCleanWorkingTree() {
  const status = commandOk('git', ['status', '--porcelain']);
  if (!status.ok) fail('Could not read git status.');
  if (status.stdout.trim()) {
    console.error(status.stdout.trim());
    fail('Working tree is not clean. Existing work was not modified.');
  }
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function extractArchive(zipPath) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'bharatdrip-merge-'));
  if (process.platform === 'win32') {
    const command = `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${escapePowerShellSingleQuoted(zipPath)}' -DestinationPath '${escapePowerShellSingleQuoted(tempRoot)}' -Force`;
    const result = run('powershell.exe', ['-NoProfile', '-Command', command]);
    if (result.status !== 0) fail('Could not extract the BharatDrip ZIP.');
  } else {
    const result = run('unzip', ['-q', zipPath, '-d', tempRoot]);
    if (result.status !== 0) fail('Could not extract the BharatDrip ZIP.');
  }
  return tempRoot;
}

function findProjectRoot(start) {
  const direct = join(start, 'package.json');
  if (existsSync(direct)) return start;
  const children = readdirSync(start, { withFileTypes: true }).filter(item => item.isDirectory());
  for (const child of children) {
    const candidate = join(start, child.name);
    if (existsSync(join(candidate, 'package.json')) && existsSync(join(candidate, 'src'))) return candidate;
  }
  fail('No Next.js project root was found in the archive.');
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`Could not parse JSON: ${path}`);
  }
}

function rewriteSource(text) {
  return text
    .replaceAll('"@/components/', '"@/components/bharatdrip/')
    .replaceAll("'@/components/", "'@/components/bharatdrip/")
    .replaceAll('"@/lib/products"', '"@/lib/bharatdrip/products"')
    .replaceAll("'@/lib/products'", "'@/lib/bharatdrip/products'")
    .replaceAll('"/products/', '"/bharatdrip/products/')
    .replaceAll("'/products/", "'/bharatdrip/products/")
    .replaceAll('href="/"', 'href="/bharatdrip"')
    .replaceAll("href='/'", "href='/bharatdrip'")
    .replaceAll('href="/#', 'href="/bharatdrip#')
    .replaceAll("href='/#", "href='/bharatdrip#");
}

function scopeSelector(selector) {
  const value = selector.trim();
  if (!value) return value;
  if (value === ':root' || value === 'html' || value === 'body') return '.bharatdrip-shell';
  if (value === '*') return '.bharatdrip-shell *';
  if (value.startsWith('.bharatdrip-shell')) return value;
  return `.bharatdrip-shell ${value}`;
}

function scopeCss(input) {
  let css = input.replace(/^\s*@import\s+["']tailwindcss["'];?\s*$/gm, '');
  css = css.replace(/}\s*(?=[.#:*a-zA-Z])/g, '}\n');
  const lines = css.split(/\r?\n/);
  const out = [];
  let keyframeDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (/^@keyframes\b/.test(trimmed)) {
      keyframeDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      out.push(line);
      continue;
    }
    if (keyframeDepth > 0) {
      keyframeDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      out.push(line);
      continue;
    }
    if (trimmed.startsWith('@') || trimmed.startsWith('}') || trimmed.startsWith('/*')) {
      out.push(line);
      continue;
    }
    const brace = line.indexOf('{');
    if (brace < 0) {
      out.push(line);
      continue;
    }
    const selector = line.slice(0, brace).trim();
    if (/^(from|to|\d+%)$/.test(selector)) {
      out.push(line);
      continue;
    }
    const indent = line.slice(0, line.indexOf(line.trimStart()));
    const scoped = selector.split(',').map(scopeSelector).join(', ');
    out.push(`${indent}${scoped} ${line.slice(brace)}`);
  }

  out.push('', '.bharatdrip-shell { min-height: 100vh; }', '');
  return out.join('\n');
}

function copyAndRewrite(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteSource(readFileSync(source, 'utf8')), 'utf8');
}

function copyComponents(sourceRoot) {
  const source = join(sourceRoot, 'src', 'components');
  if (!existsSync(source)) fail('Archive is missing src/components.');
  mkdirSync(COMPONENT_DEST, { recursive: true });
  for (const item of readdirSync(source, { withFileTypes: true })) {
    if (!item.isFile() || !['.ts', '.tsx'].includes(extname(item.name))) continue;
    copyAndRewrite(join(source, item.name), join(COMPONENT_DEST, item.name));
  }
}

function copyLibrary(sourceRoot) {
  const products = join(sourceRoot, 'src', 'lib', 'products.ts');
  if (!existsSync(products)) fail('Archive is missing src/lib/products.ts.');
  mkdirSync(LIB_DEST, { recursive: true });
  copyAndRewrite(products, join(LIB_DEST, 'products.ts'));
}

function createRoutes(sourceRoot) {
  const home = join(sourceRoot, 'src', 'app', 'page.tsx');
  const detail = join(sourceRoot, 'src', 'app', 'products', '[slug]', 'page.tsx');
  const css = join(sourceRoot, 'src', 'app', 'globals.css');
  if (!existsSync(home) || !existsSync(detail) || !existsSync(css)) {
    fail('Archive is missing the expected homepage, product route, or stylesheet.');
  }
  mkdirSync(join(APP_DEST, 'products', '[slug]'), { recursive: true });
  copyAndRewrite(home, join(APP_DEST, 'page.tsx'));
  copyAndRewrite(detail, join(APP_DEST, 'products', '[slug]', 'page.tsx'));
  writeFileSync(join(APP_DEST, 'bharatdrip.css'), scopeCss(readFileSync(css, 'utf8')), 'utf8');

  const layout = `import type { Metadata } from "next";\nimport type { ReactNode } from "react";\nimport { CartProvider } from "@/components/bharatdrip/cart-context";\nimport "./bharatdrip.css";\n\nexport const metadata: Metadata = {\n  title: "BharatDrip — Everyday, original.",\n  description: "Independent streetwear for every version of you. Designed in India, made to move everywhere.",\n};\n\nexport default function BharatDripLayout({ children }: { children: ReactNode }) {\n  return <CartProvider><div className="bharatdrip-shell">{children}</div></CartProvider>;\n}\n`;
  writeFileSync(join(APP_DEST, 'layout.tsx'), layout, 'utf8');
}

function addMarketplaceNavigation() {
  if (!existsSync(MARKETPLACE_HOME)) fail('BharatShop MarketplaceHome.tsx was not found.');
  let text = readFileSync(MARKETPLACE_HOME, 'utf8');
  if (text.includes('href="/bharatdrip"')) return;

  const desktopMarker = '<Link href="/store" className="text-sm font-bold text-slate-600 hover:text-black">All products</Link>';
  const mobileMarker = '<Link href="/store" className="rounded-full bg-black px-4 py-2 text-xs font-black text-white">All products</Link>';
  if (!text.includes(desktopMarker) || !text.includes(mobileMarker)) {
    fail('Marketplace navigation changed upstream; refusing to patch it blindly.');
  }

  text = text.replace(
    desktopMarker,
    `<Link href="/bharatdrip" className="text-sm font-black text-slate-900 hover:text-black">BharatDrip</Link>\n            ${desktopMarker}`,
  );
  text = text.replace(
    mobileMarker,
    `<Link href="/bharatdrip" className="rounded-full bg-[#d8fc58] px-4 py-2 text-xs font-black text-black">BharatDrip</Link>${mobileMarker}`,
  );
  writeFileSync(MARKETPLACE_HOME, text, 'utf8');
}

function collectUnresolvedAbsoluteRoutes(directory, findings = []) {
  if (!existsSync(directory)) return findings;
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) collectUnresolvedAbsoluteRoutes(path, findings);
    else if (['.ts', '.tsx'].includes(extname(item.name))) {
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(/(?:href=|push\(|replace\()\s*[{'"`]([^#][^'"`} ]*)/g)) {
        const route = match[1];
        if (route.startsWith('/') && !route.startsWith('/bharatdrip')) findings.push(`${path.replace(ROOT, '')}: ${route}`);
      }
    }
  }
  return findings;
}

function writeReport({ sourcePackage, licenseFiles, typecheck, build, unresolved }) {
  mkdirSync(dirname(REPORT), { recursive: true });
  const lines = [
    '# BharatDrip Merge Report',
    '',
    '## Source',
    '',
    `- Archive: \`${basename(ZIP)}\``,
    `- Source Next.js: \`${sourcePackage.dependencies?.next || 'unknown'}\``,
    `- Source React: \`${sourcePackage.dependencies?.react || 'unknown'}\``,
    `- License files in archive: ${licenseFiles.length ? licenseFiles.map(name => `\`${name}\``).join(', ') : 'none detected'}`,
    '',
    '## Imported',
    '',
    '- BharatDrip storefront mounted at `/bharatdrip`.',
    '- Product detail route mounted at `/bharatdrip/products/[slug]`.',
    '- Source UI components copied under `src/components/bharatdrip/`.',
    '- Source product data copied under `src/lib/bharatdrip/`.',
    '- Source CSS scoped under `.bharatdrip-shell` so it does not replace BharatShop global styling.',
    '- BharatShop desktop and mobile navigation receive a BharatDrip entry.',
    '',
    '## Intentionally not imported',
    '',
    '- Source root `package.json`, `next.config.ts`, `tsconfig.json`, PostCSS and ESLint configuration.',
    '- Source database and Drizzle configuration/schema.',
    '- Source `/api/health` route.',
    '- Any environment or credential files.',
    '- Any deployment configuration.',
    '',
    '## Verification',
    '',
    `- TypeScript: ${typecheck.ok ? 'PASS' : 'FAIL'}`,
    `- Next.js build: ${build.ok ? 'PASS' : 'FAIL'}`,
    `- Unresolved absolute routes inside imported BharatDrip code: ${unresolved.length ? unresolved.length : 'none detected'}`,
  ];
  if (unresolved.length) {
    lines.push('', '### Unresolved routes', '', ...unresolved.map(item => `- \`${item}\``));
  }
  lines.push('', '## Safety', '', '- No production database mutation was performed.', '- No secrets were read or copied.', '- No deployment or push was performed.', '- The previously created Git stash remains untouched.', '');
  writeFileSync(REPORT, lines.join('\n'), 'utf8');
}

function main() {
  if (!existsSync(ZIP)) fail(`Archive not found: ${ZIP}`);
  assertCleanWorkingTree();

  const extracted = extractArchive(ZIP);
  try {
    const sourceRoot = findProjectRoot(extracted);
    const sourcePackage = readJson(join(sourceRoot, 'package.json'));
    const sourceNext = String(sourcePackage.dependencies?.next || '');
    const sourceReact = String(sourcePackage.dependencies?.react || '');
    if (!sourceNext.startsWith('16.')) fail(`Unsupported source Next.js version: ${sourceNext || 'unknown'}`);
    if (!sourceReact.startsWith('19.')) fail(`Unsupported source React version: ${sourceReact || 'unknown'}`);

    const licenseFiles = readdirSync(sourceRoot).filter(name => /^(license|copying|notice)(\.|$)/i.test(name));
    if (!licenseFiles.length) console.log('BharatDrip archive has no explicit license file; recording that in the merge report.');

    rmSync(COMPONENT_DEST, { recursive: true, force: true });
    rmSync(LIB_DEST, { recursive: true, force: true });
    rmSync(APP_DEST, { recursive: true, force: true });

    copyComponents(sourceRoot);
    copyLibrary(sourceRoot);
    createRoutes(sourceRoot);
    addMarketplaceNavigation();

    const unresolved = collectUnresolvedAbsoluteRoutes(COMPONENT_DEST)
      .concat(collectUnresolvedAbsoluteRoutes(APP_DEST));

    console.log('\nRunning BharatShop TypeScript verification...');
    const typecheck = commandOk(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck']);
    process.stdout.write(typecheck.stdout);
    process.stderr.write(typecheck.stderr);

    console.log('\nRunning BharatShop production build verification...');
    const build = commandOk(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);

    writeReport({ sourcePackage, licenseFiles, typecheck, build, unresolved });

    console.log('\n=== BharatDrip integration summary ===');
    console.log(`Route: /bharatdrip`);
    console.log(`TypeScript: ${typecheck.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Build: ${build.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Report: ${REPORT}`);
    console.log('Production data/deployment: UNTOUCHED');
    console.log('Existing git stash: UNTOUCHED');

    if (!typecheck.ok || !build.ok) {
      console.log('\nIntegration files were left in the working tree for diagnosis; nothing was committed or pushed.');
      process.exit(2);
    }

    console.log('\nBharatDrip is integrated locally and verified. Review git diff before committing/pushing.');
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}

main();
