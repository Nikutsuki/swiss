import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  transpilePackages: ["@swiss/ui", "@swiss/webrtc-signaling"],
};

export default nextConfig;
