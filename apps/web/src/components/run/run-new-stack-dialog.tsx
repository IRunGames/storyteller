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
} from "@chakra-ui/react";
import { newStackSchema, type NewStackValues } from "@/lib/stack-schemas";
import { sa_setSceneStacks } from "@/app/(app)/run/[id]/actions";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** The scene's stacks now; the new one goes after them. */
  tags: string[];
  open: boolean;
  onClose: () => void;
  /** The scene's stacks with the new one last, and the new one's name. */
  onCreated: (tags: string[], name: string) => void;
};

/**
 * The In select's Create new stack: a name, added to the end of the scene's
 * stacks (sa_setSceneStacks) and chosen in the select, so what the library
 * adds next goes in it. For the scene only; Manage stacks is where the
 * story's default stacks are set.
 */
export function RunNewStackDialog({
  idStory,
  idStoryScene,
  tags,
  open,
  onClose,
  onCreated,
}: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>New stack</Dialog.Title>
            </Dialog.Header>
            {/* Only drawn while open, so each opening starts a blank form. */}
            {open && (
              <NewStackForm
                idStory={idStory}
                idStoryScene={idStoryScene}
                tags={tags}
                onClose={onClose}
                onCreated={onCreated}
              />
            )}
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function NewStackForm({ idStory, idStoryScene, tags, onClose, onCreated }: Omit<Props, "open">) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewStackValues>({
    resolver: zodResolver(newStackSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(values: NewStackValues) {
    try {
      const result = await sa_setSceneStacks(idStory, idStoryScene, {
        tags: [...tags, values.name],
        saveForStory: false,
      });
      if (result.ok) {
        onCreated(result.tags, values.name);
        return;
      }
      // Every refusal is about the list the name joins (a clash, too many),
      // so it is the name's to fix.
      setError("name", { message: Object.values(result.errors)[0] });
    } catch {
      setError("root", { message: "The stack could not be added. Try again." });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Dialog.Body>
        <Stack gap="4">
          {errors.root && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Title>{errors.root.message}</Alert.Title>
            </Alert.Root>
          )}
          <Field.Root invalid={!!errors.name}>
            <Field.Label>Name</Field.Label>
            <Input autoFocus maxLength={40} {...register("name")} />
            <Field.ErrorText>{errors.name?.message}</Field.ErrorText>
          </Field.Root>
        </Stack>
      </Dialog.Body>
      <Dialog.Footer>
        <HStack gap="2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Add stack
          </Button>
        </HStack>
      </Dialog.Footer>
    </form>
  );
}
