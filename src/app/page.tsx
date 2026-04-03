"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { TabBar } from "@/components/layout/TabBar";
import { GlobalProgressBar } from "@/components/ui/GlobalProgressBar";
import { EODSummary } from "@/components/modals/EODSummary";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { DeltaFeedPanel } from "@/components/command-center/DeltaFeedPanel";
import { DeltaToast } from "@/components/ui/DeltaToast";
import { useDeltaFeed } from "@/hooks/useDeltaFeed";
import { createSnapshot, saveSnapshot } from "@/lib/delta-snapshot";
import { CalendarHubView } from "@/components/views/CalendarHubView";
import { CommunicationsView } from "@/components/views/CommunicationsView";
import { HomeView } from "@/components/views/HomeView";
import { OperationsView } from "@/components/views/OperationsView";
import { PerformanceView } from "@/components/views/PerformanceView";
import { PeopleHubView } from "@/components/views/PeopleHubView";
import { SetupFocusView } from "@/components/ui/WorkspaceStudio";
import { useTabBadges } from "@/hooks/useTabBadges";
import { AttentionProvider, useAttention } from "@/lib/attention/client";
import { LiveDataProvider, useLiveData } from "@/lib/live-data-context";
import {
  parseCalendarSubView,
  parseCommunicationsSubView,
  parseHomeSubView,
  parseOperationsSubView,
  parsePerformanceSubView,
  parseSetupFocusTab,
  parseTabId,
  type CalendarSubView,
  type CommunicationsSubView,
  type HomeSubView,
  type OperationsSubView,
  type PerformanceSubView,
  type SetupFocusTab,
  type TabId,
} from "@/lib/tab-config";

export default function Home() {
  return (
    <LiveDataProvider>
      <AttentionProvider>
        <Suspense fallback={<HomeShellFallback />}>
          <HomeContent />
        </Suspense>
      </AttentionProvider>
    </LiveDataProvider>
  );
}

function HomeShellFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] px-4 py-8 md:px-6">
      <GlobalProgressBar isActive />
      <div className="space-y-4">
        <div className="glass-card anim-card">
          <div className="skeleton-shimmer h-4 w-36 rounded-full" />
          <div className="skeleton-shimmer mt-3 h-8 w-3/4 rounded-lg" />
          <div className="skeleton-shimmer mt-2 h-4 w-2/3 rounded-lg" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton-shimmer h-9 w-28 rounded-full" />
          <div className="skeleton-shimmer h-9 w-24 rounded-full" />
        </div>
        <div className="glass-card anim-card" style={{ animationDelay: "60ms" }}>
          <div className="skeleton-shimmer h-5 w-48 rounded-lg" />
          <div className="skeleton-shimmer mt-2 h-3 w-72 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [eodOpen, setEodOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [recentlyConnectedProvider, setRecentlyConnectedProvider] = useState<
    string | null
  >(null);
  const [deltaOpen, setDeltaOpen] = useState(false);
  const liveData = useLiveData();
  const { loading, fetchedAt, error, refetch } = liveData;
  const delta = useDeltaFeed();
  const { focusRevision, openSetupFocus, connectService } = useAttention();
  const badges = useTabBadges();
  const activeTab: TabId = parseTabId(searchParams.get("tab"));
  const homeSubView: HomeSubView = parseHomeSubView(searchParams.get("sub"));
  const communicationsSubView: CommunicationsSubView =
    parseCommunicationsSubView(searchParams.get("sub"));
  const calendarSubView: CalendarSubView = parseCalendarSubView(
    searchParams.get("sub")
  );
  const performanceSubView: PerformanceSubView = parsePerformanceSubView(
    searchParams.get("sub")
  );
  const operationsSubView: OperationsSubView = parseOperationsSubView(
    searchParams.get("sub")
  );
  const prepEventId = searchParams.get("eventId") ?? undefined;

  const syncUrl = useCallback(
    (next: {
      tab: TabId;
      sub?: string | null;
      eventId?: string | null;
      setupTab?: SetupFocusTab;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next.tab);
      if (next.sub) params.set("sub", next.sub);
      else params.delete("sub");

      if (next.eventId) params.set("eventId", next.eventId);
      else params.delete("eventId");

      if (next.setupTab) params.set("setupTab", next.setupTab);
      else params.delete("setupTab");

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    openSetupFocus(parseSetupFocusTab(searchParams.get("setupTab")));
  }, [openSetupFocus, searchParams]);

  useEffect(() => {
    const handler = ((event: CustomEvent<{ eventId: string }>) => {
      syncUrl({
        tab: "calendar",
        sub: "prep",
        eventId: event.detail.eventId,
      });
    }) as EventListener;

    window.addEventListener("navigate-prep", handler);
    return () => window.removeEventListener("navigate-prep", handler);
  }, [syncUrl]);

  useEffect(() => {
    if (focusRevision === 0) return;
    void refetch();
  }, [focusRevision, refetch]);

  useEffect(() => {
    if (!searchParams.get("tab")) {
      syncUrl({ tab: "home", sub: "overview" });
    }
  }, [searchParams, syncUrl]);

  // Save snapshot after each successful data fetch (for delta diffing)
  useEffect(() => {
    if (!fetchedAt) return;
    saveSnapshot(
      createSnapshot({
        emails: liveData.emails,
        calendar: liveData.calendar,
        tasks: liveData.tasks,
        chats: liveData.chats,
        slack: liveData.slack,
        opportunities: liveData.opportunities,
      })
    );
  }, [fetchedAt, liveData.emails, liveData.calendar, liveData.tasks, liveData.chats, liveData.slack, liveData.opportunities]);

  // Enrich delta groups when panel opens
  const enrichDeltaGroups = delta.enrichGroups;
  useEffect(() => {
    if (deltaOpen) enrichDeltaGroups();
  }, [deltaOpen, enrichDeltaGroups]);

  const navigateToTab = useCallback(
    (tab: TabId) => {
      if (tab === "home") {
        syncUrl({ tab, sub: "overview" });
        return;
      }

      if (tab === "calendar") {
        syncUrl({
          tab,
          sub: activeTab === "calendar" ? calendarSubView : "schedule",
          eventId:
            activeTab === "calendar" && calendarSubView === "prep"
              ? prepEventId ?? null
              : null,
        });
        return;
      }

      if (tab === "performance") {
        syncUrl({
          tab,
          sub: activeTab === "performance" ? performanceSubView : "sales",
        });
        return;
      }

      if (tab === "operations") {
        syncUrl({
          tab,
          sub: activeTab === "operations" ? operationsSubView : "delegation",
        });
        return;
      }

      if (tab === "communications") {
        syncUrl({
          tab,
          sub:
            activeTab === "communications"
              ? communicationsSubView
              : "replies",
        });
        return;
      }

      syncUrl({ tab });
    },
    [
      activeTab,
      calendarSubView,
      communicationsSubView,
      operationsSubView,
      performanceSubView,
      prepEventId,
      syncUrl,
    ]
  );

  const openSetup = useCallback(
    (tab: SetupFocusTab = "focus") => {
      openSetupFocus(tab);
      syncUrl({ tab: "home", sub: "setup", setupTab: tab });
    },
    [openSetupFocus, syncUrl]
  );

  const openHomeOverview = useCallback(() => {
    syncUrl({ tab: "home", sub: "overview" });
  }, [syncUrl]);

  const openCalendarPrep = useCallback(
    (eventId?: string) => {
      syncUrl({ tab: "calendar", sub: "prep", eventId: eventId ?? null });
    },
    [syncUrl]
  );

  const handleConnectService = useCallback(
    async (provider: string) => {
      const connected = await connectService(provider);
      if (!connected) return;

      syncUrl({ tab: "home", sub: "overview" });
      if (provider !== "microsoft") {
        await refetch();
        return;
      }

      setRecentlyConnectedProvider(provider);
      try {
        await refetch();
      } finally {
        setRecentlyConnectedProvider(null);
      }
    },
    [connectService, refetch, syncUrl]
  );

  const handleCalendarSubViewChange = useCallback(
    (subView: CalendarSubView) => {
      if (activeTab === "calendar") {
        syncUrl({
          tab: "calendar",
          sub: subView,
          eventId: subView === "prep" ? prepEventId ?? null : null,
        });
      }
    },
    [activeTab, prepEventId, syncUrl]
  );

  const handlePerformanceSubViewChange = useCallback(
    (subView: PerformanceSubView) => {
      if (activeTab === "performance") {
        syncUrl({ tab: "performance", sub: subView });
      }
    },
    [activeTab, syncUrl]
  );

  const handleOperationsSubViewChange = useCallback(
    (subView: OperationsSubView) => {
      if (activeTab === "operations") {
        syncUrl({ tab: "operations", sub: subView });
      }
    },
    [activeTab, syncUrl]
  );

  const handleCommunicationsSubViewChange = useCallback(
    (subView: CommunicationsSubView) => {
      if (activeTab === "communications") {
        syncUrl({ tab: "communications", sub: subView });
      }
    },
    [activeTab, syncUrl]
  );

  const currentView = useMemo(() => {
    if (activeTab === "home") {
      return homeSubView === "setup" ? (
        <SetupFocusView onBack={openHomeOverview} />
      ) : (
        <HomeView
          onNavigate={navigateToTab}
          onOpenCalendarPrep={openCalendarPrep}
          onOpenSetup={openSetup}
          onConnectService={handleConnectService}
          recentlyConnectedProvider={recentlyConnectedProvider}
          isSyncingLiveData={loading}
        />
      );
    }

    if (activeTab === "communications") {
      return (
        <CommunicationsView
          subView={communicationsSubView}
          onSubViewChange={handleCommunicationsSubViewChange}
          onConnectService={handleConnectService}
          onOpenSetup={() => openSetup("focus")}
        />
      );
    }

    if (activeTab === "people") {
      return (
        <PeopleHubView
          onConnectService={handleConnectService}
          onOpenSetup={() => openSetup("focus")}
        />
      );
    }

    if (activeTab === "calendar") {
      return (
        <CalendarHubView
          activeSubView={calendarSubView}
          initialEventId={prepEventId}
          onConnectService={handleConnectService}
          onOpenSetup={() => openSetup("focus")}
          onSubViewChange={handleCalendarSubViewChange}
          onOpenCalendarPrep={openCalendarPrep}
        />
      );
    }

    if (activeTab === "performance") {
      return (
        <PerformanceView
          activeSubView={performanceSubView}
          onConnectService={handleConnectService}
          onOpenSetup={() => openSetup("connections")}
          onSubViewChange={handlePerformanceSubViewChange}
        />
      );
    }

    return (
      <OperationsView
        activeSubView={operationsSubView}
        onConnectService={handleConnectService}
        onOpenSetup={() => openSetup("connections")}
        onSubViewChange={handleOperationsSubViewChange}
      />
    );
  }, [
    activeTab,
    calendarSubView,
    communicationsSubView,
    handleCalendarSubViewChange,
    handleCommunicationsSubViewChange,
    handleConnectService,
    handleOperationsSubViewChange,
    handlePerformanceSubViewChange,
    homeSubView,
    loading,
    navigateToTab,
    openCalendarPrep,
    openHomeOverview,
    openSetup,
    operationsSubView,
    performanceSubView,
    prepEventId,
    recentlyConnectedProvider,
  ]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="grain-overlay" aria-hidden="true" />
      <GlobalProgressBar isActive={loading} />

      <Header
        onRefresh={refetch}
        isSyncing={loading}
        lastSyncedAt={fetchedAt}
        syncError={error}
        onSearchOpen={() => setSearchOpen(true)}
        onOpenSetup={() => openSetup("focus")}
        deltaCount={delta.totalChanges}
        onDeltaOpen={() => setDeltaOpen(true)}
      />

      <TabBar activeTab={activeTab} onTabChange={navigateToTab} badges={badges} className="mb-5" />

      <main className="px-4 pb-24 md:px-6 md:pb-8">{currentView}</main>

      <Footer onEodSummary={() => setEodOpen(true)} />
      <EODSummary isOpen={eodOpen} onClose={() => setEodOpen(false)} />
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => navigateToTab(parseTabId(tab))}
      />

      {delta.showToast && (
        <DeltaToast
          count={delta.totalChanges}
          onClick={() => {
            delta.dismissToast();
            setDeltaOpen(true);
          }}
          onDismiss={delta.dismissToast}
        />
      )}

      <DeltaFeedPanel
        isOpen={deltaOpen}
        onClose={() => setDeltaOpen(false)}
        groups={delta.groups}
        totalChanges={delta.totalChanges}
        lastSeenAt={delta.lastSeenAt}
        onAcknowledge={delta.acknowledge}
      />
    </div>
  );
}
