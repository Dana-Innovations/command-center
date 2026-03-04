import { revokeToken } from "@/lib/cortex/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const cookieStore = await cookies();

  // Best-effort revoke the access token
  const accessToken = cookieStore.get("cortex_access_token")?.value;
  if (accessToken) {
    await revokeToken(accessToken);
  }

  const response = NextResponse.redirect(`${origin}/login`);
  response.cookies.delete("cortex_access_token");
  response.cookies.delete("cortex_refresh_token");
  response.cookies.delete("cortex_user");

  return response;
}
