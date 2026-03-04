"use client";

import { useSlackFeed } from "@/hooks/useSlackFeed";
import { SlackIcon } from "@/components/ui/icons";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function linkify(text: string): React.ReactNode[] {
  // Handle Slack-style <url|label> links and bare URLs
  const parts: React.ReactNode[] = [];
  const slackLinkRegex = /<(https?:\/\/[^|>]+)\|?([^>]*)>/g;
  let lastIndex = 0;
  let match;

  while ((match = slackLinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[1];
    const label = match[2] || url;
    // Truncate long URLs for display
    const displayLabel =
      label.length > 60 ? label.slice(0, 57) + "…" : label;
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hot-link text-sm break-all"
      >
        {displayLabel}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function AIFeedCard() {
  const { messages, loading, lastSynced } = useSlackFeed();

  return (
    <section
      className="glass-card anim-card"
      style={{ animationDelay: "120ms" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <SlackIcon />
          AI Feed
          <span className="text-xs font-normal text-text-muted">
            #topic--ai
          </span>
          {messages.length > 0 && (
            <span className="inline-flex items-center rounded-full tag-slack px-2 py-0.5 text-xs font-medium">
              {messages.length} messages
            </span>
          )}
        </h2>
        {lastSynced && (
          <span className="text-[10px] text-text-muted">
            synced {timeAgo(lastSynced)}
          </span>
        )}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-xs text-text-muted">Loading feed…</span>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <span className="text-xs text-text-muted">
            No messages synced yet
          </span>
          <span className="text-[10px] text-text-muted">
            Ask Claude to &quot;refresh the AI feed&quot; to populate
          </span>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto -mx-1.5 px-1.5 space-y-0 divide-y divide-[var(--bg-card-border)]">
          {messages.map((msg) => (
            <div key={msg.message_ts} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-text-heading truncate">
                      {msg.author_name}
                    </span>
                    <span className="text-[10px] text-text-muted shrink-0">
                      {timeAgo(msg.timestamp)}
                    </span>
                    {msg.permalink && (
                      <a
                        href={msg.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-text-muted hover:text-accent-teal transition-colors"
                        title="Open in Slack"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    )}
                  </div>
                  {msg.text && (
                    <p className="text-sm text-text-body leading-relaxed whitespace-pre-wrap break-words mt-1">
                      {linkify(msg.text)}
                    </p>
                  )}
                  {msg.has_files && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-text-muted mt-1">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                      </svg>
                      attachment
                    </span>
                  )}
                </div>
              </div>
              {/* Reactions + Thread indicator */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {msg.reactions &&
                  msg.reactions.length > 0 &&
                  msg.reactions.map((r) => (
                    <span
                      key={r.name}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--tab-bg)] px-1.5 py-0.5 text-[10px] text-text-muted"
                    >
                      :{r.name}: {r.count}
                    </span>
                  ))}
                {msg.thread_reply_count > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-accent-teal">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    {msg.thread_reply_count}{" "}
                    {msg.thread_reply_count === 1 ? "reply" : "replies"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
