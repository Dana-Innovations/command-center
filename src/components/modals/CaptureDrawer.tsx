"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { UseVaultCaptureReturn } from "@/hooks/useVaultCapture";
import type { RoutingPlan } from "@/lib/capture-routing";

interface CaptureDrawerProps {
  capture: UseVaultCaptureReturn;
}

export function CaptureDrawer({ capture }: CaptureDrawerProps) {
  const { state, isOpen, close, save, retry } = capture;
  const { addToast } = useToast();

  // Holds the latest user-edited plan without causing re-renders.
  // PreviewForm notifies us on every change via onPlanChange.
  const editedPlanRef = useRef<RoutingPlan | null>(null);

  // Track last-saved title so we can show it in the toast after the drawer closes.
  const lastSavedTitleRef = useRef<string | null>(null);

  // Detect saving → closed transition using a prev-status ref (no setState in effect).
  const prevStatusRef = useRef(state.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = state.status;

    // Capture title on entering "saving" (state.plan is already the edited plan).
    if (state.status === "saving") {
      lastSavedTitleRef.current = state.plan.targetTitle;
    }

    if (prev === "saving" && state.status === "closed" && lastSavedTitleRef.current) {
      addToast(`Saved to ${lastSavedTitleRef.current}`, "success");
      lastSavedTitleRef.current = null;
    }
  }, [state, addToast]);

  if (!isOpen) return null;

  // A stable key based on plan identity causes PreviewForm to remount (and reset
  // its local edit state) when a genuinely different plan arrives.
  const planKey =
    state.status === "preview" || state.status === "saving" || state.status === "error"
      ? (state.plan?.targetPath ?? "no-plan")
      : "no-plan";

  const hasPlan =
    (state.status === "preview" ||
      state.status === "saving" ||
      state.status === "error") &&
    !!state.plan;

  function handleSave() {
    const plan = editedPlanRef.current;
    if (plan) save(plan);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={close}
      />
      <div
        className={cn(
          "relative w-full max-w-md bg-[var(--bg-primary)] border-l border-[var(--bg-card-border)]",
          "shadow-2xl pointer-events-auto overflow-y-auto",
          "flex flex-col"
        )}
      >
        <div className="px-4 py-3 border-b border-[var(--bg-card-border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-heading">
            Capture to Vault
          </h2>
          <button
            onClick={close}
            className="text-text-muted hover:text-text-body text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 p-4">
          {state.status === "analyzing" && (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <div className="animate-pulse text-sm">Analyzing content...</div>
            </div>
          )}

          {(state.status === "preview" || state.status === "saving") &&
            state.plan && (
              <PreviewForm
                key={planKey}
                initialPlan={state.plan}
                onPlanChange={(p) => { editedPlanRef.current = p; }}
                saving={state.status === "saving"}
              />
            )}

          {state.status === "error" && (
            <div className="space-y-4">
              <div className="text-sm text-accent-red bg-accent-red/10 border border-accent-red/30 rounded p-3">
                {state.error}
              </div>
              {state.plan && (
                <PreviewForm
                  key={planKey}
                  initialPlan={state.plan}
                  onPlanChange={(p) => { editedPlanRef.current = p; }}
                  saving={false}
                />
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--bg-card-border)] flex items-center justify-end gap-2">
          <button
            onClick={close}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-body"
          >
            Cancel
          </button>
          {state.status === "error" && !state.plan && (
            <button
              onClick={retry}
              className="px-3 py-1.5 text-xs bg-accent-amber/20 text-accent-amber rounded hover:bg-accent-amber/30"
            >
              Try Again
            </button>
          )}
          {hasPlan && (
            <button
              onClick={handleSave}
              disabled={state.status === "saving"}
              className={cn(
                "px-3 py-1.5 text-xs rounded font-semibold",
                "bg-accent-amber/20 text-accent-amber hover:bg-accent-amber/30",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {state.status === "saving" ? "Saving..." : "Save to Vault"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PreviewFormProps {
  initialPlan: RoutingPlan;
  onPlanChange: (plan: RoutingPlan) => void;
  saving: boolean;
}

function PreviewForm({ initialPlan, onPlanChange, saving }: PreviewFormProps) {
  // Local edit state — resets naturally when the component remounts via key prop.
  const [plan, setPlan] = useState<RoutingPlan>(initialPlan);

  // Notify parent of the initial plan on mount so editedPlanRef is always valid.
  const onPlanChangeRef = useRef(onPlanChange);
  onPlanChangeRef.current = onPlanChange;
  useEffect(() => {
    onPlanChangeRef.current(initialPlan);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only on mount

  function update(next: RoutingPlan) {
    setPlan(next);
    onPlanChangeRef.current(next);
  }

  return (
    <div className="space-y-4">
      <Field label="Action">
        <div className="text-sm text-text-body">
          {plan.action === "append" ? "Append to" : "Create new"}
        </div>
      </Field>

      <Field label="Target">
        <input
          type="text"
          value={plan.targetTitle}
          onChange={(e) => update({ ...plan, targetTitle: e.target.value })}
          disabled={saving}
          className="w-full px-2 py-1 text-sm bg-[var(--bg-card)] border border-[var(--bg-card-border)] rounded text-text-body"
        />
        <div className="text-[10px] text-text-muted mt-1 font-mono">
          {plan.targetPath}
        </div>
      </Field>

      <Field label="Reasoning">
        <div className="text-xs text-text-muted italic">{plan.reasoning}</div>
      </Field>

      {plan.detectedPeople.length > 0 && (
        <Field label="Detected People">
          <div className="flex flex-wrap gap-1">
            {plan.detectedPeople.map((p) => (
              <span
                key={p}
                className="text-[10px] px-1.5 py-0.5 bg-accent-teal/20 text-accent-teal rounded"
              >
                {p}
              </span>
            ))}
          </div>
        </Field>
      )}

      {plan.detectedTopics.length > 0 && (
        <Field label="Detected Topics">
          <div className="flex flex-wrap gap-1">
            {plan.detectedTopics.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 bg-accent-amber/20 text-accent-amber rounded"
              >
                {t}
              </span>
            ))}
          </div>
        </Field>
      )}

      <Field label="Content Preview (editable)">
        <textarea
          value={plan.formattedContent}
          onChange={(e) =>
            update({ ...plan, formattedContent: e.target.value })
          }
          disabled={saving}
          rows={12}
          className="w-full px-2 py-1 text-xs font-mono bg-[var(--bg-card)] border border-[var(--bg-card-border)] rounded text-text-body resize-y"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
