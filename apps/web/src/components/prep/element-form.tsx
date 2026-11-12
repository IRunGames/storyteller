"use client";

import NextLink from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import {
  elementFormSchema,
  type ElementFormInput,
  type ElementValues,
} from "@/lib/element-schemas";
import type { ElementKind } from "@/lib/elements";
import { hasStats, systemKey, toStatBlockFields, type StatBlock } from "@/lib/stat-blocks";
import {
  sa_createElement,
  sa_updateElement,
  type StatBlockSystems,
} from "@/app/(app)/(nav)/libraries/actions";
import { StatBlockFields } from "@/components/stat-blocks/stat-block-fields";
import { DeleteElementButton } from "./delete-element-button";
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
  /**
   * The systems the Stat blocks section may draw, and the story's own, which
   * a new element starts with a block for. Left out, the section is not
   * drawn and the form posts no blocks, so the element's are left alone.
   */
  statBlockSystems?: StatBlockSystems;
};

/**
 * What the blocks start as: the story's own system's block, read against
 * its template, for an edit; for a new element, that system's block with
 * no stat blocks picked yet, so the section opens on the picker. Nothing
 * when the story has no system or its template has no stats, and the
 * section is then not drawn. A block stored for any other system is
 * neither drawn nor posted, which leaves it as it is.
 */
function initialBlocks(
  systems: StatBlockSystems | undefined,
  element: Props["element"],
): ElementFormInput["statBlocks"] {
  const own = systems?.systems.find((system) => system.idSystem === systems.storySystem);
  if (!own || !hasStats(own.definition)) return {};
  const key = systemKey(own.idSystem);
  // Read against the definition as it is drawn, so the type the schema
  // gives the column (anything) is narrowed here and nowhere else.
  const stored = element?.values.statBlocks?.[key] as StatBlock | undefined;
  return { [key]: toStatBlockFields(own.definition, stored ?? {}) };
}

// One form for a new element and an edited one, as SceneForm is for scenes:
// a new element is written in the board's dialog, which carries the title
// and closes when it is done, and an edited one on a page of its own, which
// goes back to the board when it saves. The status is not here; it moves by
// its pill.
export function ElementForm({
  idStory,
  kind = "PERSON",
  element,
  onCreated,
  onCancel,
  statBlockSystems,
}: Props) {
  const {
    register,
    control,
    setValue,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<ElementFormInput, unknown, ElementValues>({
    // The schema's input has the blocks optional, since the run forms post
    // none; this form always holds them, so the resolver is told so.
    resolver: zodResolver(elementFormSchema(statBlockSystems?.systems ?? [])) as Resolver<
      ElementFormInput,
      unknown,
      ElementValues
    >,
    defaultValues: {
      ...(element?.values ?? {
        kind,
        name: "",
        initialName: "",
        title: "",
        description: "",
        notes: "",
        url: "",
        urlText: "",
      }),
      statBlocks: initialBlocks(statBlockSystems, element),
      removedSystems: [],
    },
  });

  async function onSubmit(values: ElementValues) {
    // Without the section, the blocks are not the form's to post: the
    // action leaves the column alone for a form that says nothing of them.
    const posted = statBlockSystems
      ? values
      : { ...values, statBlocks: undefined, removedSystems: undefined };
    const result = element
      ? await sa_updateElement(element.idElement, posted)
      : await sa_createElement(idStory, posted);
    if (result.ok) {
      onCreated?.(values.kind);
      return;
    }

    // An edit that saves redirects, so this never runs for it. Anything that
    // comes back is an error the client check did not catch.
    let anyField = false;
    for (const [field, message] of Object.entries(result.errors)) {
      if (field === "") continue;
      // A stat's error is keyed by its path, statBlocks.<system>.<group>.<stat>.<part>,
      // which is the field's own name.
      setError(field as keyof ElementFormInput, { message });
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

          {statBlockSystems && (
            <StatBlockFields
              systems={statBlockSystems}
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
            />
          )}

          <Field.Root invalid={!!errors.url}>
            <Field.Label>Link (optional)</Field.Label>
            <Input autoComplete="off" inputMode="url" {...register("url")} />
            <Field.HelperText>A web address the players can open from the pill.</Field.HelperText>
            <Field.ErrorText>{errors.url?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.urlText}>
            <Field.Label>Link text (optional)</Field.Label>
            <Input autoComplete="off" {...register("urlText")} />
            <Field.ErrorText>{errors.urlText?.message}</Field.ErrorText>
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
            {/* At the far end, apart from Save: an edit's way out of the
                story altogether, which asks first. */}
            {element && (
              <Box ms="auto">
                <DeleteElementButton idElement={element.idElement} name={element.values.name} />
              </Box>
            )}
          </HStack>
        </Stack>
      </form>
    </Stack>
  );
}
