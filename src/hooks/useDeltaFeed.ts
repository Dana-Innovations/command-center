"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveData } from "@/lib/live-data-context";
import {
  createSnapshot,
  diffSnapshot,
  loadSnapshot,
  loadWatermark,
  saveSnapshot,
  saveWatermark,
  type DeltaGroup,
  type SnapshotInput,
} from "@/lib/delta-snapshot";

const HIDDEN_THRESHOLD_MS = 60_000; // 1 minute

export function useDeltaFeed() {
  const liveData = useLiveData();
  const [totalChanges, setTotalChanges] = useState(0);
  const [groups, setGroups] = useState<DeltaGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<Date | null>(null);

  const hasShownToastRef = useRef(false);
  const hiddenSinceRef = useRef<number | null>(null);
  const supabaseRef = useRef(createClient());

  // Load watermark on mount
  useEffect(() => {
    const wm = loadWatermark();
    setLastSeenAt(wm);
  }, []);

  // Query sync_log for aggregate counts since watermark
  const checkForChanges = useCallback(async () => {
    const wm = loadWatermark();
    if (!wm) {
      // First visit ever — set watermark, save initial snapshot, no toast
      saveWatermark();
      if (liveData.fetchedAt) {
        saveSnapshot(
          createSnapshot({
            emails: liveData.emails,
            calendar: liveData.calendar,
            tasks: liveData.tasks,
            chats: liveData.chats,
            slack: liveData.slack,
            opportunities: liveData.opportunities,
          })
        );
      }
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabaseRef.current
        .from("sync_log")
        .select("data_type, items_synced")
        .gte("completed_at", wm.toISOString())
        .eq("status", "completed");

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Aggregate by data_type
      const agg: Record<string, number> = {};
      for (const row of data as Array<{ data_type: string; items_synced: number }>) {
        agg[row.data_type] = (agg[row.data_type] ?? 0) + row.items_synced;
      }

      const total = Object.values(agg).reduce((sum, n) => sum + n, 0);
      setTotalChanges(total);
      setLastSeenAt(wm);

      // Build coarse groups (counts only — items populated lazily)
      const serviceMap: Record<string, DeltaGroup["service"]> = {
        emails: "emails",
        calendar: "calendar",
        tasks: "tasks",
        chats: "chats",
        teams: "chats",
        slack: "slack",
        salesforce: "salesforce",
      };
      const labelMap: Record<DeltaGroup["service"], string> = {
        emails: "Email",
        calendar: "Calendar",
        tasks: "Tasks",
        chats: "Teams",
        slack: "Slack",
        salesforce: "Pipeline",
      };

      const coarseGroups: DeltaGroup[] = [];
      for (const [dataType, count] of Object.entries(agg)) {
        const service = serviceMap[dataType];
        if (!service || count === 0) continue;
        // Merge into existing group if already there (e.g. "chats" + "teams")
        const existing = coarseGroups.find((g) => g.service === service);
        if (existing) {
          existing.count += count;
        } else {
          coarseGroups.push({
            service,
            label: labelMap[service],
            count,
            items: [],
          });
        }
      }
      setGroups(coarseGroups);

      // Show toast only once per return, and only if there are changes
      if (total > 0 && !hasShownToastRef.current) {
        setShowToast(true);
        hasShownToastRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [liveData.calendar, liveData.chats, liveData.emails, liveData.fetchedAt, liveData.opportunities, liveData.slack, liveData.tasks]);

  // Check on mount (after first data load)
  const initialCheckDone = useRef(false);
  useEffect(() => {
    if (!liveData.fetchedAt || initialCheckDone.current) return;
    initialCheckDone.current = true;
    void checkForChanges();
  }, [liveData.fetchedAt, checkForChanges]);

  // Track visibility changes — check on tab resume after 1+ min
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        // Reset toast flag so next return can show it
        hasShownToastRef.current = false;
        setShowToast(false);
      } else if (document.visibilityState === "visible") {
        const hiddenSince = hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (hiddenSince && Date.now() - hiddenSince >= HIDDEN_THRESHOLD_MS) {
          void checkForChanges();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [checkForChanges]);

  // Lazily enrich groups with item-level detail (called when panel opens)
  const enrichGroups = useCallback(() => {
    const prev = loadSnapshot();
    if (!prev) {
      // No prior snapshot — can't diff, keep coarse groups
      return;
    }

    const currentData: SnapshotInput = {
      emails: liveData.emails,
      calendar: liveData.calendar,
      tasks: liveData.tasks,
      chats: liveData.chats,
      slack: liveData.slack,
      opportunities: liveData.opportunities,
    };

    const enriched = diffSnapshot(prev, createSnapshot(currentData), currentData);

    // Merge enriched item detail into existing groups (keep sync_log counts as fallback)
    setGroups((prevGroups) => {
      if (enriched.length === 0) return prevGroups;

      const merged = new Map<DeltaGroup["service"], DeltaGroup>();

      // Start with enriched groups (have items)
      for (const g of enriched) {
        merged.set(g.service, { ...g });
      }

      // Add any coarse groups that weren't in the enriched set
      for (const g of prevGroups) {
        if (!merged.has(g.service)) {
          merged.set(g.service, g);
        }
      }

      return Array.from(merged.values());
    });
  }, [liveData.calendar, liveData.chats, liveData.emails, liveData.opportunities, liveData.slack, liveData.tasks]);

  // Acknowledge — mark all as seen
  const acknowledge = useCallback(() => {
    const now = new Date();
    saveWatermark(now);
    setLastSeenAt(now);
    setTotalChanges(0);
    setGroups([]);
    setShowToast(false);
    hasShownToastRef.current = true; // prevent re-show until next hide/show cycle

    // Save fresh snapshot
    if (liveData.fetchedAt) {
      saveSnapshot(
        createSnapshot({
          emails: liveData.emails,
          calendar: liveData.calendar,
          tasks: liveData.tasks,
          chats: liveData.chats,
          slack: liveData.slack,
          opportunities: liveData.opportunities,
        })
      );
    }

    // Fire-and-forget Supabase watermark update for cross-device persistence
    fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dashboard: { delta_last_seen_at: now.toISOString() },
      }),
    }).catch(() => {});
  }, [liveData.calendar, liveData.chats, liveData.emails, liveData.fetchedAt, liveData.opportunities, liveData.slack, liveData.tasks]);

  // Dismiss toast without acknowledging (just hide it)
  const dismissToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return {
    totalChanges,
    groups,
    loading,
    showToast,
    lastSeenAt,
    acknowledge,
    enrichGroups,
    dismissToast,
  };
}
