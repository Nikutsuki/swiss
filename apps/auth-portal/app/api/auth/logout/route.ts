import { NextResponse } from 'next/server';

function trimQuotes(s: string | undefined) {
  if (!s) return undefined;
  return s.replace(/^["']|["']$/g, '').trim() || undefined;
}

export async function POST() {
  const secure = process.env.COOKIE_SECURE === 'true';
  const sameSiteRaw = process.env.COOKIE_SAMESITE?.toLowerCase();
  const sameSite = sameSiteRaw === 'strict' ? 'strict' : 'lax';
  const domain = trimQuotes(process.env.NEXT_PUBLIC_ROOT_DOMAIN);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: 'sso_token',
    value: '',
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
  return response;
}
