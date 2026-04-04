"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { InlineConnectBanner } from "@/components/ui/InlineConnectBanner";
import { SurfaceIntro } from "@/components/views/SurfaceChrome";
import { UnifiedPeopleView } from "@/components/views/UnifiedPeopleView";

interface PeopleHubViewProps {
  onOpenSetup?: () => void;
}

export function PeopleHubView({
  onOpenSetup,
}: PeopleHubViewProps) {
  const connections = useConnections();

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="People"
        title="People"
        description="Keep relationships, recent touchpoints, and follow-up risk visible before you dive into pipeline or operations."
        actions={
          onOpenSetup ? (
            <Button variant="secondary" size="sm" onClick={onOpenSetup}>
              Personalize
            </Button>
          ) : undefined
        }
      />

      {!connections.m365 && (
        <InlineConnectBanner service="Microsoft 365" onConnect={onOpenSetup} />
      )}

      <UnifiedPeopleView />
    </div>
  );
}
