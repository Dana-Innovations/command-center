"use client";
import { cn } from "@/lib/utils";

export type TabId = "command-center" | "sales" | "people" | "timeline" | "trends";

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { 
    id: "command-center", 
    label: "Command Center",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  { 
    id: "sales", 
    label: "Sales",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 6l-9.5 9.5-5-5L1 18" />
        <path d="M17 6h6v6" />
      </svg>
    )
  },
  { 
    id: "people", 
    label: "People",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    )
  },
  { 
    id: "timeline", 
    label: "Timeline",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    )
  },
  { 
    id: "trends", 
    label: "Trends",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10" />
        <line x1="18" y1="20" x2="18" y2="4" />
        <line x1="6" y1="20" x2="6" y2="16" />
      </svg>
    )
  },
];

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  className?: string;
}

export function TabBar({ activeTab, onTabChange, className }: TabBarProps) {
  return (
    <nav
      className={cn(
        "tab-bar flex items-center gap-1 rounded-xl bg-[var(--tab-bg)] p-1 mx-6",
        className
      )}
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
              "relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer flex items-center gap-1",
              isActive
                ? "bg-[var(--tab-active-bg)] text-accent-amber shadow-sm"
                : "text-text-muted hover:text-text-body hover:bg-[var(--tab-bg)]"
            )}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.label}
          >
            <span className="inline-flex items-center justify-center" aria-hidden="true" style={{width:14, height:14}}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
