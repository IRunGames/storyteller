"use client";

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
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type { z } from "zod";
import { sceneSchema, type SceneValues } from "@/lib/scene-schemas";
import type { SceneSessionOption } from "@/lib/scenes";
import { sa_createStoryScene, sa_updateStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";

// What the fields hold before the schema runs: the Session <select> keeps its
// raw string, and sceneSchema's preprocess turns it into a number or null.
type SceneInput = z.input<typeof sceneSchema>;

type Props = {
  /** The story the scene belongs to, and the board both buttons go back to. */
  idStory: number;
  /** For the New scene heading's line under it; the edit form goes without. */
  storyTitle?: string;
  /** The story's sittings, for the select. */
  sessions: SceneSessionOption[];
  /**
   * The scene being edited, with its current values. Absent for New scene:
   * the same fields then start empty and create a scene instead.
   */
  scene?: {
    idStoryScene: number;
    values: { title: string; description: string; idStorySession: number | null };
  };
};

// One form for New scene and Edit scene, as StoryForm is for stories: the
// fields, the client check and the way server errors land are the same;
// only the heading, the button and the action differ.
//
// The pictures are on the edit form only. Each one is an attachments row
// saved the moment it is added, as on the story page, so it needs the scene
// to exist; a new scene gets its pictures once it has been created.
export function SceneForm({ idStory, storyTitle, sessions, scene }: Props) {
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

    // On success the action redirects and this never runs. Anything that
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
      <Stack gap="1">
        <Heading size="2xl">{scene ? "Edit scene" : "New scene"}</Heading>
        {storyTitle && <Text color="fg.muted">For {storyTitle}.</Text>}
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
            <Button type="submit" loading={isSubmitting || isSubmitSuccessful}>
              {scene ? "Save changes" : "Create scene"}
            </Button>
            <Button asChild variant="ghost">
              <NextLink href={`/libraries/${idStory}`}>Cancel</NextLink>
            </Button>
          </HStack>
        </Stack>
      </form>

      {scene && (
        <Stack gap="2">
          <Heading as="h2" size="md">
            Pictures
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            Saved as soon as they are added. The cover is the one the scene&apos;s panel shows.
          </Text>
          <AttachmentListField kind="STORY_SCENE" idExternal={scene.idStoryScene} showEmpty />
        </Stack>
      )}
    </Stack>
  );
}
