"use client";

import { useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldError,
  type FieldErrors,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { Archive, ArchiveRestore } from "lucide-react";
import type { z } from "zod";
import { storySchema, type StoryValues } from "@/lib/story-schemas";
import { AttachmentListField } from "@/components/uploads/attachment-list-field";
import { sa_createStory, sa_updateStory } from "@/app/(app)/(nav)/stories/actions";

// What the form fields hold before the schema runs: the System <select> keeps
// its raw string, and storySchema's preprocess turns it into a number or
// null on the way to onSubmit.
type StoryInput = z.input<typeof storySchema>;

/**
 * The message behind an attachmentIds failure, whichever shape it arrives in.
 * A rule on the array itself — more ids than attachmentIdsSchema allows — puts
 * its message on the field; a rule on one element puts it on
 * `attachmentIds.<n>`, which react-hook-form keeps as indices on that same
 * object with no message of its own on the parent.
 */
function attachmentIdsMessage(
  error: FieldErrors<StoryInput>["attachmentIds"],
): string | undefined {
  if (!error) return undefined;
  if (error.message) return error.message;
  // Read as an array-like rather than with Array.isArray: react-hook-form's
  // Merge<> type keeps the indices but makes `length` optional, and Array.from
  // of an object without one is simply empty.
  return Array.from(error as ArrayLike<FieldError | undefined>).find((item) => item?.message)
    ?.message;
}

type Props = {
  systems: { idSystem: number; label: string }[];
  /**
   * The story being edited, with its current values. Absent for the New
   * story page: the same fields then start empty and create a story instead.
   */
  story?: { idStory: number; values: StoryValues };
};

// One form for New story and Edit story. The fields, the client check and
// the way server errors land are the same either way; only the heading, the
// button and the action differ. It imports both actions itself rather than
// taking one as a prop, so the page that mounts it has nothing to relay.
export function StoryForm({ systems, story }: Props) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<StoryInput, unknown, StoryValues>({
    resolver: zodResolver(storySchema),
    defaultValues: story?.values ?? {
      title: "",
      idSystem: null,
      summary: "",
      attachmentIds: [],
      isLookingForPlayers: false,
      isActive: true,
      isArchived: false,
    },
  });

  // Set when the story was inserted but its attachments could not be claimed.
  // The action reports that on "root" like any other failure, which makes
  // isSubmitSuccessful false and would free the button; pressing it again
  // would create a second story, so the button stays disabled instead.
  const [storyCreated, setStoryCreated] = useState(false);

  // Archiving is a button rather than a third checkbox because it is not
  // one more flag among equals: an archived story is neither active nor
  // looking for players, so pressing it unticks both, and the two boxes stay
  // disabled while it is on so what will be saved is what is shown.
  // storySchema repeats the override on the server. shouldDirty so a press
  // counts as a change like typing would. useWatch rather than watch(): the
  // React Compiler cannot memoise around watch() and skips the component.
  const isArchived = useWatch({ control, name: "isArchived" });
  function toggleArchived() {
    const next = !isArchived;
    setValue("isArchived", next, { shouldDirty: true });
    if (next) {
      setValue("isActive", false, { shouldDirty: true });
      setValue("isLookingForPlayers", false, { shouldDirty: true });
    }
  }

  async function onSubmit(values: StoryValues) {
    const result = story
      ? await sa_updateStory(story.idStory, values)
      : await sa_createStory(values);

    // On success the action redirects and this never runs. Anything that
    // comes back is a field error the client check did not catch.
    //
    // attachmentIds is the exception: it has no input of its own to sit
    // beside, and a per-element issue arrives keyed "attachmentIds.0", which
    // is not a field react-hook-form knows at all. Both go to "root", where
    // the alert above is already waiting, rather than to a setError call
    // nothing would ever render.
    if (result.storyCreated) setStoryCreated(true);
    for (const [field, message] of Object.entries(result.errors)) {
      const name = field.startsWith("attachmentIds") ? "root" : field;
      setError(name as keyof StoryInput, { message });
    }
    if (Object.keys(result.errors).length === 0) {
      setError("root", {
        message: story
          ? "Could not save the story. Please try again."
          : "Could not create the story. Please try again.",
      });
    }
  }

  /**
   * The client check refusing the form before onSubmit ever runs. Every other
   * field renders its own message beside its input, so react-hook-form's own
   * focus-the-first-error is enough for them; attachmentIds has no such input,
   * and without this a story carrying more ids than attachmentIdsSchema allows
   * would make Save a silent no-op — no redirect, no message anywhere on the
   * page. It lands on the same "root" alert the server's version of this
   * failure lands on.
   */
  function onInvalid(formErrors: typeof errors) {
    const message = attachmentIdsMessage(formErrors.attachmentIds);
    if (message) setError("root", { message });
  }

  return (
    <Stack gap="6">
      <HStack justify="space-between" align="flex-start" gap="4">
        <Stack gap="1">
          <Heading size="2xl">{story ? "Edit story" : "New story"}</Heading>
          {!story && <Text color="fg.muted">Give it a name and a system; the rest can wait.</Text>}
        </Stack>
        {/* A story that does not exist yet has nothing to archive, so the
            New story page goes without. aria-pressed says which way the
            toggle currently points; the label says what pressing it does. */}
        {story && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={isArchived}
            onClick={toggleArchived}
          >
            {isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {isArchived ? "Unarchive" : "Archive"}
          </Button>
        )}
      </HStack>

      {errors.root && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{errors.root.message}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
        <Stack gap="4">
          <Field.Root required invalid={!!errors.title}>
            <Field.Label>Title</Field.Label>
            <Input autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.idSystem}>
            <Field.Label>System</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field {...register("idSystem")}>
                <option value="">No system</option>
                {systems.map((system) => (
                  <option key={system.idSystem} value={system.idSystem}>
                    {system.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Field.ErrorText>{errors.idSystem?.message}</Field.ErrorText>
          </Field.Root>

          <Field.Root invalid={!!errors.summary}>
            <Field.Label>Summary</Field.Label>
            <Textarea rows={5} {...register("summary")} />
            <Field.ErrorText>{errors.summary?.message}</Field.ErrorText>
          </Field.Root>

          {/*
            Controller rather than register() for the same reason the
            checkboxes below use it: the value is a number[] this component
            hands back through onChange, not something an <input> posts.

            idExternal is the story's id when there is one, and the field then
            loads and attaches its own rows: an edit form's pictures belong to
            the story from the moment they are made, so nothing is left for
            the submit to do. On the New story page there is no story to
            attach to yet, so idExternal is null, the collected ids travel in
            the form's value, and sa_createStory claims them once the row it
            just inserted has an id.
          */}
          <Controller
            control={control}
            name="attachmentIds"
            render={({ field }) => (
              <AttachmentListField
                kind="STORY"
                idExternal={story?.idStory ?? null}
                value={field.value ?? []}
                onChange={field.onChange}
              />
            )}
          />

          {/*
            Controller rather than register(): Chakra's hidden input carries a
            value="on" attribute, and react-hook-form reads that attribute
            instead of the checked flag, so register() would hand the schema
            the string "on" and z.boolean() would reject it.
          */}
          <Controller
            control={control}
            name="isLookingForPlayers"
            render={({ field }) => (
              <Checkbox.Root
                name={field.name}
                checked={field.value}
                disabled={isArchived}
                onCheckedChange={(details) => field.onChange(details.checked === true)}
              >
                <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
                <Checkbox.Control />
                <Checkbox.Label>Looking for players</Checkbox.Label>
              </Checkbox.Root>
            )}
          />

          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Checkbox.Root
                name={field.name}
                checked={field.value}
                disabled={isArchived}
                onCheckedChange={(details) => field.onChange(details.checked === true)}
              >
                <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
                <Checkbox.Control />
                <Checkbox.Label>Active</Checkbox.Label>
              </Checkbox.Root>
            )}
          />

          <Button
            type="submit"
            loading={isSubmitting || isSubmitSuccessful}
            disabled={storyCreated}
            alignSelf="flex-start"
          >
            {story ? "Save changes" : "Create story"}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
