"use client";

import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import type { CalendarSubView } from "@/lib/tab-config";
import { CalendarView } from "@/components/views/CalendarView";
import { MeetingPrepView } from "@/components/views/MeetingPrepView";
import { InlineConnectBanner } from "@/components/ui/InlineConnectBanner";
import { SurfaceIntro, SurfaceSubnav } from "@/components/views/SurfaceChrome";

interface CalendarHubViewProps {
  activeSubView: CalendarSubView;
  initialEventId?: string;
  onOpenCalendarPrep?: (eventId?: string) => void;
  onOpenSetup?: () => void;
  onSubViewChange: (subView: CalendarSubView) => void;
}

export function CalendarHubView({
  activeSubView,
  initialEventId,
  onOpenCalendarPrep,
  onOpenSetup,
  onSubViewChange,
}: CalendarHubViewProps) {
  const connections = useConnections();

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

      {!connections.m365 && (
        <InlineConnectBanner service="Microsoft 365" onConnect={onOpenSetup} />
      )}

      {activeSubView === "prep" ? (
        <MeetingPrepView initialEventId={initialEventId} />
      ) : (
        <CalendarView onPrepMeeting={onOpenCalendarPrep ? (id: string) => onOpenCalendarPrep(id) : undefined} />
      )}
    </div>
  );
}
