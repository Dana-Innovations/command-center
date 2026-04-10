"use client";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type {
  CaptureSourceType,
  CaptureSourceMeta,
} from "@/lib/capture-routing";

interface CaptureButtonProps {
  content: string;
  sourceType: CaptureSourceType;
  sourceMeta: CaptureSourceMeta;
  onCapture: (
    content: string,
    sourceType: CaptureSourceType,
    sourceMeta: CaptureSourceMeta
  ) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Reusable "⤴ Vault" button that triggers the capture drawer.
 * Only renders for Ari (isAri gated). Other users see nothing.
 */
export function CaptureButton({
  content,
  sourceType,
  sourceMeta,
  onCapture,
  compact = false,
  className,
}: CaptureButtonProps) {
  const { isAri } = useAuth();
  if (!isAri) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onCapture(content, sourceType, sourceMeta);
  };

  return (
    <button
      onClick={handleClick}
      title="Capture to Vault"
      className={cn(
        "shrink-0 inline-flex items-center gap-1",
        "text-[10px] font-semibold uppercase tracking-wider",
        "text-text-muted hover:text-accent-amber",
        "transition-colors cursor-pointer",
        compact ? "px-1 py-0.5" : "px-2 py-1 rounded",
        !compact && "hover:bg-accent-amber/10",
        className
      )}
    >
      <span aria-hidden="true">⤴</span>
      {!compact && <span>Vault</span>}
    </button>
  );
}
