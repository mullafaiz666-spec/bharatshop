#!/usr/bin/env python3
"""Read-only URL inspection when Browser Use's CDP launch fails."""

import asyncio
import json
import re
import sys
from urllib.parse import urlsplit

from playwright.async_api import async_playwright


async def inspect(task: str) -> dict:
    match = re.search(r"https?://[^\s<>\"']+", task)
    if not match:
        raise ValueError("Provide an exact http or https URL for read-only inspection.")
    url = match.group(0).rstrip(".,;!?)")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("The URL is not suitable for read-only inspection.")

    async with async_playwright() as playwright:
        errors = []
        for options in ({"headless": True}, {"headless": True, "channel": "msedge"}):
            browser = None
            try:
                browser = await playwright.chromium.launch(**options)
                page = await browser.new_page()
                response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                return {"ok": True, "mode": "read-only Playwright", "url": page.url,
                        "title": await page.title(), "httpStatus": response.status if response else None,
                        "note": "Only navigation and title inspection ran; no form, click, or account action was performed."}
            except Exception as exc:
                errors.append(f"{options.get('channel', 'chromium')}: {type(exc).__name__}: {str(exc).splitlines()[0]}")
            finally:
                if browser:
                    await browser.close()
        raise RuntimeError("Chromium and Edge could not open the URL: " + "; ".join(errors))


if __name__ == "__main__":
    try:
        result = asyncio.run(inspect(" ".join(sys.argv[1:])))
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
