import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@swiss/ui"],
    async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'http://localhost:8080/:path*',
      },
    ]
  },
  allowedDevOrigins: ['auth.swiss.local', 'monolith.swiss.local'],
};

export default nextConfig;
