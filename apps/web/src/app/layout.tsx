import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Provider } from "@/components/ui/provider";

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
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
