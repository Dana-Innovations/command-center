"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  generateCodeVerifier,
  generateCodeChallenge,
} from "@/lib/cortex/pkce";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed:
    "Your account is not authorized. Contact your admin for access.",
  auth_failed: "Authentication failed. Please try again.",
  no_code: "Invalid authentication response. Please try again.",
  state_mismatch: "Security validation failed. Please try again.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = crypto.randomUUID();

    // Store PKCE verifier and state in cookies for the server-side callback
    document.cookie = `cortex_code_verifier=${codeVerifier}; path=/; max-age=600; samesite=lax`;
    document.cookie = `cortex_oauth_state=${state}; path=/; max-age=600; samesite=lax`;

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_CORTEX_CLIENT_ID!,
      redirect_uri: `${window.location.origin}/auth/cortex/callback`,
      response_type: "code",
      scope: "profile email mcp:execute mcp:list",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    window.location.href = `${process.env.NEXT_PUBLIC_CORTEX_URL}/api/v1/oauth2/sso/authorize?${params}`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="glass-card max-w-md w-full mx-4 p-8 text-center">
        <h1 className="font-display text-2xl font-semibold text-text-heading mb-2">
          Executive Command Center
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Sign in with your Sonance employee account
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 text-sm text-accent-red">
            {ERROR_MESSAGES[error] || decodeURIComponent(error)}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-[#2F2F2F] hover:bg-[#3a3a3a] text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          {loading ? "Redirecting..." : "Sign in with Cortex"}
        </button>

        <p className="text-xs text-text-muted mt-6">
          Invite-only access. Contact your administrator if you need an account.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
          <div className="text-text-muted">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
