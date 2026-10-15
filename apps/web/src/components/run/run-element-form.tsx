"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { runElementSchema, type RunElementValues } from "@/lib/element-schemas";
import type { StatusOption } from "@/lib/status";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusChoicePill } from "@/components/status/status-choice-pill";
import { ElementKindSelect } from "@/components/prep/element-kind-select";

/** What a save hands back: its own success, or errors keyed by field. */
type SaveResult<Saved> = Saved | { ok: false; errors: Record<string, string> };

type Props<Saved extends { ok: true }> = {
  /**
   * What the fields start with. A status left empty takes the workflow's
   * first, as a new row would.
   */
  initial: RunElementValues;
  /**
   * Saves the values: sa_createSceneElement or sa_updateSceneElement, bound,
   * or for the library sa_updateStoryElement.
   */
  save: (values: RunElementValues) => Promise<SaveResult<Saved>>;
  /** What the save handed back: the pill as it now is, or the element. */
  onSaved: (saved: Saved) => void;
  /**
   * False for an element the form edits apart from any scene, from the
   * library: the In this scene pill is left out. The field still holds the
   * workflow's first status, so the schema is satisfied, and the action
   * that saves it does not read it.
   */
  inScene?: boolean;
  onCancel: () => void;
  submitLabel: string;
  /**
   * Drawn after the fields, before the buttons: the new-element form's
   * picture, which is not one of the fields the schema checks.
   */
  extra?: ReactNode;
};

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
] as const;

/**
 * The run page's element form, for a new element from a stack's + and for
 * an edit from a pill's info popover, so the two ask the same things in the
 * same order. How the element stands in this scene comes first, as a status
 * pill like the one in the info popover, with the link's own external link
 * for this scene; then every field the board's form has, the element's own
 * link among them; then the element's own status in the story, as a
 * dropdown.
 *
 * Both workflows are read as the form opens, so the pill and the dropdown
 * offer exactly what the database will accept.
 */
export function RunElementForm<Saved extends { ok: true }>({
  initial,
  save,
  onSaved,
  onCancel,
  submitLabel,
  extra,
  inScene = true,
}: Props<Saved>) {
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
    let result: SaveResult<Saved>;
    try {
      result = await save(values);
    } catch {
      setError("root", { message: "Could not save the element. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result);
      return;
    }
    for (const [field, message] of Object.entries(result.errors)) {
      const known = (FIELDS as readonly string[]).includes(field);
      setError(known ? (field as (typeof FIELDS)[number]) : "root", { message });
    }
  }

  if (loadFailed) {
    return <Text color="fg.muted">The form could not be loaded. Close it and try again.</Text>;
  }
  if (options === null) return <Text color="fg.muted">Loading…</Text>;

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
        {inScene && (
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
        )}
        {inScene && (
          <>
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
          </>
        )}
        <Field.Root invalid={!!errors.kind}>
          <Field.Label>Kind</Field.Label>
          <ElementKindSelect {...register("kind")} />
          <Field.ErrorText>{errors.kind?.message}</Field.ErrorText>
        </Field.Root>
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
        <Field.Root invalid={!!errors.status}>
          <Field.Label>Status</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field {...register("status")}>
              {options.element.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Field.ErrorText>{errors.status?.message}</Field.ErrorText>
        </Field.Root>
        {extra}
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
