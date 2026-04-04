"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAttention } from "@/lib/attention/client";
import { ResourcePicker, type ResourceItem } from "./ResourcePicker";

interface AsanaConfigPanelProps {
  onSave: (config: Record<string, unknown>) => Promise<void>;
  onSkip: () => void;
}

export function AsanaConfigPanel({ onSave, onSkip }: AsanaConfigPanelProps) {
  const { focusProviders, focusMapLoading } = useAttention();
  const [saving, setSaving] = useState(false);

  const asanaProjects = useMemo(() => {
    const asanaProvider = focusProviders.find((n) => n.provider === "asana");
    return asanaProvider?.children ?? [];
  }, [focusProviders]);

  const [items, setItems] = useState<ResourceItem[]>([]);

  useEffect(() => {
    if (asanaProjects.length > 0 && items.length === 0) {
      setItems(
        asanaProjects.map((node) => ({
          id: node.entityId,
          label: node.label,
          description: node.description,
          count: node.counts?.total ?? 0,
          checked: node.metadata?.archived !== true,
        }))
      );
    }
  }, [asanaProjects, items.length]);

  const handleChange = useCallback((id: string, checked: boolean) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked } : item))
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, checked: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, checked: false })));
  }, []);

  const handleDone = useCallback(async () => {
    setSaving(true);
    try {
      const selectedIds = items
        .filter((item) => item.checked)
        .map((item) => item.id);
      await onSave({ projects: selectedIds });
    } finally {
      setSaving(false);
    }
  }, [items, onSave]);

  return (
    <div className="p-4">
      <ResourcePicker
        title="Select Asana projects"
        items={items}
        onChange={handleChange}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        loading={focusMapLoading && asanaProjects.length === 0}
        emptyMessage="No Asana projects found. Connect Asana first."
      />
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-text-muted hover:text-text-body transition-colors"
        >
          Skip
        </button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleDone}
          disabled={saving}
        >
          {saving ? "Saving..." : "Done"}
        </Button>
      </div>
    </div>
  );
}
