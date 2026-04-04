"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import {
  SETUP_SERVICES,
  SERVICE_CONNECTION_MAP,
  type ServiceId,
  type ServiceDefinition,
  type ServicePreference,
  type ServiceRowState,
} from "@/lib/setup-flow";

interface ServiceEntry {
  definition: ServiceDefinition;
  state: ServiceRowState;
  preference: ServicePreference | null;
}

export interface UseSetupFlowReturn {
  services: ServiceEntry[];
  expandedService: ServiceId | null;
  connectedCount: number;
  totalCount: number; // always 6
  loading: boolean;

  connectService: (id: ServiceId) => Promise<void>;
  saveServiceConfig: (id: ServiceId, config: Record<string, unknown>) => Promise<void>;
  expandService: (id: ServiceId | null) => void;
  completeSetup: () => Promise<void>;
}

function computeRowState(
  definition: ServiceDefinition,
  isConnected: boolean,
  connectingService: string | null,
  preference: ServicePreference | null
): ServiceRowState {
  // Currently connecting via OAuth popup
  if (connectingService === definition.provider) {
    return "connecting";
  }

  // Not connected at all
  if (!isConnected) {
    return "disconnected";
  }

  // Connected — if no config step needed, auto-configured
  if (!definition.hasConfigStep) {
    return "configured";
  }

  // Connected + has a configured_at timestamp → fully configured
  if (preference?.configured_at) {
    return "configured";
  }

  // Connected but not yet configured
  return "connected-configuring";
}

export function useSetupFlow(): UseSetupFlowReturn {
  const connections = useConnections();
  const {
    connectService: attentionConnectService,
    connectingService,
    completeOnboarding,
    refreshFocusMap,
  } = useAttention();

  const [preferences, setPreferences] = useState<ServicePreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedService, setExpandedService] = useState<ServiceId | null>(null);

  // Fetch saved preferences on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchPreferences() {
      try {
        const res = await fetch("/api/setup/preferences");
        if (!res.ok) {
          // If 404 or error, just use empty preferences
          setPreferences([]);
          return;
        }
        const data = (await res.json()) as { preferences: ServicePreference[] };
        if (!cancelled) {
          setPreferences(data.preferences ?? []);
        }
      } catch {
        if (!cancelled) {
          setPreferences([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchPreferences();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the service entries with computed state
  const services = useMemo<ServiceEntry[]>(() => {
    return SETUP_SERVICES.map((definition) => {
      const connectionKey = SERVICE_CONNECTION_MAP[definition.id] as keyof typeof connections;
      const isConnected = Boolean(connections[connectionKey]);
      const preference =
        preferences.find((p) => p.service === definition.id) ?? null;

      const state = computeRowState(
        definition,
        isConnected,
        connectingService,
        preference
      );

      return { definition, state, preference };
    });
  }, [connections, connectingService, preferences]);

  const connectedCount = useMemo(
    () => services.filter((s) => s.state === "configured" || s.state === "connected-configuring").length,
    [services]
  );

  const totalCount = SETUP_SERVICES.length;

  const connectService = useCallback(
    async (id: ServiceId) => {
      const definition = SETUP_SERVICES.find((s) => s.id === id);
      if (!definition) return;

      const success = await attentionConnectService(definition.provider);

      if (success && definition.hasConfigStep) {
        setExpandedService(id);
      }
    },
    [attentionConnectService]
  );

  const saveServiceConfig = useCallback(
    async (id: ServiceId, config: Record<string, unknown>) => {
      const res = await fetch("/api/setup/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: id, config }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save service config");
      }

      const data = (await res.json()) as { preference: ServicePreference };

      // Update local state with the saved preference
      setPreferences((prev) => {
        const idx = prev.findIndex((p) => p.service === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.preference;
          return next;
        }
        return [...prev, data.preference];
      });

      setExpandedService(null);

      // Refresh the focus map so the attention system picks up new config
      await refreshFocusMap();
    },
    [refreshFocusMap]
  );

  const expandService = useCallback((id: ServiceId | null) => {
    setExpandedService(id);
  }, []);

  const completeSetup = useCallback(async () => {
    await completeOnboarding();
  }, [completeOnboarding]);

  return {
    services,
    expandedService,
    connectedCount,
    totalCount,
    loading,
    connectService,
    saveServiceConfig,
    expandService,
    completeSetup,
  };
}
