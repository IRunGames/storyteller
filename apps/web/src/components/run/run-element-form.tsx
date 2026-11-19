"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, HStack, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { runElementSchema, type RunElementValues } from "@/lib/element-schemas";
import type { ElementDetail } from "@/lib/run";
import type { SceneItem } from "@/lib/scene-elements";
import type { StatusOption } from "@/lib/status";
import { applyActionErrors } from "@/lib/forms";
import { sa_updateStoryElement } from "@/components/elements/actions";
import { sa_createSceneElement, sa_updateSceneElement } from "@/components/scene-elements/actions";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusChoicePill } from "@/components/status/status-choice-pill";
import { ElementKindSelect } from "@/components/prep/element-kind-select";
import { FormError } from "@/components/forms/form-error";

/**
 * What the form writes, and with which action: a new element from a stack's
 * or a tab's +, written into the story and linked to the scene under the
 * stack's tag (sa_createSceneElement); an element in the scene, saved with
 * its link (sa_updateSceneElement); or an element alone, apart from any
 * scene, from the library or in a complete scene (sa_updateStoryElement).
 */
export type ElementFormTarget =
  | {
      kind: "create";
      idStoryScene: number;
      tag: string | null;
      /** The pictures the popover chose before the element exists: the element's own, and the link's for this scene. */
      idAttachment: number | null;
      idSceneAttachment: number | null;
      /** The library's Add showing info switch: whether the players see the new element's description. */
      showInfo: boolean;
    }
  | { kind: "scene"; idStoryScene: number; idSceneElement: number }
  | { kind: "story"; idElement: number };

type Props = {
  idStory: number;
  /**
   * What the fields start with. A status left empty takes the workflow's
   * first, as a new row would.
   */
  initial: RunElementValues;
  onCancel: () => void;
  submitLabel: string;
  /**
   * The new-element form's pictures, which are not fields the schema
   * checks: the element's own, drawn at the top of its fields, and the
   * link's own for this scene, drawn at the top of the scene's box.
   */
  elementPicture?: ReactNode;
  scenePicture?: ReactNode;
} & (
  | {
      target: Extract<ElementFormTarget, { kind: "create" | "scene" }>;
      /** What the save handed back: the pill as it now is. */
      onSaved: (saved: { item: SceneItem }) => void;
    }
  | {
      /**
       * An element the form edits apart from any scene: the In this scene
       * pill is left out. The field still holds the workflow's first status,
       * so the schema is satisfied, and the action that saves it does not
       * read it.
       */
      target: Extract<ElementFormTarget, { kind: "story" }>;
      /** What the save handed back: the element as the story now holds it. */
      onSaved: (saved: { element: ElementDetail }) => void;
    }
);

/** The action for a target, with the form's values. */
function save(idStory: number, target: ElementFormTarget, values: RunElementValues) {
  switch (target.kind) {
    case "create":
      return sa_createSceneElement(idStory, target.idStoryScene, target.tag, {
        ...values,
        idAttachment: target.idAttachment,
        idSceneAttachment: target.idSceneAttachment,
        // Ephemera start with their info hidden whatever the switch says: a
        // handout is the storyteller's to give out, so its description is
        // not the players' at once. The pill's info toggle still shows it.
        showInfo: values.kind === "EPHEMERA" ? false : target.showInfo,
      });
    case "scene":
      return sa_updateSceneElement(idStory, target.idStoryScene, target.idSceneElement, values);
    case "story":
      return sa_updateStoryElement(idStory, target.idElement, values);
  }
}

const FIELDS = [
  "kind",
  "name",
  "initialName",
  "title",
  "description",
  "notes",
  "url",
  "urlText",
  "status",
  "sceneStatus",
  "sceneUrl",
  "sceneUrlText",
  "sceneLabel",
] as const;

/**
 * The run page's element form, for a new element from a stack's + and for
 * an edit from a pill's info popover, so the two ask the same things in the
 * same order. How the element stands in this scene comes first, as a status
 * pill like the one in the info popover, with the link's own external link
 * for this scene; then every field the board's form has, the element's own
 * link among them, with its status in the story as a pill beside its kind.
 *
 * Both workflows are read as the form opens, so the pill and the dropdown
 * offer exactly what the database will accept.
 */
