"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, HStack, Input, Stack, Textarea } from "@chakra-ui/react";
import { liveSceneTextSchema, sceneTextSchema, type SceneTextValues } from "@/lib/scene-schemas";
import type { SceneText, SetSceneTextResult } from "@/lib/scenes";
import { applyActionErrors } from "@/lib/forms";
import { sa_setLiveSceneText } from "@/components/live/actions";
import { sa_setPlaySceneText } from "@/components/play/actions";
import { sa_setSceneText } from "@/components/run/actions";
import { FormError } from "@/components/forms/form-error";
import { ScenePictures, type ScenePicturesProps } from "./scene-pictures";

/**
 * Which action saves the scene's words, each with its own rule about which
 * scenes it may write: the storyteller's sa_setSceneText from the run table
 * and the storyboard, which takes a complete scene; the live-edit page's
 * sa_setLiveSceneText, which refuses one; a player's sa_setPlaySceneText,
 * which writes only the scene being played.
 */
export type SceneTextSaver = "run" | "live" | "play";

const SAVERS: Record<
  SceneTextSaver,
  (idStory: number, idStoryScene: number, input: unknown) => Promise<SetSceneTextResult>
> = {
  run: sa_setSceneText,
  live: sa_setLiveSceneText,
  play: sa_setPlaySceneText,
};

type Props = {
  idStory: number;
  /** The scene whose words these are. */
  idStoryScene: number;
  /** What the fields start with: the scene's text as the table holds it. */
  text: SceneText;
  /**
   * Which action saves the values (SceneTextSaver). The same schema runs
   * again in the action. The title is among the values only when the form
   * has a Title field.
   */
  saver: SceneTextSaver;
  /** The text as stored, and the title as stored when the form renames the scene. */
  onSaved: (text: SceneText, title?: string) => void;
  onCancel: () => void;
  /**
   * The scene's title, given only where the panel renames the scene too:
   * the live-edit page. A Title field then leads the form.
   */
  title?: string;
  /** A line under the Notes label, for the live-edit page to say who else writes there. */
  notesHint?: string;
  /**
   * The scene's pictures under the fields, the cover in an area of its own
   * (ScenePictures), for the storyteller's editors: the tables', the
   * live-edit page's and the storyboard's. The players' panel leaves it out,
   * since the pictures are the storyteller's to manage.
   */
  pictures?: ScenePicturesProps;
};

const FIELDS = ["title", "description", "notes"] as const;

/**
 * The scene editor, one form wherever a scene's words are changed: the
 * panel behind the scene's title at either table, on the live-edit page
 * and on the storyboard's cards (SceneTextPopover). The description and
 * notes always; the title when the caller hands one over, which every
 * storyteller's panel does and the players' panel does not, since the
 * title has its own controls at the storyteller's table; and under them
 * the scene's pictures with the cover set apart (ScenePictures), again for
 * the storyteller's panels, saved as they are added rather than on Save.
 */
export function SceneTextForm({
  idStory,
  idStoryScene,
  text,
  saver,
  onSaved,
  onCancel,
  title,
  notesHint,
  pictures,
}: Props) {
  const withTitle = title !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SceneTextValues & { title?: string }>({
    // The live schema is the tables' with a title, so either one checks
    // the same description and notes.
    resolver: zodResolver(withTitle ? liveSceneTextSchema : sceneTextSchema),
    defaultValues: {
      ...(withTitle ? { title } : {}),
      description: text.description ?? "",
      notes: text.notes ?? "",
    },
  });

  async function onSubmit(values: SceneTextValues & { title?: string }) {
    let result: SetSceneTextResult;
    try {
      result = await SAVERS[saver](idStory, idStoryScene, values);
    } catch {
      setError("root", { message: "Could not save the scene. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result.text, result.title);
      return;
    }
    applyActionErrors({ setError }, result.errors, FIELDS);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        <FormError message={errors.root?.message} />
        {withTitle && (
          <Field.Root required invalid={!!errors.title}>
            <Field.Label>Title</Field.Label>
            <Input size="sm" autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>
        )}
        <Field.Root invalid={!!errors.description}>
          <Field.Label>Description</Field.Label>
          <Textarea size="sm" rows={6} {...register("description")} />
          <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.notes}>
          <Field.Label>Notes</Field.Label>
          {notesHint && <Field.HelperText mt="0">{notesHint}</Field.HelperText>}
          <Textarea size="sm" rows={6} {...register("notes")} />
          <Field.ErrorText>{errors.notes?.message}</Field.ErrorText>
        </Field.Root>
        {pictures && <ScenePictures {...pictures} />}
        {/* Cancel at the start and the action at the end, as a dialog's
            footer lays them out. */}
        <HStack justify="space-between" w="full" pt="1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save scene
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
