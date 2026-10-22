"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, HStack, Input, Stack, Textarea } from "@chakra-ui/react";
import { liveSceneTextSchema, sceneTextSchema, type SceneTextValues } from "@/lib/scene-schemas";
import type { SceneText, SetSceneTextResult } from "@/lib/scenes";

type Props = {
  /** What the fields start with: the scene's text as the table holds it. */
  text: SceneText;
  /**
   * Saves the values: the storyteller's sa_setSceneText or a player's
   * sa_setPlaySceneText, bound to the scene, as RunElementForm takes its
   * save. The same schema runs again in the action. The title is among the
   * values only when the form has a Title field.
   */
  save: (values: SceneTextValues & { title?: string }) => Promise<SetSceneTextResult>;
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
};

const FIELDS = ["title", "description", "notes"] as const;

/**
 * The description and notes of the scene being played, edited from the
 * panel behind the scene's title at either table (SceneTextPopover). Two
 * text areas and nothing else at the tables: the title and the status have
 * their own controls there, and a scene's stacks their own dialog. The
 * live-edit page has no other place to rename the scene, so it hands the
 * form the title and a Title field leads the two.
 */
export function SceneTextForm({ text, save, onSaved, onCancel, title, notesHint }: Props) {
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
      result = await save(values);
    } catch {
      setError("root", { message: "Could not save the scene. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result.text, result.title);
      return;
    }
    for (const [field, message] of Object.entries(result.errors)) {
      const known = (FIELDS as readonly string[]).includes(field);
      setError(known ? (field as (typeof FIELDS)[number]) : "root", { message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        {errors.root && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{errors.root.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
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
