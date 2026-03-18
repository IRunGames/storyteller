import type { Metadata } from "next";
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
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
