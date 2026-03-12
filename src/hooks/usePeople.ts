'use client';

import { useMemo, useState } from 'react';
import { useEmails } from './useEmails';
import { useCalendar } from './useCalendar';
import { useTasks } from './useTasks';
import { useChats } from './useChats';
import { useAuth } from './useAuth';
import { useLiveData } from '@/lib/live-data-context';

export interface TouchpointItem {
  ch: 'email' | 'teams' | 'asana' | 'slack' | 'meeting';
  text: string;
  url: string;
  draft: string;
  timestamp?: string;
  preview?: string;
}

export interface Person {
  name: string;
  email?: string;
  urgency: 'red' | 'amber' | 'teal' | 'gray';
  touchpoints: number;
  items: TouchpointItem[];
  action: string;
  lastContact?: string;
  teamsChatId?: string;
}

const EXCLUDE_SENDERS = new Set([
  'microsoft', 'noreply', 'no-reply', 'notifications', 'donotreply',
  'do-not-reply', 'mailer', 'bounce', 'asana', 'slack', 'zoom',
  'linkedin', 'twitter', 'youtube', 'google', 'apple', 'amazon',
  'support', 'info', 'help', 'team', 'newsletter', 'marketing',
  'updates', 'alert', 'digest', 'billing', 'security', 'postmaster',
  'feedback', 'survey', 'promotion', 'offers', 'deals', 'shop',
  'vercel', 'github', 'copilot', 'mileageplus', 'monday.com', 'roon',
]);

function shouldExclude(name: string, email: string): boolean {
  const ln = name.toLowerCase();
  const le = email.toLowerCase();
  for (const ex of EXCLUDE_SENDERS) {
    if (ln.includes(ex) || le.includes(ex)) return true;
  }
  if (le.match(/\+(noreply|bounce|mail)\@/)) return true;
  if (le.match(/^(no-?reply|noreply|notification|alert|auto|bounce|mailer|postmaster)/)) return true;
  return false;
}

function normalizeName(name: string): string {
  return name.replace(/<.*>/, '').replace(/\(.*\)/, '').trim();
}

