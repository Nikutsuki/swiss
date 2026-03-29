import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Same auth contract as monolith-drop: `sso_token`, JWT_SECRET, email claim in JWT.
 * Protects the entire stream app (pages only; API and static assets excluded via matcher).
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("sso_token");

  if (!token) {
    const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;
    let redirectUrl = request.url;
    if (redirectUrl === "https://0.0.0.0:3003/") {
      redirectUrl = "https://localhost:3003/";
    }
    const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
    loginUrl.searchParams.set("returnTo", redirectUrl);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token.value, secret);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", String(payload.sub ?? ""));
    const email =
      typeof payload.email === "string" ? payload.email : "";
    if (email) {
      requestHeaders.set("x-user-email", email);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;
    let redirectUrl = request.url;
    if (redirectUrl === "https://0.0.0.0:3003/") {
      redirectUrl = "https://localhost:3003/";
    }
    const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
    loginUrl.searchParams.set("returnTo", redirectUrl);

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("sso_token");
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
