import type { Metadata } from "next";
import { DM_Sans, Sora, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthModal } from "@/components/auth/AuthModal";
import { UploadToast } from "@/components/upload/UploadToast";
import { Toaster } from "@/components/ui/sonner";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { QueryProvider } from "@/lib/QueryProvider";
import "./globals.css";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Extractly | AI-Powered CV Extraction Platform",
  description: "Extract structured data from CVs at scale.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          dmSans.variable,
          sora.variable,
          jetbrainsMono.variable
        )}
      >
        <TooltipProvider>
          <QueryProvider>
            <AuthBootstrap>
              {children}
              <AuthModal />
              <UploadToast />
              <Toaster theme="dark" />
            </AuthBootstrap>
          </QueryProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
