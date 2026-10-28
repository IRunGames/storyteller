import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Box, Flex } from "@chakra-ui/react";
import { getSession } from "@/lib/require-session";
import { randomGuestName } from "@/lib/guest-names";
import { pickWelcomeBackground } from "@/lib/welcome";
import { sa_getJoinStory } from "./actions";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Join the table · Storyteller",
};

// A story's join link, which the storyteller hands out from their table
// (JoinLinkButton). Public, so someone with no account can follow it; see
// proxy.ts. The visitor picks a name and is seated at the story, signed in
// as a guest first if they have no session (join-form.tsx), and goes on to
// the story's display table, /table/[id].
//
// Someone already at the table, its storyteller included, has nothing to
// join and is sent straight there. A code that names no story, or an
// archived one, is not found.
//
// The suggested name is picked here rather than in the form for the reason
// pickWelcomeBackground gives: a pick made while rendering on both sides
// would not match when React hydrates.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const story = await sa_getJoinStory(code);
  if (!story) notFound();
  if (story.isAtTable) redirect(`/table/${story.idStory}`);

  const session = await getSession();
  // A guest joining a second table keeps the name they already go by.
  const member = session && !session.user.isAnonymous ? session.user.name : null;
  const suggested = session?.user.isAnonymous ? session.user.name : randomGuestName();

  return (
    <Flex position="relative" minH="100vh" p="4" align="center" justify="center" bg="bg.subtle">
      <Box
        aria-hidden
        position="fixed"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: `url("${story.imageUrl ?? pickWelcomeBackground()}")` }}
      />
      <Box
        position="relative"
        maxW="md"
        w="full"
        p={{ base: "6", md: "8" }}
        rounded="xl"
        bg={{ base: "whiteAlpha.800", _dark: "blackAlpha.700" }}
        backdropFilter="blur(6px)"
      >
        <JoinForm
          code={code}
          title={story.title}
          isFull={story.isFull}
          hasSession={session !== null}
          member={member}
          suggested={suggested}
        />
      </Box>
    </Flex>
  );
}
