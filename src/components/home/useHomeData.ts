"use client";

import { useMemo } from "react";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useCalendar } from "@/hooks/useCalendar";
import { useChats } from "@/hooks/useChats";
import { useEmails } from "@/hooks/useEmails";
import { useMonday } from "@/hooks/useMonday";
import { usePeople } from "@/hooks/usePeople";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useTasks } from "@/hooks/useTasks";
import {
  buildAsanaCommentAttentionTarget,
  buildCalendarAttentionTarget,
  buildEmailAttentionTarget,
  buildSlackAttentionTarget,
  buildTaskAttentionTarget,
  buildTeamsChatAttentionTarget,
} from "@/lib/attention/targets";
import { useAttention } from "@/lib/attention/client";
import { getAttentionPersonRankingWeight } from "@/lib/attention/people";

/* ─── Types ─── */

export type HeroItemKind = "email" | "chat" | "slack" | "asana" | "calendar" | "task";

export interface HeroItem {
  id: string;
  kind: HeroItemKind;
  title: string;
  subtitle: string;
  urgency: "now" | "today" | "this-week";
  score: number;
  url?: string;
  attentionTarget: unknown;
  /** Suggested CTA */
  action: QuickAction | null;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: "reply" | "video" | "check" | "arrow" | "settings";
  handler: "navigate" | "external" | "calendarPrep" | "setup";
  payload: string; // tab id, url, or eventId
}

export type CommunicationCardItem = {
  id: string;
  kind: "email" | "chat" | "slack" | "asana";
  title: string;
  meta: string;
  preview: string;
  url?: string | null;
  attentionTarget: unknown;
  score: number;
  timestamp: number;
};

/* ─── Helpers ─── */

const urgencyOrder = { red: 0, amber: 1, teal: 2, gray: 3 };

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
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

function minutesUntil(isoDate: string): number {
  return (new Date(isoDate).getTime() - Date.now()) / 60_000;
}

/* ─── Main Hook ─── */

