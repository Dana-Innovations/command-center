"use client";

import { useMemo, useState, useEffect } from "react";
import { useCalendar } from "@/hooks/useCalendar";
import { useEmails } from "@/hooks/useEmails";
import { useTasks } from "@/hooks/useTasks";
import { useAsanaComments } from "@/hooks/useAsanaComments";
import { useChats } from "@/hooks/useChats";
import { useSlackFeed } from "@/hooks/useSlackFeed";
import { useSalesforce } from "@/hooks/useSalesforce";
import { useAttention } from "@/lib/attention/client";
import { useConnections } from "@/hooks/useConnections";
import { getCurrentPSTHour } from "@/lib/utils";
import {
  buildCandidatePool,
  computeAgendaBlocks,
  type SmartAgendaData,
} from "@/lib/smart-agenda";

const WINDOW_HOURS = 4;

export function useSmartAgenda(): SmartAgendaData & {
  visible: boolean;
} {
  const { events } = useCalendar();
  const { emails } = useEmails();
  const { tasks } = useTasks();
  const { comments } = useAsanaComments();
  const { chats } = useChats();
  const { messages: slackMessages } = useSlackFeed();
  const { openOpps } = useSalesforce();
  const { applyTarget } = useAttention();
  const connections = useConnections();

  // Update "now" every 60 seconds so the timeline stays current
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Hide outside business hours (7am - 7pm PT)
  const pstHour = getCurrentPSTHour();
  const visible = pstHour >= 7 && pstHour < 19;

  const agenda = useMemo(() => {
    const candidates = buildCandidatePool(
      { emails, tasks, comments, chats, slackMessages, openOpps },
      applyTarget
    );

    return computeAgendaBlocks(
      events,
      now,
      WINDOW_HOURS,
      applyTarget,
      candidates
    );
  }, [events, emails, tasks, comments, chats, slackMessages, openOpps, applyTarget, now]);

  return {
    ...agenda,
    visible,
    hasCalendar: agenda.hasCalendar || connections.m365,
  };
}
