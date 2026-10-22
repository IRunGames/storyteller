"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  Grid,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type { z } from "zod";
import { sceneSchema, type SceneValues } from "@/lib/scene-schemas";
import { SCENE_LOCKED_STATUS, type SceneSessionOption } from "@/lib/scenes";
import type { PlayItem } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { sa_createStoryScene, sa_updateStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";
import { StatusPill } from "@/components/status/status-pill";
import { SceneElements } from "./scene-elements";

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
  /**
   * Edit scene only: where Cancel and a save go back to when the form was
   * opened from somewhere other than the board, such as a scene's preview.
   * Left out, both go back to the board.
   */
  returnTo?: string;
  /**
   * Edit scene only: the scene's stacks and the elements linked to it, for
   * the third column (sa_getScenePlaySpace).
   */
  elements?: { tags: string[]; items: PlayItem[] };
  /**
   * Edit scene only: the page has the scene's cover behind it, so each
   * column sits on a panel of its own to be read over the picture.
   */
  onCover?: boolean;
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
//
// Edit scene is laid out in three columns: the form, the pictures, and the
// elements linked to the scene in their stacks (SceneElements), which
// follow the status too, so a completed scene's stacks lock with the form.
export function SceneForm({
  idStory,
  sessions,
  scene,
  statusOptions = [],
  onCreated,
  onCancel,
  returnTo,
  elements,
  onCover = false,
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
      ? returnTo
        ? await sa_updateStoryScene(scene.idStoryScene, values, returnTo)
        : await sa_updateStoryScene(scene.idStoryScene, values)
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

  const heading = scene && (
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
  );

  const alerts = (
    <>
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
    </>
  );

  const form = (
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

        {/* Cancel at the start and the action at the end, as the element
            form's are, on New scene and Edit scene alike. */}
        <HStack justify="space-between" gap="3">
          {scene ? (
            <Button asChild variant="ghost">
              <NextLink href={returnTo ?? `/libraries/${idStory}`}>Cancel</NextLink>
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isSubmitting || isSubmitSuccessful} disabled={locked}>
            {scene ? "Save changes" : "Create scene"}
          </Button>
        </HStack>
      </Stack>
    </form>
  );

  // New scene: the fields alone, in the board's dialog.
  if (!scene) {
    return (
      <Stack gap="6">
        {alerts}
        {form}
      </Stack>
    );
  }

  // Edit scene: three columns, the form, its pictures and the scene's
  // elements, which stack one under another as the page narrows. At the
  // middle width the form and the pictures share a row and the elements
  // take the whole of the one under it, since their stacks need the room.
  return (
    <Grid
      templateColumns={{
        base: "1fr",
        lg: "repeat(2, minmax(0, 1fr))",
        xl: "repeat(3, minmax(0, 1fr))",
      }}
      gap="6"
      alignItems="start"
    >
      <Column onCover={onCover}>
        {heading}
        {alerts}
        {form}
      </Column>

      <Column onCover={onCover}>
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
            holder={{ kind: "STORY_SCENE", idExternal: scene.idStoryScene }}
            onAttached={() => setPicturesKey((key) => key + 1)}
          />
        </Stack>
      </Column>

      {/* No panel behind the elements, cover or not: the pills are part
          see-through, as on the run page, so they show the cover and stand
          apart from the opaque In this scene card inside each one. On a
          panel the two would be the same colour. */}
      <Column onCover={false} gridColumn={{ lg: "1 / -1", xl: "auto" }}>
        <SceneElements
          idStory={idStory}
          idStoryScene={scene.idStoryScene}
          initialTags={elements?.tags ?? []}
          initialItems={elements?.items ?? []}
          locked={locked}
          onCover={onCover}
        />
      </Column>
    </Grid>
  );
}

/**
 * One column of the edit page. Over the scene's cover it is a panel, mostly
 * opaque and blurring what is behind it, so the fields read against any
 * picture in any theme; on a plain page it is no box at all, since a panel
 * there would stand out from nothing.
 */
function Column({
  onCover,
  gridColumn,
  children,
}: {
  onCover: boolean;
  gridColumn?: { lg: string; xl: string };
  children: ReactNode;
}) {
  return (
    <Stack
      gap="6"
      minW="0"
      gridColumn={gridColumn}
      p={onCover ? { base: "4", md: "6" } : undefined}
      rounded={onCover ? "xl" : undefined}
      bg={onCover ? "bg.panel/90" : undefined}
      backdropFilter={onCover ? "blur(6px)" : undefined}
    >
      {children}
    </Stack>
  );
}
