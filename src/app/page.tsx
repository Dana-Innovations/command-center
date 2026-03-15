"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { TabBar, type TabId } from "@/components/layout/TabBar";
import { Footer } from "@/components/layout/Footer";
import { PriorityView } from "@/components/views/PriorityView";
import { SalesTabView } from "@/components/views/SalesTabView";
import { MetricsView } from "@/components/views/MetricsView";
import { UnifiedPeopleView } from "@/components/views/UnifiedPeopleView";
import { CalendarView } from "@/components/views/CalendarView";
import { SignalsView } from "@/components/views/SignalsView";
import { MindensView } from "@/components/views/MindensView";
import { DelegationView } from "@/components/views/DelegationView";
import { MeetingPrepView } from "@/components/views/MeetingPrepView";
import { DigestView } from "@/components/views/DigestView";
import { EODSummary } from "@/components/modals/EODSummary";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { LiveDataProvider, useLiveData } from "@/lib/live-data-context";
import { getVisibleTabs } from "@/lib/tab-config";

export default function Home() {
  return (
    <LiveDataProvider>
      <HomeContent />
    </LiveDataProvider>
  );
}

function HomeContent() {
  const [activeTab, setActiveTab] = useState<TabId>("digest");
  const [eodOpen, setEodOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [prepEventId, setPrepEventId] = useState<string | undefined>();
  const { loading, fetchedAt, error, refetch, connections } = useLiveData();

  const visibleTabs = useMemo(
    () => getVisibleTabs(connections, !!fetchedAt),
    [connections, fetchedAt]
  );

  // Redirect to Digest if current tab becomes hidden
  useEffect(() => {
    if (fetchedAt && !visibleTabs.includes(activeTab)) {
      setActiveTab("digest");
    }
  }, [visibleTabs, activeTab, fetchedAt]);

  const handlePrepNavigate = useCallback((eventId: string) => {
    setPrepEventId(eventId);
    setActiveTab("prep");
  }, []);

  // Listen for navigate-prep custom events from child components
  useEffect(() => {
    const handler = ((e: CustomEvent<{ eventId: string }>) => {
      handlePrepNavigate(e.detail.eventId);
    }) as EventListener;
    window.addEventListener("navigate-prep", handler);
    return () => window.removeEventListener("navigate-prep", handler);
  }, [handlePrepNavigate]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="grain-overlay" aria-hidden="true" />

      <Header
        onRefresh={refetch}
        isSyncing={loading}
        lastSyncedAt={fetchedAt}
        syncError={error}
        onSearchOpen={() => setSearchOpen(true)}
      />

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        visibleTabIds={visibleTabs}
        className="mb-5"
      />

      <main className="px-4 md:px-6 pb-24 md:pb-8">
        {activeTab === "digest"    && <DigestView />}
        {activeTab === "priority"  && <PriorityView />}
        {activeTab === "sales"     && <SalesTabView />}
        {activeTab === "metrics"   && <MetricsView />}
        {activeTab === "people"    && <UnifiedPeopleView />}
        {activeTab === "calendar"  && <CalendarView />}
        {activeTab === "prep"      && <MeetingPrepView initialEventId={prepEventId} />}
        {activeTab === "signals"   && <SignalsView />}
        {activeTab === "minden"    && <MindensView />}
        {activeTab === "delegation" && <DelegationView />}
      </main>

      <Footer onEodSummary={() => setEodOpen(true)} />
      <EODSummary isOpen={eodOpen} onClose={() => setEodOpen(false)} />
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={(tab) => setActiveTab(tab as TabId)}
      />
    </div>
  );
}
