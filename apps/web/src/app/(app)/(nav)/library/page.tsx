import { Center, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";

// Stub so the menu bar's link lands somewhere. See home/page.tsx for why the
// page calls requireSession() itself rather than trusting the layout.
export default async function LibraryPage() {
  await requireSession();

  return (
    <Center flex="1" px="4" py="12">
      <Stack gap="2" textAlign="center">
        <Heading size="3xl">Library</Heading>
        <Text color="fg.muted">Coming soon.</Text>
      </Stack>
    </Center>
  );
}
