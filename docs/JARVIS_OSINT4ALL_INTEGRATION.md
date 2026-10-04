# JARVIS OSINT4ALL Integration

## What was added

JARVIS now has a read-only OSINT4ALL routing registry backed by the existing BharatShop agent runtime.

OSINT4ALL currently publishes **188 tool profiles**. The registry captures a curated production-safe subset with:

- official tool URL
- investigation category
- workflow stage
- browser/API/self-hosted access
- pricing model
- self-hosted availability
- allowed BharatShop agents
- public/authorized-use policy boundary

The agent runtime returns only entries labeled free and permitted for the requesting agent. Other pricing entries remain metadata in the registry and are not suggested by the runtime. Free labels may still carry usage limits or account requirements; verify the tool's current terms before use.

The registry is intentionally metadata-first. It does **not** grant credentials, bypass authentication, scrape private accounts, or execute third-party actions.

## Runtime tools

Two read-only agent tools are exposed:

- `osint_catalog` — list registered tools, optionally filtered by category and policy; results are limited to free tools.
- `osint_plan` — map a research task to candidate OSINT tools.

Every invocation is recorded through the existing agent tool-audit path.

## Routing

The existing architecture remains:

**CEO → Agent → Tool → Evidence → Audit → Decision → Human Approval → Action → Verified Result**

OSINT discovery sits inside the **Tool** stage. It can identify an appropriate public/authorized research source, but it does not bypass the existing evidence, source-policy, economics, approval or security gates.

Typical routing:

- supplier/company research → ImportYeti, OCCRP Aleph, public procurement records
- username/public-profile research → Sherlock, Maigret, WhatsMyName
- domain/infrastructure research → Shodan, Subfinder, DNSlytics, FOFA, Netlas
- image/media verification → c2patool, SunCalc, permitted source evidence
- historical web evidence → Wayback Machine, ArchiveBox
- geolocation → GeoNames, NASA Worldview, OpenAerialMap, Map Warper, SunCalc
- threat triage → ThreatFox, IntelOwl, OpenCTI, HIBP
- trend/news intelligence → GDELT, Google Trends, Media Cloud, Feedly
- public blockchain verification → Solscan, Blockchair, Dune, Arkham

## Safety boundary

Only public or explicitly authorized information may be researched.

The JARVIS OSINT layer must not:

- access private accounts or private databases
- bypass authentication, paywalls, CAPTCHAs or access controls
- acquire credentials, session cookies or secret tokens
- obtain restricted personal data
- perform intrusive scanning outside an explicitly authorized security scope
- contact, purchase from, or modify a third-party service merely because a research tool exposes a result

A research result is evidence, not proof by itself. Source freshness, identity matching, rights/policy checks and business-specific gates still apply.

## Source

OSINT4ALL directory: https://osint4all.com/tool/

The directory's own methodology emphasizes visible fit/limits, verification context and no paid ranking. JARVIS follows the same principle: tool availability does not equal trust, authorization or truth.
