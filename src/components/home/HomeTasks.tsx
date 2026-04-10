"use client";

import { Button } from "@/components/ui/button";
import { AttentionFeedbackControl } from "@/components/ui/AttentionFeedbackControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaptureButton } from "@/components/ui/CaptureButton";
import { useVaultCaptureContext } from "@/components/modals/VaultCaptureProvider";
import type { TabId } from "@/lib/tab-config";
import { CollapsibleSection } from "./CollapsibleSection";

function formatDay(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
}

interface TaskItem {
  task: {
    id: string;
    name: string;
    permalink_url: string;
    project_name: string;
    days_overdue: number;
    due_on: string | null;
  };
  attentionTarget: unknown;
}

interface HomeTasksProps {
  tasks: TaskItem[];
  heroItemIds: Set<string>;
  onNavigate: (tab: TabId) => void;
  animDelay?: number;
}

export function HomeTasks({
  tasks,
  heroItemIds,
  onNavigate,
  animDelay = 240,
}: HomeTasksProps) {
  const { open: openCapture } = useVaultCaptureContext();
  const filtered = tasks.filter((item) => !heroItemIds.has(`task-${item.task.id}`));

  return (
    <CollapsibleSection
      storageKey="home-tasks-expanded"
      title="Priority Tasks"
      description="Overdue and near-term work that should not get buried."
      badge={filtered.length || null}
      animDelay={animDelay}
      action={
        <Button variant="ghost" size="sm" onClick={() => onNavigate("operations")}>
          Open Operations
        </Button>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState variant="all-clear" context="tasks" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map(({ task, attentionTarget }) => (
            <a
              key={task.id}
              href={task.permalink_url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[20px] border border-[var(--bg-card-border)] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    {task.project_name || "Task"}
                  </div>
                  <p className="mt-2 text-sm font-medium text-text-heading">{task.name}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {task.days_overdue > 0
                      ? `${task.days_overdue}d overdue`
                      : task.due_on
                        ? `Due ${formatDay(task.due_on)}`
                        : "No due date"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <CaptureButton
                    compact
                    content={task.name}
                    sourceType="asana"
                    sourceMeta={{
                      from: task.project_name || "Asana",
                      subject: task.name,
                      timestamp: new Date().toISOString(),
                      url: task.permalink_url,
                    }}
                    onCapture={openCapture}
                  />
                  <AttentionFeedbackControl
                    target={attentionTarget as Parameters<typeof AttentionFeedbackControl>[0]["target"]}
                    surface="home"
                    compact
                  />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
