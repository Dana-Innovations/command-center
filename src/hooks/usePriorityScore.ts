'use client';

import { useMemo } from 'react';
import { useEmails } from './useEmails';
import { useTasks } from './useTasks';
import { useChats } from './useChats';
import { useSalesforce } from './useSalesforce';
import { PriorityItem } from '@/lib/types';
import { calcScore, getEnergySlot } from '@/lib/priority';

export function usePriorityScore() {
  const { emails, loading: emailsLoading } = useEmails();
  const { tasks, loading: tasksLoading } = useTasks();
  const { chats, loading: chatsLoading } = useChats();
  const { opportunities, loading: sfLoading } = useSalesforce();

  const loading = emailsLoading || tasksLoading || chatsLoading || sfLoading;

  const items = useMemo(() => {
    const priorityItems: PriorityItem[] = [];

    // Known noise senders to skip in priority engine
    const NOISE_SENDERS = /noreply|no-reply|newsletter|marketing|notification|donotreply|mailer|linkedin|twitter|digest|promo|offer|deal/i;

    for (const email of emails) {
      // Skip read emails older than 3 days — already handled
      const receivedDaysAgoCheck = Math.floor((Date.now() - new Date(email.received_at).getTime()) / (1000 * 60 * 60 * 24));
      if (email.is_read && receivedDaysAgoCheck > 3) continue;
      if (NOISE_SENDERS.test(email.from_email || '') || NOISE_SENDERS.test(email.from_name || '')) continue;

      const subject = email.subject?.toLowerCase() || '';
      const isFinancial = /invoice|payment|billing|budget|revenue|cost|expense|contract|pricing|tax/.test(subject);
      const isLegal = /legal|lawsuit|litigation|compliance|npi|attorney|counsel|depo|deposition/.test(subject);
      const isUrgent = /urgent|asap|critical|emergency|action required|deadline|time.sensitive/.test(subject);
      const isFromSonance = (email.from_email || '').endsWith('@sonance.com');

      const receivedDaysAgo = Math.floor((Date.now() - new Date(email.received_at).getTime()) / (1000 * 60 * 60 * 24));

      // Base priority: internal Sonance emails rank higher; recent emails rank higher
      const recencyBonus = receivedDaysAgo === 0 ? 10 : receivedDaysAgo === 1 ? 5 : 0;
      const basePriority = (isFromSonance ? 30 : 22) + recencyBonus;
      const isUnread = !email.is_read;

      priorityItems.push({
        title: email.subject,
        source: 'email',
        url: email.outlook_url,
        daysOverdue: isUnread ? Math.max(0, receivedDaysAgo - 1) : 0,
        needsReply: isUnread,
        urgent: isUrgent,
        requiresAction: isUnread,
        multiplePeopleWaiting: false,
        hardDeadlineWithin7: false,
        financial: isFinancial,
        legal: isLegal,
        basePriority,
      });
    }

    for (const task of tasks) {
      const isUrgent = task.priority === 'high' || task.priority === 'urgent';
      priorityItems.push({
        title: task.name,
        source: 'asana',
        url: task.permalink_url,
        daysOverdue: task.days_overdue || 0,
        needsReply: false,
        urgent: isUrgent,
        requiresAction: true,
        multiplePeopleWaiting: false,
        hardDeadlineWithin7: task.days_overdue !== null && task.days_overdue >= -7 && task.days_overdue < 0,
        financial: false,
        legal: false,
        basePriority: isUrgent ? 30 : 15,
      });
    }

    for (const chat of chats) {
      priorityItems.push({
        title: chat.topic || chat.last_message_preview || 'Teams chat',
        source: 'teams',
        url: '',
        daysOverdue: 0,
        needsReply: true,
        urgent: false,
        requiresAction: false,
        multiplePeopleWaiting: (chat.members?.length || 0) > 3,
        hardDeadlineWithin7: false,
        financial: false,
        legal: false,
        basePriority: 10,
      });
    }

    // Salesforce: informational — Ari monitors but doesn't directly manage the pipeline
    for (const opp of opportunities) {
      if (opp.is_closed && opp.is_won) continue;
      const stageKey = (opp.stage || '').toLowerCase();
      const isNegotiation = stageKey.includes('negotiation') || stageKey.includes('closing');
      const basePriority = isNegotiation ? 25
        : stageKey.includes('proposal') ? 20
        : stageKey.includes('qualification') ? 15
        : 10;

      priorityItems.push({
        title: `${opp.name} — $${Number(opp.amount).toLocaleString()}`,
        source: 'salesforce',
        url: opp.sf_url || '',
        daysOverdue: 0,
        needsReply: false,
        urgent: false,
        requiresAction: false,
        multiplePeopleWaiting: false,
        hardDeadlineWithin7: false,
        financial: false,
        legal: false,
        basePriority,
      });
    }

    const energySlot = getEnergySlot();

    const scored = priorityItems.map((item) => {
      const baseScore = calcScore(item);
      const bonus = energySlot.boost(item);
      const finalScore = Math.max(0, Math.min(100, baseScore + bonus));
      return {
        ...item,
        score: baseScore,
        energyBonus: bonus,
        displayScore: finalScore,
      };
    });

    scored.sort((a, b) => (b.displayScore ?? 0) - (a.displayScore ?? 0));

    return scored;
  }, [emails, tasks, chats, opportunities]);

  const energySlot = getEnergySlot();

  return { items, loading, energySlot };
}
