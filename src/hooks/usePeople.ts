'use client';

import { useMemo } from 'react';
import { useEmails } from './useEmails';
import { useCalendar } from './useCalendar';
import { useTasks } from './useTasks';
import { useChats } from './useChats';

interface TouchpointItem {
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
  // Exclude obvious notification/system addresses
  if (le.match(/^(no-?reply|noreply|notification|alert|auto|bounce|mailer|postmaster)/)) return true;
  return false;
}

// Extract first+last name from "First Last <email>" style or just name
function normalizeName(name: string): string {
  return name.replace(/<.*>/, '').replace(/\(.*\)/, '').trim();
}

// Check if a chat topic/name matches a person name
function chatMatchesPerson(chatTopic: string, personName: string): boolean {
  if (!chatTopic || !personName) return false;
  const ct = chatTopic.toLowerCase();
  const pn = personName.toLowerCase();
  // Direct match
  if (ct === pn) return true;
  // First name match in 1:1 chats
  const firstName = pn.split(' ')[0];
  if (firstName.length > 2 && ct === firstName) return true;
  // Person name appears in chat topic
  const parts = pn.split(' ');
  return parts.length >= 2 && ct.includes(parts[0]) && ct.includes(parts[1]);
}

// Strip HTML from Teams message previews
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

export function usePeople() {
  const { emails, loading: emailsLoading } = useEmails();
  const { events, loading: calLoading } = useCalendar();
  const { tasks, loading: tasksLoading } = useTasks();
  const { chats, loading: chatsLoading } = useChats();

  const loading = emailsLoading || calLoading || tasksLoading || chatsLoading;

  const people: Person[] = useMemo(() => {
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

    const now = Date.now();

    // ── Emails ────────────────────────────────────────────────────────
    for (const email of emails) {
      const rawName = email.from_name || email.from_email || '';
      const name = normalizeName(rawName);
      const addr = email.from_email || '';
      if (!name || shouldExclude(name, addr)) continue;

      const daysAgo = Math.floor((now - new Date(email.received_at).getTime()) / 86400000);
      // Recency-based urgency: amber if within 24h, teal if within 7d, gray otherwise
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

    // ── Teams DMs — match chat topic to person name ────────────────────
    for (const chat of chats) {
      const topic = chat.topic || '';
      const preview = stripHtml(chat.last_message_preview || '');

      // Only 1:1 and small group chats (not "Weekly", "Taskforce", etc.)
      const isGroupKeyword = /taskforce|committee|weekly|sync|standup|all-hands|project|team\b|general|a360/i.test(topic);
      if (isGroupKeyword) continue;

      // Try to find matching person already in map from emails/calendar
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
        url: '',
        draft: '',
        preview,
      };

      if (matchedKey) {
        // Add Teams DM to existing person
        const p = map.get(matchedKey)!;
        p.items.unshift(item); // Teams DM goes to top
        p.maxUrgency = Math.max(p.maxUrgency, 2); // amber — unread DM
        if (!p.teamsChatId) p.teamsChatId = chat.id;
      } else if (topic && topic !== 'Teams Chat') {
        // New person from Teams DM
        upsert(topic, '', item, 2, now - 3600000, chat.id);
      }
    }

    // ── Calendar: people you meet with today/tomorrow ──────────────────
    const twoDaysOut = now + 2 * 24 * 60 * 60 * 1000;
    for (const event of events) {
      const startMs = new Date(event.start_time).getTime();
      if (startMs > twoDaysOut || startMs < now - 3600000) continue;
      const organizer = normalizeName(event.organizer || '');
      if (!organizer) continue;
      if (shouldExclude(organizer, '')) continue;
      if (/ari|supran/i.test(organizer)) continue;

      upsert(organizer, '', {
        ch: 'meeting',
        text: event.subject,
        url: event.join_url || event.outlook_url || '#',
        draft: '',
        timestamp: event.start_time,
      }, 1, startMs);
    }

    // ── Asana tasks — skipped (assignee field is GID, not name) ─────

    // ── Build result ──────────────────────────────────────────────────
    const urgencyMap: Record<number, 'red' | 'amber' | 'teal' | 'gray'> = {
      3: 'red', 2: 'amber', 1: 'teal', 0: 'gray',
    };

    const result: Person[] = [];
    for (const [, p] of map) {
      if (p.items.length === 0) continue;

      const emailCount = p.items.filter(i => i.ch === 'email').length;
      const teamsCount = p.items.filter(i => i.ch === 'teams').length;
      const meetingCount = p.items.filter(i => i.ch === 'meeting').length;
      const asanaCount = p.items.filter(i => i.ch === 'asana').length;

      const parts: string[] = [];
      if (teamsCount > 0) parts.push(`${teamsCount} Teams DM${teamsCount > 1 ? 's' : ''}`);
      if (emailCount > 0) parts.push(`${emailCount} email${emailCount > 1 ? 's' : ''}`);
      if (meetingCount > 0) parts.push(`${meetingCount} meeting${meetingCount > 1 ? 's' : ''}`);
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
        items: p.items.slice(0, 6),
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
  }, [emails, events, tasks, chats]);

  return { people, loading };
}
