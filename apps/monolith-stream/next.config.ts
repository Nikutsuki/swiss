import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const streamApiOrigin = process.env.MONOLITH_STREAM_API_ORIGIN ?? "http://localhost:8084";

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  transpilePackages: ["@swiss/ui", "@swiss/webrtc-signaling"],
  async rewrites() {
    return [
      {
        source: "/api/stream/:path*",
        destination: `${streamApiOrigin}/v1/stream/:path*`,
      },
    ];
  },
  allowedDevOrigins: ["auth.swiss.local", "monolith.swiss.local", "localhost", "0.0.0.0"],
};

export default nextConfig;
