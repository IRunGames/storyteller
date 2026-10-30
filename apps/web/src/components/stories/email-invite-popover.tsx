"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  Popover,
  Portal,
  Separator,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Mail, X } from "lucide-react";
import {
  sa_inviteToStory,
  sa_listStoryInvitations,
  sa_revokeStoryInvitation,
  type StoryInvitation,
} from "@/app/(app)/(nav)/stories/actions";
import {
  copyInviteLink,
  CopyInviteLinkButton,
} from "@/components/invitations/copy-invite-link-button";
import { toaster } from "@/components/ui/toaster";
import {
  storyInviteSchema,
  type StoryInviteInput,
  type StoryInviteValues,
} from "@/lib/invitation-schemas";

/**
 * The Invite by email button beside Invite Players, for someone who may not
 * have an account yet. The storyteller types an address and either sends
 * the invitation by mail or copies its link to send some other way; either
 * makes the same invitation (sa_inviteToStory). Whoever follows the link
 * makes an account or logs in and accepts, and only then takes a seat, so
 * nothing is added to the Players list from here.
 *
 * Below the form are the invitations still waiting, each with its link to
 * copy again and a way to withdraw it. They are loaded each time the
 * popover opens rather than kept, so another tab's sends show up.
 */
export function EmailInvitePopover({ idStory }: { idStory: number }) {
  const [waiting, setWaiting] = useState<StoryInvitation[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StoryInviteInput, unknown, StoryInviteValues>({
    resolver: zodResolver(storyInviteSchema),
    defaultValues: { email: "" },
  });
  // Which button submitted, so only that one spins.
  const [sending, setSending] = useState<"send" | "copy" | null>(null);

  async function load() {
    setLoadFailed(false);
    try {
      setWaiting(await sa_listStoryInvitations(idStory));
    } catch {
      setLoadFailed(true);
    }
  }

  function invite(send: boolean) {
    return handleSubmit(async (values) => {
      setSending(send ? "send" : "copy");
      try {
        const result = await sa_inviteToStory(idStory, values, send);
        if (!result.ok) {
          for (const [field, message] of Object.entries(result.errors)) {
            setError(field === "email" ? "email" : "root", { message });
          }
          return;
        }
        reset();
        setWaiting((current) => [result.invitation, ...(current ?? [])]);
        if (!send) {
          // The clipboard can refuse a write this long after the click; the
          // invitation is listed below either way, with its own copy button.
          await copyInviteLink(result.invitation.token);
        } else if (result.emailed) {
          toaster.create({
            title: `Invitation sent to ${result.invitation.email}.`,
            type: "success",
          });
        } else {
          setError("root", {
            message:
              "The invitation was made, but the email could not be sent. Copy its link below instead.",
          });
        }
      } catch {
        setError("root", { message: "Could not make the invitation. Please try again." });
      } finally {
        setSending(null);
      }
    });
  }

  async function revoke(invitation: StoryInvitation) {
    try {
      await sa_revokeStoryInvitation(idStory, invitation.idInvitation);
      setWaiting((current) =>
        (current ?? []).filter((row) => row.idInvitation !== invitation.idInvitation),
      );
    } catch {
      setError("root", { message: "Could not withdraw the invitation. Please try again." });
    }
  }

  return (
    <Popover.Root
      positioning={{ placement: "bottom-start" }}
      onOpenChange={(details) => {
        if (details.open) void load();
        else reset();
      }}
    >
      <Popover.Trigger asChild>
        <Button variant="outline" size="sm">
          <Mail size={16} />
          Invite by Email
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm">
            <Popover.Arrow />
            <Popover.Header fontWeight="semibold">
              <Popover.Title>Invite by email</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <Stack gap="4">
                <Text textStyle="sm" color="fg.muted">
                  They make an account, or log in, and accept to take a seat.
                </Text>

                {errors.root && (
                  <Alert.Root role="alert" status="error" size="sm">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{errors.root.message}</Alert.Description>
                    </Alert.Content>
                  </Alert.Root>
                )}

                <form onSubmit={invite(true)} noValidate>
                  <Stack gap="3">
                    <Field.Root required invalid={!!errors.email}>
                      <Field.Label>Email</Field.Label>
                      <Input type="email" autoComplete="off" {...register("email")} />
                      <Field.ErrorText>{errors.email?.message}</Field.ErrorText>
                    </Field.Root>
                    <HStack justify="flex-end" gap="2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={invite(false)}
                        disabled={isSubmitting}
                        loading={sending === "copy"}
                      >
                        Copy link
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmitting}
                        loading={sending === "send"}
                      >
                        Send invite
                      </Button>
                    </HStack>
                  </Stack>
                </form>

                {loadFailed && (
                  <Text textStyle="sm" color="fg.muted">
                    The waiting invitations could not be loaded.
                  </Text>
                )}
                {waiting && waiting.length > 0 && (
                  <>
                    <Separator />
                    <Stack gap="2" as="ul" aria-label="Waiting invitations">
                      {waiting.map((invitation) => (
                        <HStack as="li" key={invitation.idInvitation} gap="1">
                          <Text flex="1" textStyle="sm" truncate>
                            {invitation.email}
                          </Text>
                          <CopyInviteLinkButton token={invitation.token} email={invitation.email} />
                          <RevokeButton
                            email={invitation.email}
                            onRevoke={() => void revoke(invitation)}
                          />
                        </HStack>
                      ))}
                    </Stack>
                  </>
                )}
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function RevokeButton({ email, onRevoke }: { email: string; onRevoke: () => void }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={`Withdraw the invitation to ${email}`}
          variant="ghost"
          size="xs"
          onClick={onRevoke}
        >
          <X />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Withdraw</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
