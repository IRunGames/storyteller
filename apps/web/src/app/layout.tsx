import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import ThemeRegistry from "@/theme/ThemeRegistry";

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
    <html lang="en">
      <body>
        <SessionProvider>
          <ThemeRegistry>{children}</ThemeRegistry>
        </SessionProvider>
      </body>
    </html>
  );
}
