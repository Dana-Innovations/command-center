export type ServiceId = 'm365' | 'slack' | 'asana' | 'salesforce' | 'powerbi' | 'monday';
export type ServiceTier = 'core' | 'optional';
export type ServiceRowState = 'disconnected' | 'connecting' | 'connected-configuring' | 'configured';

export interface ServiceDefinition {
  id: ServiceId;
  provider: string;           // OAuth provider name (e.g., 'microsoft' for m365)
  label: string;
  description: string;
  tier: ServiceTier;
  hasConfigStep: boolean;     // false for Salesforce
  configSteps: string[];      // e.g., ['folders', 'teams', 'chats'] for m365
}

export interface ServicePreference {
  id: string;
  cortex_user_id: string;
  service: string;
  config: Record<string, unknown>;
  configured_at: string | null;
  created_at: string;
  updated_at: string;
}

export const SETUP_SERVICES: ServiceDefinition[] = [
  { id: 'm365', provider: 'microsoft', label: 'Microsoft 365', description: 'Email, Calendar, Teams', tier: 'core', hasConfigStep: true, configSteps: ['folders', 'teams', 'chats'] },
  { id: 'slack', provider: 'slack', label: 'Slack', description: 'Channel Messages', tier: 'core', hasConfigStep: true, configSteps: ['channels'] },
  { id: 'asana', provider: 'asana', label: 'Asana', description: 'Tasks & Projects', tier: 'core', hasConfigStep: true, configSteps: ['projects'] },
  { id: 'salesforce', provider: 'salesforce', label: 'Salesforce', description: 'Pipeline & CRM', tier: 'optional', hasConfigStep: false, configSteps: [] },
  { id: 'powerbi', provider: 'powerbi', label: 'Power BI', description: 'Reports & Dashboards', tier: 'optional', hasConfigStep: true, configSteps: ['dashboards'] },
  { id: 'monday', provider: 'monday', label: 'Monday.com', description: 'Manufacturing', tier: 'optional', hasConfigStep: true, configSteps: ['boards'] },
];

// Map ServiceId to the connection key used by useConnections()
export const SERVICE_CONNECTION_MAP: Record<ServiceId, string> = {
  m365: 'm365',
  slack: 'slack',
  asana: 'asana',
  salesforce: 'salesforce',
  powerbi: 'powerbi',
  monday: 'monday',
};
