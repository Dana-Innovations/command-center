"use client";

import { useState, useMemo, useCallback, useEffect, startTransition } from "react";
import { cn } from "@/lib/utils";
import { usePeople } from "@/hooks/usePeople";
import { useSalesforce } from "@/hooks/useSalesforce";
import { usePersonDetail } from "@/hooks/usePersonDetail";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Person, TouchpointItem } from "@/hooks/usePeople";
import type { SalesforceOpportunity } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────

type Heat = "hot" | "warm" | "cold";
type SourceFilter = "all" | "email" | "meeting" | "asana" | "salesforce";

interface RelationshipContact extends Person {
  heat: Heat;
  heatDays: number;
  openItemCount: number;
  lastChannel: TouchpointItem["ch"] | null;
  lastInteractionDate: string | null;
  relatedOpps: SalesforceOpportunity[];
}

// ── Constants ─────────────────────────────────────────────────────────────

const HEAT_CONFIG: Record<Heat, { label: string; color: string; bg: string; dot: string; border: string }> = {
  hot:  { label: "Hot",  color: "text-accent-green", bg: "bg-accent-green/15", dot: "bg-accent-green", border: "border-l-accent-green" },
  warm: { label: "Warm", color: "text-accent-amber", bg: "bg-accent-amber/15", dot: "bg-accent-amber", border: "border-l-accent-amber" },
  cold: { label: "Cold", color: "text-accent-red",   bg: "bg-accent-red/15",   dot: "bg-accent-red",   border: "border-l-accent-red" },
};

const AVATAR_BG: Record<Heat, string> = {
  hot:  "bg-accent-green/20 text-accent-green ring-accent-green/30",
  warm: "bg-accent-amber/20 text-accent-amber ring-accent-amber/30",
  cold: "bg-accent-red/20 text-accent-red ring-accent-red/30",
};

const CH_LABELS: Record<string, string> = {
  email: "Email", teams: "Teams", asana: "Asana", slack: "Slack", meeting: "Meeting",
};

const CH_ICONS: Record<string, string> = {
  email: "\u2709", teams: "\uD83D\uDCAC", asana: "\u2713", slack: "#", meeting: "\uD83D\uDCC5",
};

const CH_COLORS: Record<string, string> = {
  email: "tag-email", teams: "tag-teams", asana: "tag-asana", slack: "tag-slack", meeting: "bg-purple-500/15 text-purple-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function computeHeat(lastContactMs: number, now: number): { heat: Heat; days: number } {
  if (lastContactMs === 0) return { heat: "cold", days: 999 };
  const days = Math.floor((now - lastContactMs) / 86400000);
  if (days <= 7) return { heat: "hot", days };
  if (days <= 30) return { heat: "warm", days };
  return { heat: "cold", days };
}

