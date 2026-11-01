"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  IconButton,
  Popover,
  Portal,
  Skeleton,
  Stack,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { Info } from "lucide-react";
import { sessionNotesSchema, type SessionNotesValues } from "@/lib/session-schemas";
import { toaster } from "@/components/ui/toaster";
import { sa_getSessionNotes, sa_setSessionNotes } from "./actions";

type Props = {
  idStorySession: number;
  /** The session's heading, which heads the panel. */
  heading: string;
};

const FIELDS = [
  { name: "notes", label: "Notes" },
  { name: "lingeringQuestions", label: "Lingering questions" },
] as const;

/**
 * The info button beside the session's heading at either table, and the
 * panel it opens: the session's notes and lingering questions in a form,
 * for the storyteller at /run and the players at /play alike, so what is
 * being kept about the sitting can be written up as it is played. The form
 * is only drawn while the panel is open and reads the session as it opens,
 * so each opening starts from what is stored now, whoever last saved it.
 */
export function SessionNotesPopover({ idStorySession, heading }: Props) {
  // Tooltip and popover each look their trigger up by id; sharing one keeps
  // the popover from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  // The first field takes focus once the panel has loaded: zag would
  // otherwise settle focus on the panel itself a moment after opening.
  const content = useRef<HTMLDivElement>(null);

  return (
    <Popover.Root
      ids={{ trigger: triggerId }}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "bottom-start" }}
      initialFocusEl={() => content.current?.querySelector("textarea") ?? null}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Session notes"
              aria-expanded={open}
              size="xs"
              variant="ghost"
              rounded="full"
            >
              <Info />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Notes and lingering questions</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content ref={content} w="md" maxH="80vh" overflowY="auto">
            <Popover.Arrow />
            <Popover.Header>
              <Popover.Title fontWeight="semibold">{heading}</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              {open && (
                <SessionNotesForm
                  idStorySession={idStorySession}
                  onSaved={() => {
                    setOpen(false);
                    toaster.create({ title: "Session saved", type: "success" });
                  }}
                  onCancel={() => setOpen(false)}
                />
              )}
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

type FormProps = {
  idStorySession: number;
  onSaved: () => void;
  onCancel: () => void;
};

/**
 * The panel's two text areas, read from the session as the form mounts
 * (sa_getSessionNotes) and saved together (sa_setSessionNotes). A session
 * the action will not hand over, which the button should never be drawn
 * for, is said so in place of the fields.
 */
function SessionNotesForm({ idStorySession, onSaved, onCancel }: FormProps) {
  const [loaded, setLoaded] = useState<"loading" | "ready" | "refused">("loading");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SessionNotesValues>({
    resolver: zodResolver(sessionNotesSchema),
    defaultValues: { notes: "", lingeringQuestions: "" },
  });

  useEffect(() => {
    let cancelled = false;
    sa_getSessionNotes(idStorySession).then((notes) => {
      if (cancelled) return;
      if (notes === null) {
        setLoaded("refused");
        return;
      }
      reset({ notes: notes.notes ?? "", lingeringQuestions: notes.lingeringQuestions ?? "" });
      setLoaded("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [idStorySession, reset]);

  async function onSubmit(values: SessionNotesValues) {
    const result = await sa_setSessionNotes(idStorySession, values);
    if (result.ok) {
      onSaved();
      return;
    }
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field === "root" ? "root" : (field as keyof SessionNotesValues), { message });
    }
  }

  if (loaded === "loading") {
    return (
      <Stack gap="3" data-testid="session-notes-loading">
        <Skeleton h="24" />
        <Skeleton h="24" />
      </Stack>
    );
  }
  // role="alert" on both, which Chakra's Alert does not set itself.
  if (loaded === "refused") {
    return (
      <Alert.Root role="alert" status="error">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>This session is not at a table of yours.</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        {errors.root && (
          <Alert.Root role="alert" status="error">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{errors.root.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        {FIELDS.map((field) => (
          <Field.Root key={field.name} invalid={!!errors[field.name]}>
            <Field.Label>{field.label}</Field.Label>
            <Textarea rows={5} {...register(field.name)} />
            <Field.ErrorText>{errors[field.name]?.message}</Field.ErrorText>
          </Field.Root>
        ))}
        <HStack justify="flex-end" gap="2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
