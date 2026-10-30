import type { Metadata } from "next";
import NextLink from "next/link";
import { Box, Button, Flex, Heading, Stack, Text } from "@chakra-ui/react";
import { getSession } from "@/lib/require-session";
import { withRedirect } from "@/lib/safe-redirect";
import { pickWelcomeBackground } from "@/lib/welcome";
import { sa_getInvitation } from "./actions";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Invitation · Storyteller",
};

// An invitation's link, emailed or copied by whoever sent it: a storyteller
// inviting someone to a story, or an administrator inviting someone to the
// app with an account type. Public, so someone with no account can follow
// it; see proxy.ts.
//
// Someone signed in with an account accepts here. Anyone else, a guest
// included, is sent to sign up (with the invited address filled in) or log
// in, and comes back here to accept: one accept path for a password signup,
// a login and Google alike, and nothing changes on a GET. A link that is
// used, withdrawn or expired says so rather than 404ing, since the person
// holding it did nothing wrong.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, session] = await Promise.all([sa_getInvitation(token), getSession()]);
  const member = session && !session.user.isAnonymous ? session.user : null;
  const here = `/invite/${token}`;

  return (
    <Flex position="relative" minH="100vh" p="4" align="center" justify="center" bg="bg.subtle">
      <Box
        aria-hidden
        position="fixed"
        inset="0"
        bgSize="cover"
        bgPos="center"
        style={{ backgroundImage: `url("${pickWelcomeBackground()}")` }}
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
        {invitation === null ? (
          <Stack gap="4">
            <Heading size="xl">This invitation is no longer valid</Heading>
            <Text color="fg.muted">
              It has been used, withdrawn or has expired. Ask whoever sent it for a new one.
            </Text>
            <Button asChild variant="outline">
              <NextLink href="/">Go to Storyteller</NextLink>
            </Button>
          </Stack>
        ) : (
          <Stack gap="6">
            <Stack gap="1">
              <Text textStyle="sm" color="fg.muted">
                {invitation.inviter} invited you
              </Text>
              <Heading size="2xl">
                {invitation.story
                  ? `Play ${invitation.story.title}`
                  : `Join Storyteller as a ${invitation.userTypeName ?? "member"}`}
              </Heading>
            </Stack>

            {member ? (
              <AcceptInvitationForm token={token} member={member.name} />
            ) : (
              <Stack gap="3">
                <Text color="fg.muted">
                  Make an account to accept, or log in if you already have one.
                </Text>
                <Button asChild w="full">
                  <NextLink
                    href={`${withRedirect("/signup", here)}&email=${encodeURIComponent(invitation.email)}`}
                  >
                    Sign up
                  </NextLink>
                </Button>
                <Button asChild variant="outline" w="full">
                  <NextLink href={withRedirect("/login", here)}>Log in</NextLink>
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Flex>
  );
}
