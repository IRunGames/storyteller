import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { appIcons } from "@/lib/app-icons";
import { currentEnvironment } from "@/lib/environment";
import { EmotionRegistry } from "@/components/ui/emotion-registry";
import { Provider } from "@/components/ui/provider";
import { Toaster } from "@/components/ui/toaster";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: "Storyteller",
  description: "Real-time collaborative storytelling",
  // The mark in production, the gold d20 everywhere else (lib/app-icons.ts).
  icons: appIcons(currentEnvironment()),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={figtree.variable}>
        {/* The Toaster sits here, not inside Provider: every test renders
            through Provider, and the toast machine's mount-time update would
            trip React's act() warning in tests that never toast. The
            registry is here for the same reason: it only matters to the
            server render, and in Provider every test would make a cache. */}
        <EmotionRegistry>
          <Provider>
            {children}
            <Toaster />
          </Provider>
        </EmotionRegistry>
      </body>
    </html>
  );
}
