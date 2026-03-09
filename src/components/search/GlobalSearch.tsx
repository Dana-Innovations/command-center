"use client";

import { useEffect, useRef, useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  useGlobalSearch,
  type SearchCategory,
  type SearchResult,
} from "@/hooks/useGlobalSearch";

/* ── Category metadata ── */
const CATEGORY_META: Record<
  SearchCategory,
  { label: string; color: string; icon: ReactNode }
> = {
  tasks: {
    label: "Tasks",
    color: "text-accent-red",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="m8 12 3 3 6-8" />
      </svg>
    ),
  },
  people: {
    label: "People",
    color: "text-accent-teal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </svg>
    ),
  },
  emails: {
    label: "Emails",
    color: "text-accent-green",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
  },
  meetings: {
    label: "Meetings",
    color: "text-accent-amber",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  opportunities: {
    label: "Salesforce Opps",
    color: "text-[#0070D2]",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
};

const CATEGORY_ORDER: SearchCategory[] = [
  "tasks",
  "people",
  "emails",
  "meetings",
  "opportunities",
];

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
}

export function GlobalSearch({ isOpen, onClose, onNavigate }: GlobalSearchProps) {
  const {
    query,
    setQuery,
    grouped,
    results,
    isSearching,
    recentSearches,
    addRecent,
    clearRecent,
  } = useGlobalSearch();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat list for keyboard navigation
  const flatResults: SearchResult[] = [];
  for (const cat of CATEGORY_ORDER) {
    flatResults.push(...grouped[cat]);
  }

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, setQuery]);

  // Reset selection on results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      addRecent(query);
      if (result.url) {
        window.open(result.url, "_blank", "noopener");
      }
      if (onNavigate) {
        onNavigate(result.tab);
      }
      onClose();
    },
    [query, addRecent, onNavigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatResults[selectedIndex]) {
            handleSelect(flatResults[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatResults, selectedIndex, handleSelect, onClose]
  );

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;
  const hasResults = flatResults.length > 0;

  // Track flat index for rendering
  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[10001] flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-[var(--bg-card-border)] bg-[var(--bg-secondary)] shadow-2xl anim-card overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--bg-card-border)] px-5 py-4">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, people, emails, meetings, deals..."
            className="flex-1 bg-transparent text-base text-text-heading placeholder:text-text-muted outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-[var(--bg-card-border)] px-1.5 py-0.5 text-[10px] text-text-muted font-mono">
            ESC
          </kbd>
        </div>

        {/* Results / Recent / Empty */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {/* Loading skeleton */}
          {isSearching && hasQuery && (
            <div className="px-5 py-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-[var(--tab-bg)]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-48 rounded bg-[var(--tab-bg)]" />
                    <div className="h-2.5 w-32 rounded bg-[var(--tab-bg)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {hasQuery && !hasResults && !isSearching && (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-text-muted">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-text-muted mt-1">
                Try a different search term
              </p>
            </div>
          )}

          {/* Grouped results */}
          {hasQuery && hasResults && !isSearching && (
            <div className="py-2">
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const meta = CATEGORY_META[cat];

                return (
                  <div key={cat}>
                    {/* Category header */}
                    <div className="px-5 py-2 flex items-center gap-2">
                      <span className={cn("shrink-0", meta.color)}>
                        {meta.icon}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        ({items.length})
                      </span>
                    </div>

                    {/* Items */}
                    {items.map((result) => {
                      const thisIdx = flatIdx++;
                      const isSelected = thisIdx === selectedIndex;

                      return (
                        <button
                          key={result.id}
                          data-selected={isSelected}
                          className={cn(
                            "flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors cursor-pointer",
                            isSelected
                              ? "bg-[var(--tab-active-bg)] text-accent-amber"
                              : "text-text-body hover:bg-[var(--tab-bg)]"
                          )}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setSelectedIndex(thisIdx)}
                        >
                          <span className={cn("shrink-0 opacity-60", meta.color)}>
                            {meta.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {result.title}
                            </div>
                            {result.subtitle && (
                              <div className="text-xs text-text-muted truncate">
                                {result.subtitle}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <kbd className="hidden sm:inline-flex items-center rounded-md border border-[var(--bg-card-border)] px-1.5 py-0.5 text-[10px] text-text-muted font-mono">
                              ↵
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent searches (when input is empty) */}
          {!hasQuery && recentSearches.length > 0 && (
            <div className="py-2">
              <div className="px-5 py-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Recent Searches
                </span>
                <button
                  className="text-[11px] text-text-muted hover:text-accent-amber transition-colors cursor-pointer"
                  onClick={clearRecent}
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  className="flex w-full items-center gap-3 px-5 py-2 text-left text-sm text-text-body hover:bg-[var(--tab-bg)] transition-colors cursor-pointer"
                  onClick={() => setQuery(term)}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-text-muted shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span className="truncate">{term}</span>
                </button>
              ))}
            </div>
          )}

          {/* Empty state — no query, no recents */}
          {!hasQuery && recentSearches.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-text-muted">
                Search across tasks, people, emails, meetings, and deals
              </p>
              <p className="text-xs text-text-muted mt-2">
                <kbd className="rounded border border-[var(--bg-card-border)] px-1 py-0.5 text-[10px] font-mono">↑↓</kbd>
                {" "}to navigate{" "}
                <kbd className="rounded border border-[var(--bg-card-border)] px-1 py-0.5 text-[10px] font-mono">↵</kbd>
                {" "}to open{" "}
                <kbd className="rounded border border-[var(--bg-card-border)] px-1 py-0.5 text-[10px] font-mono">esc</kbd>
                {" "}to close
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasQuery && hasResults && (
          <div className="border-t border-[var(--bg-card-border)] px-5 py-2.5 flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {flatResults.length} result{flatResults.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[11px] text-text-muted hidden sm:block">
              <kbd className="rounded border border-[var(--bg-card-border)] px-1 py-0.5 text-[10px] font-mono">⌘K</kbd>
              {" "}to search
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