function chatMatchesPerson(chatTopic: string, personName: string): boolean {
  if (!chatTopic || !personName) return false;
  const ct = chatTopic.toLowerCase();
  const pn = personName.toLowerCase();
  if (ct === pn) return true;
  const firstName = pn.split(' ')[0];
  if (firstName.length > 2 && ct === firstName) return true;
  const parts = pn.split(' ');
  return parts.length >= 2 && ct.includes(parts[0]) && ct.includes(parts[1]);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function isOwnName(name: string, fullName: string): boolean {
  if (!fullName || !name) return false;
  const nameLower = name.toLowerCase();
  const firstNameLower = fullName.split(' ')[0].toLowerCase();
  if (firstNameLower.length <= 2) return false;
  return nameLower.includes(firstNameLower);
}

export function usePeople() {
  const { emails, sentEmails, loading: emailsLoading } = useEmails();
  const { events, loading: calLoading } = useCalendar();
  const { tasks, loading: tasksLoading } = useTasks();
  const { chats, loading: chatsLoading } = useChats();
  const { slack } = useLiveData();
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name ?? "";
  const userEmail = user?.email?.toLowerCase() ?? "";

  const loading = emailsLoading || calLoading || tasksLoading || chatsLoading;
  const [now] = useState(() => Date.now());

  const people: Person[] = useMemo(() => {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const map = new Map<string, {
      name: string;
      email: string;
      items: TouchpointItem[];
      maxUrgency: number;
      lastContactMs: number;
      teamsChatId?: string;
    }>();

    function upsert(
      name: string,
      email: string,
      item: TouchpointItem,
      urgencyLevel: number,
      contactMs = 0,
      chatId?: string
    ) {
      const key = name.toLowerCase().trim();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { name, email, items: [], maxUrgency: 0, lastContactMs: 0 });
      }
      const p = map.get(key)!;
      p.items.push(item);
      if (urgencyLevel > p.maxUrgency) p.maxUrgency = urgencyLevel;
      if (contactMs > p.lastContactMs) p.lastContactMs = contactMs;
      if (chatId && !p.teamsChatId) p.teamsChatId = chatId;
      if (email && !p.email) p.email = email;
    }

    // ── Received Emails ──────────────────────────────────────────────
    for (const email of emails) {
      const rawName = email.from_name || email.from_email || '';
      const name = normalizeName(rawName);
      const addr = email.from_email || '';
      if (!name || shouldExclude(name, addr)) continue;
      if (isOwnName(name, fullName)) continue;
      if (userEmail && addr.toLowerCase() === userEmail) continue;

      const daysAgo = Math.floor((now - new Date(email.received_at).getTime()) / 86400000);
      const urgencyLevel = daysAgo < 1 ? 2 : daysAgo < 7 ? 1 : 0;

      upsert(name, addr, {
        ch: 'email',
        text: email.subject,
        url: email.outlook_url || '#',
        draft: '',
        timestamp: email.received_at,
        preview: email.preview?.slice(0, 80),
      }, urgencyLevel, new Date(email.received_at).getTime());
    }

    // ── Sent Emails ──────────────────────────────────────────────────
    for (const email of sentEmails) {
      const rawName = email.to_name || email.to_email || '';
      const name = normalizeName(rawName);
      const addr = email.to_email || '';
      if (!name || shouldExclude(name, addr)) continue;
      if (isOwnName(name, fullName)) continue;
      if (userEmail && addr.toLowerCase() === userEmail) continue;

      const sentMs = new Date(email.received_at).getTime();
      if (sentMs < sevenDaysAgo) continue;

      const daysAgo = Math.floor((now - sentMs) / 86400000);
      const urgencyLevel = daysAgo < 1 ? 1 : 0;

      upsert(name, addr, {
        ch: 'email',
        text: `↗ ${email.subject}`,
        url: email.outlook_url || '#',
        draft: '',
        timestamp: email.received_at,
        preview: email.preview?.slice(0, 80),
      }, urgencyLevel, sentMs);
    }

    // ── Teams DMs — one touchpoint per conversation thread ──────────
    for (const chat of chats) {
      const topic = chat.topic || '';

      const isGroupKeyword = /taskforce|committee|weekly|sync|standup|all-hands|project|team\b|general|a360/i.test(topic);
      if (isGroupKeyword) continue;

      const chatMessages = chat.messages || [];
      const webUrl = chat.web_url || '';

      if (chatMessages.length > 0) {
        // Filter to relevant messages (not from self, within 7 days)
        const relevant = chatMessages.filter(msg => {
          if (isOwnName(msg.from, fullName)) return false;
          const msgMs = new Date(msg.timestamp).getTime();
          if (msgMs < sevenDaysAgo) return false;
          const personName = msg.from || topic;
          if (!personName || personName === 'Teams Chat') return false;
          return true;
        });

        if (relevant.length === 0) continue;

        // Use the latest message as the representative for this thread
        const sorted = [...relevant].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const latest = sorted[0];
        const personName = latest.from || topic;
        const latestMs = new Date(latest.timestamp).getTime();
        const msgCount = sorted.length;

        const daysAgo = Math.floor((now - latestMs) / 86400000);
        const urgencyLevel = daysAgo < 1 ? 2 : 1;

        const prefix = msgCount > 1 ? `Teams (${msgCount}): ` : 'Teams: ';
        const previewText = latest.text ? latest.text.slice(0, 60) : `DM with ${personName}`;

        upsert(personName, '', {
          ch: 'teams',
          text: `${prefix}${previewText}`,
          url: webUrl,
          draft: '',
          timestamp: latest.timestamp,
          preview: latest.text,
        }, urgencyLevel, latestMs, chat.id);
      } else {
        // Fallback: use last_message_preview if no individual messages
        const preview = stripHtml(chat.last_message_preview || '');

        let matchedKey: string | null = null;
        for (const [key] of map) {
          if (chatMatchesPerson(topic, key)) {
            matchedKey = key;
            break;
          }
        }

        const item: TouchpointItem = {
          ch: 'teams',
          text: preview ? `Teams: ${preview.slice(0, 60)}` : `Teams DM: ${topic}`,
          url: webUrl,
          draft: '',
          preview,
        };

        if (matchedKey) {
          const p = map.get(matchedKey)!;
          p.items.unshift(item);
          p.maxUrgency = Math.max(p.maxUrgency, 2);
          if (!p.teamsChatId) p.teamsChatId = chat.id;
        } else if (topic && topic !== 'Teams Chat') {
          upsert(topic, '', item, 2, now - 3600000, chat.id);
        }
      }
    }

    // ── Calendar: meetings from past 7 days + next 7 days ────────────
    const sevenDaysOut = now + 7 * 24 * 60 * 60 * 1000;
    for (const event of events) {
      const startMs = new Date(event.start_time).getTime();
      if (startMs > sevenDaysOut || startMs < sevenDaysAgo) continue;
      const organizer = normalizeName(event.organizer || '');
      if (!organizer) continue;
      if (shouldExclude(organizer, '')) continue;
      if (isOwnName(organizer, fullName)) continue;

      const isPast = startMs < now;
      const urgencyLevel = isPast ? 0 : 1;

      upsert(organizer, '', {
        ch: 'meeting',
        text: event.subject,
        url: event.join_url || event.outlook_url || '#',
        draft: '',
        timestamp: event.start_time,
      }, urgencyLevel, startMs);
    }

    // ── Slack messages ───────────────────────────────────────────────
    for (const msg of slack) {
      const name = msg.author_name || '';
      if (!name || shouldExclude(name, '')) continue;
      if (isOwnName(name, fullName)) continue;

      const msgMs = new Date(msg.timestamp).getTime();
      if (msgMs < sevenDaysAgo) continue;

      const daysAgo = Math.floor((now - msgMs) / 86400000);
      const urgencyLevel = daysAgo < 1 ? 1 : 0;

      upsert(name, '', {
        ch: 'slack',
        text: `#${msg.channel_name}: ${(msg.text || '').slice(0, 60)}`,
        url: msg.permalink || '#',
        draft: '',
        timestamp: msg.timestamp,
        preview: msg.text?.slice(0, 80),
      }, urgencyLevel, msgMs);
    }

    // ── Asana tasks ────────────────────────────────────────────────
    for (const task of tasks) {
      const people: { name: string; email: string }[] = [];

      if (task.assignee_name) {
        people.push({ name: normalizeName(task.assignee_name), email: task.assignee_email || '' });
      }
      if (task.created_by_name) {
        people.push({ name: normalizeName(task.created_by_name), email: task.created_by_email || '' });
      }
      for (let ci = 0; ci < (task.collaborator_names?.length || 0); ci++) {
        const cn = task.collaborator_names![ci];
        people.push({ name: normalizeName(cn), email: task.collaborator_emails?.[ci] || '' });
      }

      const taskMs = task.modified_at ? new Date(task.modified_at).getTime()
        : task.due_on ? new Date(task.due_on).getTime() : 0;
      if (taskMs > 0 && taskMs < sevenDaysAgo) continue;

      for (const person of people) {
        if (!person.name || shouldExclude(person.name, person.email)) continue;
        if (isOwnName(person.name, fullName)) continue;

        const daysAgo = taskMs > 0 ? Math.floor((now - taskMs) / 86400000) : 7;
        const urgencyLevel = task.days_overdue > 0 ? 2 : daysAgo < 1 ? 1 : 0;

        upsert(person.name, person.email, {
          ch: 'asana',
          text: task.name,
          url: task.permalink_url || '#',
          draft: '',
          timestamp: task.modified_at || task.due_on || undefined,
          preview: task.project_name ? `${task.project_name}${task.due_on ? ` · due ${task.due_on}` : ''}` : undefined,
        }, urgencyLevel, taskMs, undefined);
      }
    }

    // ── Build result ────────────────────────────────────────────────
    const urgencyMap: Record<number, 'red' | 'amber' | 'teal' | 'gray'> = {
      3: 'red', 2: 'amber', 1: 'teal', 0: 'gray',
    };

    const result: Person[] = [];
    for (const [, p] of map) {
      if (p.items.length === 0) continue;
      if (isOwnName(p.name, fullName)) continue;
      if (userEmail && p.email && p.email.toLowerCase() === userEmail) continue;

      // Sort items chronologically (newest first)
      p.items.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      const emailCount = p.items.filter(i => i.ch === 'email').length;
      const teamsCount = p.items.filter(i => i.ch === 'teams').length;
      const meetingCount = p.items.filter(i => i.ch === 'meeting').length;
      const asanaCount = p.items.filter(i => i.ch === 'asana').length;
      const slackCount = p.items.filter(i => i.ch === 'slack').length;

      const parts: string[] = [];
      if (teamsCount > 0) parts.push(`${teamsCount} Teams DM${teamsCount > 1 ? 's' : ''}`);
      if (emailCount > 0) parts.push(`${emailCount} email${emailCount > 1 ? 's' : ''}`);
      if (meetingCount > 0) parts.push(`${meetingCount} meeting${meetingCount > 1 ? 's' : ''}`);
      if (slackCount > 0) parts.push(`${slackCount} Slack msg${slackCount > 1 ? 's' : ''}`);
      if (asanaCount > 0) parts.push(`${asanaCount} task${asanaCount > 1 ? 's' : ''}`);

      // Format last contact
      const diffMs = now - p.lastContactMs;
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      const lastContact = diffHrs < 1 ? 'just now'
        : diffHrs < 24 ? `${diffHrs}h ago`
        : diffDays === 1 ? 'yesterday'
        : diffDays < 7 ? `${diffDays}d ago`
        : '';

      result.push({
        name: p.name,
        email: p.email,
        urgency: urgencyMap[p.maxUrgency],
        touchpoints: p.items.length,
        items: p.items.slice(0, 15),
        action: parts.join(' · ') || 'Review',
        lastContact,
        teamsChatId: p.teamsChatId,
      });
    }

    const urgencyOrder = { red: 0, amber: 1, teal: 2, gray: 3 };
    result.sort((a, b) => {
      const ud = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (ud !== 0) return ud;
      return b.touchpoints - a.touchpoints;
    });

    return result;
  }, [emails, sentEmails, events, chats, slack, tasks, fullName, userEmail, now]);

  return { people, loading };
}