export function RunElementForm({
  idStory,
  initial,
  target,
  onSaved,
  onCancel,
  submitLabel,
  elementPicture,
  scenePicture,
}: Props) {
  const inScene = target.kind !== "story";
  const [options, setOptions] = useState<{
    element: StatusOption[];
    scene: StatusOption[];
  } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RunElementValues>({
    resolver: zodResolver(runElementSchema),
    defaultValues: initial,
  });

  useEffect(() => {
    let live = true;
    Promise.all([sa_listStatusOptions("elements"), sa_listStatusOptions("scene_elements")])
      .then(([element, scene]) => {
        if (!live) return;
        setOptions({ element, scene });
        // A new element starts in each workflow's first status unless the
        // form was given one.
        if (!getValues("status") && element[0]) setValue("status", element[0].key);
        if (!getValues("sceneStatus") && scene[0]) setValue("sceneStatus", scene[0].key);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [getValues, setValue]);

  async function onSubmit(values: RunElementValues) {
    let result: Awaited<ReturnType<typeof save>>;
    try {
      result = await save(idStory, target, values);
    } catch {
      setError("root", { message: "Could not save the element. Please try again." });
      return;
    }
    if (result.ok) {
      // Each target's action answers the shape its onSaved takes, which the
      // union of props says but one call cannot carry.
      (onSaved as (saved: Extract<typeof result, { ok: true }>) => void)(result);
      return;
    }
    applyActionErrors({ setError }, result.errors, FIELDS);
  }

  if (loadFailed) {
    return <Text color="fg.muted">The form could not be loaded. Close it and try again.</Text>;
  }
  if (options === null) return <Text color="fg.muted">Loading…</Text>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack gap="3">
        <FormError message={errors.root?.message} />
        {/* The scene's part of the element in a box of its own, darker than
            the form round it, so what belongs to this scene alone reads
            apart from the element's own fields below. */}
        {inScene && (
          <Stack gap="3" bg="bg.muted" rounded="md" p="3" data-testid="scene-element-fields">
            {scenePicture}
            <Field.Root invalid={!!errors.sceneStatus}>
              <HStack gap="3">
                <Field.Label m="0">In this scene</Field.Label>
                <Controller
                  control={control}
                  name="sceneStatus"
                  render={({ field }) => (
                    <StatusChoicePill
                      label="In this scene"
                      value={field.value}
                      options={options.scene}
                      onChange={field.onChange}
                    />
                  )}
                />
              </HStack>
              <Field.ErrorText>{errors.sceneStatus?.message}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={!!errors.sceneLabel}>
              <Field.Label>Label in this scene (optional)</Field.Label>
              <Input size="sm" autoComplete="off" {...register("sceneLabel")} />
              <Field.HelperText>
                Words of this copy&apos;s own, which its pill can show in place of the
                element&apos;s fields; a second copy of an element gets a numbered one as it is
                added.
              </Field.HelperText>
              <Field.ErrorText>{errors.sceneLabel?.message}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={!!errors.sceneUrl}>
              <Field.Label>Link in this scene (optional)</Field.Label>
              <Input size="sm" autoComplete="off" inputMode="url" {...register("sceneUrl")} />
              <Field.HelperText>
                A web address the players can open from the pill, in this scene only.
              </Field.HelperText>
              <Field.ErrorText>{errors.sceneUrl?.message}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={!!errors.sceneUrlText}>
              <Field.Label>Link text in this scene (optional)</Field.Label>
              <Input size="sm" autoComplete="off" {...register("sceneUrlText")} />
              <Field.ErrorText>{errors.sceneUrlText?.message}</Field.ErrorText>
            </Field.Root>
          </Stack>
        )}
        {elementPicture}
        {/* The kind and, beside it, the element's status in the story as a
            pill: one row, since both are a word rather than a line. */}
        <HStack gap="3" align="flex-start">
          <Field.Root invalid={!!errors.kind} flex="1">
            <Field.Label>Kind</Field.Label>
            <ElementKindSelect {...register("kind")} />
            <Field.ErrorText>{errors.kind?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.status} w="auto">
            <Field.Label>Status</Field.Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <StatusChoicePill
                  label="Status"
                  value={field.value}
                  options={options.element}
                  onChange={field.onChange}
                />
              )}
            />
            <Field.ErrorText>{errors.status?.message}</Field.ErrorText>
          </Field.Root>
        </HStack>
        <Field.Root required invalid={!!errors.name}>
          <Field.Label>Name</Field.Label>
          <Input size="sm" autoComplete="off" {...register("name")} />
          <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.initialName}>
          <Field.Label>Initial name (optional)</Field.Label>
          <Input size="sm" autoComplete="off" {...register("initialName")} />
          <Field.HelperText>What the players know it as at first.</Field.HelperText>
          <Field.ErrorText>{errors.initialName?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.title}>
          <Field.Label>Title (optional)</Field.Label>
          <Input size="sm" autoComplete="off" {...register("title")} />
          <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.description}>
          <Field.Label>Description (optional)</Field.Label>
          <Textarea size="sm" rows={3} {...register("description")} />
          <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.notes}>
          <Field.Label>Notes (optional)</Field.Label>
          <Textarea size="sm" rows={3} {...register("notes")} />
          <Field.ErrorText>{errors.notes?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.url}>
          <Field.Label>Link (optional)</Field.Label>
          <Input size="sm" autoComplete="off" inputMode="url" {...register("url")} />
          <Field.HelperText>A web address the players can open from the pill.</Field.HelperText>
          <Field.ErrorText>{errors.url?.message}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!errors.urlText}>
          <Field.Label>Link text (optional)</Field.Label>
          <Input size="sm" autoComplete="off" {...register("urlText")} />
          <Field.ErrorText>{errors.urlText?.message}</Field.ErrorText>
        </Field.Root>
        {/* Cancel at the start and the action at the end, as a dialog's
            footer lays them out. */}
        <HStack justify="space-between" w="full" pt="1">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
