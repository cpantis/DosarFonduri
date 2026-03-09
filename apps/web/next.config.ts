import type { NextConfig } from "next";

const rawUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const API_URL = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@dosarfonduri/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
