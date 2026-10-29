"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  Heading,
  IconButton,
  Input,
  InputGroup,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { Dices } from "lucide-react";
import { randomGuestName } from "@/lib/guest-names";
import { joinSchema, type JoinValues } from "@/lib/join-schemas";
import { sa_joinAsGuest, sa_joinByLink } from "./actions";

type Props = {
  code: string;
  title: string;
  isFull: boolean;
  /** The visitor already has a session, their own or a guest's. */
  hasSession: boolean;
  /** The name of a visitor with an account, who joins as themselves. */
  member: string | null;
  /** The name the field starts with: a random one, or a guest's own. */
  suggested: string;
};

/**
 * Takes a seat at a story from its join link. A visitor with no session is
 * made a guest by the server as they are seated (sa_joinAsGuest), named by
 * the nickname they pick. Someone with an account joins under their own
 * name and is not asked for one.
 */
export function JoinForm({ code, title, isFull, hasSession, member, suggested }: Props) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    // Someone with an account sends their own name, which the action ignores
    // for them, so the schema is still met.
    defaultValues: { nickname: member ?? suggested },
  });

  async function onSubmit(values: JoinValues) {
    const joined = hasSession
      ? await sa_joinByLink(code, values.nickname)
      : await sa_joinAsGuest(code, values.nickname);
    if (!joined.ok) {
      setError("root", { message: joined.error });
      return;
    }
    router.push(`/table/${joined.idStory}`);
    // The pages were rendered with no session; refresh re-runs them with
    // the guest's cookie in place.
    router.refresh();
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Text textStyle="sm" color="fg.muted">
          You&apos;re invited to the table
        </Text>
        <Heading size="2xl">{title}</Heading>
      </Stack>

      {isFull ? (
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              This table is full. Ask the storyteller to make room for you.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack gap="4">
            {errors.root && (
              <Alert.Root status="error">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{errors.root.message}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}

            {member === null ? (
              <Field.Root required invalid={!!errors.nickname}>
                <Field.Label>What should the table call you?</Field.Label>
                <InputGroup
                  endElement={
                    <RerollButton
                      onRoll={(name) => setValue("nickname", name, { shouldValidate: true })}
                    />
                  }
                >
                  <Input autoComplete="nickname" {...register("nickname")} />
                </InputGroup>
                <Field.ErrorText>{errors.nickname?.message}</Field.ErrorText>
              </Field.Root>
            ) : (
              <Text>
                Joining as <strong>{member}</strong>.
              </Text>
            )}

            {/* Stays loading after success: the browser is navigating away. */}
            <Button type="submit" loading={isSubmitting || isSubmitSuccessful} w="full">
              Join
            </Button>
          </Stack>
        </form>
      )}
    </Stack>
  );
}

function RerollButton({ onRoll }: { onRoll: (name: string) => void }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="Another name"
          variant="ghost"
          size="xs"
          me="-2"
          onClick={() => onRoll(randomGuestName())}
        >
          <Dices />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>Another name</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
