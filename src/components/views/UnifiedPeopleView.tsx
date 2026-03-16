"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { usePeople } from "@/hooks/usePeople";
import { useSalesforce } from "@/hooks/useSalesforce";
import { EmptyState } from "@/components/ui/EmptyState";
import { PersonDetailPanel } from "./PersonDetailPanel";
import type { TouchpointItem } from "@/hooks/usePeople";
import { useAttention } from "@/lib/attention/client";
import { getAttentionPersonRankingWeight } from "@/lib/attention/people";
import type {
  UnifiedContact,
  SourceFilter,
} from "@/lib/people-utils";
import {
  TIER_CONFIG,
  URGENCY_BORDERS,
  URGENCY_AVATAR_BG,
  URGENCY_BAR_COLOR,
  HEAT_CONFIG,
  CH_COLORS,
  CH_ICONS,
  getInitials,
  formatRelativeTime,
  formatDaysAgo,
  computeHeat,
  matchesOpp,
} from "@/lib/people-utils";

// ── Main Component ────────────────────────────────────────────────────────

export function UnifiedPeopleView() {
  const { people, loading: peopleLoading } = usePeople();
  const { openOpps, loading: sfLoading } = useSalesforce();
  const { getPersonPreference } = useAttention();
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedPerson, setSelectedPerson] = useState<UnifiedContact | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "red" | "amber" | "teal" | "gray">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  const loading = peopleLoading || sfLoading;

  // Enrich people with heat + SF opps
  const contacts: UnifiedContact[] = useMemo(() => {
    return people.map((person) => {
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
      const emailCount = person.items.filter(
        (i) => i.ch === "email" && !i.text.startsWith("\u2197")
      ).length;
      const taskCount = person.items.filter((i) => i.ch === "asana").length;
      const openItemCount = emailCount + taskCount + relatedOpps.length;
      const attentionPreference = getPersonPreference({
        name: person.name,
        email: person.email ?? null,
      });

      return {
        ...person,
        heat,
        heatDays: days,
        openItemCount,
        lastChannel: lastCh,
        lastInteractionDate: lastDate,
        relatedOpps,
        attentionPreference,
      };
    });
  }, [getPersonPreference, now, openOpps, people]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = contacts;

    if (urgencyFilter !== "all") {
      result = result.filter((c) => c.urgency === urgencyFilter);
    }

    if (sourceFilter !== "all") {
      result = result.filter((c) => {
        if (sourceFilter === "salesforce") return c.relatedOpps.length > 0;
        const chMap: Record<string, string> = {
          email: "email",
          meeting: "meeting",
          asana: "asana",
        };
        const ch = chMap[sourceFilter];
        return ch ? c.items.some((i) => i.ch === ch) : false;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    return result;
  }, [contacts, urgencyFilter, sourceFilter, search]);

  const maxTouchpoints = useMemo(
    () => Math.max(1, ...filtered.map((p) => p.touchpoints)),
    [filtered]
  );

  const pinnedContacts = useMemo(
    () =>
      [...filtered]
        .filter((contact) => contact.attentionPreference?.pinned)
        .sort((a, b) => {
          const preferenceDelta =
            getAttentionPersonRankingWeight(b.attentionPreference) -
            getAttentionPersonRankingWeight(a.attentionPreference);
          if (preferenceDelta !== 0) return preferenceDelta;
          return b.touchpoints - a.touchpoints;
        }),
    [filtered]
  );

  // KPI counts
  const kpis = useMemo(() => {
    const hot = contacts.filter((c) => c.heat === "hot").length;
    const cold = contacts.filter((c) => c.heat === "cold").length;
    const awaiting = contacts.filter((c) => c.openItemCount > 0).length;
    return { total: contacts.length, hot, cold, awaiting };
  }, [contacts]);

  function toggle(name: string) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

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
        {/* Urgency filter */}
        <div className="flex items-center gap-1">
          {(["all", "red", "amber", "teal", "gray"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUrgencyFilter(u)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full transition-colors capitalize",
                urgencyFilter === u
                  ? "bg-white/10 text-text-heading font-medium"
                  : "text-text-muted hover:text-text-body hover:bg-white/5"
              )}
            >
              {u === "all"
                ? "All"
                : u === "red"
                ? "Action"
                : u === "amber"
                ? "Follow Up"
                : u === "teal"
                ? "Monitor"
                : "Low"}
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
              {s === "all"
                ? "All Sources"
                : s === "salesforce"
                ? "Salesforce"
                : s === "meeting"
                ? "Meetings"
                : s.charAt(0).toUpperCase() + s.slice(1)}
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

      {/* ── Grouped Contact Grid ──────────────────────────────── */}
      {pinnedContacts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-teal">
              Pinned
            </h3>
            <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">
              {pinnedContacts.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pinnedContacts.map((contact) => (
              <ContactCard
                key={`pinned-${contact.name}`}
                contact={contact}
                maxTouchpoints={maxTouchpoints}
                isExpanded={expandedCards.has(contact.name)}
                onToggle={() => toggle(contact.name)}
                onDeepDive={() => setSelectedPerson(contact)}
              />
            ))}
          </div>
        </div>
      )}

      {TIER_CONFIG.map((tier) => {
        const tierPeople = filtered.filter(
          (c) => c.urgency === tier.key && !c.attentionPreference?.pinned
        );
        if (tierPeople.length === 0) return null;

        const sorted = [...tierPeople].sort((a, b) => {
          const preferenceDelta =
            getAttentionPersonRankingWeight(b.attentionPreference) -
            getAttentionPersonRankingWeight(a.attentionPreference);
          if (preferenceDelta !== 0) return preferenceDelta;
          return b.touchpoints - a.touchpoints;
        });

        return (
          <div key={tier.key}>
            <div className="flex items-center gap-2 mb-3">
              <h3
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider",
                  tier.color
                )}
              >
                {tier.label}
              </h3>
              <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">
                {sorted.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {sorted.map((contact) => (
                <ContactCard
                  key={contact.name}
                  contact={contact}
                  maxTouchpoints={maxTouchpoints}
                  isExpanded={expandedCards.has(contact.name)}
                  onToggle={() => toggle(contact.name)}
                  onDeepDive={() => setSelectedPerson(contact)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          No contacts match your filters
        </div>
      )}

      {/* ── Detail Panel ─────────────────────────────────────── */}
      {selectedPerson && (
        <PersonDetailPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          heat={selectedPerson.heat}
          heatDays={selectedPerson.heatDays}
          relatedOpps={selectedPerson.relatedOpps}
        />
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className={cn("text-2xl font-bold", color)}>{value}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

// ── Contact Card ──────────────────────────────────────────────────────────

function ContactCard({
  contact,
  maxTouchpoints,
  isExpanded,
  onToggle,
  onDeepDive,
}: {
  contact: UnifiedContact;
  maxTouchpoints: number;
  isExpanded: boolean;
  onToggle: () => void;
  onDeepDive: () => void;
}) {
  const teamsItems = contact.items.filter((i) => i.ch === "teams");
  const emailItems = contact.items.filter((i) => i.ch === "email");
  const meetingItems = contact.items.filter((i) => i.ch === "meeting");
  const asanaItems = contact.items.filter((i) => i.ch === "asana");
  const slackItems = contact.items.filter((i) => i.ch === "slack");
  const densityPct = Math.round((contact.touchpoints / maxTouchpoints) * 100);
  const heatCfg = HEAT_CONFIG[contact.heat];

  return (
    <div
      className={cn(
        "glass-card rounded-xl overflow-hidden transition-all",
        URGENCY_BORDERS[contact.urgency]
      )}
    >
      {/* Card header */}
      <button
        className="w-full text-left p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-1",
              URGENCY_AVATAR_BG[contact.urgency]
            )}
          >
            {getInitials(contact.name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-text-heading">
                {contact.name}
              </span>
              {contact.attentionPreference?.important && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent-amber/10 text-accent-amber">
                  Important
                </span>
              )}
              {contact.attentionPreference?.pinned && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent-teal/10 text-accent-teal">
                  Pinned
                </span>
              )}
              {/* Heat dot */}
              <span
                className={cn("w-2 h-2 rounded-full shrink-0", heatCfg.dot)}
                title={`${heatCfg.label} — ${formatDaysAgo(contact.heatDays)}`}
              />
              {/* Channel badges */}
              <div className="flex items-center gap-1">
                {teamsItems.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tag-teams">
                    {teamsItems.length}
                  </span>
                )}
                {emailItems.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tag-email">
                    {emailItems.length}
                  </span>
                )}
                {meetingItems.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400">
                    {meetingItems.length}
                  </span>
                )}
                {asanaItems.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tag-asana">
                    {asanaItems.length}
                  </span>
                )}
                {slackItems.length > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded tag-slack">
                    {slackItems.length}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-muted">{contact.action}</span>
              {contact.lastContact && (
                <>
                  <span className="text-text-muted opacity-30">&middot;</span>
                  <span className="text-[11px] text-text-muted">
                    {contact.lastContact}
                  </span>
                </>
              )}
            </div>

            {/* Open items + opps */}
            {(contact.openItemCount > 0 || contact.relatedOpps.length > 0) && (
              <div className="flex items-center gap-2 mt-1.5">
                {contact.openItemCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber">
                    {contact.openItemCount} open item
                    {contact.openItemCount > 1 ? "s" : ""}
                  </span>
                )}
                {contact.relatedOpps.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-teal/10 text-accent-teal">
                    {contact.relatedOpps.length} opp
                    {contact.relatedOpps.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Interaction density bar */}
            <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  URGENCY_BAR_COLOR[contact.urgency]
                )}
                style={{ width: `${densityPct}%` }}
              />
            </div>
          </div>

          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={cn(
              "shrink-0 text-text-muted mt-2 transition-transform",
              isExpanded && "rotate-180"
            )}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Expanded touchpoints */}
      {isExpanded && (
        <div className="border-t border-[var(--bg-card-border)] divide-y divide-[var(--bg-card-border)]">
          {contact.items.map((item, i) => (
            <div key={i} className="px-4 py-2.5 flex items-start gap-2.5">
              <span
                className={cn(
                  "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5",
                  CH_COLORS[item.ch]
                )}
              >
                {CH_ICONS[item.ch]} {item.ch}
              </span>
              <div className="min-w-0 flex-1">
                {item.url && item.url !== "#" ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-body hover:text-accent-amber transition-colors line-clamp-2"
                  >
                    {item.text}
                  </a>
                ) : (
                  <div className="text-xs text-text-body line-clamp-2">
                    {item.text}
                  </div>
                )}
                {item.preview && item.preview !== item.text && (
                  <div className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
                    {item.preview}
                  </div>
                )}
              </div>
              {item.timestamp && (
                <span className="text-[10px] text-text-muted whitespace-nowrap shrink-0 mt-0.5">
                  {formatRelativeTime(item.timestamp)}
                </span>
              )}
            </div>
          ))}

          {/* Quick actions */}
          <div className="px-4 py-2.5 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeepDive();
              }}
              className="text-[10px] px-2.5 py-1 rounded border border-accent-amber/30 text-accent-amber hover:bg-accent-amber/10 transition-colors font-medium"
            >
              Deep Dive
            </button>
            {contact.email && (
              <a
                href={`https://outlook.office.com/mail/new?to=${contact.email}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-2.5 py-1 rounded border border-[var(--bg-card-border)] text-text-muted hover:text-text-body hover:border-accent-amber/30 transition-colors"
              >
                &#9993; Email
              </a>
            )}
            {contact.teamsChatId && (
              <span className="text-[10px] px-2.5 py-1 rounded border border-[var(--bg-card-border)] text-text-muted">
                &#128172; Teams DM
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
