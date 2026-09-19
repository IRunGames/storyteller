"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  Heading,
  Input,
  Link,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import { signIn } from "@/lib/auth-client";
import { signInSchema, type SignInValues } from "@/lib/auth-schemas";
import { GoogleButton } from "@/components/auth/google-button";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    const result = await signIn.email(values);

    if (result.error) {
      // Better Auth deliberately returns the same message for an unknown email
      // and a wrong password, so this does not leak which accounts exist.
      // A "root" error belongs to no field; the next submit clears it.
      setError("root", {
        message:
          result.error.message ?? "Could not sign you in. Please try again.",
      });
      return;
    }

    router.push(redirectTo);
    // Server Components cached the signed-out state; refresh re-runs the
    // layout session check with the new cookie in place.
    router.refresh();
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">Welcome back</Heading>
        <Text color="fg.muted">Sign in to continue your story.</Text>
      </Stack>

      {errors.root && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{errors.root.message}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap="4">
          <Field.Root required invalid={!!errors.email}>
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="email" {...register("email")} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root required invalid={!!errors.password}>
            <Field.Label>Password</Field.Label>
            <Input
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>

          {/* Stays loading after success: the browser is navigating away. */}
          <Button
            type="submit"
            loading={isSubmitting || isSubmitSuccessful}
            w="full"
          >
            Sign in
          </Button>
        </Stack>
      </form>

      <HStack gap="3">
        <Separator flex="1" />
        <Text textStyle="xs" color="fg.muted" whiteSpace="nowrap">
          OR
        </Text>
        <Separator flex="1" />
      </HStack>

      <GoogleButton callbackURL={redirectTo} />

      <Text textStyle="sm" color="fg.muted" textAlign="center">
        Don&apos;t have an account?{" "}
        <Link asChild>
          <NextLink href="/signup">Sign up</NextLink>
        </Link>
      </Text>
    </Stack>
  );
}
