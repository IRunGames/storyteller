"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Heading,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import type { z } from "zod";
import { newStorySchema, type NewStoryValues } from "@/lib/story-schemas";
import type { CreateStoryResult } from "../actions";

// What the form fields hold before the schema runs: the System <select> keeps
// its raw string, and newStorySchema's preprocess turns it into a number or
// null on the way to onSubmit.
type NewStoryInput = z.input<typeof newStorySchema>;

type Props = {
  systems: { idSystem: number; label: string }[];
  /** The createStory server action. Redirects on success. */
  onCreate: (values: NewStoryValues) => Promise<CreateStoryResult>;
};

export function NewStoryForm({ systems, onCreate }: Props) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm<NewStoryInput, unknown, NewStoryValues>({
    resolver: zodResolver(newStorySchema),
    defaultValues: {
      title: "",
      idSystem: null,
      summary: "",
      imageUrl: "",
      isLookingForPlayers: false,
    },
  });

  async function onSubmit(values: NewStoryValues) {
    const result = await onCreate(values);

    // On success the action redirects and this never runs. Anything that
    // comes back is a field error the client check did not catch.
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field as keyof NewStoryInput, { message });
    }
    if (Object.keys(result.errors).length === 0) {
      setError("root", { message: "Could not create the story. Please try again." });
    }
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">New story</Heading>
        <Text color="fg.muted">Give it a name and a system; the rest can wait.</Text>
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

          <Field.Root invalid={!!errors.imageUrl}>
            <Field.Label>Image URL</Field.Label>
            <Input type="url" placeholder="https://" {...register("imageUrl")} />
            <Field.ErrorText>{errors.imageUrl?.message}</Field.ErrorText>
          </Field.Root>

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
                onCheckedChange={(details) => field.onChange(details.checked === true)}
              >
                <Checkbox.HiddenInput onBlur={field.onBlur} ref={field.ref} />
                <Checkbox.Control />
                <Checkbox.Label>Looking for players</Checkbox.Label>
              </Checkbox.Root>
            )}
          />

          <Button type="submit" loading={isSubmitting || isSubmitSuccessful} alignSelf="flex-start">
            Create story
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
