const CALLBACK_PATH = "/auth/cortex/callback";

function sanitizeValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getCortexRedirectUri(fallbackOrigin?: string): string {
  const explicitRedirectUri = sanitizeValue(
    process.env.NEXT_PUBLIC_CORTEX_REDIRECT_URI
  );

  if (explicitRedirectUri) {
    return explicitRedirectUri;
  }

  const origin = sanitizeValue(fallbackOrigin);
  if (origin) {
    return `${stripTrailingSlashes(origin)}${CALLBACK_PATH}`;
  }

  const siteUrl = sanitizeValue(process.env.NEXT_PUBLIC_SITE_URL);
  if (siteUrl) {
    return `${stripTrailingSlashes(siteUrl)}${CALLBACK_PATH}`;
  }

  throw new Error(
    "Missing NEXT_PUBLIC_CORTEX_REDIRECT_URI or NEXT_PUBLIC_SITE_URL for Cortex OAuth"
  );
}
