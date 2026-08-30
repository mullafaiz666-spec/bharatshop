import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "https://veloraskart-agent-production.up.railway.app/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
