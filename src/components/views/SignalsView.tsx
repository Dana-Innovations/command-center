"use client";
import { SlackCard } from "@/components/command-center/SlackCard";
import { AIFeedCard } from "@/components/command-center/AIFeedCard";
import { JeanaSection } from "@/components/command-center/JeanaSection";
import { EmailHygieneCard } from "@/components/command-center/EmailHygieneCard";
import { useTasks } from "@/hooks/useTasks";
import { useChats } from "@/hooks/useChats";
import { transformJeanaItems } from "@/lib/transformers";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

function TeamsChatsCard() {
  const { chats, loading } = useChats();
  const { user } = useAuth();
  const fullName = user?.user_metadata?.full_name ?? "";

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
          {chats
            .filter(chat => {
              // Filter out self-chats (topic is own name + sender is self)
              if (fullName && chat.topic === fullName && chat.last_message_from === fullName) return false;
              // Filter out ghost chats (no topic, no preview, no sender)
              if (chat.topic === 'Teams Chat' && !chat.last_message_preview && !chat.last_message_from) return false;
              return true;
            })
            .map((chat, i) => {
            const topic = chat.topic || 'Teams Chat';
            const preview = chat.last_message_preview || '';
            const from = chat.last_message_from || '';
            const isGroup = chat.chat_type === 'group' || chat.chat_type === 'meeting';
            return (
              <div key={chat.id || i} className="py-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#5865f2]/20 flex items-center justify-center shrink-0 text-[11px] font-bold text-[#5865f2] mt-0.5">
                  {topic.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-heading truncate">{topic}</span>
                    {isGroup && <span className="text-[9px] bg-white/5 text-text-muted px-1.5 py-0.5 rounded shrink-0">group</span>}
                  </div>
                  {from && <div className="text-[11px] text-text-muted mt-0.5">{from}</div>}
                  {preview && (
                    <div className="text-xs text-text-muted/80 mt-1 line-clamp-2 leading-snug">{preview}</div>
                  )}
                  {!preview && !from && (
                    <div className="text-xs text-text-muted/40 mt-0.5 italic">No recent messages</div>
                  )}
                </div>
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
      <EmailHygieneCard />
      <AIFeedCard />
      <JeanaSection items={jeanaItems} />
    </div>
  );
}
