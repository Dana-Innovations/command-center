/**
 * Server-side Cortex OAuth2 helpers.
 * Used in the auth callback route and middleware.
 */

const CORTEX_URL = process.env.NEXT_PUBLIC_CORTEX_URL!;
const CLIENT_ID = process.env.CORTEX_CLIENT_ID!;
const CLIENT_SECRET = process.env.CORTEX_CLIENT_SECRET!;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface UserInfo {
  sub: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  department?: string;
  job_title?: string;
  employee_number?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(`${CORTEX_URL}/api/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const res = await fetch(`${CORTEX_URL}/api/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  return res.json();
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(`${CORTEX_URL}/api/v1/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${CORTEX_URL}/api/v1/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {
    // Best-effort revocation
  });
}
