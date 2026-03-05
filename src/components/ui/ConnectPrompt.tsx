"use client";

interface ConnectPromptProps {
  service: string;
}

export function ConnectPrompt({ service }: ConnectPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <p className="text-sm text-text-muted">
        Connect <span className="text-text-body font-medium">{service}</span> in Cortex to see your data
      </p>
    </div>
  );
}
