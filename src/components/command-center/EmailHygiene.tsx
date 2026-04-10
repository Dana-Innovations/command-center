"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CaptureButton } from "@/components/ui/CaptureButton";
import { useVaultCaptureContext } from "@/components/modals/VaultCaptureProvider";

interface EmailSender {
  id: string;
  name: string;
  email: string;
  group: "spam" | "newsletter" | "marketing";
}


interface EmailHygieneProps {
  senders?: EmailSender[];
}

export function EmailHygiene({ senders = [] }: EmailHygieneProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const { open: openCapture } = useVaultCaptureContext();

  const visible = senders.filter((s) => !removedIds.has(s.id));

  const groups = {
    spam: visible.filter((s) => s.group === "spam"),
    newsletter: visible.filter((s) => s.group === "newsletter"),
    marketing: visible.filter((s) => s.group === "marketing"),
  };

  function handleAction(id: string) {
    setRemovedIds((prev) => new Set(prev).add(id));
  }

  function handleBulk(group: "spam" | "newsletter" | "marketing") {
    const ids = visible.filter((s) => s.group === group).map((s) => s.id);
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "560ms" }}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          Email Hygiene
          <span className="inline-flex items-center rounded-full bg-[var(--tab-bg)] text-text-muted px-2 py-0.5 text-xs font-medium">
            {visible.length} senders
          </span>
        </h2>
        <svg
          className={cn("w-4 h-4 text-text-muted transition-transform", isOpen && "rotate-180")}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4">
          {(["spam", "newsletter", "marketing"] as const).map((group) => {
            const items = groups[group];
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {group === "spam" ? "Spam" : group === "newsletter" ? "Newsletters" : "Marketing"}
                    <span className="ml-1 text-text-muted opacity-60">({items.length})</span>
                  </h3>
                  <button
                    className="text-[10px] px-2 py-0.5 rounded-md bg-accent-red/15 text-accent-red hover:bg-accent-red/25 transition-colors cursor-pointer"
                    onClick={() => handleBulk(group)}
                  >
                    {group === "spam" ? "Unsub All Spam" : "Unsub All"}
                  </button>
                </div>
                <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
                  {items.map((sender) => (
                    <div key={sender.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-text-body">{sender.name}</div>
                        <div className="text-xs text-text-muted truncate">{sender.email}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <CaptureButton
                          compact
                          content={`${sender.name} <${sender.email}> — ${sender.group}`}
                          sourceType="email"
                          sourceMeta={{
                            from: sender.name || sender.email,
                            subject: `Email sender: ${sender.name}`,
                            timestamp: new Date().toISOString(),
                          }}
                          onCapture={openCapture}
                        />
                        <button
                          className="text-[10px] px-2 py-0.5 rounded-md hover:bg-accent-red/20 text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                          onClick={() => handleAction(sender.id)}
                        >
                          Block
                        </button>
                        <button
                          className="text-[10px] px-2 py-0.5 rounded-md hover:bg-accent-amber/20 text-text-muted hover:text-accent-amber transition-colors cursor-pointer"
                          onClick={() => handleAction(sender.id)}
                        >
                          Unsub
                        </button>
                        <button
                          className="text-[10px] px-2 py-0.5 rounded-md hover:bg-accent-teal/20 text-text-muted hover:text-accent-teal transition-colors cursor-pointer"
                          onClick={() => handleAction(sender.id)}
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="text-center py-4 text-sm text-accent-green">
              All clean. Nice work.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
