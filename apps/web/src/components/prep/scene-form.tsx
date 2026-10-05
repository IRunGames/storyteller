"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Separator,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type { z } from "zod";
import { sceneSchema, type SceneValues } from "@/lib/scene-schemas";
import { SCENE_LOCKED_STATUS, type SceneSessionOption } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { sa_createStoryScene, sa_updateStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";
import { StatusPill } from "@/components/status/status-pill";

// What the fields hold before the schema runs: the Session <select> keeps its
// raw string, and sceneSchema's preprocess turns it into a number or null.
type SceneInput = z.input<typeof sceneSchema>;

type Props = {
  /** The story the scene belongs to, and the board the edit form goes back to. */
  idStory: number;
  /** The story's sittings, for the select. */
  sessions: SceneSessionOption[];
  /**
   * The scene being edited, with its current values. Absent for New scene:
   * the same fields then start empty and create a scene instead.
   */
  scene?: {
    idStoryScene: number;
    /** The status it holds, for the pill under the heading. */
    status: string;
    values: { title: string; description: string; idStorySession: number | null };
  };
  /** The story_scenes workflow, for the edit form's pill. */
  statusOptions?: StatusOption[];
  /** New scene only: the scene is in, so the dialog it sits in can close. */
  onCreated?: () => void;
  /** New scene only: the dialog's Cancel. */
  onCancel?: () => void;
};

// One form for New scene and Edit scene, as StoryForm is for stories: the
// fields, the client check and the way server errors land are the same;
// only the heading, the buttons and the action differ. New scene sits in the
// board's dialog, which carries the title and closes when it is done; Edit
// scene is a page of its own and goes back to the board when it saves.
//
// The status pill and the pictures are on the edit form only, and both take
// effect at once rather than on Save: the pill moves the row as the board's
// card does, and each picture is an attachments row saved the moment it is
// added, as on the story page. Both need the scene to exist, so a new scene
// gets them once it has been created. Moving the pill to SCENE_LOCKED_STATUS
// finishes the scene, which the edit action then refuses to save over, so
// the form says so and Save goes quiet until it is moved back.
export function SceneForm({
  idStory,
  sessions,
  scene,
  statusOptions = [],
  onCreated,
  onCancel,
}: Props) {
  const [status, setStatus] = useState(scene?.status ?? null);
  // Bumped when the picker moves some of the story's attachments onto the
  // scene: the pictures field loads its rows once, on mount, so a new key is
  // what makes it fetch them again with the new ones in.
  const [picturesKey, setPicturesKey] = useState(0);
  const locked = status === SCENE_LOCKED_STATUS;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<SceneInput, unknown, SceneValues>({
    resolver: zodResolver(sceneSchema),
    defaultValues: scene
      ? {
          ...scene.values,
          // The select's value is a string; "" is its Not played yet option.
          idStorySession:
            scene.values.idStorySession === null ? "" : String(scene.values.idStorySession),
        }
      : { title: "", description: "", idStorySession: "" },
  });

  async function onSubmit(values: SceneValues) {
    const result = scene
      ? await sa_updateStoryScene(scene.idStoryScene, values)
      : await sa_createStoryScene(idStory, values);
    if (result.ok) {
      onCreated?.();
      return;
    }

    // An edit that saves redirects, so this never runs for it. Anything that
    // comes back is an error the client check did not catch; one with no
    // field to sit on (a scene completed since the form opened) goes on top.
    let anyField = false;
    for (const [field, message] of Object.entries(result.errors)) {
      if (field === "") continue;
      setError(field as keyof SceneInput, { message });
      anyField = true;
    }
    if (!anyField) {
      setError("root", {
        message:
          result.errors[""] ??
          (scene
            ? "Could not save the scene. Please try again."
            : "Could not create the scene. Please try again."),
      });
    }
  }

  return (
    <Stack gap="6">
      {scene && (
        <Stack gap="2" align="start">
          <Heading size="2xl">Edit scene</Heading>
          {status !== null && (
            <StatusPill
              table="story_scenes"
              id={scene.idStoryScene}
              status={status}
              options={statusOptions}
              canEdit
              onChanged={setStatus}
            />
          )}
        </Stack>
      )}

      {locked && (
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              This scene is complete, so its words can no longer be changed. Move it back to another
              status to edit it.
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

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
          <Field.Root required invalid={!!errors.title}>
            <Field.Label>Title</Field.Label>
            <Input autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.description}>
            <Field.Label>Description (optional)</Field.Label>
            {/* A line each for what happens, the NPCs in it and anything of
                note; the info panel keeps the line breaks. */}
            <Textarea rows={8} {...register("description")} />
            <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.idStorySession}>
            <Field.Label>Session (optional)</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field {...register("idStorySession")}>
                <option value="">Not played yet</option>
                {sessions.map((session) => (
                  <option key={session.idStorySession} value={session.idStorySession}>
                    {session.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.ErrorText>{errors.idStorySession?.message}</Field.ErrorText>
          </Field.Root>

          <HStack gap="3">
            <Button type="submit" loading={isSubmitting || isSubmitSuccessful} disabled={locked}>
              {scene ? "Save changes" : "Create scene"}
            </Button>
            {scene ? (
              <Button asChild variant="ghost">
                <NextLink href={`/libraries/${idStory}`}>Cancel</NextLink>
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </HStack>
        </Stack>
      </form>

      {scene && <Separator />}

      {scene && (
        <Stack gap="2">
          <Heading as="h2" size="md">
            Pictures
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            Saved as soon as they are added. The cover is the one the scene&apos;s panel shows.
          </Text>
          <AttachmentListField
            key={picturesKey}
            kind="STORY_SCENE"
            idExternal={scene.idStoryScene}
            showEmpty
          />
          <StoryAttachmentPicker
            idStory={idStory}
            idStoryScene={scene.idStoryScene}
            onAttached={() => setPicturesKey((key) => key + 1)}
          />
        </Stack>
      )}
    </Stack>
  );
}
