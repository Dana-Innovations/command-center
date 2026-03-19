"use client";

import { useMemo, useState } from "react";
import { useAttention } from "@/lib/attention/client";
import type { AttentionFeedbackValue, AttentionTarget } from "@/lib/attention/types";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{
  value: AttentionFeedbackValue;
  label: string;
  short: string;
  tooltip: string;
}> = [
  { value: "raise", label: "Raise", short: "Raise", tooltip: "Raise priority" },
  { value: "right", label: "Right level", short: "Right", tooltip: "Priority is right" },
  { value: "lower", label: "Lower", short: "Lower", tooltip: "Lower priority" },
];

export function AttentionFeedbackControl({
  target,
  surface,
  compact = false,
  className,
}: {
  target: AttentionTarget;
  surface?: string;
  compact?: boolean;
  className?: string;
}) {
  const { getItemFeedback, submitFeedback } = useAttention();
  const [pending, setPending] = useState<AttentionFeedbackValue | null>(null);

  const current = useMemo(
    () => getItemFeedback(target.itemType, target.itemId),
    [getItemFeedback, target.itemId, target.itemType]
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-[var(--bg-card-border)] bg-black/10 p-1",
        compact ? "text-[10px]" : "text-[11px]",
        className
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {OPTIONS.map((option) => {
        const active = current === option.value;
        const busy = pending === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={Boolean(pending)}
            onClick={async () => {
              setPending(option.value);
              try {
                await submitFeedback(target, option.value, surface);
              } finally {
                setPending(null);
              }
            }}
            className={cn(
              "relative group rounded-xl px-2.5 py-1 transition-colors",
              active
                ? option.value === "raise"
                  ? "bg-accent-green/15 text-accent-green"
                  : option.value === "lower"
                    ? "bg-accent-red/15 text-accent-red"
                    : "bg-[var(--tab-active-bg)] text-text-heading"
                : "text-text-muted hover:text-text-body"
            )}
          >
            {busy ? "..." : compact ? option.short : option.label}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] rounded bg-gray-900 text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {option.tooltip}
            </span>
          </button>
        );
      })}
    </div>
  );
}
