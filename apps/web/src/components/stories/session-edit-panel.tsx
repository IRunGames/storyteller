"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  Input,
  List,
  NativeSelect,
  Skeleton,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { Minus } from "lucide-react";
import {
  sessionEditSchema,
  type SessionEditInput,
  type SessionEditValues,
} from "@/lib/session-schemas";
import { SCENE_LOCKED_STATUS } from "@/lib/scenes";
import type { SessionForEdit } from "@/lib/stories";
import { sa_getSessionForEdit, sa_updateStorySession } from "@/app/(app)/(nav)/stories/actions";
import { sa_setLiveSceneSession } from "@/app/(app)/scenes/[id]/live/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";

type Props = {
  idStorySession: number;
  /** The title as saved, for the row to show. */
  onSaved: (title: string | null) => void;
  onClose: () => void;
};

const FIELDS = ["title", "summary", "notes", "lingeringQuestions"] as const;

/**
 * A Timeline row's edit panel, opened in place under the row by its pencil:
 * the session's title, summary, notes and lingering questions, saved
 * together (sa_updateStorySession), with Cancel at the start and Save at the
 * end. Read as it opens, so it starts from the session as stored.
 *
 * Under the fields, the scenes played in the session: each with a − that
 * takes it out of the session, and a select of the story's other scenes to
 * put one in. Those take effect at once, as the live-edit page's session
 * select does (sa_setLiveSceneSession), rather than waiting for Save. A
 * complete scene was played somewhere, so its − is off: it can only move
 * to another session, from that session's panel.
 */
export function SessionEditPanel({ idStorySession, onSaved, onClose }: Props) {
  const [loaded, setLoaded] = useState<SessionForEdit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    sa_getSessionForEdit(idStorySession)
      .then((found) => {
        if (!live) return;
        if (found) setLoaded(found);
        else setError("This session is no longer here.");
      })
      .catch(() => live && setError("Could not load the session."));
    return () => {
      live = false;
    };
  }, [idStorySession]);

  if (error) {
    return (
      <Alert.Root status="error" size="sm">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }
  if (!loaded) {
    return (
      <Stack gap="3" data-testid="session-edit-loading">
        <Skeleton h="8" />
        <Skeleton h="16" />
      </Stack>
    );
  }
  return (
    <SessionEditForm
      session={loaded}
      onScenesChange={(scenes) => setLoaded((current) => current && { ...current, scenes })}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

function SessionEditForm({
  session,
  onScenesChange,
  onSaved,
  onClose,
}: {
  session: SessionForEdit;
  onScenesChange: (scenes: SessionForEdit["scenes"]) => void;
  onSaved: (title: string | null) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SessionEditInput, unknown, SessionEditValues>({
    resolver: zodResolver(sessionEditSchema),
    defaultValues: session.values,
  });

  async function onSubmit(values: SessionEditValues) {
    let result: Awaited<ReturnType<typeof sa_updateStorySession>>;
    try {
      result = await sa_updateStorySession(session.idStorySession, values);
    } catch {
      setError("root", { message: "Could not save the session. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result.title);
      onClose();
      toaster.create({ title: "Session saved", type: "success" });
      return;
    }
    for (const [field, message] of Object.entries(result.errors)) {
      const known = (FIELDS as readonly string[]).includes(field);
      setError(known ? (field as (typeof FIELDS)[number]) : "root", { message });
    }
  }

  // A scene put into this session, or taken out: at once, and the list
  // follows what the action answers.
  async function moveScene(idStoryScene: number, into: number | null) {
    try {
      const result = await sa_setLiveSceneSession(session.idStory, idStoryScene, into);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      onScenesChange(
        session.scenes.map((scene) =>
          scene.idStoryScene === idStoryScene ? { ...scene, idStorySession: into } : scene,
        ),
      );
    } catch {
      toaster.create({ title: "The scene could not be moved. Try again.", type: "error" });
    }
  }

  const inSession = session.scenes.filter(
    (scene) => scene.idStorySession === session.idStorySession,
  );
  const others = session.scenes.filter((scene) => scene.idStorySession !== session.idStorySession);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        {errors.root && (
          <Alert.Root status="error" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{errors.root.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <Field.Root invalid={!!errors.title}>
          <Field.Label>Title (optional)</Field.Label>
          <Input size="sm" autoComplete="off" {...register("title")} />
          <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.summary}>
          <Field.Label>Summary (optional)</Field.Label>
          <Textarea size="sm" rows={3} {...register("summary")} />
          <Field.ErrorText>{errors.summary?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.notes}>
          <Field.Label>Notes (optional)</Field.Label>
          <Textarea size="sm" rows={3} {...register("notes")} />
          <Field.ErrorText>{errors.notes?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.lingeringQuestions}>
          <Field.Label>Lingering questions (optional)</Field.Label>
          <Textarea size="sm" rows={3} {...register("lingeringQuestions")} />
          <Field.ErrorText>{errors.lingeringQuestions?.message}</Field.ErrorText>
        </Field.Root>

        <Stack gap="2">
          <Text textStyle="sm" fontWeight="medium">
            Scenes
          </Text>
          {inSession.length === 0 ? (
            <Text textStyle="sm" color="fg.muted">
              No scenes in this session.
            </Text>
          ) : (
            <List.Root gap="1" listStyleType="none" aria-label="Scenes in this session">
              {inSession.map((scene) => {
                const locked = scene.status === SCENE_LOCKED_STATUS;
                return (
                  <List.Item key={scene.idStoryScene}>
                    <HStack gap="1" justify="space-between">
                      <Text textStyle="sm" truncate>
                        {scene.title}
                      </Text>
                      <PrepIconButton
                        label={
                          locked
                            ? "A complete scene keeps its session"
                            : `Remove ${scene.title} from this session`
                        }
                        onClick={() => {
                          if (!locked) void moveScene(scene.idStoryScene, null);
                        }}
                        outlined
                      >
                        <Minus />
                      </PrepIconButton>
                    </HStack>
                  </List.Item>
                );
              })}
            </List.Root>
          )}
          {others.length > 0 && (
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                aria-label="Add a scene to this session"
                value=""
                onChange={(event) => {
                  if (event.target.value !== "") {
                    void moveScene(Number(event.target.value), session.idStorySession);
                  }
                }}
              >
                <option value="">Add a scene…</option>
                {others.map((scene) => (
                  <option key={scene.idStoryScene} value={scene.idStoryScene}>
                    {/* A scene already in another sitting moves from it. */}
                    {scene.idStorySession === null
                      ? scene.title
                      : `${scene.title} (from another session)`}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
        </Stack>

        {/* Cancel at the start and the action at the end, as the forms lay
            them out. */}
        <HStack justify="space-between" pt="1">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save session
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
