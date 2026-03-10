import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Command Center | Sonance",
  description: "Sonance executive command center — unified view of communications, tasks, calendar, and strategic priorities.",
  icons: {
    icon: "https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png",
    apple: "https://brand.sonance.com/logos/sonance/Sonance_Logo_2C_Reverse_RGB.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Command Center",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${dmSans.variable} antialiased`}
      >
        <ToastProvider>
          {children}
        </ToastProvider>
        <div className="grain-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
