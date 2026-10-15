"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, HStack, Stack, Textarea } from "@chakra-ui/react";
import { sceneTextSchema, type SceneTextValues } from "@/lib/scene-schemas";
import type { SceneText, SetSceneTextResult } from "@/lib/scenes";

type Props = {
  /** What the fields start with: the scene's text as the table holds it. */
  text: SceneText;
  /**
   * Saves the values: the storyteller's sa_setSceneText or a player's
   * sa_setPlaySceneText, bound to the scene, as RunElementForm takes its
   * save. The same schema runs again in the action.
   */
  save: (values: SceneTextValues) => Promise<SetSceneTextResult>;
  /** The text as stored. */
  onSaved: (text: SceneText) => void;
  onCancel: () => void;
};

const FIELDS = ["description", "notes"] as const;

/**
 * The description and notes of the scene being played, edited from the
 * panel behind the scene's title at either table (SceneTextPopover). Two
 * text areas and nothing else: the title and the status have their own
 * controls, and a scene's stacks their own dialog.
 */
export function SceneTextForm({ text, save, onSaved, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SceneTextValues>({
    resolver: zodResolver(sceneTextSchema),
    defaultValues: { description: text.description ?? "", notes: text.notes ?? "" },
  });

  async function onSubmit(values: SceneTextValues) {
    let result: SetSceneTextResult;
    try {
      result = await save(values);
    } catch {
      setError("root", { message: "Could not save the scene. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result.text);
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
        <Field.Root invalid={!!errors.description}>
          <Field.Label>Description</Field.Label>
          <Textarea size="sm" rows={6} {...register("description")} />
          <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.notes}>
          <Field.Label>Notes</Field.Label>
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
