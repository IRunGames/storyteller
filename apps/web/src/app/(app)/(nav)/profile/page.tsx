import { Center, Heading, Stack, Text } from "@chakra-ui/react";
import { requireSession } from "@/lib/require-session";

// Stub reached from the account menu. See home/page.tsx for why the page
// calls requireSession() itself rather than trusting the layout.
export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <Center flex="1" px="4" py="12">
      <Stack gap="2" textAlign="center">
        <Heading size="3xl">{session.user.name}</Heading>
        <Text color="fg.muted">{session.user.email}</Text>
        <Text color="fg.muted">Profile settings are coming soon.</Text>
      </Stack>
    </Center>
  );
}
