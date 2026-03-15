import type { NextResponse } from "next/server";
import { getUserInfo } from "@/lib/cortex/auth";
import { getCortexToken } from "@/lib/cortex/client";

export interface CortexSessionUser {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

function normalizeCortexSessionUser(
  value: Partial<CortexSessionUser> | null | undefined
) {
  if (!value?.sub) return null;

  return {
    sub: value.sub,
    name: value.name || "",
    email: value.email || "",
    picture: value.picture,
  } satisfies CortexSessionUser;
}

export function parseCortexUserCookieValue(
  cookieValue: string | null | undefined
) {
  if (!cookieValue) return null;

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as Partial<CortexSessionUser>;
    return normalizeCortexSessionUser(parsed);
  } catch {
    return null;
  }
}

export function parseCortexUserFromCookieHeader(
  cookieHeader: string | null | undefined
) {
  const match = (cookieHeader || "").match(/(?:^|;\s*)cortex_user=([^;]+)/);
  return parseCortexUserCookieValue(match?.[1]);
}

export async function getCortexUserFromRequest(request: Request) {
  const cookieUser = parseCortexUserFromCookieHeader(
    request.headers.get("cookie")
  );
  if (cookieUser) {
    return cookieUser;
  }

  const token = getCortexToken(request);
  if (!token) {
    return null;
  }

  try {
    const userInfo = await getUserInfo(token);
    return normalizeCortexSessionUser(userInfo);
  } catch {
    return null;
  }
}

export function setCortexUserCookie(
  response: NextResponse,
  user: CortexSessionUser,
  maxAge = 3600
) {
  response.cookies.set("cortex_user", JSON.stringify(user), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}
