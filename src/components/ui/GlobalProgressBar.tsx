"use client";

import { useEffect, useState } from "react";

type Phase = "idle" | "loading" | "completing";

export function GlobalProgressBar({ isActive }: { isActive: boolean }) {
  const [phase, setPhase] = useState<Phase>(isActive ? "loading" : "idle");
  const [prevIsActive, setPrevIsActive] = useState(isActive);

  // Adjust state during render when prop changes
  // (React-recommended pattern — no effect needed for prop-driven transitions)
  if (isActive !== prevIsActive) {
    setPrevIsActive(isActive);
    if (isActive) {
      setPhase("loading");
    } else if (phase === "loading") {
      setPhase("completing");
    }
  }

  // Timer clears the completion animation (async — not a synchronous effect setState)
  useEffect(() => {
    if (phase !== "completing") return;
    const timer = setTimeout(() => setPhase("idle"), 400);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] h-[2px]">
      <div
        className="h-full rounded-r-full transition-all"
        style={{
          background: "var(--sonance-blue)",
          boxShadow: "0 0 8px rgba(0, 163, 225, 0.4)",
          width: phase === "loading" ? "85%" : "100%",
          opacity: phase === "completing" ? 0 : 1,
          transitionDuration:
            phase === "loading" ? "8s" : "0.3s",
          transitionTimingFunction:
            phase === "loading"
              ? "cubic-bezier(0.1, 0.7, 0.2, 1)"
              : "ease",
        }}
      />
    </div>
  );
}
