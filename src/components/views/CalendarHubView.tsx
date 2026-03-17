"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import { useAttention } from "@/lib/attention/client";
import type { CalendarSubView } from "@/lib/tab-config";
import { CalendarView } from "@/components/views/CalendarView";
import { MeetingPrepView } from "@/components/views/MeetingPrepView";
import { SurfaceConnectState } from "@/components/views/SurfaceConnectState";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface CalendarHubViewProps {
  activeSubView: CalendarSubView;
  initialEventId?: string;
  onConnectService: (provider: string) => Promise<void>;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: CalendarSubView) => void;
}

export function CalendarHubView({
  activeSubView,
  initialEventId,
  onConnectService,
  onOpenSetup,
  onSubViewChange,
}: CalendarHubViewProps) {
  const connections = useConnections();
  const { connectingService } = useAttention();

  return (
    <div className="space-y-5">
      <SurfaceIntro
        eyebrow="Calendar"
        title="Calendar"
        description="See the week at a glance, then switch into prep mode when a meeting needs context and talking points."
        actions={
          onOpenSetup ? (
            <Button variant="secondary" size="sm" onClick={onOpenSetup}>
              Personalize
            </Button>
          ) : undefined
        }
      />

      <SurfaceSubnav
        active={activeSubView}
        onChange={onSubViewChange}
        items={[
          { id: "schedule", label: "Schedule" },
          { id: "prep", label: "Prep" },
        ]}
      />

      {!connections.m365 ? (
        <SurfaceConnectState
          title="Connect Microsoft 365 for calendar context"
          description="Calendar and meeting prep depend on your live Microsoft 365 calendar. This is also the fastest way to make Home feel like a command center."
          services={["Microsoft 365"]}
          outcomes={[
            "Your real schedule for today and this week",
            "Meeting prep tied to upcoming calendar events",
            "Live calendar signals feeding the morning brief",
          ]}
          primaryActionLabel={
            connectingService === "microsoft"
              ? "Connecting Microsoft 365..."
              : "Connect Microsoft 365"
          }
          primaryActionDisabled={connectingService === "microsoft"}
          onPrimaryAction={() => void onConnectService("microsoft")}
          secondaryActionLabel={onOpenSetup ? "Personalize" : undefined}
          onSecondaryAction={onOpenSetup}
        />
      ) : activeSubView === "prep" ? (
        <MeetingPrepView initialEventId={initialEventId} />
      ) : (
        <CalendarView />
      )}
    </div>
  );
}
