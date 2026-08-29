"""BharatShop image search adapter for the self-hosted SearXNG service."""
from __future__ import annotations

import os
import time
from typing import Any
from urllib.parse import quote_plus

import requests

SEARXNG_URL = os.getenv("IMAGE_SEARCH_BASE_URL", "https://bharatshop-searxng.onrender.com").rstrip("/")
TIMEOUT = float(os.getenv("IMAGE_SEARCH_TIMEOUT", "20"))
MAX_ATTEMPTS = int(os.getenv("IMAGE_SEARCH_MAX_ATTEMPTS", "4"))


def _search_once(query: str) -> list[dict[str, Any]]:
    url = f"{SEARXNG_URL}/search?q={quote_plus(query)}&categories=images&format=json"
    response = requests.get(url, timeout=TIMEOUT, headers={"Accept": "application/json", "User-Agent": "BharatShop/1.0"})
    if response.status_code == 429:
        raise RuntimeError("SearXNG rate limited request (429)")
    response.raise_for_status()
    payload = response.json()
    return payload.get("results", [])


def search_product_images(query: str, minimum: int = 4, maximum: int = 8) -> list[dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(MAX_ATTEMPTS):
        try:
            raw = _search_once(query)
            verified: list[dict[str, Any]] = []
            seen: set[str] = set()
            for item in raw:
                image_url = item.get("img_src") or item.get("thumbnail_src")
                source_url = item.get("url")
                if not image_url or image_url in seen:
                    continue
                seen.add(image_url)
                verified.append({
                    "image_url": image_url,
                    "source_url": source_url,
                    "title": item.get("title", ""),
                    "width": item.get("resolution", ""),
                })
                if len(verified) >= maximum:
                    break
            if len(verified) >= minimum:
                return verified
            raise RuntimeError(f"Only {len(verified)} usable images returned; need at least {minimum}")
        except Exception as exc:
            last_error = exc
            if attempt == MAX_ATTEMPTS - 1:
                break
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Image search failed after {MAX_ATTEMPTS} attempts: {last_error}")