export function useHomeData() {
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
    services,
    connectingService,
    applyTarget,
    getPersonPreference,
  } = useAttention();

  const connectedServices = useMemo(
    () => services.filter((s) => s.connected),
    [services]
  );
  const hasAnyService = connectedServices.length > 0;
  const hasM365 = connectedServices.some((s) => s.provider === "microsoft");
  const hasAsana = connectedServices.some((s) => s.provider === "asana");

  /* ── Today's events ── */
  const todayEvents = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Los_Angeles",
    });
    return [...events]
      .filter((e) => {
        const start = new Date(e.start_time).toLocaleDateString("en-CA", {
          timeZone: "America/Los_Angeles",
        });
        return start === today;
      })
      .map((event) => {
        const attentionTarget = buildCalendarAttentionTarget(event, "home", event.is_all_day ? 52 : 62);
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

  /* ── Priority tasks ── */
  const priorityTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => !t.completed)
      .map((task) => {
        const dueDelta = daysUntil(task.due_on);
        const baseScore = task.days_overdue > 0 ? 72 : dueDelta !== null && dueDelta <= 2 ? 62 : 50;
        const attentionTarget = buildTaskAttentionTarget(task, "home", baseScore);
        const attention = applyTarget(attentionTarget);
        return { task, attention, attentionTarget };
      })
      .filter((item) => !item.attention.hidden)
      .sort((a, b) => {
        if (a.task.days_overdue !== b.task.days_overdue) return b.task.days_overdue - a.task.days_overdue;
        return b.attention.finalScore - a.attention.finalScore;
      })
      .slice(0, 5);
  }, [applyTarget, tasks]);

  /* ── People to watch ── */
  const peopleToWatch = useMemo(() => {
    return [...people]
      .sort((a, b) => {
        const prefDelta =
          getAttentionPersonRankingWeight(getPersonPreference({ name: b.name, email: b.email ?? null })) -
          getAttentionPersonRankingWeight(getPersonPreference({ name: a.name, email: a.email ?? null }));
        if (prefDelta !== 0) return prefDelta;
        const urgDelta = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgDelta !== 0) return urgDelta;
        return b.touchpoints - a.touchpoints;
      })
      .slice(0, 5);
  }, [getPersonPreference, people]);

  /* ── Performance watchlist ── */
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

  /* ── Operations watchlist ── */
  const operationsWatchlist = useMemo(() => {
    if (!mondayConnected) return [];
    return orders.filter((o) => orderNeedsAttention(o.status)).slice(0, 3);
  }, [mondayConnected, orders]);

  /* ── Communication items ── */
  const communicationItems = useMemo<CommunicationCardItem[]>(() => {
    const next: CommunicationCardItem[] = [];

    emails
      .filter((e) => e.needs_reply)
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

    slackMessages.slice(0, 6).forEach((msg) => {
      const attentionTarget = buildSlackAttentionTarget(msg, "home", 54);
      const attention = applyTarget(attentionTarget);
      if (attention.hidden) return;
      next.push({
        id: `slack-${msg.id}`,
        kind: "slack",
        title: `#${msg.channel_name}`,
        meta: `${msg.author_name} · ${formatDay(msg.timestamp)}`,
        preview: msg.text || "Slack activity",
        url: msg.permalink,
        attentionTarget,
        score: attention.finalScore,
        timestamp: new Date(msg.timestamp).getTime(),
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

    return next.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp).slice(0, 6);
  }, [applyTarget, chats, comments, emails, slackMessages]);

  /* ── Hero items (top 3 urgent across all sources) ── */
  const heroItems = useMemo<HeroItem[]>(() => {
    const candidates: HeroItem[] = [];

    // Urgent emails
    communicationItems
      .filter((item) => item.kind === "email" && item.score >= 70)
      .forEach((item) => {
        candidates.push({
          id: item.id,
          kind: "email",
          title: item.title,
          subtitle: item.meta,
          urgency: item.score >= 80 ? "now" : "today",
          score: item.score,
          url: item.url ?? undefined,
          attentionTarget: item.attentionTarget,
          action: {
            id: `reply-${item.id}`,
            label: "Open in Comms",
            icon: "reply",
            handler: "navigate",
            payload: "communications",
          },
        });
      });

    // Next meeting within 30 min
    todayEvents.forEach(({ event, attention }) => {
      const minsAway = minutesUntil(event.start_time);
      if (minsAway > 0 && minsAway <= 30) {
        candidates.push({
          id: `cal-${event.id}`,
          kind: "calendar",
          title: event.subject,
          subtitle: `Starts in ${Math.round(minsAway)} min${event.location ? ` · ${event.location}` : ""}`,
          urgency: minsAway <= 10 ? "now" : "today",
          score: attention.finalScore + 20,
          url: event.join_url || undefined,
          attentionTarget: null,
          action: event.join_url
            ? { id: `join-${event.id}`, label: "Join", icon: "video", handler: "external", payload: event.join_url }
            : { id: `prep-${event.id}`, label: "Prep", icon: "arrow", handler: "calendarPrep", payload: event.id },
        });
      }
    });

    // Overdue tasks
    priorityTasks
      .filter(({ task }) => task.days_overdue > 0)
      .forEach(({ task, attention }) => {
        candidates.push({
          id: `task-${task.id}`,
          kind: "task",
          title: task.name,
          subtitle: `${task.days_overdue}d overdue · ${task.project_name || "Task"}`,
          urgency: task.days_overdue >= 3 ? "now" : "today",
          score: attention.finalScore,
          url: task.permalink_url,
          attentionTarget: null,
          action: {
            id: `open-${task.id}`,
            label: "Open Task",
            icon: "check",
            handler: "external",
            payload: task.permalink_url,
          },
        });
      });

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [communicationItems, todayEvents, priorityTasks]);

  const heroItemIds = useMemo(
    () => new Set(heroItems.map((h) => h.id)),
    [heroItems]
  );

  /* ── Quick actions ── */
  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [];

    // Derive from hero items
    heroItems.forEach((item) => {
      if (item.action && actions.length < 3) {
        actions.push(item.action);
      }
    });

    // Fill with defaults
    if (actions.length < 3 && hasM365) {
      if (!actions.some((a) => a.handler === "navigate" && a.payload === "communications")) {
        actions.push({ id: "nav-comms", label: "Open Comms", icon: "reply", handler: "navigate", payload: "communications" });
      }
    }
    if (actions.length < 3 && hasM365) {
      if (!actions.some((a) => a.handler === "navigate" && a.payload === "calendar")) {
        actions.push({ id: "nav-cal", label: "View Calendar", icon: "arrow", handler: "navigate", payload: "calendar" });
      }
    }
    if (actions.length < 4) {
      actions.push({ id: "nav-setup", label: "Personalize", icon: "settings", handler: "setup", payload: "focus" });
    }

    return actions.slice(0, 5);
  }, [heroItems, hasM365]);

  /* ── Home stats ── */
  const homeStats = useMemo(
    () => [
      { label: "Connected", value: connectedServices.length },
      { label: "Replies", value: emails.filter((e) => e.needs_reply).length },
      { label: "Meetings today", value: todayEvents.length },
      { label: "Priority tasks", value: priorityTasks.length },
    ],
    [connectedServices.length, emails, todayEvents.length, priorityTasks.length]
  );

  return {
    // Hero
    heroItems,
    heroItemIds,
    quickActions,

    // Sections
    communicationItems,
    todayEvents,
    priorityTasks,
    peopleToWatch,
    performanceWatchlist,
    operationsWatchlist,
    homeStats,

    // Services
    connectedServices,
    hasAnyService,
    hasM365,
    hasAsana,
    connectingService,

    // Attention
    applyTarget,
    getPersonPreference,

    // Helpers
    formatDay,
    formatTime,
  };
}
