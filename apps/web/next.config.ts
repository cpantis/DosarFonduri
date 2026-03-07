import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@dosarfonduri/shared"],
};

export default nextConfig;
