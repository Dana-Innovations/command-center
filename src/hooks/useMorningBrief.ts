"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useEmails } from "@/hooks/useEmails";
import { useCalendar } from "@/hooks/useCalendar";
import { useTasks } from "@/hooks/useTasks";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useChats } from "@/hooks/useChats";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useMonday } from "@/hooks/useMonday";
import { useAttention } from "@/lib/attention/client";
import {
  type BriefApiSnapshot,
  type BriefSnapshot,
  type MorningBrief,
  type MorningBriefRequestBody,
  type MorningBriefResponseBody,
  buildBriefSnapshot,
  computeSnapshotHash,
  buildOriginalTargetsMap,
  stripAttentionTargetsFromBriefSnapshot,
} from "@/lib/morning-brief";
import type { AttentionTarget } from "@/lib/attention/types";

export type BriefStatus = "idle" | "loading" | "ready" | "error";

export function useMorningBrief() {
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [status, setStatus] = useState<BriefStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const { emails } = useEmails();
  const { events } = useCalendar();
  const { tasks } = useTasks();
  const { comments } = useAsanaComments();
  const { chats } = useChats();
  const { messages: slackMessages } = useSlackFeed();
  const { openOpps } = useSalesforce();
  const { orders } = useMonday();
  const { applyTarget } = useAttention();

  const snapshot = useMemo<BriefSnapshot>(
    () =>
      buildBriefSnapshot(
        { emails, events, tasks, comments, chats, slackMessages, openOpps, orders },
        applyTarget
      ),
    [emails, events, tasks, comments, chats, slackMessages, openOpps, orders, applyTarget]
  );

  const snapshotHash = useMemo(() => computeSnapshotHash(snapshot), [snapshot]);
  const apiSnapshot = useMemo<BriefApiSnapshot>(
    () => stripAttentionTargetsFromBriefSnapshot(snapshot),
    [snapshot]
  );

  // Keep a map of original AttentionTargets for richer feedback
  const originalTargets = useMemo<Map<string, AttentionTarget>>(
    () => buildOriginalTargetsMap(snapshot),
    [snapshot]
  );

  const generate = useCallback(
    async (force = false) => {
      setStatus("loading");
      setError(null);
      try {
        const payload: MorningBriefRequestBody = {
          force,
          snapshot: apiSnapshot,
        };

        const res = await fetch("/api/ai/morning-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        const data = (await res.json()) as MorningBriefResponseBody;
        setBrief(data.brief as MorningBrief);
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate brief");
        setStatus("error");
      }
    },
    [apiSnapshot]
  );

  // Auto-generate on first load once any data arrives
  const hasDataRef = useRef(false);
  useEffect(() => {
    const hasData =
      emails.length > 0 ||
      tasks.length > 0 ||
      events.length > 0 ||
      chats.length > 0 ||
      slackMessages.length > 0;
    if (status === "idle" && hasData && !hasDataRef.current) {
      hasDataRef.current = true;
      void generate();
    }
  }, [status, emails.length, tasks.length, events.length, chats.length, slackMessages.length, generate]);

  // Auto-regenerate when snapshot hash changes (data refreshed)
  const prevHashRef = useRef(snapshotHash);
  useEffect(() => {
    if (prevHashRef.current !== snapshotHash && (status === "ready" || brief)) {
      prevHashRef.current = snapshotHash;
      void generate(); // Will use server-side cache if hash matches
    }
  }, [brief, snapshotHash, status, generate]);

  return {
    brief,
    status,
    error,
    snapshot,
    originalTargets,
    refresh: useCallback(() => generate(true), [generate]),
  };
}
