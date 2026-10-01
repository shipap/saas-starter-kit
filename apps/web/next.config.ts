import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  output: "standalone",
  experimental: { cpus: 1 },
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingRoot: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  ),
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  logging: { incomingRequests: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
