import { redirect } from "next/navigation";
import { Flex } from "@chakra-ui/react";
import { AppHeader } from "@/components/nav/app-header";
import { requireUser } from "@/lib/authorize";

// Every page that carries the menu bar lives in this group, the Play primer
// included. Only the tables, (app)/play/[id], (app)/run/[id] and
// (app)/table/[id], sit outside it, because they draw their own chrome.
//
// (app)/layout.tsx above is the gate and mounts UserProvider, and the header
// reads the user from that. The one thing checked here is a guest: someone
// who came in by a join link holds a session but has no account, so nothing
// behind the menu bar is theirs. Signing up keeps the tables they joined
// (lib/auth.ts). requireUser() is memoised per request, so this costs no
// second lookup.
export default async function NavLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.isAnonymous) redirect("/signup");

  return (
    <Flex direction="column" minH="100vh">
      <AppHeader />
      {children}
    </Flex>
  );
}
