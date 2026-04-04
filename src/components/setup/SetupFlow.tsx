"use client";

import { useCallback, useState } from "react";
import { useSetupFlow } from "@/hooks/useSetupFlow";
import { SetupServiceRow } from "@/components/setup/SetupServiceRow";
import { SetupContinueBar } from "@/components/setup/SetupContinueBar";
import { M365ConfigPanel } from "@/components/setup/M365ConfigPanel";
import { SlackConfigPanel } from "@/components/setup/SlackConfigPanel";
import { AsanaConfigPanel } from "@/components/setup/AsanaConfigPanel";
import { GenericConfigPanel } from "@/components/setup/GenericConfigPanel";
import type { ServiceId } from "@/lib/setup-flow";

interface SetupFlowProps {
  onComplete: () => void;
}

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <svg
        className="h-8 w-8 animate-spin text-text-muted"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx={12}
          cy={12}
          r={10}
          stroke="currentColor"
          strokeWidth={3}
          strokeDasharray="60 30"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function SetupFlow({ onComplete }: SetupFlowProps) {
  const {
    services,
    expandedService,
    connectedCount,
    totalCount,
    loading,
    connectService,
    saveServiceConfig,
    expandService,
    completeSetup,
  } = useSetupFlow();

  const [completing, setCompleting] = useState(false);

  const coreServices = services.filter((s) => s.definition.tier === "core");
  const optionalServices = services.filter(
    (s) => s.definition.tier === "optional"
  );

  const handleContinue = useCallback(async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await completeSetup();
      onComplete();
    } catch {
      // Allow retry on failure
      setCompleting(false);
    }
  }, [completeSetup, onComplete, completing]);

  const handleConnect = useCallback(
    (id: ServiceId) => {
      void connectService(id);
    },
    [connectService]
  );

  const handleSaveConfig = useCallback(
    (id: ServiceId) => async (config: Record<string, unknown>) => {
      await saveServiceConfig(id, config);
    },
    [saveServiceConfig]
  );

  const handleSkipConfig = useCallback(
    (id: ServiceId) => () => {
      void saveServiceConfig(id, {});
    },
    [saveServiceConfig]
  );

  function renderConfigPanel(id: ServiceId) {
    switch (id) {
      case "m365":
        return (
          <M365ConfigPanel
            onSave={handleSaveConfig(id)}
            onSkip={handleSkipConfig(id)}
          />
        );
      case "slack":
        return (
          <SlackConfigPanel
            onSave={handleSaveConfig(id)}
            onSkip={handleSkipConfig(id)}
          />
        );
      case "asana":
        return (
          <AsanaConfigPanel
            onSave={handleSaveConfig(id)}
            onSkip={handleSkipConfig(id)}
          />
        );
      case "powerbi":
        return (
          <GenericConfigPanel
            serviceId={id}
            title="Power BI"
            onSave={handleSaveConfig(id)}
            onSkip={handleSkipConfig(id)}
          />
        );
      case "monday":
        return (
          <GenericConfigPanel
            serviceId={id}
            title="Monday.com"
            onSave={handleSaveConfig(id)}
            onSkip={handleSkipConfig(id)}
          />
        );
      default:
        return null;
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-text-heading">
            Set up your workspace
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Connect your tools and choose what matters.
          </p>
        </div>

        {/* Core services */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            Core
          </h2>
          <div className="flex flex-col gap-3">
            {coreServices.map((entry) => (
              <SetupServiceRow
                key={entry.definition.id}
                definition={entry.definition}
                state={entry.state}
                preference={entry.preference}
                expanded={expandedService === entry.definition.id}
                onConnect={() => handleConnect(entry.definition.id)}
                onExpand={() => expandService(entry.definition.id)}
                onCollapse={() => expandService(null)}
              >
                {renderConfigPanel(entry.definition.id)}
              </SetupServiceRow>
            ))}
          </div>
        </section>

        {/* Optional services */}
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">
            Optional
          </h2>
          <div className="flex flex-col gap-3">
            {optionalServices.map((entry) => (
              <SetupServiceRow
                key={entry.definition.id}
                definition={entry.definition}
                state={entry.state}
                preference={entry.preference}
                expanded={expandedService === entry.definition.id}
                onConnect={() => handleConnect(entry.definition.id)}
                onExpand={() => expandService(entry.definition.id)}
                onCollapse={() => expandService(null)}
              >
                {renderConfigPanel(entry.definition.id)}
              </SetupServiceRow>
            ))}
          </div>
        </section>
      </div>

      {/* Fixed bottom bar */}
      <SetupContinueBar
        connectedCount={connectedCount}
        totalCount={totalCount}
        onContinue={handleContinue}
      />
    </div>
  );
}
