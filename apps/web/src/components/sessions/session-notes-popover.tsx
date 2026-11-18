"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, HStack, Skeleton, Stack, Textarea } from "@chakra-ui/react";
import { sessionNotesSchema, type SessionNotesValues } from "@/lib/session-schemas";
import { applyActionErrors } from "@/lib/forms";
import { InfoPopoverShell } from "@/components/popovers/info-popover-shell";
import { toaster } from "@/components/ui/toaster";
import { FormError } from "@/components/forms/form-error";
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
 * for the storyteller at /stories/[id]/run and the players at
 * /stories/[id]/play alike, so what is being kept about the sitting can be
 * written up as it is played. The shell (InfoPopoverShell) draws the form
 * only while the panel is open, and it reads the session as it opens, so
 * each opening starts from what is stored now, whoever last saved it. The
 * first field takes focus as the panel opens.
 */
export function SessionNotesPopover({ idStorySession, heading }: Props) {
  return (
    <InfoPopoverShell
      label="Session notes"
      tooltip="Notes and lingering questions"
      heading={heading}
      placement="bottom-start"
      width="md"
      initialFocus="textarea"
    >
      {(close) => (
        <SessionNotesForm
          idStorySession={idStorySession}
          onSaved={() => {
            close();
            toaster.create({ title: "Session saved", type: "success" });
          }}
          onCancel={close}
        />
      )}
    </InfoPopoverShell>
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
    applyActionErrors(
      { setError },
      result.errors,
      FIELDS.map((field) => field.name),
    );
  }

  if (loaded === "loading") {
    return (
      <Stack gap="3" data-testid="session-notes-loading">
        <Skeleton h="24" />
        <Skeleton h="24" />
      </Stack>
    );
  }
  if (loaded === "refused") {
    return <FormError message="This session is not at a table of yours." />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        <FormError message={errors.root?.message} />
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
