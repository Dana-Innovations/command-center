"use client";

import { useCallback, useEffect, useState } from "react";

interface CortexUser {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

function getCortexUserFromCookie(): CortexUser | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/cortex_user=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<{
    email: string;
    user_metadata: { full_name: string; avatar_url?: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cortexUser = getCortexUserFromCookie();
    if (cortexUser) {
      setUser({
        email: cortexUser.email,
        user_metadata: {
          full_name: cortexUser.name,
          avatar_url: cortexUser.picture,
        },
      });
    }
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    // POST to signout route which clears cookies and revokes token
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/signout";
    document.body.appendChild(form);
    form.submit();
  }, []);

  return { user, loading, signOut };
}
