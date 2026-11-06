"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Dialog, Field, Input, Portal, Stack } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import {
  systemFieldsSchema,
  type SystemFieldsInput,
  type SystemFieldsValues,
} from "@/lib/system-schemas";
import { sa_createSystem, type AdminSystem } from "./actions";

const FIELDS = ["systemName", "systemVersion", "variant"] as const;
type FieldName = (typeof FIELDS)[number];
const isField = (name: string): name is FieldName => (FIELDS as readonly string[]).includes(name);

/**
 * The New system button at the top of the Systems page and its dialog: a
 * name, and the version and variant that tell editions and settings of one
 * game apart. The system starts with no definition; the pencil on its new
 * row is where that is written. A duplicate comes back on the name from
 * the action, as a field error does.
 */
export function NewSystemDialog({ onCreated }: { onCreated: (system: AdminSystem) => void }) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SystemFieldsInput, unknown, SystemFieldsValues>({
    resolver: zodResolver(systemFieldsSchema),
    defaultValues: { systemName: "", systemVersion: "", variant: "" },
  });

  function start() {
    reset();
    setOpen(true);
  }

  async function save(values: SystemFieldsValues) {
    try {
      const result = await sa_createSystem(values);
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.errors)) {
          setError(isField(field) ? field : "root", { message });
        }
        return;
      }
      onCreated(result.system);
      setOpen(false);
      toaster.create({ title: `${result.system.label} added.`, type: "success" });
    } catch {
      setError("root", { message: "The system could not be added. Try again." });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
      <Button type="button" size="sm" onClick={start}>
        <Plus /> New system
      </Button>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <form onSubmit={handleSubmit(save)} noValidate>
              <Dialog.Header>
                <Dialog.Title>New system</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="4">
                  {errors.root && (
                    <Alert.Root role="alert" status="error" size="sm">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{errors.root.message}</Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}
                  <Field.Root required invalid={!!errors.systemName}>
                    <Field.Label>Name</Field.Label>
                    <Input autoComplete="off" autoFocus {...register("systemName")} />
                    <Field.ErrorText>{errors.systemName?.message}</Field.ErrorText>
                  </Field.Root>
                  <Field.Root invalid={!!errors.systemVersion}>
                    <Field.Label>Version (optional)</Field.Label>
                    <Input autoComplete="off" placeholder="2e" {...register("systemVersion")} />
                    <Field.ErrorText>{errors.systemVersion?.message}</Field.ErrorText>
                  </Field.Root>
                  <Field.Root invalid={!!errors.variant}>
                    <Field.Label>Variant (optional)</Field.Label>
                    <Input autoComplete="off" placeholder="Numenera" {...register("variant")} />
                    <Field.HelperText>
                      The setting or line, when one game has several.
                    </Field.HelperText>
                    <Field.ErrorText>{errors.variant?.message}</Field.ErrorText>
                  </Field.Root>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button type="submit" loading={isSubmitting}>
                  Save
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
