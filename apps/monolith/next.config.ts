import type { NextConfig } from "next";

const authApiOrigin = process.env.AUTH_API_ORIGIN ?? "http://localhost:8080";
const monolithApiOrigin = process.env.MONOLITH_API_ORIGIN ?? "http://localhost:8081";

const nextConfig: NextConfig = {
  transpilePackages: ["@swiss/ui"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${authApiOrigin}/:path*`,
      },
      {
        source: "/api/devices/:path*",
        destination: `${monolithApiOrigin}/devices/:path*`,
      },
      {
        source: "/api/pastes",
        destination: `${monolithApiOrigin}/pastes`,
      },
      {
        source: "/api/pastes/:path*",
        destination: `${monolithApiOrigin}/pastes/:path*`,
      },
      {
        source: "/api/shared-pastes/:path*",
        destination: `${monolithApiOrigin}/shared-pastes/:path*`,
      },
    ];
  },
  allowedDevOrigins: ['auth.swiss.local', 'monolith.swiss.local', 'localhost', '0.0.0.0'],
};

export default nextConfig;
