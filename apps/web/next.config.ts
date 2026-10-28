import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@letsdance/contracts", "@letsdance/motion-core"],
  experimental: {
    // Leave room for a 200 MB source video plus multipart framing if a proxy is added later.
    proxyClientMaxBodySize: "210mb",
  },
};

export default nextConfig;
