"use client";
import { PriorityEngine } from "@/components/command-center/PriorityEngine";
import { ReplyCenter } from "@/components/command-center/ReplyCenter";
import { OverdueTasks } from "@/components/command-center/OverdueTasks";
import { usePriorityScore } from "@/hooks/usePriorityScore";
import { useTasks } from "@/hooks/useTasks";
import { transformOverdueTasks } from "@/lib/transformers";

export function PriorityView() {
  const { items: priorityItems } = usePriorityScore();
  const { tasks } = useTasks();
  const { overdue, stale } = transformOverdueTasks(tasks);

  return (
    <div className="space-y-5">
      <PriorityEngine items={priorityItems} />
      <ReplyCenter />
      {(overdue.length > 0 || stale.length > 0) && (
        <OverdueTasks items={overdue} staleItems={stale} />
      )}
    </div>
  );
}
