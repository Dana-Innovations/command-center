"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

interface GenericConfigPanelProps {
  serviceId: string;
  title: string;
  onSave: (config: Record<string, unknown>) => Promise<void>;
  onSkip: () => void;
}

export function GenericConfigPanel({
  title,
  onSave,
  onSkip,
}: GenericConfigPanelProps) {
  const [saving, setSaving] = useState(false);

  const handleDone = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({});
    } finally {
      setSaving(false);
    }
  }, [onSave]);

  return (
    <div className="p-4">
      <div className="rounded-lg border border-white/5 px-4 py-6 text-center">
        <p className="text-sm text-text-body">
          Resource selection for {title} coming soon.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Your data will be imported automatically.
        </p>
      </div>
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
