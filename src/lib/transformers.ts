import type { CalendarEvent, Task, Email, SlackFeedMessage } from './types';

// ---------- Shared helpers ----------

function toPST(iso: string): Date {
  return new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

function decimalHour(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

function formatTime12(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}:00 ${period}` : `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatTimeRange(startISO: string, endISO: string): string {
  const s = toPST(startISO);
  const e = toPST(endISO);
  return `${formatTime12(s)} \u2013 ${formatTime12(e)}`;
}

function formatDueDate(dueDateStr: string): string {
  if (!dueDateStr) return '';
  const d = new Date(dueDateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------- Slack ----------

export interface SlackItem {
  title: string;
  meta: string;
  url: string;
  jeanaTitle: string;
  jeanaContext: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function transformSlackItems(messages: SlackFeedMessage[]): SlackItem[] {
  return messages.slice(0, 10).map((m) => {
    const preview = m.text ? (m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text) : '';
    const threadInfo = m.thread_reply_count > 0 ? ` · ${m.thread_reply_count} replies` : '';
    return {
      title: `${m.author_name}: ${preview}`,
      meta: `${timeAgo(m.timestamp)}${threadInfo}`,
      url: m.permalink || '',
      jeanaTitle: `Reply to ${m.author_name} on Slack`,
      jeanaContext: preview,
    };
  });
}

// ---------- CalendarTimeline ----------

export interface CalEvent {
  time: string;
  title: string;
  meta: string;
  type: 'normal' | 'highlight';
  dotColor?: 'amber' | 'teal';
  startH: number;
  endH: number;
  url: string;
  overlay?: {
    time: string;
    title: string;
    meta: string;
    dotColor: 'teal';
    url: string;
  };
}

export function transformCalendarEvents(events: CalendarEvent[]): CalEvent[] {
  if (!events.length) return [];

  // Sort by start_time
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Find the longest event (highlight candidate)
  let longestIdx = 0;
  let longestDuration = 0;
  sorted.forEach((ev, i) => {
    const dur = new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime();
    if (dur > longestDuration) {
      longestDuration = dur;
      longestIdx = i;
    }
  });

  const result: CalEvent[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;

    const ev = sorted[i];
    const startPST = toPST(ev.start_time);
    const endPST = toPST(ev.end_time);
    const startDec = decimalHour(startPST);
    const endDec = decimalHour(endPST);
    const isLongest = i === longestIdx;

    const calEvent: CalEvent = {
      time: formatTimeRange(ev.start_time, ev.end_time),
      title: ev.subject,
      meta: (typeof ev.location === 'string' ? ev.location : '') || (typeof ev.organizer === 'string' ? ev.organizer : '') || '',
      type: isLongest ? 'highlight' : 'normal',
      dotColor: isLongest ? 'amber' : undefined,
      startH: startDec,
      endH: endDec,
      url: ev.outlook_url || '',
    };

    // Check for overlapping events to nest as overlay
    for (let j = i + 1; j < sorted.length; j++) {
      if (usedIndices.has(j)) continue;
      const other = sorted[j];
      const otherStart = new Date(other.start_time).getTime();
      const evEnd = new Date(ev.end_time).getTime();
      const evStart = new Date(ev.start_time).getTime();

      if (otherStart >= evStart && otherStart < evEnd) {
        // This event overlaps — nest as overlay
        const otherPST = toPST(other.start_time);
        calEvent.overlay = {
          time: formatTime12(otherPST),
          title: other.subject,
          meta: other.location || other.organizer || '',
          dotColor: 'teal',
          url: other.outlook_url || '',
        };
        usedIndices.add(j);
        break; // Only one overlay per event
      }
    }

    result.push(calEvent);
  }

  return result;
}

// ---------- MeetingDebrief ----------

export interface DebriefMeeting {
  name: string;
  time: string;
  startH: number;
  endH: number;
  url: string;
}

export function transformDebriefMeetings(events: CalendarEvent[]): DebriefMeeting[] {
  if (!events.length) return [];

  return [...events]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((ev) => {
      const startPST = toPST(ev.start_time);
      const endPST = toPST(ev.end_time);
      return {
        name: ev.subject,
        time: formatTimeRange(ev.start_time, ev.end_time),
        startH: decimalHour(startPST),
        endH: decimalHour(endPST),
        url: ev.outlook_url || '',
      };
    });
}

// ---------- MeetingPrep ----------

export interface MeetingPrepItem {
  time: string;
  name: string;
  oneLiner: string;
  details: string[];
  url: string;
}

export function transformMeetingPrep(events: CalendarEvent[]): MeetingPrepItem[] {
  if (!events.length) return [];

  return [...events]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((ev) => ({
      time: formatTimeRange(ev.start_time, ev.end_time),
      name: ev.subject,
      oneLiner: ev.location && typeof ev.location === 'string'
        ? ev.location
        : ev.is_online
        ? 'Online meeting'
        : ev.organizer && typeof ev.organizer === 'string'
        ? `Organized by ${ev.organizer}`
        : '',
      details: [],
      url: ev.outlook_url || '',
    }));
}

// ---------- OverdueTasks ----------

export interface OverdueItem {
  id: string;
  name: string;
  daysOverdue: number;
  dueDate: string;
  url: string;
}

export function transformOverdueTasks(tasks: Task[]): {
  overdue: OverdueItem[];
  stale: OverdueItem[];
} {
  const overdueItems: OverdueItem[] = [];
  const staleItems: OverdueItem[] = [];

  for (const task of tasks) {
    if (task.days_overdue <= 0) continue;

    const item: OverdueItem = {
      id: task.task_gid || task.id,
      name: task.name,
      daysOverdue: task.days_overdue,
      dueDate: formatDueDate(task.due_on),
      url: task.permalink_url || '',
    };

    if (task.days_overdue > 30) {
      staleItems.push(item);
    } else {
      overdueItems.push(item);
    }
  }

  // Sort by most overdue first
  overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
  staleItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { overdue: overdueItems, stale: staleItems };
}

// ---------- JeanaSection ----------

export interface JeanaItem {
  title: string;
  context: string;
  url: string;
}

export function transformJeanaItems(tasks: Task[]): JeanaItem[] {
  // Filter for delegatable tasks: incomplete, not high priority
  return tasks
    .filter((t) => !t.completed && t.priority !== 'high' && t.priority !== 'urgent')
    .slice(0, 10)
    .map((t) => ({
      title: t.name,
      context: t.notes ? t.notes.slice(0, 120) : `Checking in on ${t.name}`,
      url: t.permalink_url || '',
    }));
}

// ---------- EmailHygiene ----------

export interface EmailSender {
  id: string;
  name: string;
  email: string;
  group: 'spam' | 'newsletter' | 'marketing';
}

const NEWSLETTER_DOMAINS = new Set([
  'substack.com', 'morningbrew.com', 'thehustle.co', 'tldrnewsletter.com',
  'stratechery.com', 'ben-evans.com', 'firstround.com', 'arstechnica.com',
  'theinformation.com', 'axios.com', 'protocol.com',
]);

const MARKETING_DOMAINS = new Set([
  'amazon.com', 'bestbuy.com', 'costco.com', 'nordstrom.com', 'rei.com',
  'delta.com', 'united.com', 'marriott-email.com', 'apple.com',
  'williams-sonoma.com',
]);

const SPAM_KEYWORDS = ['noreply', 'no-reply', 'notifications', 'alerts', 'digest',
  'updates', 'info@', 'news@', 'team@', 'concierge@'];

function classifyEmailGroup(email: string): 'spam' | 'newsletter' | 'marketing' {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  const localPart = email.split('@')[0]?.toLowerCase() || '';

  if (NEWSLETTER_DOMAINS.has(domain)) return 'newsletter';
  if (MARKETING_DOMAINS.has(domain)) return 'marketing';
  if (SPAM_KEYWORDS.some((kw) => localPart.includes(kw) || email.toLowerCase().includes(kw))) return 'spam';

  return 'spam'; // Default non-person senders to spam
}

export function transformEmailSenders(emails: Email[]): EmailSender[] {
  // Group by from_email, only include automated/non-person senders
  const senderMap = new Map<string, { name: string; count: number }>();

  for (const email of emails) {
    if (!email.from_email) continue;
    const existing = senderMap.get(email.from_email);
    if (existing) {
      existing.count++;
    } else {
      senderMap.set(email.from_email, { name: email.from_name, count: 1 });
    }
  }

  // Only include senders with 2+ emails (automated/recurring) or matching known patterns
  const result: EmailSender[] = [];
  for (const [emailAddr, { name, count }] of senderMap) {
    const group = classifyEmailGroup(emailAddr);
    // Include if 2+ emails or matches a known pattern
    if (count >= 2 || NEWSLETTER_DOMAINS.has(emailAddr.split('@')[1] || '') || MARKETING_DOMAINS.has(emailAddr.split('@')[1] || '')) {
      result.push({
        id: `eh-${emailAddr}`,
        name: name || emailAddr,
        email: emailAddr,
        group,
      });
    }
  }

  return result;
}
