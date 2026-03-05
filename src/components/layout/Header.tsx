"use client";
import { useState, useEffect, useCallback } from "react";
import { getGreeting, getFormattedDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { SyncIndicator } from "@/components/ui/SyncIndicator";
import { CommandBar, type CommandItem } from "@/components/ui/CommandBar";
import { useAuth } from "@/hooks/useAuth";
import { useLiveData } from "@/lib/live-data-context";
import { ConnectedServicesPanel } from "@/components/ui/ConnectedServicesPanel";

interface HeaderProps {
  onRefresh?: () => void;
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  syncError?: string | null;
  commandItems?: CommandItem[];
}

export function Header({
  onRefresh,
  isSyncing = false,
  lastSyncedAt = null,
  syncError = null,
  commandItems = [],
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { loading, error } = useLiveData();
  const [greeting, setGreeting] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [clock, setClock] = useState("");
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);

  const userInitial = user?.user_metadata?.full_name?.[0] ?? user?.email?.[0] ?? "?";
  const userName = user?.user_metadata?.full_name ?? user?.email ?? "";
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? "";

  // Initialize and update clock every second
  useEffect(() => {
    function update() {
      setGreeting(getGreeting(firstName));
      setDateStr(getFormattedDate());
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "America/Los_Angeles",
        })
      );
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [firstName]);

  // Global "/" key listener for command bar
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !commandBarOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setCommandBarOpen(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [commandBarOpen]);

  // Theme toggle
  const toggleTheme = useCallback(() => {
    document.documentElement.classList.toggle("dark");
  }, []);

  // Print
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-6 py-5">
        {/* Left: greeting + date + clock */}
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-heading leading-tight">
            {greeting}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {dateStr}
            {clock && <span className="ml-3 tabular-nums">{clock}</span>}
          </p>
        </div>

        {/* Right: controls */}
        <div className="header-controls flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <div 
              className={`w-2 h-2 rounded-full ${
                loading ? "bg-amber-400 animate-pulse" : 
                error ? "bg-red-500" : "bg-green-500"
              }`}
              title={loading ? "Syncing..." : error ? `Error: ${error}` : "Data live"}
            />
            <SyncIndicator isSyncing={isSyncing} lastSyncedAt={lastSyncedAt} syncError={syncError} />
          </div>

          {/* Search */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCommandBarOpen(true)}
            aria-label="Search"
            title="Search (press /)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Button>

          {/* Refresh */}
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

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title="Toggle dark/light mode"
          >
            {/* Sun icon (visible in dark mode) */}
            <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
            {/* Moon icon (visible in light mode) */}
            <svg className="block dark:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          </Button>

          {/* Connected Services */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setServicesOpen(true)}
            aria-label="Connected services"
            title="Manage connected services"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </Button>

          {/* Print */}
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

          {/* User avatar / sign-out */}
          <button
            onClick={signOut}
            className="w-8 h-8 rounded-full bg-accent-teal/20 text-accent-teal flex items-center justify-center text-sm font-semibold hover:bg-accent-teal/30 transition-colors cursor-pointer"
            title={`Signed in as ${userName} — click to sign out`}
            aria-label="Sign out"
          >
            {userInitial.toUpperCase()}
          </button>
        </div>
      </header>

      {/* Connected Services Panel */}
      <ConnectedServicesPanel
        open={servicesOpen}
        onClose={() => setServicesOpen(false)}
      />

      {/* Command Bar */}
      <CommandBar
        items={commandItems}
        isOpen={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
      />
    </>
  );
}
