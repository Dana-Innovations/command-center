"use client";

import Image from "next/image";
import { ALL_TAB_IDS, type TabId } from "@/lib/tab-config";
import { cn } from "@/lib/utils";

const tabs: Array<{
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: React.ReactNode;
}> = [
  {
    id: "home",
    label: "Home",
    mobileLabel: "Home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M10 21v-6h4v6" />
      </svg>
    ),
  },
  {
    id: "communications",
    label: "Comms",
    mobileLabel: "Comms",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "people",
    label: "People",
    mobileLabel: "People",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="4" />
        <path d="M17 11a4 4 0 1 0 0-6" />
        <path d="M3 21a6 6 0 0 1 12 0" />
        <path d="M15 21a6 6 0 0 0-3-5.19" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    mobileLabel: "Cal",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: "performance",
    label: "Performance",
    mobileLabel: "Perf",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19h16" />
        <path d="M7 16V8" />
        <path d="M12 16V5" />
        <path d="M17 16v-3" />
      </svg>
    ),
  },
  {
    id: "operations",
    label: "Operations",
    mobileLabel: "Ops",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v3" />
        <path d="M18.36 5.64l-2.12 2.12" />
        <path d="M21 12h-3" />
        <path d="M18.36 18.36l-2.12-2.12" />
        <path d="M12 21v-3" />
        <path d="M7.76 16.24l-2.12 2.12" />
        <path d="M6 12H3" />
        <path d="M7.76 7.76 5.64 5.64" />
        <circle cx="12" cy="12" r="3.5" />
      </svg>
    ),
  },
];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  badges?: Partial<Record<TabId, number | null>>;
  className?: string;
}

export function TabBar({ activeTab, onTabChange, badges, className }: TabBarProps) {
  return (
    <>
      <div className="md:hidden sticky top-0 z-50 flex items-center justify-center h-12 bg-[#1a2028]/95 backdrop-blur-xl border-b border-[rgba(217,217,214,0.12)]">
        <Image
          src="https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png"
          alt="Sonance"
          width={96}
          height={24}
          className="h-6 w-auto"
        />
      </div>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[rgba(217,217,214,0.12)] bg-[#1a2028]/96 backdrop-blur-xl"
        style={{ paddingBottom: "var(--safe-bottom)" }}
        role="tablist"
      >
        <div className="grid h-[72px] grid-cols-6">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const badgeCount = badges?.[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center transition-colors",
                  isActive
                    ? "text-[#00A3E1]"
                    : "text-[#8f999f]"
                )}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="relative inline-flex items-center justify-center" aria-hidden="true">
                  {tab.icon}
                  {badgeCount != null && badgeCount > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#00A3E1] px-1 text-[9px] font-bold text-white">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none">
                  {tab.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className={cn("hidden md:block mx-6", className)}>
        <div className="flex items-center gap-3 mb-3 pt-4">
          <Image
            src="https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png"
            alt="Sonance"
            width={112}
            height={28}
            className="h-7 w-auto"
          />
          <div className="h-5 w-px bg-[#D9D9D6] opacity-20" />
          <span className="text-xs font-medium tracking-[0.32em] uppercase text-[#8f999f]">
            Command Center
          </span>
        </div>

        <nav
          className="tab-bar grid grid-cols-6 gap-1 rounded-[18px] bg-[var(--tab-bg)] p-1.5"
          role="tablist"
        >
          {ALL_TAB_IDS.map((tabId) => {
            const tab = tabs.find((item) => item.id === tabId)!;
            const isActive = activeTab === tab.id;
            const badgeCount = badges?.[tab.id];

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "relative flex items-center justify-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-[var(--tab-active-bg)] text-[#00A3E1] shadow-sm"
                    : "text-[#8f999f] hover:bg-white/[0.03] hover:text-[#D9D9D6]"
                )}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="relative inline-flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4" aria-hidden="true">
                  {tab.icon}
                  {badgeCount != null && badgeCount > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#00A3E1] px-0.5 text-[8px] font-bold text-white">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
