import type { NextConfig } from "next";

const authApiOrigin = process.env.AUTH_API_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  transpilePackages: ["@swiss/ui"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${authApiOrigin}/:path*`,
      },
    ];
  },
  allowedDevOrigins: ['auth.swiss.local', 'monolith.swiss.local', 'localhost', '0.0.0.0'],
};

export default nextConfig;
