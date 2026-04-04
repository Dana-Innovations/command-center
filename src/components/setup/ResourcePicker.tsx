"use client";

import { useMemo, useState } from "react";

export interface ResourceItem {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  count?: number;
}

interface ResourcePickerProps {
  title: string;
  items: ResourceItem[];
  onChange: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  loading?: boolean;
  emptyMessage?: string;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <svg
        className="h-5 w-5 animate-spin text-text-muted"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          cx={12}
          cy={12}
          r={10}
          stroke="currentColor"
          strokeWidth={3}
          strokeDasharray="60 30"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function ResourcePicker({
  title,
  items,
  onChange,
  onSelectAll,
  onDeselectAll,
  loading = false,
  emptyMessage = "No items found.",
}: ResourcePickerProps) {
  const [filter, setFilter] = useState("");

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    [items]
  );

  const filtered = useMemo(() => {
    if (!filter.trim()) return sorted;
    const q = filter.toLowerCase();
    return sorted.filter((item) => item.label.toLowerCase().includes(q));
  }, [sorted, filter]);

  const checkedCount = items.filter((i) => i.checked).length;
  const allChecked = items.length > 0 && checkedCount === items.length;

  if (loading) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-text-muted">{title}</p>
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-text-muted">{title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={allChecked ? onDeselectAll : onSelectAll}
            className="text-xs text-text-muted hover:text-text-body transition-colors"
          >
            {allChecked ? "Deselect all" : "Select all"}
          </button>
        </div>
      </div>

      {/* Search / filter */}
      {items.length > 5 && (
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-text-body placeholder:text-text-muted focus:border-accent-amber/40 focus:outline-none"
        />
      )}

      {/* Item list */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-white/5">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-text-muted">
            {emptyMessage}
          </p>
        ) : (
          filtered.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) => onChange(item.id, e.target.checked)}
                className="h-4 w-4 shrink-0 rounded accent-[var(--accent-amber)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-body">
                  {item.label}
                </span>
                {item.description && (
                  <span className="block truncate text-xs text-text-muted">
                    {item.description}
                  </span>
                )}
              </span>
              {item.count != null && item.count > 0 && (
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums text-text-muted">
                  {item.count}
                </span>
              )}
            </label>
          ))
        )}
      </div>

      {/* Selected count */}
      <p className="mt-1.5 text-xs text-text-muted">
        {checkedCount} of {items.length} selected
      </p>
    </div>
  );
}
