"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type {
  Email,
  CalendarEvent,
  Task,
  SalesforceOpportunity,
  Chat,
  SlackFeedMessage,
} from "./types";

interface LiveDataState {
  emails: Email[];
  calendar: CalendarEvent[];
  tasks: Task[];
  opportunities: SalesforceOpportunity[];
  chats: Chat[];
  slack: SlackFeedMessage[];
  powerbi: { reports: unknown[]; kpis: unknown[] };
  loading: boolean;
  error: string | null;
  fetchedAt: Date | null;
  refetch: () => Promise<void>;
}

const LiveDataContext = createContext<LiveDataState | null>(null);

const REFRESH_MS = 5 * 60_000; // 5 minutes
const RETRY_MS = 60_000; // 60 seconds on error

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [opportunities, setOpportunities] = useState<SalesforceOpportunity[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [slack, setSlack] = useState<SlackFeedMessage[]>([]);
  const [powerbi, setPowerbi] = useState<{ reports: unknown[]; kpis: unknown[] }>({ reports: [], kpis: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLiveData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data/live");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmails((data.emails ?? []) as Email[]);
      setCalendar((data.calendar ?? []) as CalendarEvent[]);
      setTasks((data.tasks ?? []) as Task[]);
      setOpportunities((data.pipeline ?? []) as SalesforceOpportunity[]);
      setChats((data.chats ?? []) as Chat[]);
      setSlack((data.slack ?? []) as SlackFeedMessage[]);
      if (data.powerbi) setPowerbi(data.powerbi as { reports: unknown[]; kpis: unknown[] });
      setFetchedAt(new Date(data.fetchedAt));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch live data");
      // Retry after 60s on error
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => {
        fetchLiveData();
      }, RETRY_MS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, REFRESH_MS);
    return () => {
      clearInterval(interval);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [fetchLiveData]);

  return (
    <LiveDataContext.Provider
      value={{
        emails,
        calendar,
        tasks,
        opportunities,
        chats,
        slack,
        powerbi,
        loading,
        error,
        fetchedAt,
        refetch: fetchLiveData,
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
