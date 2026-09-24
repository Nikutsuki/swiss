import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildExternalRequestUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "");

  return `${proto}://${host}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

/**
 * Same auth contract as apps/monolith/proxy.ts: `sso_token` cookie, JWT_SECRET,
 * redirect to NEXT_PUBLIC_AUTH_URL with returnTo. Scoped to `/session` only
 * so the marketing home page stays public.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sso_token");

  if (!token) {
    const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;
    const redirectUrl = buildExternalRequestUrl(request);
    const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
    loginUrl.searchParams.set("returnTo", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token.value, secret);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub as string);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;
    const redirectUrl = buildExternalRequestUrl(request);
    const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
    loginUrl.searchParams.set("returnTo", redirectUrl);

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("sso_token");
    return response;
  }
}

export const config = {
  matcher: ["/session", "/session/:path*"],
};
