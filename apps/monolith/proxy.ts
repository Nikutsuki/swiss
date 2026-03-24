import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from 'jose';

export async function proxy(request: NextRequest) {
    const token = request.cookies.get('sso_token');
    const pathname = request.nextUrl.pathname;

    const isSharedViewRoute = pathname.startsWith('/p/');
    const isProtectedRoute = pathname.startsWith('/') && !isSharedViewRoute;

    console.log(`Proxy middleware: incoming request to ${request.url}, token=${token}, isProtectedRoute=${isProtectedRoute}`);

    if (isProtectedRoute) {
        if (!token) {
            const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;

            console.log(`Proxy middleware: token=${token}, authUrlBase=${authUrlBase}`);
            let redirectUrl = request.url;
            if (redirectUrl === "https://0.0.0.0:3001/") {
                redirectUrl = "https://localhost:3001/";
            }
            const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
            loginUrl.searchParams.set('returnTo', redirectUrl);
            return NextResponse.redirect(loginUrl);
        }
        try {
            const secret = new TextEncoder().encode(process.env.JWT_SECRET);
            const { payload } = await jwtVerify(token.value, secret);

            const requestHeaders = new Headers(request.headers);
            requestHeaders.set('x-user-id', payload.sub as string);

            console.log(`Proxy middleware: token valid, userId=${payload.sub}`);

            return NextResponse.next({
                request: {
                    headers: requestHeaders,
                },
            });
        } catch (error) {
            const authUrlBase = process.env.NEXT_PUBLIC_AUTH_URL;
            let redirectUrl = request.url;
            if (redirectUrl === "https://0.0.0.0:3001/") {
                redirectUrl = "https://localhost:3001/";
            }
            const loginUrl = new URL(`${authUrlBase}`, redirectUrl);
            loginUrl.searchParams.set('returnTo', redirectUrl);

            const response = NextResponse.redirect(loginUrl);

            console.log(`Proxy middleware: token invalid, error=${error}, redirecting to ${loginUrl}`);

            response.cookies.delete('sso_token');
            return response;
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};