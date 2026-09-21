import { Flex } from "@chakra-ui/react";
import { AppHeader } from "@/components/nav/app-header";

// Every page that carries the menu bar lives in this group. Play sits outside
// it, directly under (app), because it draws its own chrome.
//
// No session read here: (app)/layout.tsx above is the gate and mounts
// UserProvider, and the header reads the user from that.
export default function NavLayout({ children }: { children: React.ReactNode }) {
  return (
    <Flex direction="column" minH="100vh">
      <AppHeader />
      {children}
    </Flex>
  );
}
