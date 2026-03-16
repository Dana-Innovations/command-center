"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useCalendar } from "@/hooks/useCalendar";
import { useChats } from "@/hooks/useChats";
import { useEmails } from "@/hooks/useEmails";
import { useMonday } from "@/hooks/useMonday";
import { usePeople } from "@/hooks/usePeople";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useTasks } from "@/hooks/useTasks";
import { MorningBrief } from "@/components/command-center/MorningBrief";
import {
  buildAsanaCommentAttentionTarget,
  buildCalendarAttentionTarget,
  buildEmailAttentionTarget,
  buildSlackAttentionTarget,
  buildTaskAttentionTarget,
  buildTeamsChatAttentionTarget,
} from "@/lib/attention/targets";
import { type SetupFocusTab, type TabId } from "@/lib/tab-config";
import { useAttention } from "@/lib/attention/client";
import { getAttentionPersonRankingWeight } from "@/lib/attention/people";
import { cn } from "@/lib/utils";

type CommunicationCardItem =
  | {
      id: string;
      kind: "email";
      title: string;
      meta: string;
      preview: string;
      url: string;
      attentionTarget: ReturnType<typeof buildEmailAttentionTarget>;
      score: number;
      timestamp: number;
    }
  | {
      id: string;
      kind: "chat";
      title: string;
      meta: string;
      preview: string;
      url?: string;
      attentionTarget: ReturnType<typeof buildTeamsChatAttentionTarget>;
      score: number;
      timestamp: number;
    }
  | {
      id: string;
      kind: "slack";
      title: string;
      meta: string;
      preview: string;
      url?: string | null;
      attentionTarget: ReturnType<typeof buildSlackAttentionTarget>;
      score: number;
      timestamp: number;
    }
  | {
      id: string;
      kind: "asana";
      title: string;
      meta: string;
      preview: string;
      url: string;
      attentionTarget: ReturnType<typeof buildAsanaCommentAttentionTarget>;
      score: number;
      timestamp: number;
    };

