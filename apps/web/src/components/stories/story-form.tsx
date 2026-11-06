"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
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
import { sa_createStory, sa_updateStory } from "@/app/(app)/(nav)/stories/actions";

// What the form fields hold before the schema runs: the System <select> keeps
// its raw string, and storySchema's preprocess turns it into a number or
// null on the way to onSubmit.
type StoryInput = z.input<typeof storySchema>;

type Props = {
  systems: { idSystem: number; label: string }[];
  /**
   * The story being edited, with its current values. Absent for the New
   * story page: the same fields then start empty and create a story instead.
   */
  story?: { idStory: number; values: StoryValues };
  /**
   * Where to go once a new story is made, when the page that linked here
   * said (stories/new/page.tsx); else the story's own page. Only read when
   * creating.
   */
  afterCreate?: string;
};

// One form for New story and Edit story. The fields, the client check and
// the way server errors land are the same either way; only the heading, the
// button and the action differ. It imports both actions itself rather than
// taking one as a prop, so the page that mounts it has nothing to relay.
export function StoryForm({ systems, story, afterCreate }: Props) {
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
      isLookingForPlayers: false,
      isActive: true,
      isArchived: false,
      isPublic: false,
    },
  });

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
      : await sa_createStory(values, afterCreate);

    // On success the action redirects and this never runs. Anything that
    // comes back is a field error the client check did not catch.
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field as keyof StoryInput, { message });
    }
    if (Object.keys(result.errors).length === 0) {
      setError("root", {
        message: story
          ? "Could not save the story. Please try again."
          : "Could not create the story. Please try again.",
      });
    }
  }

  // Controller rather than register() for every checkbox: Chakra's hidden
  // input carries a value="on" attribute, and react-hook-form reads that
  // attribute instead of the checked flag, so register() would hand the
  // schema the string "on" and z.boolean() would reject it. Active is drawn
  // in two places by mode (below), so it is made once here.
  const activeCheckbox = (
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
  );

  return (
    <Stack gap="6">
      <HStack justify="space-between" align="flex-start" gap="4">
        <Stack gap="1">
          <Heading size="2xl">{story ? "Edit story" : "New story"}</Heading>
          {!story && <Text color="fg.muted">Give it a name and a system; the rest can wait.</Text>}
        </Stack>
        {/* On Edit story, whether the story is still played sits on the
            heading's line with Archive, the two things about the story as a
            whole rather than its text; a new story is active to begin with
            and has nothing to archive, so the New story page keeps Active
            among the fields and goes without Archive. aria-pressed says
            which way the toggle currently points; the label says what
            pressing it does. */}
        {story && (
          <HStack gap="4" flexShrink="0">
            {activeCheckbox}
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
          </HStack>
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
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

          {!story && activeCheckbox}

          {/* Not tied to Archive like the two above: whether an archived
              story's record may be read is a separate question from
              whether it is still played. */}
          <Controller
            control={control}
            name="isPublic"
            render={({ field }) => (
              <Field.Root>
                <Checkbox.Root
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={(details) => field.onChange(details.checked === true)}
                >
                  <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
                  <Checkbox.Control />
                  <Checkbox.Label>Public</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  Anyone signed in can read its sessions and played scenes. Otherwise only you and
                  its players can.
                </Field.HelperText>
              </Field.Root>
            )}
          />

          <Button type="submit" loading={isSubmitting || isSubmitSuccessful} alignSelf="flex-start">
            {story ? "Save changes" : "Create story"}
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
