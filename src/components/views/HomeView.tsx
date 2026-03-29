"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { MorningBrief } from "@/components/command-center/MorningBrief";
import { AttentionHero } from "@/components/home/AttentionHero";
import { QuickActions } from "@/components/home/QuickActions";
import { HomeCommunications } from "@/components/home/HomeCommunications";
import { HomeCalendar } from "@/components/home/HomeCalendar";
import { HomeTasks } from "@/components/home/HomeTasks";
import { HomePeople } from "@/components/home/HomePeople";
import { HomeWatchlist } from "@/components/home/HomeWatchlist";
import { useHomeData, type QuickAction } from "@/components/home/useHomeData";
import { useAuth } from "@/hooks/useAuth";
import type { SetupFocusTab, TabId } from "@/lib/tab-config";

type OnboardingStep = "welcome" | "connect-asana" | "syncing";

const VALUE_PROPS = [
  { icon: "\u{1F4C8}", label: "Prioritized", desc: "What matters surfaces first" },
  { icon: "\u{1F517}", label: "Connected", desc: "People & threads across tools" },
  { icon: "\u26A1", label: "Actionable", desc: "Act without switching apps" },
] as const;

interface HomeViewProps {
  onNavigate: (tab: TabId) => void;
  onOpenCalendarPrep: (eventId?: string) => void;
  onOpenSetup: (tab?: SetupFocusTab) => void;
  onConnectService: (provider: string) => Promise<void>;
  recentlyConnectedProvider?: string | null;
  isSyncingLiveData?: boolean;
}

export function HomeView({
  onNavigate,
  onOpenCalendarPrep,
  onOpenSetup,
  onConnectService,
  recentlyConnectedProvider = null,
  isSyncingLiveData = false,
}: HomeViewProps) {
  const data = useHomeData();
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name?.split(" ")[0] ?? "";

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    () => {
      try {
        if (typeof window !== "undefined" && localStorage.getItem("cc-onboarding-completed") === "true") return null;
      } catch {}
      if (!data.hasM365) return "welcome";
      if (!data.hasAsana) return "connect-asana";
      return null;
    }
  );

  useEffect(() => {
    if (onboardingStep === "syncing" && data.hasAnyService) {
      const timer = setTimeout(() => {
        try { localStorage.setItem("cc-onboarding-completed", "true"); } catch {}
        setOnboardingStep(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [onboardingStep, data.hasAnyService]);

  const handleConnectM365 = useCallback(async () => {
    await onConnectService("microsoft");
    setOnboardingStep("connect-asana");
  }, [onConnectService]);

  const handleConnectAsana = useCallback(async () => {
    await onConnectService("asana");
    setOnboardingStep("syncing");
  }, [onConnectService]);

  const handleSkipAsana = useCallback(() => {
    setOnboardingStep("syncing");
  }, []);

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

  const StepDots = ({ current }: { current: 1 | 2 | 3 }) => (
    <div className="flex gap-1.5 mb-5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-[3px] w-7 rounded-full transition-colors duration-300 ${
            i < current ? "bg-accent-green" : i === current ? "bg-blue-500" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );

  if (onboardingStep !== null) {
    return (
      <div className="space-y-5">
        <section className="glass-card anim-card overflow-hidden" style={{ animationDelay: "0ms" }}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,163,225,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(0,178,169,0.12),transparent_32%)]" />
          <div className="relative">
            {onboardingStep === "welcome" && (
              <>
                <StepDots current={1} />
                <h1 className="font-display text-2xl font-semibold leading-tight text-text-heading">
                  {userName ? `Welcome, ${userName}.` : "Welcome."}
                </h1>
                <p className="mt-1.5 text-[15px] text-text-body">
                  One place for everything across your tools.
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                  Email, calendar, tasks, messages — prioritized and connected. Start by connecting Microsoft 365.
                </p>
                <div className="mt-5 flex flex-wrap gap-5">
                  {VALUE_PROPS.map((vp) => (
                    <div key={vp.label} className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/15 text-sm">
                        {vp.icon}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-text-heading">{vp.label}</div>
                        <div className="text-[11px] text-text-muted">{vp.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-4">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={data.connectingService === "microsoft"}
                    onClick={() => void handleConnectM365()}
                  >
                    {data.connectingService === "microsoft" ? "Connecting..." : "Connect Microsoft 365"}
                  </Button>
                  <span className="text-xs text-text-muted">About 60 seconds total</span>
                </div>
              </>
            )}

            {onboardingStep === "connect-asana" && (
              <>
                <StepDots current={2} />
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-accent-green/25 bg-accent-green/10 px-2.5 py-1">
                  <span className="text-accent-green">&#10003;</span>
                  <span className="text-xs text-accent-green">Microsoft 365 connected</span>
                </div>
                <h1 className="font-display text-[22px] font-semibold leading-tight text-text-heading">
                  Add Asana for task context.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                  See your tasks alongside emails and meetings — all prioritized in one view.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={data.connectingService === "asana"}
                    onClick={() => void handleConnectAsana()}
                  >
                    {data.connectingService === "asana" ? "Connecting..." : "Connect Asana"}
                  </Button>
                  <button
                    className="text-sm text-text-muted underline underline-offset-2 hover:text-text-body"
                    onClick={handleSkipAsana}
                  >
                    Skip for now
                  </button>
                </div>
              </>
            )}

            {onboardingStep === "syncing" && (
              <>
                <StepDots current={3} />
                <div className="mb-4 flex flex-wrap gap-2">
                  {data.hasM365 && (
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-accent-green/25 bg-accent-green/10 px-2.5 py-1">
                      <span className="text-accent-green">&#10003;</span>
                      <span className="text-xs text-accent-green">Microsoft 365</span>
                    </div>
                  )}
                  {data.hasAsana && (
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-accent-green/25 bg-accent-green/10 px-2.5 py-1">
                      <span className="text-accent-green">&#10003;</span>
                      <span className="text-xs text-accent-green">Asana</span>
                    </div>
                  )}
                </div>
                <h1 className="font-display text-[22px] font-semibold leading-tight text-text-heading">
                  Syncing your data...
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                  Pulling in your emails, calendar, tasks, and messages.
                </p>
                <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-2/3 animate-[progressIndeterminate_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    );
  }

  /* ── Connected state — attention-focused dashboard ── */
  return (
    <div className="space-y-4">
      {/* 1. Attention Hero — top 1-3 urgent items */}
      <AttentionHero items={data.heroItems} onAction={handleQuickAction} />

      {/* 2. Quick action buttons */}
      <QuickActions actions={data.quickActions} onAction={handleQuickAction} />

      {/* 3. Morning Brief (collapsed by default) */}
      <MorningBrief
        onOpenCalendarPrep={onOpenCalendarPrep}
        showPendingState={recentlyConnectedProvider === "microsoft" && isSyncingLiveData}
      />

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
