"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Stack, Text } from "@chakra-ui/react";
import { sa_acceptInvitation } from "./actions";

/**
 * The Accept button for someone signed in with an account. The action
 * redirects on success, to the story's table or home, so the button stays
 * loading until the browser has gone; only a refusal comes back here.
 */
export function AcceptInvitationForm({ token, member }: { token: string; member: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await sa_acceptInvitation(token);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <Stack gap="4">
      {error && (
        <Alert.Root role="alert" status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <Text>
        Accepting as <strong>{member}</strong>.
      </Text>
      <Button w="full" onClick={accept} loading={isPending}>
        Accept
      </Button>
    </Stack>
  );
}
