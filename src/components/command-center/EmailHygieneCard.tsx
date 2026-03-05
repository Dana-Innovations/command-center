"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useHygieneEmails, HygieneEmail } from "@/hooks/useHygieneEmails";
import { useConnections } from "@/hooks/useConnections";
import { ConnectPrompt } from "@/components/ui/ConnectPrompt";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function domainOf(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at) : email;
}

type ActionState = "idle" | "pending" | "done" | "error";

function HygieneRow({
  email,
  onRemove,
}: {
  email: HygieneEmail;
  onRemove: (id: string) => void;
}) {
  const [blockState, setBlockState] = useState<ActionState>("idle");
  const [phishState, setPhishState] = useState<ActionState>("idle");
  const [unsubState, setUnsubState] = useState<ActionState>("idle");
  const [fading, setFading] = useState(false);

  const [unsubLabel, setUnsubLabel] = useState("✓");

  async function act(
    action: "block" | "phishing" | "unsub",
    setState: (s: ActionState) => void
  ) {
    setState("pending");
    try {
      const url =
        action === "block"
          ? "/api/actions/block-sender"
          : action === "phishing"
            ? "/api/actions/report-phishing"
            : "/api/actions/unsubscribe-email";
      const body =
        action === "block"
          ? { fromEmail: email.from_email, fromName: email.from_name }
          : { messageId: email.id };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (action === "unsub") {
          setUnsubLabel(data.method === "none" ? "✓ Deleted" : "✓ Unsubscribed");
        }
        setState("done");
        setFading(true);
        setTimeout(() => onRemove(email.id), 500);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-3 transition-all duration-500",
        fading && "opacity-0 max-h-0 py-0 overflow-hidden"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-body truncate max-w-[180px]">
            {email.from_name || email.from_email}
          </span>
          <span className="text-[10px] bg-[rgba(245,158,11,0.12)] text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">
            {domainOf(email.from_email)}
          </span>
        </div>
        <div className="text-xs text-text-muted truncate mt-0.5">
          {email.subject}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-text-muted mr-1 hidden sm:inline">
          {timeAgo(email.received_at)}
        </span>
        <ActionBtn
          label="🚫 Block"
          state={blockState}
          className="hover:bg-red-500/10 hover:text-red-400"
          onClick={() => act("block", setBlockState)}
        />
        <ActionBtn
          label="🎣 Phishing"
          state={phishState}
          className="hover:bg-amber-500/10 hover:text-amber-400"
          onClick={() => act("phishing", setPhishState)}
        />
        <ActionBtn
          label="✉️ Unsub"
          doneLabel={unsubLabel}
          state={unsubState}
          className="hover:bg-white/5 hover:text-text-body"
          onClick={() => act("unsub", setUnsubState)}
        />
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  doneLabel,
  state,
  className,
  onClick,
}: {
  label: string;
  doneLabel?: string;
  state: ActionState;
  className?: string;
  onClick: () => void;
}) {
  if (state === "pending")
    return (
      <span className="text-[10px] text-text-muted animate-spin inline-block w-4 h-4 border border-text-muted border-t-transparent rounded-full" />
    );
  if (state === "done")
    return <span className="text-[10px] text-accent-green">{doneLabel || "✓"}</span>;
  if (state === "error")
    return <span className="text-[10px] text-red-400">err</span>;
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[10px] text-text-muted px-1.5 py-0.5 rounded-md transition-colors cursor-pointer",
        className
      )}
    >
      {label}
    </button>
  );
}

export function EmailHygieneCard() {
  const { emails, loading, refetch, removeEmail } = useHygieneEmails();
  const { m365: m365Connected } = useConnections();

  return (
    <section className="glass-card anim-card p-5" style={{ animationDelay: "120ms" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
        <span>📧</span>
        Other Inbox
        {m365Connected && !loading && (
          <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">
            {emails.length}
          </span>
        )}
        {m365Connected && (
          <button
            onClick={refetch}
            className="ml-auto text-[10px] text-text-muted hover:text-accent-amber transition-colors px-2 py-1 rounded-md hover:bg-[var(--accent-amber-dim)] cursor-pointer"
          >
            Refresh
          </button>
        )}
      </h2>

      {!m365Connected ? (
        <ConnectPrompt service="Microsoft 365" />
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-md bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <div className="text-sm text-green-400/70 py-4 text-center">
          ✅ Other inbox is clean
        </div>
      ) : (
        <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
          {emails.slice(0, 20).map((email) => (
            <HygieneRow key={email.id} email={email} onRemove={removeEmail} />
          ))}
        </div>
      )}
    </section>
  );
}
