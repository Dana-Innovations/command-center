import { NextResponse, type NextRequest } from "next/server";
import { getUserInfo } from "@/lib/cortex/auth";
import { setCortexUserCookie } from "@/lib/cortex/user";

const PUBLIC_PATHS = ["/login", "/auth/cortex/callback", "/auth/signout"];
const CORTEX_CLIENT_SECRET = process.env.CORTEX_CLIENT_SECRET;

async function tryHydrateCortexUserCookie(args: {
  response: NextResponse;
  accessToken: string;
  maxAge?: number;
}) {
  try {
    const userInfo = await getUserInfo(args.accessToken);
    if (!userInfo?.sub) {
      return;
    }

    setCortexUserCookie(
      args.response,
      {
        sub: userInfo.sub,
        name: userInfo.name ?? "",
        email: userInfo.email ?? "",
        picture: userInfo.picture,
      },
      args.maxAge ?? 3600
    );
  } catch {
    // Best-effort cookie repair; routes can still recover identity from token.
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and API cron routes through
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get("cortex_access_token")?.value;
  const refreshToken = request.cookies.get("cortex_refresh_token")?.value;

  // No tokens → login
  if (!accessToken && !refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Access token missing but refresh token exists → try refresh
  if (!accessToken && refreshToken) {
    try {
      const cortexUrl = process.env.NEXT_PUBLIC_CORTEX_URL;
      const clientId = process.env.CORTEX_CLIENT_ID;

      if (!cortexUrl || !clientId) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      const body: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      };

      if (CORTEX_CLIENT_SECRET) {
        body.client_secret = CORTEX_CLIENT_SECRET;
      }

      const res = await fetch(`${cortexUrl}/api/v1/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const tokens = await res.json();

      if (tokens.error || !tokens.access_token) {
        const response = NextResponse.redirect(
          new URL("/login", request.url)
        );
        response.cookies.delete("cortex_access_token");
        response.cookies.delete("cortex_refresh_token");
        response.cookies.delete("cortex_user");
        return response;
      }

      const response = NextResponse.next();
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

      await tryHydrateCortexUserCookie({
        response,
        accessToken: tokens.access_token,
        maxAge: tokens.expires_in || 3600,
      });

      // Forward the new access token to API routes via header
      response.headers.set("x-cortex-token", tokens.access_token);
      return response;
    } catch {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("cortex_access_token");
      response.cookies.delete("cortex_refresh_token");
      response.cookies.delete("cortex_user");
      return response;
    }
  }

  // Has access token → pass through, forwarding token for API routes
  const response = NextResponse.next();
  if (accessToken) {
    response.headers.set("x-cortex-token", accessToken);
    if (!request.cookies.get("cortex_user")?.value) {
      await tryHydrateCortexUserCookie({
        response,
        accessToken,
      });
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
