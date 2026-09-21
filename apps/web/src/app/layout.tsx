import type { Metadata } from "next";
import { Figtree } from "next/font/google";
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={figtree.variable}>
        {/* The Toaster sits here, not inside Provider: every test renders
            through Provider, and the toast machine's mount-time update would
            trip React's act() warning in tests that never toast. */}
        <Provider>
          {children}
          <Toaster />
        </Provider>
      </body>
    </html>
  );
}
