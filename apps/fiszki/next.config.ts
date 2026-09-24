import type { NextConfig } from "next";

const authApiOrigin = process.env.AUTH_API_ORIGIN ?? "http://localhost:8080";
const fiszkiApiOrigin = process.env.FISZKI_API_ORIGIN ?? "http://localhost:8085";

const nextConfig: NextConfig = {
  transpilePackages: ["@swiss/ui"],
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${authApiOrigin}/:path*`,
      },
      {
        source: "/api/fiszki/:path*",
        destination: `${fiszkiApiOrigin}/:path*`,
      },
    ];
  },
  allowedDevOrigins: ['auth.swiss.local', 'fiszki.swiss.local', 'localhost', '0.0.0.0'],
};

export default nextConfig;
