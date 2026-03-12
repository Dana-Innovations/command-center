"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  startTransition,
  type ReactNode,
} from "react";
import type {
  Email,
  CalendarEvent,
  Task,
  AsanaCommentThread,
  AsanaProject,
  SalesforceOpportunity,
  Chat,
  SlackFeedMessage,
} from "./types";

export interface ConnectionStatus {
  m365: boolean;
  asana: boolean;
  slack: boolean;
  salesforce: boolean;
  powerbi: boolean;
  monday: boolean;
}

interface LiveDataState {
  emails: Email[];
  sentEmails: Email[];
  calendar: CalendarEvent[];
  tasks: Task[];
  asanaComments: AsanaCommentThread[];
  asanaProjects: AsanaProject[];
  opportunities: SalesforceOpportunity[];
  chats: Chat[];
  slack: SlackFeedMessage[];
  powerbi: { reports: unknown[]; kpis: unknown[] };
  connections: ConnectionStatus;
  loading: boolean;
  error: string | null;
  fetchedAt: Date | null;
  refetch: () => Promise<void>;
}

const LiveDataContext = createContext<LiveDataState | null>(null);

const REFRESH_MS = 15 * 60_000; // 15 minutes while the active tab is visible
const RETRY_MS = 2 * 60_000; // Retry after 2 minutes on error
const RESUME_STALE_MS = 60_000; // Refresh soon after returning to the tab
const LEADER_KEY = "command-center:live-data-leader";
const LEADER_TTL_MS = 45_000;
const LEADER_HEARTBEAT_MS = 15_000;

type FetchReason =
  | "mount"
  | "visible"
  | "focus"
  | "scheduled"
  | "retry"
  | "manual"
  | "leader";

