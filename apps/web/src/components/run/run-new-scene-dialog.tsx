"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import type { RunPlaySpace } from "@/lib/run";
import { runSceneSchema, type RunSceneValues } from "@/lib/scene-schemas";
import { sa_createRunScene } from "@/app/(app)/run/[id]/actions";
import { toaster } from "@/components/ui/toaster";

type Props = {
  idStory: number;
  open: boolean;
  onClose: () => void;
  /** The new scene's play space, once the table is on it. */
  onCreated: (space: RunPlaySpace) => void;
};

/**
 * The scene selector's Create new scene: a title and a description, and the
 * table goes straight to the new scene, ACTIVE, in the session being played
 * (sa_createRunScene). The board's New scene form also asks which sitting
 * the scene belongs to; here that is the one at the table, so it does not.
 */
export function RunNewSceneDialog({ idStory, open, onClose, onCreated }: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="md"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>New scene</Dialog.Title>
            </Dialog.Header>
            {/* Only drawn while open, so each opening starts a blank form. */}
            {open && <NewSceneForm idStory={idStory} onClose={onClose} onCreated={onCreated} />}
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function NewSceneForm({ idStory, onClose, onCreated }: Omit<Props, "open">) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RunSceneValues>({
    resolver: zodResolver(runSceneSchema),
    defaultValues: { title: "", description: "" },
  });

  async function onSubmit(values: RunSceneValues) {
    let result: Awaited<ReturnType<typeof sa_createRunScene>>;
    try {
      result = await sa_createRunScene(idStory, values);
    } catch {
      setError("root", { message: "Could not create the scene. Please try again." });
      return;
    }
    if (result.ok) {
      onCreated(result.space);
      onClose();
      toaster.create({ title: "Scene created", type: "success" });
      return;
    }
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field === "title" || field === "description" ? field : "root", { message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Dialog.Body>
        <Stack gap="4">
          {errors.root && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errors.root.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          <Field.Root required invalid={!!errors.title}>
            <Field.Label>Title</Field.Label>
            <Input autoComplete="off" {...register("title")} />
            <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
          </Field.Root>
          <Field.Root invalid={!!errors.description}>
            <Field.Label>Description (optional)</Field.Label>
            <Textarea rows={5} {...register("description")} />
            <Field.ErrorText>{errors.description?.message}</Field.ErrorText>
          </Field.Root>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        {/* Cancel at the start and the action at the end, as a dialog's
            footer lays them out. */}
        <HStack justify="space-between" w="full">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Create scene
          </Button>
        </HStack>
      </Dialog.Footer>
    </form>
  );
}
