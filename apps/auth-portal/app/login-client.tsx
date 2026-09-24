'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow
} from '@swiss/ui';
import {
  browserSupportsWebAuthn,
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';

interface Credential {
  id: string;
  credential_label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface LoginPageClientProps {
  initialHasSsoToken: boolean;
  initialSsoTokenEmail?: string | null;
}

function toRegistrationOptionsJSON(raw: unknown) {
  if (
    raw &&
    typeof raw === 'object' &&
    'publicKey' in raw &&
    (raw as { publicKey: unknown }).publicKey
  ) {
    return (raw as { publicKey: unknown }).publicKey;
  }
  return raw;
}

function toAuthenticationOptionsJSON(raw: unknown) {
  if (
    raw &&
    typeof raw === 'object' &&
    'publicKey' in raw &&
    (raw as { publicKey: unknown }).publicKey
  ) {
    return (raw as { publicKey: unknown }).publicKey;
  }
  return raw;
}

export default function LoginPageClient({ initialHasSsoToken, initialSsoTokenEmail }: LoginPageClientProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(
    initialHasSsoToken ? 'SSO Cookie detected. You are already authenticated.' : ''
  );
  const searchParams = useSearchParams();

  const [isSignedIn, setIsSignedIn] = useState(initialHasSsoToken);
  const [tokenEmail, setTokenEmail] = useState<string | null>(initialSsoTokenEmail || null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [loginMode, setLoginMode] = useState<'webauthn' | 'totp'>('webauthn');
  const [totpCode, setTotpCode] = useState('');
  const [totpSetupUri, setTotpSetupUri] = useState<string | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);

  const toErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  };

  const getWebAuthnSupportError = () => {
    if (!window.isSecureContext) {
      return 'WebAuthn requires a secure origin (HTTPS or localhost).';
    }
    if (!browserSupportsWebAuthn()) {
      return 'This browser does not support WebAuthn on the current origin.';
    }
    return null;
  };

  const enrollLocalPasskey = async (userEmail: string) => {
    const supportError = getWebAuthnSupportError();
    if (supportError) {
      setStatus(`Cannot register passkey: ${supportError}`);
      return;
    }
    setStatus('Registering a passkey for this device...');
    const optResp = await fetch('/api/auth/register/options', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail }),
    });
    if (!optResp.ok) throw new Error('Failed to get registration options');
    const rawOpts = await optResp.json();
    const registrationOptions = toRegistrationOptionsJSON(rawOpts);
    const attResp = await startRegistration({ optionsJSON: registrationOptions as Parameters<typeof startRegistration>[0]['optionsJSON'] });
    const verifyResp = await fetch('/api/auth/register/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, credential: attResp }),
    });
    if (!verifyResp.ok) throw new Error('Passkey registration failed');
  };

  const handleRegister = async () => {
    const supportError = getWebAuthnSupportError();
    if (supportError) {
      setStatus(`Error: ${supportError}`);
      return;
    }
    setStatus('Requesting registration challenge...');
    try {
      const resp = await fetch('/api/auth/register/options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error('Failed to get registration options');
      const rawOpts = await resp.json();
      const registrationOptions = toRegistrationOptionsJSON(rawOpts);
      setStatus('Waiting for hardware authenticator...');
      const attResp = await startRegistration({ optionsJSON: registrationOptions as Parameters<typeof startRegistration>[0]['optionsJSON'] });
      setStatus('Verifying and saving credential...');
      const verificationResp = await fetch('/api/auth/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, credential: attResp }),
      });
      if (!verificationResp.ok) throw new Error('Verification failed');
      setStatus('Registration successful.');
      setIsSignedIn(true);
      setTokenEmail(email);
    } catch (error: unknown) {
      console.error(error);
      setStatus(`Error: ${toErrorMessage(error)}`);
    }
  };

  const completeLogin = async (data: { redirectTo?: string }) => {
    setStatus('Login successful. Redirecting...');
    if (data?.redirectTo) {
      window.location.assign(data.redirectTo);
      return;
    }
    window.location.reload();
  };

  const handleLogin = async () => {
    const supportError = getWebAuthnSupportError();
    if (supportError) {
      setStatus(`Error: ${supportError}`);
      return;
    }
    setStatus('Requesting authentication challenge...');
    try {
      const resp = await fetch('/api/auth/login/options', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!resp.ok) throw new Error('Failed to get login options');
      const rawOpts = await resp.json();
      const authOptions = toAuthenticationOptionsJSON(rawOpts);
      setStatus('Waiting for hardware authenticator...');
      const asseResp = await startAuthentication({ optionsJSON: authOptions as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      setStatus('Verifying authentication...');
      const returnTo = searchParams.get('returnTo') ?? '';
      const verificationResp = await fetch('/api/auth/login/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, returnTo, credential: asseResp }),
      });
      if (!verificationResp.ok) {
        const message = (await verificationResp.text()).trim() || 'Authentication failed at the server.';
        throw new Error(message);
      }
      const data = await verificationResp.json();
      if (data?.requireLocalPasskeyEnrollment) {
        await enrollLocalPasskey(email);
        await completeLogin(data);
        return;
      }
      await completeLogin(data);
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
    }
  };

  const handleTOTPLogin = async () => {
    setStatus('Verifying authenticator code...');
    try {
      const verificationResp = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: totpCode.replace(/\s/g, '') }),
      });
      if (!verificationResp.ok) throw new Error('Invalid code or account not set up.');
      await verificationResp.json();
      setStatus('Signed in. Redirecting...');
      const returnTo = searchParams.get('returnTo') ?? '';
      if (returnTo) window.location.assign(returnTo);
      else window.location.reload();
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
    }
  };

  const handleTotpGenerate = async () => {
    setStatus('Generating TOTP secret...');
    try {
      const resp = await fetch('/api/auth/totp/generate', {
        method: 'POST',
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Failed to generate TOTP');
      const data = await resp.json();
      setTotpSetupUri(data.otpauthUri ?? null);
      setTotpSetupSecret(data.secret ?? null);
      setStatus('Scan the QR code with your authenticator app, then enter a code to confirm on next login.');
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
    }
  };

  const handleRegisterThisDevice = async () => {
    if (!tokenEmail) return;
    try {
      await enrollLocalPasskey(tokenEmail);
      setStatus('This device now has a passkey.');
      await fetchCredentials();
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
    }
  };

  const fetchCredentials = async () => {
    setCredentialsLoading(true);
    try {
      const resp = await fetch('/api/auth/credentials', { credentials: 'include' });
      if (!resp.ok) {
        throw new Error('Failed to load security devices');
      }
      const data = await resp.json();
      setCredentials(data);
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleRenameCredential = async (id: string) => {
    const resp = await fetch(`/api/auth/credentials/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel }),
    });
    if (resp.ok) {
      setEditingId(null);
      setNewLabel('');
      await fetchCredentials();
      return;
    }
    setStatus('Error: Failed to rename device');
  };

  const handleRevokeCredential = async (id: string) => {
    if (!confirm('Are you sure? This device will no longer be able to unlock your vault.')) return;
    const resp = await fetch(`/api/auth/credentials/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (resp.ok) {
      await fetchCredentials();
      return;
    }
    setStatus('Error: Failed to revoke device');
  };

  const handleSignOut = async () => {
    try {
      const resp = await fetch('/api/auth/logout', { method: 'POST' });
      if (!resp.ok) {
        throw new Error('Failed to clear session cookie');
      }
    } catch (error: unknown) {
      setStatus(`Error: ${toErrorMessage(error)}`);
      return;
    }
    setTokenEmail(null);
    setCredentials([]);
    setEditingId(null);
    setNewLabel('');
    setTotpSetupUri(null);
    setTotpSetupSecret(null);
    setStatus('Signed out.');
    setIsSignedIn(false);
  };

  useEffect(() => {
    if (!isSignedIn) return;
    void fetchCredentials();
    // fetchCredentials is stable for our usage; avoid effect loops on function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  if (isSignedIn) {
    return (
      <div className="auth-background flex flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <Card className="mx-auto w-full max-w-6xl" variant="ghost">
          <CardBody className="p-4 sm:p-6">
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <CardTitle className="text-2xl sm:text-3xl lg:text-4xl mb-2 wrap-break-word">{tokenEmail}</CardTitle>
                <p className="text-(--on-surface-variant)">{status || 'Session active.'}</p>
              </div>
              <Button onClick={handleSignOut} variant="primary" size="lg" className="w-full sm:w-auto">
                Sign Out
              </Button>
            </div>

            <div className="rounded-sm bg-(--surface-container-high) p-4 mb-6 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-center">
              <Button onClick={handleRegisterThisDevice} variant="secondary" size="sm" className="w-full sm:w-auto">
                Register this device (passkey)
              </Button>
              <Button onClick={handleTotpGenerate} variant="secondary" size="sm" className="w-full sm:w-auto">
                Set up authenticator app
              </Button>
            </div>

            {totpSetupUri && (
              <div className="mb-6 p-4 rounded-sm bg-(--surface-container-high)">
                <p className="text-sm mb-2 text-(--on-surface-variant)">Authenticator provisioning</p>
                <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-6 items-start">
                  <QRCodeSVG value={totpSetupUri} size={140} />
                  {totpSetupSecret && (
                    <p className="text-xs break-all max-w-md">
                      <span className="font-medium">Secret (manual entry): </span>
                      {totpSetupSecret}
                    </p>
                  )}
                </div>
              </div>
            )}

            <CardTitle className="text-2xl sm:text-3xl mb-4">Security Devices</CardTitle>
            <p className="mb-6 text-(--on-surface-variant)">
              Manage the hardware keys that can unlock your encrypted vault.
            </p>

            {credentialsLoading ? (
              <p className="text-(--on-surface-variant)">Loading devices...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell className="font-bold whitespace-nowrap">Device Label</TableCell>
                      <TableCell className="font-bold whitespace-nowrap">Status</TableCell>
                      <TableCell className="font-bold whitespace-nowrap">Registered</TableCell>
                      <TableCell className="font-bold whitespace-nowrap">Last Used</TableCell>
                      <TableCell className="font-bold text-right whitespace-nowrap">Actions</TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credentials.map((cred) => (
                      <TableRow key={cred.id}>
                        <TableCell className="min-w-52">
                          {editingId === cred.id ? (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <Input
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                size="sm"
                              />
                              <Button onClick={() => handleRenameCredential(cred.id)} size="sm">
                                Save
                              </Button>
                            </div>
                          ) : (
                            <span className="font-medium">{cred.credential_label || 'Unnamed Device'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {cred.revoked_at ? (
                            <Badge variant="error">Revoked</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {cred.created_at ? new Date(cred.created_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {cred.last_used_at ? new Date(cred.last_used_at).toLocaleString() : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          {!cred.revoked_at && (
                            <div className="flex flex-col sm:flex-row gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingId(cred.id);
                                  setNewLabel(cred.credential_label || '');
                                }}
                              >
                                Rename
                              </Button>
                              <Button variant="error" size="sm" onClick={() => handleRevokeCredential(cred.id)}>
                                Revoke
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1">
      <div className="auth-background flex flex-1 flex-col px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Card className="w-full max-w-md m-auto" variant="ghost">
          <CardBody className="p-4 sm:p-6">
            <CardTitle className="text-2xl sm:text-3xl lg:text-4xl mb-4">Authenticate into Swiss</CardTitle>
            <Input
              type="email"
              title="IDENTITY IDENTIFIER"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4"
            />
            {loginMode === 'webauthn' ? (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button onClick={handleRegister} variant="secondary" className="flex-1 min-h-13" size="lg">
                  Register
                </Button>
                <Button onClick={handleLogin} variant="primary" className="flex-1 min-h-13" size="lg">
                  Authenticate
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
                <Button onClick={handleTOTPLogin} variant="primary" size="lg" className="min-h-13">
                  Verify code
                </Button>
              </div>
            )}
            <button
              type="button"
              className="mt-4 text-sm text-(--on-surface-variant) underline"
              onClick={() => setLoginMode(loginMode === 'webauthn' ? 'totp' : 'webauthn')}
            >
              {loginMode === 'webauthn' ? 'Use authenticator app instead' : 'Back to passkey sign-in'}
            </button>
            {status && <p className="mt-4 text-sm text-(--on-surface-variant)">{status}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
