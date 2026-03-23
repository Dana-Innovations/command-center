import type { ConnectionStatus } from "@/lib/live-data-context";

export type TabId =
  | "home"
  | "communications"
  | "people"
  | "calendar"
  | "performance"
  | "operations";

export type HomeSubView = "overview" | "setup";
export type CommunicationsSubView = "replies" | "teams" | "slack" | "hygiene";
export type CalendarSubView = "schedule" | "prep";
export type PerformanceSubView = "sales" | "metrics";
export type OperationsSubView = "delegation" | "orders";
export type SetupFocusTab = "connections" | "focus" | "advanced";

export const ALL_TAB_IDS: TabId[] = [
  "home",
  "communications",
  "people",
  "calendar",
  "performance",
  "operations",
];

export type SurfaceAvailability =
  | { connected: true }
  | {
      connected: false;
      services: Array<keyof ConnectionStatus>;
    };

export function getSurfaceAvailability(
  tab: TabId,
  connections: ConnectionStatus
): SurfaceAvailability {
  switch (tab) {
    case "home":
      return { connected: true };
    case "communications":
      return connections.m365 || connections.slack || connections.asana
        ? { connected: true }
        : { connected: false, services: ["m365", "slack", "asana"] };
    case "people":
      return connections.m365 ||
        connections.salesforce ||
        connections.asana ||
        connections.slack
        ? { connected: true }
        : {
            connected: false,
            services: ["m365", "salesforce", "asana", "slack"],
          };
    case "calendar":
      return connections.m365
        ? { connected: true }
        : { connected: false, services: ["m365"] };
    case "performance":
      return connections.salesforce || connections.powerbi
        ? { connected: true }
        : { connected: false, services: ["salesforce", "powerbi"] };
    case "operations":
      return connections.asana || connections.monday
        ? { connected: true }
        : { connected: false, services: ["asana", "monday"] };
    default:
      return { connected: true };
  }
}

export function parseTabId(value: string | null | undefined): TabId {
  return ALL_TAB_IDS.includes(value as TabId) ? (value as TabId) : "home";
}

export function parseHomeSubView(
  value: string | null | undefined
): HomeSubView {
  return value === "setup" ? "setup" : "overview";
}

export function parseCommunicationsSubView(
  value: string | null | undefined
): CommunicationsSubView {
  if (value === "teams" || value === "slack" || value === "hygiene") return value;
  return "replies";
}

export function parseCalendarSubView(
  value: string | null | undefined
): CalendarSubView {
  return value === "prep" ? "prep" : "schedule";
}

export function parsePerformanceSubView(
  value: string | null | undefined
): PerformanceSubView {
  return value === "metrics" ? "metrics" : "sales";
}

export function parseOperationsSubView(
  value: string | null | undefined
): OperationsSubView {
  return value === "orders" ? "orders" : "delegation";
}

export function parseSetupFocusTab(
  value: string | null | undefined
): SetupFocusTab {
  if (value === "connections" || value === "advanced") {
    return value;
  }

  return "focus";
}
