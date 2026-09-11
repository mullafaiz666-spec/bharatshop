import type { NextConfig } from "next";

const buildRevision =
  process.env.COMMIT_REF ||
  process.env.GITHUB_SHA ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.COMMIT_SHA ||
  "unknown";

const nextConfig: NextConfig = {
  env: {
    // Publicly safe immutable source revision. Netlify exposes COMMIT_REF while
    // building, but serverless functions do not reliably retain it at runtime.
    // Embedding it makes /api/health exact-deploy verification deterministic.
    BHARATSHOP_BUILD_REVISION: buildRevision,
  },
};

export default nextConfig;
