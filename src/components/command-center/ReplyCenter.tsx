"use client";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TONE_PRESETS } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { useEmails } from "@/hooks/useEmails";
import { useTasks } from "@/hooks/useTasks";

interface ReplyItem {
  id: string;
  channel: "email" | "teams" | "slack" | "asana";
  subject: string;
  sender: string;
  daysAgo: number;
  receivedAt?: string;
  url: string;
  tags: string[];
  context: string;
  message?: string;
}


function formatReceivedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
}

const CHANNEL_COLORS: Record<string, string> = {
  email: "tag-email",
  teams: "tag-teams",
  slack: "tag-slack",
  asana: "tag-asana",
};

const CHANNEL_NAMES: Record<string, string> = {
  email: "Outlook",
  teams: "Teams",
  slack: "Slack",
  asana: "Asana",
};

function ageBadgeClass(days: number) {
  if (days >= 30) return "bg-accent-red/20 text-accent-red";
  if (days >= 7) return "bg-accent-amber/20 text-accent-amber";
  if (days >= 1) return "bg-accent-teal/20 text-accent-teal";
  return "bg-[var(--tab-bg)] text-text-muted";
}

export function ReplyCenter() {
  const { emails } = useEmails();
  const { tasks } = useTasks();

  const items: ReplyItem[] = useMemo(() => {
    const NOISE = /noreply|no-reply|newsletter|marketing|notification|donotreply|mailer|linkedin|twitter|digest|promo|offer|deal/i;
    const emailItems: ReplyItem[] = emails
      .filter((e) => {
        if (NOISE.test(e.from_email || '') || NOISE.test(e.from_name || '')) return false;
        return true; // show all focused inbox emails (Outlook already filtered junk/spam)
      })
      .sort((a, b) => {
        // Unread first, then by recency
        if (!a.is_read && b.is_read) return -1;
        if (a.is_read && !b.is_read) return 1;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      })
      .slice(0, 15)
      .map((e) => {
        const receivedAt = e.received_at;
        const daysAgo = Math.floor((Date.now() - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: e.id,
          channel: 'email',
          subject: e.subject,
          sender: e.from_name || e.from_email,
          daysAgo,
          receivedAt,
          url: e.outlook_url || '#',
          tags: ['REPLY'],
          context: e.preview || '',
          message: e.preview || '',
        };
      });

    const taskItems: ReplyItem[] = tasks
      .filter((t) => !t.completed && t.days_overdue > 0)
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        channel: 'asana',
        subject: t.name,
        sender: 'Asana',
        daysAgo: t.days_overdue,
        url: t.permalink_url || '#',
        tags: t.days_overdue >= 7 ? ['URGENT', 'ACTION'] : ['ACTION'],
        context: t.notes || `Due ${t.due_on || 'overdue'}`,
      }));

    return [...emailItems, ...taskItems];
  }, [emails, tasks]);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [activeDrafts, setActiveDrafts] = useState<Record<string, string>>({});
  const [activeTones, setActiveTones] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promptTexts, setPromptTexts] = useState<Record<string, string>>({});
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());

  const counts = {
    all: items.length,
    email: items.filter((i) => i.channel === "email").length,
    teams: items.filter((i) => i.channel === "teams").length,
    slack: items.filter((i) => i.channel === "slack").length,
    asana: items.filter((i) => i.channel === "asana").length,
  };

  const filtered = items.filter((item) => {
    if (dismissedIds.has(item.id)) return false;
    if (activeFilter === "all") return true;
    return item.channel === activeFilter;
  });

  function handleTone(itemId: string, toneId: string, context: string) {
    const tone = TONE_PRESETS.find((t) => t.id === toneId);
    if (!tone) return;
    setActiveDrafts((prev) => ({ ...prev, [itemId]: tone.generate(context) }));
    setActiveTones((prev) => ({ ...prev, [itemId]: toneId }));
  }

  function handlePromptMode(itemId: string) {
    setActiveTones((prev) => ({ ...prev, [itemId]: "ai-prompt" }));
    setActiveDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setExpandedId(itemId);
  }

  async function handleAIDraft(item: ReplyItem) {
    const prompt = promptTexts[item.id]?.trim();
    if (!prompt) return;

    setStreamingIds((prev) => new Set(prev).add(item.id));
    // Use a sentinel space so the draft area renders while streaming
    setActiveDrafts((prev) => ({ ...prev, [item.id]: " " }));

    try {
      const response = await fetch("/api/ai/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: item.message || item.context,
          prompt,
          channel: item.channel,
          sender: item.sender,
          subject: item.subject,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setActiveDrafts((prev) => ({ ...prev, [item.id]: fullText }));
        }
      }

      if (!fullText.trim()) {
        throw new Error("Empty response from AI");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setActiveDrafts((prev) => ({
        ...prev,
        [item.id]: `Error: ${msg}. Please try again.`,
      }));
    } finally {
      setStreamingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  function handleDismiss(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleCopy(text: string) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "240ms" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Reply Center
          <span className="inline-flex items-center rounded-full bg-accent-amber/15 text-accent-amber px-2 py-0.5 text-xs font-medium">
            {filtered.length}
          </span>
        </h2>
        <div className="flex gap-1 flex-wrap">
          {(["all", "email", "teams", "slack", "asana"] as const).map((f) => (
            <button
              key={f}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                activeFilter === f
                  ? "bg-[var(--tab-active-bg)] text-accent-amber"
                  : "text-text-muted hover:text-text-body hover:bg-[var(--tab-bg)]"
              )}
              onClick={() => setActiveFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
      <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          const isPromptMode = activeTones[item.id] === "ai-prompt";
          const isStreaming = streamingIds.has(item.id);

          return (
            <div key={item.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-md px-2 py-0.5 shrink-0 mt-0.5", CHANNEL_COLORS[item.channel])}>
                  {item.channel}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="hot-link text-sm font-medium text-left cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {item.subject}
                    </button>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-text-muted hover:text-text-body shrink-0 transition-colors"
                        title={`Open in ${CHANNEL_NAMES[item.channel]}`}
                      >
                        <ExternalLinkIcon size={12} />
                      </a>
                    )}
                    {item.daysAgo > 0 && (
                      <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-0.5", ageBadgeClass(item.daysAgo))}>
                        {item.daysAgo}d
                      </span>
                    )}
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-[9px] uppercase tracking-wider text-text-muted bg-[var(--tab-bg)] rounded px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{item.sender}</span>
                    {item.receivedAt && (
                      <>
                        <span className="opacity-30">·</span>
                        <span className="tabular-nums">{formatReceivedAt(item.receivedAt)}</span>
                      </>
                    )}
                  </div>

                  {/* Expanded original message */}
                  {isExpanded && item.message && (
                    <div className="mt-2 p-3 rounded-lg bg-[var(--tab-bg)] border-l-2 border-accent-amber/30">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                        From {item.sender}
                      </div>
                      <p className="text-xs text-text-body whitespace-pre-wrap">
                        {item.message}
                      </p>
                    </div>
                  )}

                  {/* Tone preset buttons + Prompt Reply */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {TONE_PRESETS.map((tone) => (
                      <button
                        key={tone.id}
                        className={cn(
                          "text-[10px] px-2 py-1 rounded-md transition-all cursor-pointer border",
                          activeTones[item.id] === tone.id
                            ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                            : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
                        )}
                        onClick={() => handleTone(item.id, tone.id, item.context)}
                      >
                        {tone.label}
                      </button>
                    ))}
                    <button
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-md transition-all cursor-pointer border",
                        isPromptMode
                          ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                          : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
                      )}
                      onClick={() => handlePromptMode(item.id)}
                    >
                      Prompt Reply
                    </button>
                  </div>

                  {/* Prompt input area */}
                  {isPromptMode && !activeDrafts[item.id] && !isStreaming && (
                    <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                      <textarea
                        className="w-full h-20 bg-transparent border border-[var(--bg-card-border)] rounded-lg p-2 text-xs text-text-body resize-none focus:outline-none focus:border-accent-amber/30 placeholder:text-text-muted"
                        placeholder="Dictate or type your thoughts on how to reply..."
                        value={promptTexts[item.id] || ""}
                        onChange={(e) =>
                          setPromptTexts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      />
                      <button
                        className="mt-2 text-[10px] px-2.5 py-1 rounded-md bg-accent-amber text-[#0d0d0d] font-medium cursor-pointer hover:bg-accent-amber/90 transition-colors disabled:opacity-50"
                        disabled={!promptTexts[item.id]?.trim()}
                        onClick={() => handleAIDraft(item)}
                      >
                        Draft Reply
                      </button>
                    </div>
                  )}

                  {/* Streaming indicator */}
                  {isStreaming && !activeDrafts[item.id] && (
                    <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                      <div className="text-xs text-text-muted animate-pulse">Drafting...</div>
                    </div>
                  )}

                  {/* Draft area (editable) */}
                  {activeDrafts[item.id] && (
                    <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                      <textarea
                        className="w-full text-xs text-text-body whitespace-pre-wrap font-sans mb-2 bg-transparent resize-none focus:outline-none min-h-[60px]"
                        value={activeDrafts[item.id]}
                        onChange={(e) =>
                          setActiveDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        rows={Math.max(3, activeDrafts[item.id].split("\n").length + 1)}
                      />
                      <div className="flex gap-2">
                        <button
                          className="text-[10px] px-2.5 py-1 rounded-md bg-accent-amber text-[#0d0d0d] font-medium cursor-pointer hover:bg-accent-amber/90 transition-colors"
                          onClick={() => handleCopy(activeDrafts[item.id])}
                        >
                          Copy to Clipboard
                        </button>
                        {item.url && (
                          <a
                            className="text-[10px] px-2.5 py-1 rounded-md border border-[var(--bg-card-border)] text-text-muted hover:text-text-body transition-colors"
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in {CHANNEL_NAMES[item.channel]}
                          </a>
                        )}
                        <button
                          className="text-[10px] px-2.5 py-1 rounded-md text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                          onClick={() => handleDismiss(item.id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}
