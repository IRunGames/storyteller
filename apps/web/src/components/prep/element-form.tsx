"use client";

import NextLink from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Field, Heading, HStack, Input, Stack, Textarea } from "@chakra-ui/react";
import { elementSchema, type ElementValues } from "@/lib/element-schemas";
import type { ElementKind } from "@/lib/elements";
import { sa_createElement, sa_updateElement } from "@/app/(app)/(nav)/libraries/actions";
import { ElementKindSelect } from "./element-kind-select";

type Props = {
  /** The story the element belongs to, and the board the edit form goes back to. */
  idStory: number;
  /**
   * The kind a new element starts as: the column whose + opened the form.
   * The dropdown can still change it.
   */
  kind?: ElementKind;
  /**
   * The element being edited, with its current values. Absent for a new one:
   * the same fields then start empty and create an element instead.
   */
  element?: { idElement: number; values: ElementValues };
  /** New element only: it is in, so the dialog it sits in can close. */
  onCreated?: (kind: ElementKind) => void;
  /** New element only: the dialog's Cancel. */
  onCancel?: () => void;
};

// One form for a new element and an edited one, as SceneForm is for scenes:
// a new element is written in the board's dialog, which carries the title
// and closes when it is done, and an edited one on a page of its own, which
// goes back to the board when it saves. The status is not here; it moves by
// its pill.
export function ElementForm({ idStory, kind = "PERSON", element, onCreated, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ElementValues>({
    resolver: zodResolver(elementSchema),
    defaultValues: element?.values ?? {
      kind,
      name: "",
      initialName: "",
      title: "",
      description: "",
      notes: "",
    },
  });

  async function onSubmit(values: ElementValues) {
    const result = element
      ? await sa_updateElement(element.idElement, values)
      : await sa_createElement(idStory, values);
    if (result.ok) {
      onCreated?.(values.kind);
      return;
    }

    // An edit that saves redirects, so this never runs for it. Anything that
    // comes back is an error the client check did not catch.
    let anyField = false;
    for (const [field, message] of Object.entries(result.errors)) {
      if (field === "") continue;
      setError(field as keyof ElementValues, { message });
      anyField = true;
    }
    if (!anyField) {
      setError("root", {
        message:
          result.errors[""] ??
          (element
            ? "Could not save the element. Please try again."
            : "Could not create the element. Please try again."),
      });
    }
  }

  return (
    <Stack gap="6">
      {element && <Heading size="2xl">Edit element</Heading>}

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
          <Field.Root required invalid={!!errors.kind}>
            <Field.Label>Kind</Field.Label>
            <ElementKindSelect {...register("kind")} />
            <Field.ErrorText>{errors.kind?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root required invalid={!!errors.name}>
            <Field.Label>Name</Field.Label>
            <Input autoComplete="off" {...register("name")} />
            <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.initialName}>
            <Field.Label>Initial name (optional)</Field.Label>
            <Input autoComplete="off" {...register("initialName")} />
            <Field.ErrorText>{errors.initialName?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.title}>
            <Field.Label>Title (optional)</Field.Label>
            <Input autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.description}>
            <Field.Label>Description (optional)</Field.Label>
            <Textarea rows={5} {...register("description")} />
            <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.notes}>
            <Field.Label>Notes (optional)</Field.Label>
            <Textarea rows={5} {...register("notes")} />
            <Field.ErrorText>{errors.notes?.message}</Field.ErrorText>
          </Field.Root>

          <HStack gap="3">
            <Button type="submit" loading={isSubmitting || isSubmitSuccessful}>
              {element ? "Save changes" : "Create element"}
            </Button>
            {element ? (
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
    </Stack>
  );
}