interface LeaderLease {
  tabId: string;
  expiresAt: number;
}

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function parseLeaderLease(value: string | null): LeaderLease | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<LeaderLease>;
    if (typeof parsed.tabId !== "string" || typeof parsed.expiresAt !== "number") {
      return null;
    }
    return {
      tabId: parsed.tabId,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [asanaComments, setAsanaComments] = useState<AsanaCommentThread[]>([]);
  const [asanaProjects, setAsanaProjects] = useState<AsanaProject[]>([]);
  const [opportunities, setOpportunities] = useState<SalesforceOpportunity[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [slack, setSlack] = useState<SlackFeedMessage[]>([]);
  const [powerbi, setPowerbi] = useState<{ reports: unknown[]; kpis: unknown[] }>({ reports: [], kpis: [] });
  const [connections, setConnections] = useState<ConnectionStatus>({ m365: false, asana: false, slack: false, salesforce: false, powerbi: false, monday: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);
  const isLeaderRef = useRef(false);
  const lastFetchedAtRef = useRef(0);
  const fetchLiveDataRef = useRef<(reason?: FetchReason) => Promise<void>>(async () => {});
  const tabIdRef = useRef("");

  if (!tabIdRef.current) {
    tabIdRef.current =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `tab-${Math.random().toString(36).slice(2)}`;
  }

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopScheduledWork = useCallback(() => {
    clearPollTimer();
    clearRetryTimer();
  }, [clearPollTimer, clearRetryTimer]);

  const readLeaderLease = useCallback((): LeaderLease | null => {
    try {
      return parseLeaderLease(window.localStorage.getItem(LEADER_KEY));
    } catch {
      return null;
    }
  }, []);

  const writeLeaderLease = useCallback((expiresAt = Date.now() + LEADER_TTL_MS) => {
    const lease: LeaderLease = { tabId: tabIdRef.current, expiresAt };

    try {
      window.localStorage.setItem(LEADER_KEY, JSON.stringify(lease));
    } catch {
      // Ignore storage failures and fall back to visible-tab gating only.
    }

    isLeaderRef.current = true;
  }, []);

  const releaseLeadership = useCallback(() => {
    const currentLease = readLeaderLease();
    if (currentLease?.tabId === tabIdRef.current) {
      try {
        window.localStorage.removeItem(LEADER_KEY);
      } catch {
        // Ignore storage failures.
      }
    }

    isLeaderRef.current = false;
    stopScheduledWork();
  }, [readLeaderLease, stopScheduledWork]);

  const claimLeadership = useCallback(
    (preferSelf = false) => {
      if (!isDocumentVisible()) {
        isLeaderRef.current = false;
        return false;
      }

      const now = Date.now();
      const currentLease = readLeaderLease();
      const canLead =
        preferSelf ||
        !currentLease ||
        currentLease.expiresAt <= now ||
        currentLease.tabId === tabIdRef.current;

      if (!canLead) {
        isLeaderRef.current = false;
        stopScheduledWork();
        return false;
      }

      writeLeaderLease(now + LEADER_TTL_MS);
      return true;
    },
    [readLeaderLease, stopScheduledWork, writeLeaderLease]
  );

  const scheduleNextRefresh = useCallback(
    (delay = REFRESH_MS) => {
      clearPollTimer();
      if (!mountedRef.current || !isLeaderRef.current || !isDocumentVisible()) {
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        void fetchLiveDataRef.current("scheduled");
      }, delay);
    },
    [clearPollTimer]
  );

  const scheduleRetry = useCallback(
    (delay = RETRY_MS) => {
      clearRetryTimer();
      if (!mountedRef.current || !isLeaderRef.current || !isDocumentVisible()) {
        return;
      }

      retryTimerRef.current = setTimeout(() => {
        void fetchLiveDataRef.current("retry");
      }, delay);
    },
    [clearRetryTimer]
  );

  const maybeRefreshAfterResume = useCallback(
    (reason: Extract<FetchReason, "mount" | "visible" | "focus" | "leader">) => {
      if (!mountedRef.current || !isLeaderRef.current || !isDocumentVisible()) {
        return;
      }

      const age = Date.now() - lastFetchedAtRef.current;
      if (!lastFetchedAtRef.current || age >= RESUME_STALE_MS) {
        void fetchLiveDataRef.current(reason);
        return;
      }

      scheduleNextRefresh(Math.max(REFRESH_MS - age, 5_000));
    },
    [scheduleNextRefresh]
  );

  const fetchLiveData = useCallback(
    async (reason: FetchReason = "manual") => {
      if (!mountedRef.current || !isDocumentVisible()) {
        return;
      }

      if (reason !== "manual" && !isLeaderRef.current) {
        return;
      }

      if (inFlightRef.current) {
        return inFlightRef.current;
      }

      stopScheduledWork();
      setLoading(true);

      const request = (async () => {
        try {
          let apiUrl = "/api/data/live";
          try {
            const stored = window.localStorage.getItem("my-monkeys:project-filter");
            if (stored) {
              const gids: string[] = JSON.parse(stored);
              if (Array.isArray(gids) && gids.length > 0) {
                apiUrl += `?projectGids=${gids.join(",")}`;
              }
            }
          } catch {
            // ignore localStorage errors
          }
          const res = await fetch(apiUrl, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = await res.json();
          const nextFetchedAt = new Date(data.fetchedAt ?? Date.now());
          lastFetchedAtRef.current = nextFetchedAt.getTime();

          startTransition(() => {
            setEmails((data.emails ?? []) as Email[]);
            setSentEmails((data.sentEmails ?? []) as Email[]);
            setCalendar((data.calendar ?? []) as CalendarEvent[]);
            setTasks((data.tasks ?? []) as Task[]);
            setAsanaComments((data.asanaComments ?? []) as AsanaCommentThread[]);
            if (data.asanaProjects) {
              setAsanaProjects((data.asanaProjects ?? []) as AsanaProject[]);
            }
            setOpportunities((data.pipeline ?? []) as SalesforceOpportunity[]);
            setChats((data.chats ?? []) as Chat[]);
            setSlack((data.slack ?? []) as SlackFeedMessage[]);
            if (data.powerbi) {
              setPowerbi(data.powerbi as { reports: unknown[]; kpis: unknown[] });
            }
            if (data.connections) {
              setConnections(data.connections as ConnectionStatus);
            }
            setFetchedAt(nextFetchedAt);
            setError(null);
          });

          if (isLeaderRef.current) {
            scheduleNextRefresh();
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to fetch live data");
          if (isLeaderRef.current) {
            scheduleRetry();
          }
        } finally {
          inFlightRef.current = null;
          if (mountedRef.current) {
            setLoading(false);
          }
        }
      })();

      inFlightRef.current = request;
      return request;
    },
    [scheduleNextRefresh, scheduleRetry, stopScheduledWork]
  );

  fetchLiveDataRef.current = fetchLiveData;

  const refetch = useCallback(async () => {
    if (isDocumentVisible()) {
      claimLeadership(true);
    }

    await fetchLiveData("manual");
  }, [claimLeadership, fetchLiveData]);

  useEffect(() => {
    mountedRef.current = true;

    const handleVisible = (reason: Extract<FetchReason, "mount" | "visible" | "focus" | "leader">) => {
      const becameLeader = claimLeadership(reason !== "leader");
      if (becameLeader) {
        maybeRefreshAfterResume(reason);
      }
    };

    const handleHidden = () => {
      releaseLeadership();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleVisible("visible");
      } else {
        handleHidden();
      }
    };

    const onFocus = () => {
      if (isDocumentVisible()) {
        handleVisible("focus");
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LEADER_KEY || !isDocumentVisible()) {
        return;
      }

      const currentLease = readLeaderLease();
      const stillLeader =
        Boolean(currentLease) &&
        currentLease!.tabId === tabIdRef.current &&
        currentLease!.expiresAt > Date.now();

      if (!stillLeader) {
        isLeaderRef.current = false;
        stopScheduledWork();
      }

      if (!currentLease || currentLease.expiresAt <= Date.now()) {
        handleVisible("leader");
      }
    };

    const onBeforeUnload = () => {
      releaseLeadership();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onBeforeUnload);

    heartbeatRef.current = setInterval(() => {
      if (!mountedRef.current || !isDocumentVisible()) {
        return;
      }

      const currentLease = readLeaderLease();
      const now = Date.now();

      if (currentLease?.tabId === tabIdRef.current) {
        writeLeaderLease(now + LEADER_TTL_MS);
        return;
      }

      if (!currentLease || currentLease.expiresAt <= now) {
        handleVisible("leader");
      }
    }, LEADER_HEARTBEAT_MS);

    if (isDocumentVisible()) {
      handleVisible("mount");
    }

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      releaseLeadership();
    };
  }, [claimLeadership, maybeRefreshAfterResume, readLeaderLease, releaseLeadership, stopScheduledWork, writeLeaderLease]);

  return (
    <LiveDataContext.Provider
      value={{
        emails,
        sentEmails,
        calendar,
        tasks,
        asanaComments,
        asanaProjects,
        opportunities,
        chats,
        slack,
        powerbi,
        connections,
        loading,
        error,
        fetchedAt,
        refetch,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
}

export function useLiveData() {
  const ctx = useContext(LiveDataContext);
  if (!ctx)
    throw new Error("useLiveData must be used within a LiveDataProvider");
  return ctx;
}
