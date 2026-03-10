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

    const redirectUri = `${window.location.origin}/auth/cortex/callback`;
    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_CORTEX_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "profile email mcp:execute mcp:list",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    window.location.href = `${process.env.NEXT_PUBLIC_CORTEX_URL}/api/v1/oauth2/sso/authorize?${params}`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2028]">
      <div className="max-w-md w-full mx-4">
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <img
            src="https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png"
            alt="Sonance"
            className="h-10 w-auto mx-auto mb-6"
          />
          <h1 className="text-2xl font-semibold text-white tracking-tight mb-1">
            Command Center
          </h1>
          <p className="text-sm text-[#6B7C8A]">
            Executive dashboard for Sonance leadership
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-accent-red/10 border border-accent-red/20 text-sm text-accent-red">
              {ERROR_MESSAGES[error] || decodeURIComponent(error)}
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-[#00A3E1] hover:bg-[#0090C8] text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
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

          <p className="text-xs text-[#6B7C8A] mt-6 text-center">
            Invite-only access. Contact your administrator if you need an account.
          </p>
        </div>

        {/* Footer */}
        <p className="text-xs text-[#4A5568] mt-8 text-center">
          Sonance Internal Tool
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#1a2028]">
          <div className="text-[#6B7C8A]">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
