"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, HStack, Input, NativeSelect, Stack } from "@chakra-ui/react";
import { sa_inviteToApp, type AdminInvitation } from "@/app/(app)/(nav)/admin/invitations/actions";
import { copyInviteLink } from "@/components/invitations/copy-invite-link-button";
import { toaster } from "@/components/ui/toaster";
import {
  appInviteSchema,
  INVITE_USER_TYPES,
  type AppInviteInput,
  type AppInviteValues,
} from "@/lib/invitation-schemas";
import { USER_TYPES } from "@/lib/user-types";

/**
 * The administrators' New invitation form: an address and the paid account
 * type to give it, Paid Player unless changed. Send invite mails it; Copy
 * link makes the same invitation and copies its link instead. Either way
 * the new row is handed up for the table to show.
 */
export function NewInvitationForm({ onInvited }: { onInvited: (row: AdminInvitation) => void }) {
  const [sending, setSending] = useState<"send" | "copy" | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AppInviteInput, unknown, AppInviteValues>({
    resolver: zodResolver(appInviteSchema),
    defaultValues: { email: "", idUserType: String(USER_TYPES.paidPlayer) },
  });

  function invite(send: boolean) {
    return handleSubmit(async (values) => {
      setSending(send ? "send" : "copy");
      try {
        const result = await sa_inviteToApp(values, send);
        if (!result.ok) {
          for (const [field, message] of Object.entries(result.errors)) {
            setError(field === "email" || field === "idUserType" ? field : "root", { message });
          }
          return;
        }
        onInvited(result.invitation);
        reset({ email: "", idUserType: String(values.idUserType) });
        if (!send) {
          await copyInviteLink(result.invitation.token);
        } else if (result.emailed) {
          toaster.create({
            title: `Invitation sent to ${result.invitation.email}.`,
            type: "success",
          });
        } else {
          setError("root", {
            message:
              "The invitation was made, but the email could not be sent. Copy its link from the list instead.",
          });
        }
      } catch {
        setError("root", { message: "Could not make the invitation. Please try again." });
      } finally {
        setSending(null);
      }
    });
  }

  return (
    <form onSubmit={invite(true)} noValidate aria-label="New invitation">
      <Stack gap="3">
        {errors.root && (
          <Alert.Root role="alert" status="error" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{errors.root.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <HStack gap="3" align="flex-start" wrap="wrap">
          <Field.Root required invalid={!!errors.email} flex="1" minW="60">
            <Field.Label>Email</Field.Label>
            <Input type="email" autoComplete="off" {...register("email")} />
            <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root required invalid={!!errors.idUserType} w="auto">
            <Field.Label>Account type</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field {...register("idUserType")}>
                {INVITE_USER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.ErrorText>{errors.idUserType?.message}</Field.ErrorText>
          </Field.Root>
        </HStack>
        <HStack justify="flex-end" gap="2">
          <Button
            type="button"
            variant="outline"
            onClick={invite(false)}
            disabled={isSubmitting}
            loading={sending === "copy"}
          >
            Copy link
          </Button>
          <Button type="submit" disabled={isSubmitting} loading={sending === "send"}>
            Send invite
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
