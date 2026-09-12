import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared AI provider has bounded Gemini to local/OpenAI-compatible failover", () => {
  const src = read("src/lib/ai/provider.ts");
  assert.match(src, /gemini\+openai-compatible-fallback/);
  assert.match(src, /hasOpenAICompatibleFallback/);
  assert.match(src, /if \(!baseUrl\(\)\) throw primaryError/);
  assert.match(src, /requestOpenAICompatible\(messages, \{ \.\.\.options, model: localTextModel\(\) \}\)/);
  assert.match(src, /primary_and_fallback_unavailable/);
  assert.match(src, /fallbackUsed/);
});

test("public agent health reports the immutable deployed build revision and provider chain", () => {
  const src = read("src/app/api/health/agents/route.ts");
  assert.match(src, /BHARATSHOP_BUILD_REVISION/);
  assert.match(src, /COMMIT_REF/);
  assert.match(src, /provider: readiness\.provider/);
  assert.match(src, /configured AI provider chain passed the live model readiness probe/);
});

test("Android v1.5.1 targets the currently verified production runtime", () => {
  const activity = read("android-app/app/src/main/java/com/bharatshop/app/MainActivity.java");
  const gradle = read("android-app/app/build.gradle");
  const workflow = read(".github/workflows/android-apk.yml");
  assert.match(activity, /https:\/\/bharatshop-9w4a\.onrender\.com\/\?app=android-1\.5\.1/);
  assert.doesNotMatch(activity, /bharatshop-35fd\.netlify\.app/);
  assert.match(gradle, /versionCode 6/);
  assert.match(gradle, /versionName '1\.5\.1'/);
  assert.match(workflow, /BharatShop-v1\.5\.1\.apk/);
  assert.match(workflow, /bharatshop-android-v1\.5\.1/);
});

test("validated laptop workstation is packaged from tracked source only", () => {
  const workflow = read(".github/workflows/agent-suite-build.yml");
  assert.match(workflow, /git archive --format=zip/);
  assert.match(workflow, /BharatShop-Agent-Workstation-2026-09-11\.zip/);
  assert.match(workflow, /BUILD-REVISION\.txt/);
  assert.match(workflow, /bharatshop-agent-workstation-20260911/);
});