const urgencyOrder = { red: 0, amber: 1, teal: 2, gray: 3 };

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
  });
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const today = new Date();
  const target = new Date(value);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function orderNeedsAttention(status: string) {
  const upper = status.toUpperCase();
  return (
    upper.includes("DWG NEEDED") ||
    upper.includes("BONITA PO NEEDED") ||
    upper.includes("SALES ORDER NEEDED")
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-text-heading">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

interface HomeViewProps {
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
  onOpenSetup: (tab?: SetupFocusTab) => void;
}

export function HomeView({
  onNavigate,
  onOpenCalendarPrep,
  onOpenSetup,
}: HomeViewProps) {
  const { emails } = useEmails();
  const { chats } = useChats();
  const { comments } = useAsanaComments();
  const { messages: slackMessages } = useSlackFeed();
  const { events } = useCalendar();
  const { tasks } = useTasks();
  const { people } = usePeople();
  const { openOpps } = useSalesforce();
  const { orders, connected: mondayConnected } = useMonday();
  const {
    profile,
    services,
    onboardingCompleted,
    applyTarget,
    getPersonPreference,
  } = useAttention();

  const connectedServices = services.filter((service) => service.connected);
  const focusRules = profile?.focusPreferences ?? [];

  const todayEvents = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Los_Angeles",
    });

    return [...events]
      .filter((event) => {
        const start = new Date(event.start_time).toLocaleDateString("en-CA", {
          timeZone: "America/Los_Angeles",
        });
        return start === today;
      })
      .map((event) => {
        const attentionTarget = buildCalendarAttentionTarget(
          event,
          "home",
          event.is_all_day ? 52 : 62
        );
        const attention = applyTarget(attentionTarget);
        return { event, attention, attentionTarget };
      })
      .filter((item) => !item.attention.hidden)
      .sort(
        (a, b) =>
          b.attention.finalScore - a.attention.finalScore ||
          new Date(a.event.start_time).getTime() - new Date(b.event.start_time).getTime()
      )
      .slice(0, 4);
  }, [applyTarget, events]);

  const priorityTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => !task.completed)
      .map((task) => {
        const dueDelta = daysUntil(task.due_on);
        const baseScore =
          task.days_overdue > 0 ? 72 : dueDelta !== null && dueDelta <= 2 ? 62 : 50;
        const attentionTarget = buildTaskAttentionTarget(task, "home", baseScore);
        const attention = applyTarget(attentionTarget);
        return { task, attention, attentionTarget };
      })
      .filter((item) => !item.attention.hidden)
      .sort((a, b) => {
        if (a.task.days_overdue !== b.task.days_overdue) {
          return b.task.days_overdue - a.task.days_overdue;
        }
        return b.attention.finalScore - a.attention.finalScore;
      })
      .slice(0, 5);
  }, [applyTarget, tasks]);

  const peopleToWatch = useMemo(() => {
    return [...people]
      .sort((a, b) => {
        const preferenceDelta =
          getAttentionPersonRankingWeight(
            getPersonPreference({ name: b.name, email: b.email ?? null })
          ) -
          getAttentionPersonRankingWeight(
            getPersonPreference({ name: a.name, email: a.email ?? null })
          );
        if (preferenceDelta !== 0) return preferenceDelta;
        const urgencyDelta = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgencyDelta !== 0) return urgencyDelta;
        return b.touchpoints - a.touchpoints;
      })
      .slice(0, 5);
  }, [getPersonPreference, people]);

  const performanceWatchlist = useMemo(() => {
    return openOpps
      .filter(
        (opp) =>
          opp.days_to_close <= 14 ||
          (opp.days_in_stage != null && opp.days_in_stage > 30) ||
          opp.has_overdue_task
      )
      .sort((a, b) => a.days_to_close - b.days_to_close)
      .slice(0, 3);
  }, [openOpps]);

  const operationsWatchlist = useMemo(() => {
    if (!mondayConnected) return [];
    return orders.filter((order) => orderNeedsAttention(order.status)).slice(0, 3);
  }, [mondayConnected, orders]);

  const communicationItems = useMemo<CommunicationCardItem[]>(() => {
    const next: CommunicationCardItem[] = [];

    emails
      .filter((email) => email.needs_reply)
      .slice(0, 8)
      .forEach((email) => {
        const attentionTarget = buildEmailAttentionTarget(email, "home", 70);
        const attention = applyTarget(attentionTarget);
        if (attention.hidden) return;
        next.push({
          id: `email-${email.id}`,
          kind: "email",
          title: email.subject || "(no subject)",
          meta: `${email.from_name || email.from_email} · ${formatDay(email.received_at)}`,
          preview: email.preview,
          url: email.outlook_url,
          attentionTarget,
          score: attention.finalScore,
          timestamp: new Date(email.received_at).getTime(),
        });
      });

    chats.slice(0, 6).forEach((chat) => {
      const attentionTarget = buildTeamsChatAttentionTarget(chat, "home", 56);
      const attention = applyTarget(attentionTarget);
      if (attention.hidden) return;
      next.push({
        id: `chat-${chat.id}`,
        kind: "chat",
        title: chat.topic || "Teams Chat",
        meta: `${chat.last_message_from || "Teams"} · ${formatDay(chat.last_activity)}`,
        preview: chat.last_message_preview,
        url: chat.web_url,
        attentionTarget,
        score: attention.finalScore,
        timestamp: new Date(chat.last_activity).getTime(),
      });
    });

    slackMessages.slice(0, 6).forEach((message) => {
      const attentionTarget = buildSlackAttentionTarget(message, "home", 54);
      const attention = applyTarget(attentionTarget);
      if (attention.hidden) return;
      next.push({
        id: `slack-${message.id}`,
        kind: "slack",
        title: `#${message.channel_name}`,
        meta: `${message.author_name} · ${formatDay(message.timestamp)}`,
        preview: message.text || "Slack activity",
        url: message.permalink,
        attentionTarget,
        score: attention.finalScore,
        timestamp: new Date(message.timestamp).getTime(),
      });
    });

    comments.slice(0, 6).forEach((comment) => {
      const attentionTarget = buildAsanaCommentAttentionTarget(comment, "home", 58);
      const attention = applyTarget(attentionTarget);
      if (attention.hidden) return;
      next.push({
        id: `asana-${comment.id}`,
        kind: "asana",
        title: comment.task_name,
        meta: `${comment.latest_commenter_name} · ${formatDay(comment.latest_comment_at)}`,
        preview: comment.latest_comment_text,
        url: comment.permalink_url,
        attentionTarget,
        score: attention.finalScore,
        timestamp: new Date(comment.latest_comment_at).getTime(),
      });
    });

    return next
      .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [applyTarget, chats, comments, emails, slackMessages]);

  const homeStats = useMemo(
    () => [
      { label: "Connected", value: connectedServices.length },
      { label: "Focused rules", value: focusRules.length },
      { label: "Replies", value: emails.filter((email) => email.needs_reply).length },
      { label: "Meetings today", value: todayEvents.length },
    ],
    [connectedServices.length, emails, focusRules.length, todayEvents.length]
  );

  const focusPreview = focusRules
    .filter((rule) => rule.importance !== "muted")
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <MorningBrief onOpenCalendarPrep={onOpenCalendarPrep} />

      <section className="glass-card anim-card overflow-hidden" style={{ animationDelay: "0ms" }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,163,225,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(0,178,169,0.12),transparent_32%)]" />
        <div className="relative grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-accent-amber">
              Setup & Focus
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-text-heading">
              {onboardingCompleted
                ? "Your command center is focused and ready."
                : "Finish setup before the dashboard tries to do too much."}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
              {onboardingCompleted
                ? "You can adjust services and focus rules any time from here. The rest of Home stays intentionally high level."
                : "Connect the systems you care about and set structural focus once so Home, Comms, and Calendar know what should rise first."}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {focusPreview.length > 0 ? (
                focusPreview.map((rule) => (
                  <span
                    key={`${rule.provider}-${rule.entity_type}-${rule.entity_id}`}
                    className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.04] px-3 py-1 text-[11px] text-text-body"
                  >
                    {rule.label_snapshot || rule.entity_id}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-[var(--bg-card-border)] bg-white/[0.04] px-3 py-1 text-[11px] text-text-muted">
                  No focus rules saved yet
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => onOpenSetup("focus")}>
                {onboardingCompleted ? "Edit focus" : "Continue setup"}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onOpenSetup("connections")}>
                Manage services
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("communications")}>
                Open Comms
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {homeStats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-[22px] border border-[var(--bg-card-border)] bg-black/10 p-4"
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-text-muted">
                  {stat.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tabular-nums text-text-heading">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-card anim-card" style={{ animationDelay: "80ms" }}>
        <SectionHeader
          title="Communications Now"
          description="One high-level sweep of the threads, chats, comments, and channels most likely to need you next."
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate("communications")}>
              View all in Comms
            </Button>
          }
        />
        {communicationItems.length === 0 ? (
          <p className="text-sm text-text-muted">No communications are rising right now.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {communicationItems.map((item) => (
              <div
                key={item.id}
                className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-[var(--bg-card-border)] bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-text-muted">
                        {item.kind}
                      </span>
                      <span className="text-[11px] text-text-muted">{item.meta}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-text-heading">
                      {item.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-muted">
                      {item.preview}
                    </p>
                  </div>
                  <AttentionFeedbackControl
                    target={item.attentionTarget}
                    surface="home"
                    compact
                  />
                </div>
                {item.url && (
                  <div className="mt-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-accent-amber hover:underline"
                    >
                      Open source
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card anim-card" style={{ animationDelay: "120ms" }}>
        <SectionHeader
          title="Today on Calendar"
          description="Stay ahead of the next meetings that deserve prep or context."
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate("calendar")}>
              View Calendar
            </Button>
          }
        />
        {todayEvents.length === 0 ? (
          <p className="text-sm text-text-muted">No meetings are on deck today.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {todayEvents.map(({ event, attentionTarget }) => (
              <div
                key={event.id}
                className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {event.is_all_day ? formatDay(event.start_time) : `${formatDay(event.start_time)} · ${formatTime(event.start_time)}`}
                    </div>
                    <p className="mt-2 text-sm font-medium text-text-heading">
                      {event.subject}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {event.location || event.organizer || "Calendar event"}
                    </p>
                  </div>
                  <AttentionFeedbackControl target={attentionTarget} surface="home" compact />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenCalendarPrep(event.id)}
                  >
                    Prep
                  </Button>
                  {event.join_url && event.is_online && (
                    <a
                      href={event.join_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg bg-white/5 px-3 py-1.5 text-xs text-text-body transition-colors hover:bg-white/10"
                    >
                      Join
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card anim-card" style={{ animationDelay: "160ms" }}>
        <SectionHeader
          title="Priority Tasks"
          description="A short list of overdue and near-term work that should not get buried."
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate("operations")}>
              Open Operations
            </Button>
          }
        />
        {priorityTasks.length === 0 ? (
          <p className="text-sm text-text-muted">No tasks are rising above the baseline right now.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {priorityTasks.map(({ task, attentionTarget }) => (
              <a
                key={task.id}
                href={task.permalink_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {task.project_name || "Task"}
                    </div>
                    <p className="mt-2 text-sm font-medium text-text-heading">
                      {task.name}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {task.days_overdue > 0
                        ? `${task.days_overdue}d overdue`
                        : task.due_on
                          ? `Due ${formatDay(task.due_on)}`
                          : "No due date"}
                    </p>
                  </div>
                  <AttentionFeedbackControl target={attentionTarget} surface="home" compact />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card anim-card" style={{ animationDelay: "200ms" }}>
        <SectionHeader
          title="People to Watch"
          description="Keep the relationship layer visible before you drop into pipeline or operational detail."
          action={
            <Button variant="ghost" size="sm" onClick={() => onNavigate("people")}>
              Open People
            </Button>
          }
        />
        {peopleToWatch.length === 0 ? (
          <p className="text-sm text-text-muted">No relationship signals are available yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {peopleToWatch.map((person) => {
              const preference = getPersonPreference({
                name: person.name,
                email: person.email ?? null,
              });

              return (
                <div
                  key={person.name}
                  className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
                        person.urgency === "red" && "bg-accent-red/15 text-accent-red",
                        person.urgency === "amber" && "bg-accent-amber/15 text-accent-amber",
                        person.urgency === "teal" && "bg-accent-teal/15 text-accent-teal",
                        person.urgency === "gray" && "bg-white/10 text-text-muted"
                      )}
                    >
                      {person.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text-heading">
                          {person.name}
                        </p>
                        {preference?.important && (
                          <span className="rounded-full bg-accent-amber/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-amber">
                            Important
                          </span>
                        )}
                        {preference?.pinned && (
                          <span className="rounded-full bg-accent-teal/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-accent-teal">
                            Pinned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {person.touchpoints} touchpoint
                        {person.touchpoints === 1 ? "" : "s"} · {person.action}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="glass-card anim-card" style={{ animationDelay: "240ms" }}>
        <SectionHeader
          title="Performance & Operations Watchlist"
          description="Keep revenue risk and execution blockers visible, but leave the detail work for the deeper tabs."
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Performance
                </div>
                <p className="mt-1 text-sm text-text-muted">Deals that are aging or closing soon.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("performance")}>
                Open Performance
              </Button>
            </div>
            <div className="space-y-3">
              {performanceWatchlist.length > 0 ? (
                performanceWatchlist.map((opp) => (
                  <a
                    key={opp.id}
                    href={opp.sf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <p className="text-sm font-medium text-text-heading">{opp.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {opp.account_name} · closes in {opp.days_to_close}d
                    </p>
                  </a>
                ))
              ) : (
                <p className="text-sm text-text-muted">No major performance risks are rising.</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                  Operations
                </div>
                <p className="mt-1 text-sm text-text-muted">Orders or workflows that need intervention.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate("operations")}>
                Open Operations
              </Button>
            </div>
            <div className="space-y-3">
              {operationsWatchlist.length > 0 ? (
                operationsWatchlist.map((order) => (
                  <a
                    key={order.id}
                    href={order.monday_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                  >
                    <p className="text-sm font-medium text-text-heading">{order.name}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {order.status} · {order.location || "Location pending"}
                    </p>
                  </a>
                ))
              ) : (
                <p className="text-sm text-text-muted">No major operational blockers are rising.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
