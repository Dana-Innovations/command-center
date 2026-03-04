"use client";
import { SlackCard } from "@/components/command-center/SlackCard";
import { AIFeedCard } from "@/components/command-center/AIFeedCard";
import { JeanaSection } from "@/components/command-center/JeanaSection";
import { useTasks } from "@/hooks/useTasks";
import { useChats } from "@/hooks/useChats";
import { transformJeanaItems } from "@/lib/transformers";
import { cn } from "@/lib/utils";

function TeamsChatsCard() {
  const { chats, loading } = useChats();

  return (
    <section className="glass-card anim-card p-5">
      <h2 className="text-sm font-semibold text-text-heading mb-4 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Teams Chats
        {!loading && (
          <span className="text-[10px] bg-white/5 text-text-muted px-2 py-0.5 rounded-full">{chats.length}</span>
        )}
      </h2>

      {loading ? (
        <div className="text-sm text-text-muted animate-pulse">Loading chats…</div>
      ) : chats.length === 0 ? (
        <div className="text-sm text-text-muted">No Teams chats found.</div>
      ) : (
        <div className="space-y-0 divide-y divide-[var(--bg-card-border)]">
          {chats.map((chat, i) => {
            const topic = chat.topic || 'Teams Chat';
            const preview = chat.last_message_preview || '';
            return (
              <div key={chat.id || i} className="py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#5865f2]/20 flex items-center justify-center shrink-0 text-[10px] font-bold text-[#5865f2] mt-0.5">
                  {topic.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-heading truncate">{topic}</div>
                  {preview && (
                    <div className="text-xs text-text-muted truncate mt-0.5">{preview}</div>
                  )}
                </div>
                <span className="text-[9px] uppercase tracking-wider bg-[#5865f2]/10 text-[#5865f2] px-1.5 py-0.5 rounded shrink-0">Teams</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SignalsView() {
  const { tasks } = useTasks();
  const jeanaItems = transformJeanaItems(tasks);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TeamsChatsCard />
        <SlackCard />
      </div>
      <AIFeedCard />
      <JeanaSection items={jeanaItems} />
    </div>
  );
}
