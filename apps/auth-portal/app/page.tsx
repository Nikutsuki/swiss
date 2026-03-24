import { cookies } from 'next/headers';
import LoginPageClient from './login-client'; // Adjust path if necessary

function getEmailFromToken(token: string | null): string | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null; 

    const payloadBase64 = parts[1];
    
    const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decodedPayload);
    
    return parsedPayload.email || null;
  } catch (error) {
    console.error('Failed to decode SSO token:', error);
    return null;
  }
}

export default async function Page() {
  const cookieStore = await cookies();
  const hasSsoToken = cookieStore.has('sso_token');
  const ssoTokenEmail = getEmailFromToken(cookieStore.get('sso_token')?.value || null);

  return <LoginPageClient initialHasSsoToken={hasSsoToken} initialSsoTokenEmail={ssoTokenEmail} />;
}