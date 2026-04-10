"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useVaultCapture, type UseVaultCaptureReturn } from "@/hooks/useVaultCapture";
import { CaptureDrawer } from "@/components/modals/CaptureDrawer";

const VaultCaptureContext = createContext<UseVaultCaptureReturn | null>(null);

export function VaultCaptureProvider({ children }: { children: ReactNode }) {
  const capture = useVaultCapture();
  return (
    <VaultCaptureContext.Provider value={capture}>
      {children}
      <CaptureDrawer capture={capture} />
    </VaultCaptureContext.Provider>
  );
}

export function useVaultCaptureContext(): UseVaultCaptureReturn {
  const ctx = useContext(VaultCaptureContext);
  if (!ctx) {
    throw new Error(
      "useVaultCaptureContext must be used within <VaultCaptureProvider>"
    );
  }
  return ctx;
}