function formatDaysAgo(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function matchesOpp(person: Person, opp: SalesforceOpportunity): boolean {
  const pName = person.name.toLowerCase();
  const accName = (opp.account_name || "").toLowerCase();
  const ownerName = (opp.owner_name || "").toLowerCase();
  // Match if the person's name appears in account or owner, or vice versa
  const pFirst = pName.split(" ")[0];
  if (pFirst.length > 2 && (accName.includes(pFirst) || ownerName.includes(pFirst))) return true;
  if (accName && pName.includes(accName.split(" ")[0])) return true;
  return false;
}

// ── Main Component ────────────────────────────────────────────────────────

export function RelationshipView() {
  const { people, loading: peopleLoading } = usePeople();
  const { openOpps, loading: sfLoading } = useSalesforce();
  const [heatFilter, setHeatFilter] = useState<Heat | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<RelationshipContact | null>(null);
  const [now] = useState(() => Date.now());

  const loading = peopleLoading || sfLoading;

  // Derive relationship contacts from people + SF opps
  const contacts: RelationshipContact[] = useMemo(() => {
    return people.map((person) => {
      // Find last interaction timestamp across all items
      let lastMs = 0;
      let lastCh: TouchpointItem["ch"] | null = null;
      let lastDate: string | null = null;
      for (const item of person.items) {
        if (item.timestamp) {
          const ms = new Date(item.timestamp).getTime();
          if (ms > lastMs) {
            lastMs = ms;
            lastCh = item.ch;
            lastDate = item.timestamp;
          }
        }
      }

      const { heat, days } = computeHeat(lastMs, now);
      const relatedOpps = openOpps.filter((opp) => matchesOpp(person, opp));

      // Count open items: emails needing reply (received, not sent) + uncompleted tasks + open opps
      const emailCount = person.items.filter((i) => i.ch === "email" && !i.text.startsWith("\u2197")).length;
      const taskCount = person.items.filter((i) => i.ch === "asana").length;
      const openItemCount = emailCount + taskCount + relatedOpps.length;

      return {
        ...person,
        heat,
        heatDays: days,
        openItemCount,
        lastChannel: lastCh,
        lastInteractionDate: lastDate,
        relatedOpps,
      };
    });
  }, [people, openOpps, now]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = contacts;

    if (heatFilter !== "all") {
      result = result.filter((c) => c.heat === heatFilter);
    }

    if (sourceFilter !== "all") {
      result = result.filter((c) => {
        if (sourceFilter === "salesforce") return c.relatedOpps.length > 0;
        const chMap: Record<string, string> = { email: "email", meeting: "meeting", asana: "asana" };
        const ch = chMap[sourceFilter];
        return ch ? c.items.some((i) => i.ch === ch) : false;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Sort: hot first, then warm, then cold; within each, by most touchpoints
    const heatOrder = { hot: 0, warm: 1, cold: 2 };
    result.sort((a, b) => {
      const hd = heatOrder[a.heat] - heatOrder[b.heat];
      if (hd !== 0) return hd;
      return b.touchpoints - a.touchpoints;
    });

    return result;
  }, [contacts, heatFilter, sourceFilter, search]);

  // KPI counts
  const kpis = useMemo(() => {
    const hot = contacts.filter((c) => c.heat === "hot").length;
    const cold = contacts.filter((c) => c.heat === "cold").length;
    const awaiting = contacts.filter((c) => c.openItemCount > 0).length;
    return { total: contacts.length, hot, cold, awaiting };
  }, [contacts]);

  if (loading && people.length === 0) {
    return (
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card anim-card p-5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/10" />
              <div className="flex-1">
                <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-3 bg-white/5 rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5">
      {/* ── KPI Strip ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Contacts" value={kpis.total} color="text-text-heading" />
        <KpiCard label="Hot This Week" value={kpis.hot} color="text-accent-green" />
        <KpiCard label="Going Cold" value={kpis.cold} color="text-accent-red" />
        <KpiCard label="Awaiting Response" value={kpis.awaiting} color="text-accent-amber" />
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Heat filter */}
        <div className="flex items-center gap-1">
          {(["all", "hot", "warm", "cold"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHeatFilter(h)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full transition-colors capitalize",
                heatFilter === h
                  ? "bg-white/10 text-text-heading font-medium"
                  : "text-text-muted hover:text-text-body hover:bg-white/5"
              )}
            >
              {h === "all" ? "All" : h}
              {h !== "all" && (
                <span className={cn("ml-1 inline-block w-1.5 h-1.5 rounded-full", HEAT_CONFIG[h].dot)} />
              )}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-1">
          {(["all", "email", "meeting", "asana", "salesforce"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full transition-colors capitalize",
                sourceFilter === s
                  ? "bg-white/10 text-text-heading font-medium"
                  : "text-text-muted hover:text-text-body hover:bg-white/5"
              )}
            >
              {s === "all" ? "All Sources" : s === "salesforce" ? "Salesforce" : s === "meeting" ? "Meetings" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[180px] max-w-xs">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs bg-white/5 border border-[var(--bg-card-border)] rounded-lg px-3 py-1.5 text-text-body placeholder:text-text-muted/50 focus:outline-none focus:border-accent-amber/40 transition-colors"
          />
        </div>

        <span className="text-[10px] text-text-muted ml-auto">
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Contact Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((contact, i) => (
          <ContactCard
            key={contact.name}
            contact={contact}
            index={i}
            onClick={() => setSelectedContact(contact)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No contacts match your filters
        </div>
      )}

      {/* ── Side Panel ─────────────────────────────────────────── */}
      {selectedContact && (
        <RelationshipPanel
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
        />
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

// ── Contact Card ──────────────────────────────────────────────────────────

function ContactCard({ contact, index, onClick }: { contact: RelationshipContact; index: number; onClick: () => void }) {
  const cfg = HEAT_CONFIG[contact.heat];

  return (
    <div
      className={cn(
        "glass-card anim-card rounded-xl overflow-hidden cursor-pointer hover:bg-white/[0.02] transition-all border-l-4",
        cfg.border
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ring-1",
              AVATAR_BG[contact.heat]
            )}
          >
            {getInitials(contact.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text-heading truncate">
                {contact.name}
              </span>
              <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
            </div>

            {/* Last interaction */}
            <div className="flex items-center gap-1.5 mt-1">
              {contact.lastChannel && (
                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", CH_COLORS[contact.lastChannel])}>
                  {CH_ICONS[contact.lastChannel]} {CH_LABELS[contact.lastChannel]}
                </span>
              )}
              <span className="text-[11px] text-text-muted">
                {formatDaysAgo(contact.heatDays)}
              </span>
            </div>

            {/* Open items + opps */}
            <div className="flex items-center gap-2 mt-2">
              {contact.openItemCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber">
                  {contact.openItemCount} open item{contact.openItemCount > 1 ? "s" : ""}
                </span>
              )}
              {contact.relatedOpps.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-teal/10 text-accent-teal">
                  {contact.relatedOpps.length} opp{contact.relatedOpps.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--bg-card-border)]">
          {contact.email && (
            <a
              href={`https://outlook.office.com/mail/new?to=${contact.email}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] px-2.5 py-1 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body hover:border-accent-amber/30 transition-colors"
            >
              \u2709 Email
            </a>
          )}
          {contact.items.some((i) => i.ch === "asana") && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="text-[10px] px-2.5 py-1 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body hover:border-accent-amber/30 transition-colors"
            >
              \u2713 Tasks
            </button>
          )}
          {contact.relatedOpps.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="text-[10px] px-2.5 py-1 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body hover:border-accent-amber/30 transition-colors"
            >
              $ Opps
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────

function RelationshipPanel({ contact, onClose }: { contact: RelationshipContact; onClose: () => void }) {
  const { detail, loading, error } = usePersonDetail(
    contact.name,
    contact.email,
    contact.teamsChatId
  );
  const [notes, setNotes] = useState("");
  const storageKey = `rel-notes:${contact.name.toLowerCase()}`;

  // Load notes from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) startTransition(() => setNotes(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  const saveNotes = useCallback((val: string) => {
    setNotes(val);
    try { localStorage.setItem(storageKey, val); } catch { /* ignore */ }
  }, [storageKey]);

  // Build full timeline
  const timeline = useMemo(() => {
    if (!detail) return [];
    const items: { ch: string; text: string; subtext?: string; date: string; url: string }[] = [];

    for (const e of detail.emails) {
      items.push({
        ch: "email",
        text: `${e.direction === "sent" ? "\u2197 " : ""}${e.subject}`,
        subtext: e.preview,
        date: e.date,
        url: e.url,
      });
    }
    for (const m of detail.meetings) {
      items.push({ ch: "meeting", text: m.subject, date: m.date, url: m.url });
    }
    for (const c of detail.chats) {
      items.push({ ch: "teams", text: c.text, subtext: c.from ? `from ${c.from}` : undefined, date: c.date, url: c.url });
    }
    for (const s of detail.slackMessages) {
      items.push({ ch: "slack", text: s.text, subtext: s.channel ? `#${s.channel}` : undefined, date: s.date, url: s.url });
    }
    for (const t of detail.tasks) {
      items.push({
        ch: "asana",
        text: t.name,
        subtext: [t.project, t.status, t.due ? `due ${t.due}` : ""].filter(Boolean).join(" \u00B7 "),
        date: t.due || "",
        url: t.url,
      });
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [detail]);

  const openTasks = detail?.tasks.filter((t) => t.status !== "completed") ?? [];
  const cfg = HEAT_CONFIG[contact.heat];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[var(--bg-main)] border-l border-[var(--bg-card-border)] overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-main)] border-b border-[var(--bg-card-border)] px-6 py-4">
          <div className="flex items-start gap-4">
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ring-1", AVATAR_BG[contact.heat])}>
              {getInitials(contact.name)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-heading truncate">{contact.name}</h2>
                <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", cfg.bg, cfg.color)}>
                  {cfg.label}
                </span>
              </div>
              {detail?.identity.title && (
                <div className="text-xs text-text-muted mt-0.5">
                  {detail.identity.title}
                  {detail.identity.department ? ` \u00B7 ${detail.identity.department}` : ""}
                </div>
              )}
              {(detail?.identity.email || contact.email) && (
                <div className="text-[11px] text-text-muted mt-0.5 opacity-60">
                  {detail?.identity.email || contact.email}
                </div>
              )}
            </div>

            <button onClick={onClose} className="text-text-muted hover:text-text-body transition-colors p-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Heat + stats summary */}
          <div className="flex items-center gap-3 mt-3 text-[11px] text-text-muted">
            <span>Last contact: <strong className="text-text-body">{formatDaysAgo(contact.heatDays)}</strong></span>
            <span>{contact.touchpoints} touchpoint{contact.touchpoints !== 1 ? "s" : ""}</span>
            {contact.openItemCount > 0 && (
              <span className="text-accent-amber">{contact.openItemCount} open item{contact.openItemCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass-card p-4 animate-pulse">
                  <div className="h-3 bg-white/10 rounded w-2/3 mb-2" />
                  <div className="h-2 bg-white/5 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {error && <div className="glass-card p-4 text-accent-red text-sm">{error}</div>}

          {!loading && !error && (
            <>
              {/* Interaction Timeline */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  Interaction Timeline
                  {timeline.length > 0 && <span className="ml-1 opacity-60">({timeline.length})</span>}
                </h3>
                {timeline.length === 0 ? (
                  <div className="text-xs text-text-muted py-4 text-center">No interactions found</div>
                ) : (
                  <div className="space-y-0 max-h-[300px] overflow-y-auto">
                    {timeline.slice(0, 30).map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 py-2.5 border-b border-[var(--bg-card-border)] last:border-0">
                        <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5", CH_COLORS[item.ch] ?? "bg-white/10 text-text-muted")}>
                          {CH_ICONS[item.ch] ?? "\u2022"}
                        </span>
                        <div className="min-w-0 flex-1">
                          {item.url && item.url !== "#" ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-text-body hover:text-accent-amber transition-colors line-clamp-2">
                              {item.text}
                            </a>
                          ) : (
                            <div className="text-xs text-text-body line-clamp-2">{item.text}</div>
                          )}
                          {item.subtext && <div className="text-[11px] text-text-muted mt-0.5 line-clamp-1">{item.subtext}</div>}
                        </div>
                        {item.date && (
                          <span className="text-[10px] text-text-muted whitespace-nowrap shrink-0 mt-0.5">
                            {formatDate(item.date)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Open Tasks */}
              {openTasks.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-amber mb-3">
                    Open Tasks ({openTasks.length})
                  </h3>
                  <div className="space-y-0">
                    {openTasks.map((t, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 py-2 border-b border-[var(--bg-card-border)] last:border-0">
                        <div className="min-w-0 flex-1">
                          {t.url && t.url !== "#" ? (
                            <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-xs text-text-body hover:text-accent-amber transition-colors line-clamp-1">
                              {t.name}
                            </a>
                          ) : (
                            <div className="text-xs text-text-body line-clamp-1">{t.name}</div>
                          )}
                          {t.project && <div className="text-[11px] text-text-muted mt-0.5">{t.project}</div>}
                        </div>
                        {t.due && (
                          <span className="text-[10px] text-text-muted whitespace-nowrap shrink-0">
                            due {formatDate(t.due)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Related SF Opps */}
              {contact.relatedOpps.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-teal mb-3">
                    Salesforce Opportunities ({contact.relatedOpps.length})
                  </h3>
                  <div className="space-y-2">
                    {contact.relatedOpps.map((opp) => (
                      <div key={opp.id} className="glass-card rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-text-heading line-clamp-1">{opp.name}</div>
                            <div className="text-[11px] text-text-muted mt-0.5">
                              {opp.account_name} \u00B7 {opp.stage}
                            </div>
                          </div>
                          {opp.amount > 0 && (
                            <span className="text-xs font-semibold text-accent-green shrink-0">
                              ${(opp.amount / 1000).toFixed(0)}k
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-text-muted">
                          <span>{opp.probability}% prob</span>
                          {opp.close_date && <span>close {formatDate(opp.close_date)}</span>}
                          {opp.next_step && <span className="truncate max-w-[150px]">Next: {opp.next_step}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(e) => saveNotes(e.target.value)}
                  placeholder="Add private notes about this relationship..."
                  className="w-full h-24 text-xs bg-white/5 border border-[var(--bg-card-border)] rounded-lg px-3 py-2 text-text-body placeholder:text-text-muted/50 focus:outline-none focus:border-accent-amber/40 transition-colors resize-none"
                />
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-main)] border-t border-[var(--bg-card-border)] px-6 py-3 flex gap-2">
          {(detail?.identity.email || contact.email) && (
            <a
              href={`https://outlook.office.com/mail/new?to=${detail?.identity.email || contact.email}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-3 py-1.5 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body hover:border-accent-amber/30 transition-colors"
            >
              \u2709 Email
            </a>
          )}
          {contact.teamsChatId && (
            <span className="text-[11px] px-3 py-1.5 rounded border border-[var(--bg-card-border)] text-text-muted">
              \uD83D\uDCAC Teams DM active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
