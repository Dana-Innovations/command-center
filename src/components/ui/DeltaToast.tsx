"use client";

import { useEffect, useState } from "react";

interface DeltaToastProps {
  count: number;
  onClick: () => void;
  onDismiss: () => void;
}

export function DeltaToast({ count, onClick, onDismiss }: DeltaToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[10000] pointer-events-auto">
      <button
        onClick={onClick}
        className="flex items-center gap-3 rounded-xl border border-[var(--bg-card-border)] bg-[var(--bg-card)] px-4 py-3 text-sm shadow-lg backdrop-blur-md anim-card cursor-pointer transition-colors hover:border-accent-teal/30"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent-teal shrink-0"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="text-text-body">
          <span className="font-semibold text-text-heading">{count}</span>{" "}
          {count === 1 ? "thing" : "things"} changed while you were away
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-text-muted hover:text-text-body transition-colors ml-1 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            onDismiss();
          }}
        >
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
    </div>
  );
}
