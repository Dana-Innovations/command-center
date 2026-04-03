"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { CommandBar, type CommandItem } from "@/components/ui/CommandBar";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/lib/live-data-context";

interface HeaderProps {
  onRefresh?: () => void;
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  syncError?: string | null;
  commandItems?: CommandItem[];
  onSearchOpen?: () => void;
  onOpenSetup?: () => void;
  deltaCount?: number;
  onDeltaOpen?: () => void;
}

export function Header({
  onRefresh,
  isSyncing = false,
  lastSyncedAt = null,
  syncError = null,
  commandItems = [],
  onSearchOpen,
  onOpenSetup,
  deltaCount = 0,
  onDeltaOpen,
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { loading, error } = useLiveData();
  const [commandBarOpen, setCommandBarOpen] = useState(false);

  const userInitial = user?.user_metadata?.full_name?.[0] ?? user?.email?.[0] ?? "?";
  const userName = user?.user_metadata?.full_name ?? user?.email ?? "";

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSearchOpen?.();
        return;
      }

      if (
        event.key === "/" &&
        !commandBarOpen &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        setCommandBarOpen(true);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [commandBarOpen, onSearchOpen]);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle("dark");
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <>
      <header className="flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">
              Sonance
            </div>
            <div className="mt-1 text-lg font-semibold text-text-heading">
              Command Center
            </div>
          </div>
          <div className="hidden h-8 w-px bg-white/10 md:block" />
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <div
              className={loading ? "h-2.5 w-2.5 rounded-full bg-accent-amber animate-pulse" : error ? "h-2.5 w-2.5 rounded-full bg-accent-red" : "h-2.5 w-2.5 rounded-full bg-accent-green"}
              title={loading ? "Syncing..." : error ? `Error: ${error}` : "Data live"}
            />
            <SyncIndicator
              isSyncing={isSyncing}
              lastSyncedAt={lastSyncedAt}
              syncError={syncError}
            />
          </div>
        </div>

        <div className="header-controls flex flex-wrap items-center gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenSetup?.()}
            title="Open personalization"
          >
            Personalize
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSearchOpen?.()}
            aria-label="Search"
            title="Search (⌘K)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onDeltaOpen}
            aria-label="What changed"
            title="What changed"
            className="relative"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {deltaCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 text-[9px] font-bold text-white">
                {deltaCount > 99 ? "99+" : deltaCount}
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className={isSyncing ? "refreshing" : ""}
            aria-label="Refresh"
            title="Refresh data"
          >
            <svg className="refresh-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle dark/light mode"
          >
            <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            <svg className="block dark:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrint}
            aria-label="Print"
            title="Print view"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
          </Button>

          <button
            onClick={signOut}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-teal/20 text-sm font-semibold text-accent-teal transition-colors hover:bg-accent-teal/30"
            title={`Signed in as ${userName} — click to sign out`}
            aria-label="Sign out"
          >
            {userInitial.toUpperCase()}
          </button>
        </div>
      </header>

      <CommandBar
        items={commandItems}
        isOpen={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
      />
    </>
  );
}
