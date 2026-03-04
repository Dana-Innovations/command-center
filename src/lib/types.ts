export interface Email {
  id: string;
  message_id: string;
  from_name: string;
  from_email: string;
  subject: string;
  preview: string;
  body_html: string;
  received_at: string;
  is_read: boolean;
  folder: string;
  has_attachments: boolean;
  outlook_url: string;
  needs_reply: boolean;
  days_overdue: number;
  synced_at: string;
}

export interface CalendarEvent {
  id: string;
  event_id: string;
  subject: string;
  location: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  organizer: string;
  is_online: boolean;
  join_url: string;
  outlook_url: string;
  synced_at: string;
}

export interface Task {
  id: string;
  task_gid: string;
  name: string;
  notes: string;
  due_on: string;
  completed: boolean;
  assignee: string;
  project_name: string;
  permalink_url: string;
  priority: string;
  days_overdue: number;
  synced_at: string;
}

export interface TeamsChannel {
  id: string;
  team_id: string;
  team_name: string;
  channel_id: string;
  channel_name: string;
  is_private: boolean;
}

export interface Chat {
  id: string;
  chat_id: string;
  topic: string;
  chat_type: string;
  last_message_preview: string;
  last_message_from: string;
  last_activity: string;
  members: string[];
  synced_at: string;
}

export interface ActionQueueItem {
  id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface SyncLog {
  id: string;
  data_type: string;
  items_synced: number;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export interface PriorityItem {
  title: string;
  sender?: string;
  source: 'email' | 'teams' | 'asana' | 'slack' | 'salesforce';
  url: string;
  daysOverdue: number;
  needsReply: boolean;
  urgent: boolean;
  requiresAction: boolean;
  multiplePeopleWaiting: boolean;
  hardDeadlineWithin7: boolean;
  financial: boolean;
  legal: boolean;
  basePriority: number;
  score?: number;
  displayScore?: number;
  energyBonus?: number;
}

export interface SalesforceOpportunity {
  id: string;
  sf_opportunity_id: string;
  name: string;
  account_name: string;
  owner_name: string;
  stage: string;
  amount: number;
  probability: number;
  close_date: string;
  days_to_close: number;
  is_closed: boolean;
  is_won: boolean;
  last_activity_date: string | null;
  next_step: string | null;
  territory?: string | null;
  sales_channel?: string | null;
  opp_type?: string | null;
  forecast_category?: string | null;
  record_type?: string | null;
  product_line?: string | null;
  age_in_days?: number | null;
  days_in_stage?: number | null;
  has_overdue_task?: boolean | null;
  push_count?: number | null;
  sf_url: string;
  synced_at: string;
}

export interface SalesforceReport {
  id: string;
  sf_report_id: string;
  name: string;
  description: string | null;
  report_type: string;
  last_run_date: string | null;
  summary_data: Record<string, unknown>;
  sf_url: string;
  synced_at: string;
}

export interface SlackFeedMessage {
  id: string;
  message_ts: string;
  author_name: string;
  author_id: string | null;
  text: string | null;
  timestamp: string;
  channel_name: string;
  reactions: { name: string; count: number }[];
  thread_reply_count: number;
  has_files: boolean;
  permalink: string | null;
  synced_at: string;
}

export interface PowerBIKPI {
  id: string;
  kpi_name: string;
  kpi_category: string;
  current_value: number | null;
  previous_value: number | null;
  target_value: number | null;
  unit: string;
  period: string;
  dataset_id: string;
  dax_query: string | null;
  raw_result: Record<string, unknown> | null;
  synced_at: string;
}

export interface PowerBIReportConfig {
  id: string;
  report_id: string;
  report_name: string;
  workspace_id: string;
  embed_url: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EnergySlot {
  id: 'pre' | 'during' | 'post' | 'evening';
  label: string;
  boost: (item: PriorityItem) => number;
}

export interface TonePreset {
  id: string;
  label: string;
  generate: (context: string) => string;
}
