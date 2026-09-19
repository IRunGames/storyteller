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
import { signUp } from "@/lib/auth-client";
import {
  MIN_PASSWORD_LENGTH,
  signUpSchema,
  type SignUpValues,
} from "@/lib/auth-schemas";
import { GoogleButton } from "@/components/auth/google-button";

export function SignupForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  // `values` has already been through the schema, so name and email arrive
  // trimmed and nothing blank gets this far.
  async function onSubmit(values: SignUpValues) {
    const result = await signUp.email(values);

    if (result.error) {
      // A "root" error belongs to no field; the next submit clears it.
      setError("root", {
        message:
          result.error.message ??
          "Could not create your account. Please try again.",
      });
      return;
    }

    // Email verification is off for now, so signup leaves the user signed in
    // and we can go straight into the app.
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">Create your account</Heading>
        <Text color="fg.muted">Start telling stories together.</Text>
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
          <Field.Root required invalid={!!errors.name}>
            <Field.Label>Name</Field.Label>
            <Input autoComplete="name" {...register("name")} />
            <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root required invalid={!!errors.email}>
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="email" {...register("email")} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root required invalid={!!errors.password}>
            <Field.Label>Password</Field.Label>
            <Input
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {/* Chakra shows ErrorText only while invalid, so both can sit here. */}
            <Field.HelperText>
              At least {MIN_PASSWORD_LENGTH} characters.
            </Field.HelperText>
            <Field.ErrorText>{errors.password?.message}</Field.ErrorText>
          </Field.Root>

          {/* Stays loading after success: the browser is navigating away. */}
          <Button
            type="submit"
            loading={isSubmitting || isSubmitSuccessful}
            w="full"
          >
            Create account
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

      <GoogleButton callbackURL={redirectTo} label="Sign up with Google" />

      <Text textStyle="sm" color="fg.muted" textAlign="center">
        Already have an account?{" "}
        <Link asChild>
          <NextLink href="/login">Sign in</NextLink>
        </Link>
      </Text>
    </Stack>
  );
}
