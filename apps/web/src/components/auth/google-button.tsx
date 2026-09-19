"use client";

import { useState } from "react";
import { Button, Stack, Text } from "@chakra-ui/react";
import { signIn } from "@/lib/auth-client";

function GoogleIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * Google is both sign-in and sign-up — the provider decides which, so the same
 * button serves /login and /signup with different wording.
 */
export function GoogleButton({
  callbackURL,
  label = "Continue with Google",
}: {
  callbackURL: string;
  label?: string;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setIsRedirecting(true);

    // Better Auth's client resolves with { error } rather than rejecting, so
    // the failure has to be read off the result. On success the browser is
    // already navigating to Google, so the button stays in its loading state.
    const result = await signIn.social({ provider: "google", callbackURL });

    if (result.error) {
      setError(
        result.error.message ??
          "Could not continue with Google. Please try again.",
      );
      setIsRedirecting(false);
    }
  }

  return (
    <Stack gap="2">
      <Button
        variant="outline"
        w="full"
        loading={isRedirecting}
        onClick={() => void start()}
      >
        <GoogleIcon />
        {label}
      </Button>
      {error && (
        <Text textStyle="sm" color="fg.error" textAlign="center">
          {error}
        </Text>
      )}
    </Stack>
  );
}
