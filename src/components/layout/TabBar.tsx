"use client";
import { cn } from "@/lib/utils";

export type TabId = "digest" | "priority" | "sales" | "metrics" | "people" | "relationships" | "calendar" | "prep" | "signals" | "minden" | "delegation";

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "digest",
    label: "Digest",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 18a5 5 0 00-10 0" /><line x1="12" y1="2" x2="12" y2="9" /><line x1="4.22" y1="10.22" x2="5.64" y2="11.64" /><line x1="1" y1="18" x2="3" y2="18" /><line x1="21" y1="18" x2="23" y2="18" /><line x1="18.36" y1="11.64" x2="19.78" y2="10.22" /><line x1="23" y1="22" x2="1" y2="22" /><polyline points="8 6 12 2 16 6" />
      </svg>
    ),
  },
  {
    id: "priority",
    label: "Priority",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    id: "sales",
    label: "Sales",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" />
      </svg>
    ),
  },
  {
    id: "metrics",
    label: "Metrics",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="4" /><line x1="12" y1="20" x2="12" y2="10" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: "people",
    label: "People",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
  },
  {
    id: "relationships",
    label: "Relations",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "prep",
    label: "Prep",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: "signals",
    label: "Signals",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    id: "minden",
    label: "Minden",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h20" /><path d="M5 20V8l7-5 7 5v12" /><rect x="9" y="12" width="6" height="8" />
        <line x1="9" y1="8" x2="9" y2="8.01" /><line x1="15" y1="8" x2="15" y2="8.01" />
      </svg>
    ),
  },
  {
    id: "delegation",
    label: "Delegate",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="M3 21l7-7" />
      </svg>
    ),
  },
];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}

export function TabBar({ activeTab, onTabChange, className }: TabBarProps) {
  return (
    <>
      {/* ─── Mobile: Sticky top header with logo ─── */}
      <div className="md:hidden sticky top-0 z-50 flex items-center justify-center h-12 bg-[#1a2028] border-b border-[rgba(217,217,214,0.12)]">
        <img
          src="https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png"
          alt="Sonance"
          className="h-6 w-auto"
        />
      </div>

      {/* ─── Mobile: Fixed bottom tab bar ─── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#1a2028] border-t border-[rgba(217,217,214,0.12)]"
        style={{ paddingBottom: "var(--safe-bottom)" }}
        role="tablist"
      >
        <div className="flex items-center justify-around h-16 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-1 py-1 transition-colors cursor-pointer",
                  isActive
                    ? "text-[#00A3E1]"
                    : "text-[#8f999f]"
                )}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="inline-flex items-center justify-center" aria-hidden="true">{tab.icon}</span>
                <span className="text-[10px] mt-0.5 font-medium leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ─── Desktop: Top horizontal bar with logo + tabs ─── */}
      <div className={cn("hidden md:block mx-6", className)}>
        <div className="flex items-center gap-3 mb-3 pt-4">
          <img
            src="https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png"
            alt="Sonance"
            className="h-7 w-auto"
          />
          <div className="h-5 w-px bg-[#D9D9D6] opacity-20" />
          <span className="text-xs font-medium tracking-wider uppercase text-[#8f999f]">
            Command Center
          </span>
        </div>

        <nav
          className="tab-bar flex items-center gap-1 rounded-xl bg-[var(--tab-bg)] p-1"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5",
                  isActive
                    ? "bg-[var(--tab-active-bg)] text-[#00A3E1] shadow-sm"
                    : "text-[#8f999f] hover:text-[#D9D9D6] hover:bg-[var(--tab-bg)]"
                )}
                onClick={() => onTabChange(tab.id)}
              >
                <span className="inline-flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5" aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
