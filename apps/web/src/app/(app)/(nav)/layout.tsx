import { Flex } from "@chakra-ui/react";
import { AppHeader } from "@/components/nav/app-header";
import { requireSession } from "@/lib/require-session";

// Every page that carries the menu bar lives in this group. Play sits outside
// it, directly under (app), because it draws its own chrome.
//
// requireSession() is memoised per request, so this costs nothing beyond the
// lookup (app)/layout.tsx already makes; it just gives us the user for the bar.
export default async function NavLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <Flex direction="column" minH="100vh">
      <AppHeader user={session.user} />
      {children}
    </Flex>
  );
}
