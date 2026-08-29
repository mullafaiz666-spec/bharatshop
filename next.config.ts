import type { NextConfig } from "next";

const railwayApi = process.env.RAILWAY_API_URL || "https://veloraskart-agent-production.up.railway.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${railwayApi}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
