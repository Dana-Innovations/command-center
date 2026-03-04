import { exchangeCodeForTokens, getUserInfo } from "@/lib/cortex/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    const msg = errorDescription || error;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get("cortex_code_verifier")?.value || "";
  const savedState = cookieStore.get("cortex_oauth_state")?.value;

  // CSRF check
  if (savedState && state !== savedState) {
    return NextResponse.redirect(`${origin}/login?error=state_mismatch`);
  }

  // Exchange code for tokens
  const redirectUri = `${origin}/auth/cortex/callback`;
  const tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);

  if (tokens.error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(tokens.error_description || tokens.error)}`
    );
  }

  // Fetch user profile from Cortex
  const userInfo = await getUserInfo(tokens.access_token);

  // Upsert into user_profiles
  if (userInfo.sub) {
    try {
      const supabase = createServiceClient();
      await supabase.from("user_profiles").upsert(
        {
          cortex_user_id: userInfo.sub,
          email: userInfo.email,
          full_name: userInfo.name,
          avatar_url: userInfo.picture,
          department: userInfo.department,
          job_title: userInfo.job_title,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cortex_user_id" }
      );
    } catch (e) {
      console.error("Failed to upsert user_profiles:", e);
    }
  }

  // Set cookies and redirect home
  const response = NextResponse.redirect(`${origin}/`);

  response.cookies.set("cortex_access_token", tokens.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: tokens.expires_in || 3600,
    path: "/",
  });

  if (tokens.refresh_token) {
    response.cookies.set("cortex_refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });
  }

  // Non-httpOnly cookie for client-side user display
  response.cookies.set(
    "cortex_user",
    JSON.stringify({
      sub: userInfo.sub,
      name: userInfo.name,
      email: userInfo.email,
      picture: userInfo.picture,
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in || 3600,
      path: "/",
    }
  );

  // Clean up PKCE cookies
  response.cookies.delete("cortex_code_verifier");
  response.cookies.delete("cortex_oauth_state");

  return response;
}
