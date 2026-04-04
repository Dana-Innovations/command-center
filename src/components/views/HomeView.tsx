"use client";

import { useCallback } from "react";
import { MorningBrief } from "@/components/command-center/MorningBrief";
import { AttentionHero } from "@/components/home/AttentionHero";
import { QuickActions } from "@/components/home/QuickActions";
import { SmartAgenda } from "@/components/home/SmartAgenda";
import { HomeCommunications } from "@/components/home/HomeCommunications";
import { HomeCalendar } from "@/components/home/HomeCalendar";
import { HomeTasks } from "@/components/home/HomeTasks";
import { HomePeople } from "@/components/home/HomePeople";
import { HomeWatchlist } from "@/components/home/HomeWatchlist";
import { useHomeData, type QuickAction } from "@/components/home/useHomeData";
import {
  OnboardingHighlight,
  ONBOARDING_HIGHLIGHTS,
  useOnboardingHighlights,
} from "@/components/home/OnboardingHighlights";
import type { SetupFocusTab, TabId } from "@/lib/tab-config";

interface HomeViewProps {
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
  onOpenSetup: (tab?: SetupFocusTab) => void;
  recentlyConnectedProvider?: string | null;
  isSyncingLiveData?: boolean;
}

export function HomeView({
  onNavigate,
  onOpenCalendarPrep,
  onOpenSetup,
  recentlyConnectedProvider = null,
  isSyncingLiveData = false,
}: HomeViewProps) {
  const data = useHomeData();
  const highlights = useOnboardingHighlights();

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      switch (action.handler) {
        case "navigate":
          onNavigate(action.payload as TabId);
          break;
        case "external":
          window.open(action.payload, "_blank", "noopener,noreferrer");
          break;
        case "calendarPrep":
          onOpenCalendarPrep(action.payload);
          break;
        case "setup":
          onOpenSetup(action.payload as SetupFocusTab);
          break;
      }
    },
    [onNavigate, onOpenCalendarPrep, onOpenSetup]
  );

  return (
    <div className="space-y-4">
      {/* 1. Attention Hero — top 1-3 urgent items */}
      <div className="relative">
        <OnboardingHighlight
          id="attention-hero"
          label={ONBOARDING_HIGHLIGHTS[0].label}
          dismissed={highlights.dismissed.has("attention-hero")}
          onDismiss={() => highlights.dismiss("attention-hero")}
        />
        <AttentionHero items={data.heroItems} onAction={handleQuickAction} />
      </div>

      {/* 2. Quick action buttons */}
      <div className="relative">
        <OnboardingHighlight
          id="quick-actions"
          label={ONBOARDING_HIGHLIGHTS[2].label}
          dismissed={highlights.dismissed.has("quick-actions")}
          onDismiss={() => highlights.dismiss("quick-actions")}
        />
        <QuickActions actions={data.quickActions} onAction={handleQuickAction} />
      </div>

      {/* 2.5. Smart Daily Agenda — next 4 hours time-blocked */}
      <SmartAgenda
        onNavigate={onNavigate}
        onOpenCalendarPrep={onOpenCalendarPrep}
        animDelay={100}
      />

      {/* 3. Morning Brief (collapsed by default) */}
      <div className="relative">
        <OnboardingHighlight
          id="morning-brief"
          label={ONBOARDING_HIGHLIGHTS[1].label}
          dismissed={highlights.dismissed.has("morning-brief")}
          onDismiss={() => highlights.dismiss("morning-brief")}
        />
        <MorningBrief
          onOpenCalendarPrep={onOpenCalendarPrep}
          showPendingState={recentlyConnectedProvider === "microsoft" && isSyncingLiveData}
        />
      </div>

      {/* 4. Collapsible sections — progressive disclosure */}
      <HomeCalendar
        events={data.todayEvents}
        heroItemIds={data.heroItemIds}
        onNavigate={onNavigate}
        onOpenCalendarPrep={onOpenCalendarPrep}
        animDelay={160}
      />

      <HomeCommunications
        items={data.communicationItems}
        heroItemIds={data.heroItemIds}
        onNavigate={onNavigate}
        animDelay={200}
      />

      <HomeTasks
        tasks={data.priorityTasks}
        heroItemIds={data.heroItemIds}
        onNavigate={onNavigate}
        animDelay={240}
      />

      <HomePeople
        people={data.peopleToWatch}
        getPersonPreference={data.getPersonPreference}
        onNavigate={onNavigate}
        animDelay={280}
      />

      <HomeWatchlist
        performanceItems={data.performanceWatchlist}
        operationsItems={data.operationsWatchlist}
        onNavigate={onNavigate}
        animDelay={320}
      />
    </div>
  );
}
