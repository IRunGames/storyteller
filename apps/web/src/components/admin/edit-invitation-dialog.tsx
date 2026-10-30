"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  NativeSelect,
  Portal,
  Stack,
  Tooltip,
} from "@chakra-ui/react";
import { Pencil } from "lucide-react";
import {
  sa_resendInvitation,
  sa_updateInvitation,
  type AdminInvitation,
} from "@/app/(app)/(nav)/admin/invitations/actions";
import { toaster } from "@/components/ui/toaster";
import {
  INVITE_USER_TYPES,
  invitationEditSchema,
  type InvitationEditInput,
  type InvitationEditValues,
} from "@/lib/invitation-schemas";

/** yyyy-mm-dd of a date in the browser's zone, for a date input. */
function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Props = {
  invitation: AdminInvitation;
  onSaved: (invitation: AdminInvitation) => void;
};

/**
 * The pencil on a row of the Invitations table and its dialog: the address,
 * the account type for an app invitation, and the day the link stops
 * working. Setting a later day is how an expired invitation is brought back.
 * An accepted invitation cannot be changed, so its pencil is
 * aria-disabled, kept focusable so the tooltip can say why.
 *
 * Resend lives here too: an address that was just corrected is the usual
 * reason to send again.
 */
export function EditInvitationDialog({ invitation, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [isResending, setResending] = useState(false);
  const locked = invitation.status === "accepted";
  const isApp = invitation.kind === "app";
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationEditInput, unknown, InvitationEditValues>({
    resolver: zodResolver(invitationEditSchema),
  });

  function start() {
    reset({
      email: invitation.email,
      idUserType: isApp ? (invitation.idUserType ?? undefined) : undefined,
      expiresOn: dayOf(invitation.expiresAt),
    });
    setOpen(true);
  }

  async function save(values: InvitationEditValues) {
    try {
      const result = await sa_updateInvitation(invitation.idInvitation, values);
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.errors)) {
          const known = field === "email" || field === "idUserType" || field === "expiresOn";
          setError(known ? field : "root", { message });
        }
        return;
      }
      onSaved(result.invitation);
      setOpen(false);
      toaster.create({ title: "Invitation saved.", type: "success" });
    } catch {
      setError("root", { message: "The invitation could not be saved. Try again." });
    }
  }

  async function resend() {
    setResending(true);
    try {
      const { ok } = await sa_resendInvitation(invitation.idInvitation);
      if (ok) toaster.create({ title: `Sent to ${invitation.email} again.`, type: "success" });
      else setError("root", { message: "The email could not be sent. Copy the link instead." });
    } catch {
      setError("root", { message: "The email could not be sent. Copy the link instead." });
    } finally {
      setResending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
        <Tooltip.Trigger asChild>
          <IconButton
            type="button"
            aria-label={`Edit the invitation to ${invitation.email}`}
            aria-disabled={locked || undefined}
            variant="ghost"
            size="xs"
            opacity={locked ? 0.4 : undefined}
            onClick={() => {
              if (!locked) start();
            }}
          >
            <Pencil />
          </IconButton>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {locked ? "Accepted, so it cannot be changed" : "Edit"}
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <form onSubmit={handleSubmit(save)} noValidate>
              <Dialog.Header>
                <Dialog.Title>Edit invitation</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="4">
                  {errors.root && (
                    <Alert.Root role="alert" status="error" size="sm">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{errors.root.message}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                  <Field.Root required invalid={!!errors.email}>
                    <Field.Label>Email</Field.Label>
                    <Input type="email" autoComplete="off" {...register("email")} />
                    <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                  </Field.Root>
                  {isApp && (
                    <Field.Root required invalid={!!errors.idUserType}>
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
                  )}
                  <Field.Root required invalid={!!errors.expiresOn}>
                    <Field.Label>Link works until</Field.Label>
                    <Input type="date" {...register("expiresOn")} />
                    <Field.ErrorText>{errors.expiresOn?.message}</Field.ErrorText>
                  </Field.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                {invitation.status === "pending" && (
                  <Box flex="1">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void resend()}
                      loading={isResending}
                    >
                      Resend email
                    </Button>
                  </Box>
                )}
                <Dialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button type="submit" loading={isSubmitting}>
                  Save
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
