#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import sys

# Browser Use reads telemetry configuration during import.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "false")
os.environ.setdefault("BROWSER_USE_VERSION_CHECK", "false")

from browser_use import Agent, Browser, ChatOllama


async def run_task(task: str, model: str, max_steps: int, headless: bool) -> dict:
    llm = ChatOllama(model=model)
    browser = Browser(headless=headless)
    guarded_task = f"""
You are the browser worker for the user's local Personal AI system.
Complete the requested browser task where safe and reversible.
Do not make purchases, payments, publish content, send messages, change account/security settings,
accept legal terms, delete data, or perform another irreversible/customer-impacting action.
If the task reaches such a boundary, stop immediately before the final action and report exactly what remains.
Do not request, reveal, or print credentials or secrets.

USER TASK:
{task}
""".strip()

    agent = Agent(
        task=guarded_task,
        llm=llm,
        browser=browser,
        use_vision=False,
    )

    try:
        history = await agent.run(max_steps=max_steps)
        errors = [str(error) for error in history.errors() if error]
        return {
            "ok": len(errors) == 0,
            "final_result": history.final_result(),
            "errors": errors,
            "actions": history.action_names(),
        }
    finally:
        close = getattr(browser, "stop", None) or getattr(browser, "close", None)
        if close:
            result = close()
            if asyncio.iscoroutine(result):
                await result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BharatShop local Browser Use worker")
    parser.add_argument("task")
    parser.add_argument("--model", default=os.getenv("PERSONAL_AI_MODEL", os.getenv("AGENCY_MODEL", "qwen3.5:4b")))
    parser.add_argument("--max-steps", type=int, default=int(os.getenv("PERSONAL_AI_BROWSER_MAX_STEPS", "25")))
    parser.add_argument("--headless", action="store_true", default=os.getenv("PERSONAL_AI_BROWSER_HEADLESS", "").lower() in {"1", "true", "yes", "on"})
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = asyncio.run(run_task(args.task, args.model, args.max_steps, args.headless))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["ok"] else 1
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
