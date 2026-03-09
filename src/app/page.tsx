"use client";
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { TabBar, type TabId } from "@/components/layout/TabBar";
import { Footer } from "@/components/layout/Footer";
import { PriorityView } from "@/components/views/PriorityView";
import { SalesTabView } from "@/components/views/SalesTabView";
import { MetricsView } from "@/components/views/MetricsView";
import { PeopleView } from "@/components/views/PeopleView";
import { CalendarView } from "@/components/views/CalendarView";
import { SignalsView } from "@/components/views/SignalsView";
import { MindensView } from "@/components/views/MindensView";
import { DelegationView } from "@/components/views/DelegationView";
import { MeetingPrepView } from "@/components/views/MeetingPrepView";
import { RelationshipView } from "@/components/views/RelationshipView";
import { usePeople } from "@/hooks/usePeople";
import { EODSummary } from "@/components/modals/EODSummary";
import { LiveDataProvider, useLiveData } from "@/lib/live-data-context";

export default function Home() {
  return (
    <LiveDataProvider>
      <HomeContent />
    </LiveDataProvider>
  );
}

function HomeContent() {
  const [activeTab, setActiveTab] = useState<TabId>("priority");
  const [eodOpen, setEodOpen] = useState(false);
  const { loading, fetchedAt, error, refetch } = useLiveData();
  const { people, loading: peopleLoading } = usePeople();

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <div className="grain-overlay" aria-hidden="true" />

      <Header
        onRefresh={refetch}
        isSyncing={loading}
        lastSyncedAt={fetchedAt}
        syncError={error}
      />

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="mb-5"
      />

      <main className="px-6 pb-8">
        {activeTab === "priority"  && <PriorityView />}
        {activeTab === "sales"     && <SalesTabView />}
        {activeTab === "metrics"   && <MetricsView />}
        {activeTab === "people"    && <PeopleView people={people} loading={peopleLoading} />}
        {activeTab === "relationships" && <RelationshipView />}
        {activeTab === "calendar"  && <CalendarView />}
        {activeTab === "prep"      && <MeetingPrepView />}
        {activeTab === "signals"   && <SignalsView />}
        {activeTab === "minden"    && <MindensView />}
        {activeTab === "delegation" && <DelegationView />}
      </main>

      <Footer onEodSummary={() => setEodOpen(true)} />
      <EODSummary isOpen={eodOpen} onClose={() => setEodOpen(false)} />
    </div>
  );
}
