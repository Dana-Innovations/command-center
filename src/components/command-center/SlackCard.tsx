"use client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConnectPrompt } from "@/components/ui/ConnectPrompt";
import { SlackIcon } from "@/components/ui/icons";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useConnections } from "@/hooks/useConnections";

export function SlackCard() {
  const { messages, loading } = useSlackFeed();
  const { slack: slackConnected } = useConnections();

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "80ms" }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading mb-4">
        <SlackIcon />
        Slack
        {slackConnected && (
          <span className="inline-flex items-center rounded-full bg-[rgba(90,199,139,0.12)] text-accent-green px-2 py-0.5 text-xs font-medium">
            {messages.length} messages
          </span>
        )}
      </h2>
      {!slackConnected ? (
        <ConnectPrompt service="Slack" />
      ) : loading && messages.length === 0 ? (
        <div className="text-sm text-text-muted animate-pulse py-4 text-center">Loading Slack…</div>
      ) : messages.length === 0 ? (
        <EmptyState />
      ) : (
      <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
        {messages.slice(0, 8).map((msg, i) => (
          <div
            key={msg.id || i}
            className={cn(
              "flex items-start justify-between gap-3 py-3",
              i === 0 && "pt-0",
            )}
          >
            <div className="flex items-start gap-2 min-w-0">
              <span className="inline-flex items-center rounded-md bg-white/5 text-text-muted px-1.5 py-0.5 text-[10px] font-bold tracking-wide shrink-0 mt-0.5">
                #{msg.channel_name || "general"}
              </span>
              <div className="min-w-0">
                <div className="text-sm text-text-body line-clamp-2">{msg.text || "(no text)"}</div>
                <span className="text-xs text-text-muted">{msg.author_name}</span>
                {msg.thread_reply_count > 0 && (
                  <span className="text-xs text-text-muted ml-2">{msg.thread_reply_count} replies</span>
                )}
              </div>
            </div>
            {msg.permalink && (
              <a
                href={msg.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-text-muted hover:text-accent-amber transition-colors px-2 py-1 rounded-md hover:bg-[var(--accent-amber-dim)] cursor-pointer"
              >
                Open
              </a>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
