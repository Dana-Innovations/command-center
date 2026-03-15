import type { TabId } from "@/components/layout/TabBar";
import type { ConnectionStatus } from "@/lib/live-data-context";

interface TabRequirement {
  id: TabId;
  /** Which connections this tab needs. Empty = always visible. */
  connections: (keyof ConnectionStatus)[];
  /** If true, ALL listed connections required. If false, ANY suffices. */
  requireAll: boolean;
}

const TAB_REQUIREMENTS: TabRequirement[] = [
  { id: "digest",     connections: [],                                       requireAll: false },
  { id: "priority",   connections: ["m365", "asana", "slack"],               requireAll: false },
  { id: "sales",      connections: ["salesforce"],                           requireAll: true  },
  { id: "metrics",    connections: ["powerbi"],                              requireAll: true  },
  { id: "people",     connections: ["m365", "salesforce", "asana", "slack"], requireAll: false },
  { id: "calendar",   connections: ["m365"],                                 requireAll: true  },
  { id: "prep",       connections: ["m365"],                                 requireAll: true  },
  { id: "signals",    connections: ["m365", "slack"],                        requireAll: false },
  { id: "minden",     connections: ["monday"],                               requireAll: true  },
  { id: "delegation", connections: ["asana"],                                requireAll: true  },
];

/** All tab IDs in display order. */
export const ALL_TAB_IDS: TabId[] = TAB_REQUIREMENTS.map((t) => t.id);

/**
 * Returns the list of tabs the user should see based on their connections.
 * During initial load (before first fetch), returns all tabs to prevent flash.
 */
export function getVisibleTabs(
  connections: ConnectionStatus,
  hasFetched: boolean
): TabId[] {
  if (!hasFetched) return ALL_TAB_IDS;

  return TAB_REQUIREMENTS.filter((tab) => {
    if (tab.connections.length === 0) return true;
    if (tab.requireAll) {
      return tab.connections.every((svc) => connections[svc]);
    }
    return tab.connections.some((svc) => connections[svc]);
  }).map((tab) => tab.id);
}
