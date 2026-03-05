"use client";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TONE_PRESETS } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { useEmails } from "@/hooks/useEmails";
import { useTasks } from "@/hooks/useTasks";
import { useChats } from "@/hooks/useChats";
import { useAuth } from "@/hooks/useAuth";

interface ReplyItem {
  id: string;
  channel: "email" | "teams" | "slack" | "asana";
  subject: string;
  sender: string;
  senderEmail?: string;
  daysAgo: number;
  receivedAt?: string;
  url: string;
  tags: string[];
  context: string;
  message?: string;
  isUnread?: boolean;
}

function formatReceivedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return diffMins <= 1 ? 'just now' : `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
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

const NOISE = /noreply|no-reply|newsletter|marketing|notification|donotreply|mailer|linkedin|twitter|digest|promo|offer|deal|vercel\.com|github\.com/i;

export function ReplyCenter() {
  const { emails, loading: emailsLoading } = useEmails();
  const { tasks, loading: tasksLoading } = useTasks();
  const { chats, loading: chatsLoading } = useChats();
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name ?? "";

  const loading = emailsLoading || tasksLoading || chatsLoading;

  const items: ReplyItem[] = useMemo(() => {
    const all: ReplyItem[] = [];

    // ── Emails (sorted newest first) ──────────────────────────────────
    const sortedEmails = [...emails]
      .filter(e => !NOISE.test(e.from_email || '') && !NOISE.test(e.from_name || ''))
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

    for (const e of sortedEmails.slice(0, 20)) {
      const daysAgo = Math.max(0, Math.floor((Date.now() - new Date(e.received_at).getTime()) / (1000 * 60 * 60 * 24)));
      all.push({
        id: e.id,
        channel: 'email',
        subject: e.subject || '(no subject)',
        sender: e.from_name || e.from_email,
        senderEmail: e.from_email,
        daysAgo,
        receivedAt: e.received_at,
        url: e.outlook_url || '#',
        tags: !e.is_read ? ['UNREAD'] : [],
        context: e.preview || '',
        message: e.preview || '',
        isUnread: !e.is_read,
      });
    }

    // ── Teams Chats ───────────────────────────────────────────────────
    const filteredChats = chats.filter(chat => {
      if (fullName && chat.topic === fullName && chat.last_message_from === fullName) return false;
      if (chat.topic === 'Teams Chat' && !chat.last_message_preview) return false;
      return true;
    });
    for (const chat of filteredChats) {
      const title = chat.topic || chat.last_message_preview || 'Teams message';
      const preview = chat.last_message_preview || '';
      all.push({
        id: `teams-${chat.id || title}`,
        channel: 'teams',
        subject: title,
        sender: 'Teams',
        daysAgo: 0,
        url: '',
        tags: ['UNREAD'],
        context: preview,
        message: preview,
        isUnread: true,
      });
    }

    // ── Asana overdue tasks ───────────────────────────────────────────
    const overdueTasks = tasks
      .filter(t => !t.completed && (t.days_overdue > 0))
      .sort((a, b) => b.days_overdue - a.days_overdue)
      .slice(0, 5);

    for (const t of overdueTasks) {
      all.push({
        id: `asana-${t.id}`,
        channel: 'asana',
        subject: t.name,
        sender: 'Asana',
        daysAgo: t.days_overdue,
        url: t.permalink_url || '#',
        tags: t.days_overdue >= 7 ? ['OVERDUE', 'URGENT'] : ['OVERDUE'],
        context: `Due ${t.due_on || 'overdue'} · ${t.days_overdue}d past due`,
        isUnread: false,
      });
    }

    // Sort: unread first, then by recency
    return all.sort((a, b) => {
      if (a.isUnread && !b.isUnread) return -1;
      if (!a.isUnread && b.isUnread) return 1;
      return a.daysAgo - b.daysAgo;
    });
  }, [emails, tasks, chats, fullName]);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [activeDrafts, setActiveDrafts] = useState<Record<string, string>>({});
  const [activeTones, setActiveTones] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promptTexts, setPromptTexts] = useState<Record<string, string>>({});
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return items
      .filter(i => !dismissedIds.has(i.id))
      .filter(i => activeFilter === 'all' || i.channel === activeFilter);
  }, [items, dismissedIds, activeFilter]);

  const counts = {
    all: items.filter(i => !dismissedIds.has(i.id)).length,
    email: items.filter(i => !dismissedIds.has(i.id) && i.channel === 'email').length,
    teams: items.filter(i => !dismissedIds.has(i.id) && i.channel === 'teams').length,
    slack: items.filter(i => !dismissedIds.has(i.id) && i.channel === 'slack').length,
    asana: items.filter(i => !dismissedIds.has(i.id) && i.channel === 'asana').length,
  };

  function handleTone(itemId: string, toneId: string, context: string) {
    const tone = TONE_PRESETS.find(t => t.id === toneId);
    if (!tone) return;
    setActiveDrafts(prev => ({ ...prev, [itemId]: tone.generate(context) }));
    setActiveTones(prev => ({ ...prev, [itemId]: toneId }));
    setExpandedId(itemId);
  }

  function handlePromptMode(itemId: string) {
    setActiveTones(prev => ({ ...prev, [itemId]: 'ai-prompt' }));
    setActiveDrafts(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setExpandedId(itemId);
  }

  async function handleAIDraft(item: ReplyItem) {
    const prompt = promptTexts[item.id]?.trim();
    if (!prompt) return;
    setStreamingIds(prev => new Set(prev).add(item.id));
    setActiveDrafts(prev => ({ ...prev, [item.id]: '' }));
    try {
      const res = await fetch('/api/ai/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: item.message || item.context, prompt, channel: item.channel, sender: item.sender, subject: item.subject }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setActiveDrafts(prev => ({ ...prev, [item.id]: full }));
        }
      }
    } catch (err) {
      setActiveDrafts(prev => ({ ...prev, [item.id]: `Error: ${err instanceof Error ? err.message : err}` }));
    } finally {
      setStreamingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  async function handleSend(item: ReplyItem) {
    const body = activeDrafts[item.id]?.trim();
    if (!body || item.channel !== 'email') return;
    setSendingIds(prev => new Set(prev).add(item.id));
    setSendErrors(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    try {
      // Use the real message ID (not our prefixed one)
      const realId = item.id.startsWith('asana-') || item.id.startsWith('teams-') ? null : item.id;
      const res = await fetch('/api/actions/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: realId,
          body,
          subject: `Re: ${item.subject}`,
          toEmail: item.senderEmail,
          toName: item.sender,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSentIds(prev => new Set(prev).add(item.id));
      // Auto-dismiss after 2s
      setTimeout(() => setDismissedIds(prev => new Set(prev).add(item.id)), 2000);
    } catch (err) {
      setSendErrors(prev => ({ ...prev, [item.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSendingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  return (
    <section className="glass-card anim-card" style={{ animationDelay: "240ms" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Reply Center
          <span className="inline-flex items-center rounded-full bg-accent-amber/15 text-accent-amber px-2 py-0.5 text-xs font-medium">
            {counts.all}
          </span>
        </h2>
        <div className="flex gap-1 flex-wrap">
          {(["all", "email", "teams", "slack", "asana"] as const).map(f => (
            <button key={f}
              className={cn("text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                activeFilter === f
                  ? "bg-[var(--tab-active-bg)] text-accent-amber"
                  : "text-text-muted hover:text-text-body hover:bg-[var(--tab-bg)]"
              )}
              onClick={() => setActiveFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && filtered.length === 0 ? (
        <div className="text-sm text-text-muted animate-pulse py-4 text-center">Loading inbox…</div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
          {filtered.map(item => {
            const isExpanded = expandedId === item.id;
            const isPromptMode = activeTones[item.id] === 'ai-prompt';
            const isStreaming = streamingIds.has(item.id);
            const isSending = sendingIds.has(item.id);
            const isSent = sentIds.has(item.id);
            const sendError = sendErrors[item.id];

            return (
              <div key={item.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wide rounded-md px-2 py-0.5 shrink-0 mt-0.5", CHANNEL_COLORS[item.channel])}>
                    {item.channel}
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button className="hot-link text-sm font-medium text-left cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                        {item.subject}
                      </button>
                      {item.url && item.url !== '#' && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-body shrink-0 transition-colors"
                          title={`Open in ${CHANNEL_NAMES[item.channel]}`}>
                          <ExternalLinkIcon size={12} />
                        </a>
                      )}
                      {item.isUnread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-amber shrink-0" title="Unread" />
                      )}
                      {item.receivedAt && (
                        <span className="text-xs text-text-muted tabular-nums">{formatReceivedAt(item.receivedAt)}</span>
                      )}
                      {item.tags.map(tag => (
                        <span key={tag} className={cn("text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5",
                          tag === 'UNREAD' ? 'text-accent-amber bg-accent-amber/10' :
                          tag === 'URGENT' || tag === 'OVERDUE' ? 'text-accent-red bg-accent-red/10' :
                          'text-text-muted bg-white/5')}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    {/* Sender */}
                    <div className="text-xs text-text-muted mt-0.5">{item.sender}</div>

                    {/* Expanded preview */}
                    {isExpanded && item.message && (
                      <div className="mt-2 p-3 rounded-lg bg-[var(--tab-bg)] border-l-2 border-accent-amber/30">
                        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">From {item.sender}</div>
                        <p className="text-xs text-text-body whitespace-pre-wrap leading-relaxed">{item.message}</p>
                      </div>
                    )}

                    {/* Tone buttons */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {TONE_PRESETS.map(tone => (
                        <button key={tone.id}
                          className={cn("text-[10px] px-2 py-1 rounded-md transition-all cursor-pointer border",
                            activeTones[item.id] === tone.id
                              ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                              : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
                          )}
                          onClick={() => handleTone(item.id, tone.id, item.context)}>
                          {tone.label}
                        </button>
                      ))}
                      <button
                        className={cn("text-[10px] px-2 py-1 rounded-md transition-all cursor-pointer border",
                          isPromptMode
                            ? "border-accent-amber bg-accent-amber/15 text-accent-amber"
                            : "border-[var(--bg-card-border)] text-text-muted hover:border-accent-amber/30 hover:text-text-body"
                        )}
                        onClick={() => handlePromptMode(item.id)}>
                        Prompt Reply
                      </button>
                    </div>

                    {/* Prompt input */}
                    {isPromptMode && !activeDrafts[item.id] && !isStreaming && (
                      <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                        <textarea
                          className="w-full h-20 bg-transparent border border-[var(--bg-card-border)] rounded-lg p-2 text-xs text-text-body resize-none focus:outline-none focus:border-accent-amber/30 placeholder:text-text-muted"
                          placeholder="Type your thoughts on how to reply…"
                          value={promptTexts[item.id] || ''}
                          onChange={e => setPromptTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                        />
                        <button
                          className="mt-2 text-[10px] px-2.5 py-1 rounded-md bg-accent-amber text-[#0d0d0d] font-medium cursor-pointer hover:bg-accent-amber/90 transition-colors disabled:opacity-50"
                          disabled={!promptTexts[item.id]?.trim()}
                          onClick={() => handleAIDraft(item)}>
                          Draft with AI
                        </button>
                      </div>
                    )}

                    {/* Streaming */}
                    {isStreaming && (
                      <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                        <div className="text-xs text-text-muted animate-pulse">Drafting reply…</div>
                        {activeDrafts[item.id] && (
                          <p className="text-xs text-text-body mt-1 whitespace-pre-wrap">{activeDrafts[item.id]}</p>
                        )}
                      </div>
                    )}

                    {/* Draft area */}
                    {activeDrafts[item.id] && !isStreaming && (
                      <div className="mt-2 p-3 rounded-lg bg-[var(--draft-bg)] border border-[rgba(212,164,76,0.1)]">
                        <textarea
                          className="w-full text-xs text-text-body bg-transparent resize-none focus:outline-none min-h-[60px] leading-relaxed"
                          value={activeDrafts[item.id]}
                          onChange={e => setActiveDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          rows={Math.max(3, activeDrafts[item.id].split('\n').length + 1)}
                        />
                        {sendError && (
                          <div className="text-[10px] text-accent-red mb-2">Send failed: {sendError}</div>
                        )}
                        {isSent ? (
                          <div className="text-xs text-accent-teal font-medium">✓ Drafted — check Outlook</div>
                        ) : (
                          <div className="flex gap-2 flex-wrap">
                            {item.channel === 'email' && (
                              <button
                                className="text-[10px] px-3 py-1.5 rounded-md bg-accent-amber text-[#0d0d0d] font-semibold cursor-pointer hover:bg-accent-amber/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                disabled={isSending}
                                onClick={() => handleSend(item)}>
                                {isSending ? (
                                  <><span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />Sending…</>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                    Draft Reply
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              className="text-[10px] px-2.5 py-1.5 rounded-md border border-[var(--bg-card-border)] text-text-muted hover:text-text-body transition-colors cursor-pointer"
                              onClick={() => navigator.clipboard?.writeText(activeDrafts[item.id])}>
                              Copy
                            </button>
                            {item.url && item.url !== '#' && (
                              <a className="text-[10px] px-2.5 py-1.5 rounded-md border border-[var(--bg-card-border)] text-text-muted hover:text-text-body transition-colors"
                                href={item.url} target="_blank" rel="noopener noreferrer">
                                Open in {CHANNEL_NAMES[item.channel]}
                              </a>
                            )}
                            <button
                              className="text-[10px] px-2.5 py-1.5 rounded-md text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                              onClick={() => setDismissedIds(prev => new Set(prev).add(item.id))}>
                              Dismiss
                            </button>
                          </div>
                        )}
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
