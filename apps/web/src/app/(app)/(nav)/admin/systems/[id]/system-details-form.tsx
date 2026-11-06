"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Card, Field, Heading, HStack, Input, Stack } from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import {
  systemFieldsSchema,
  type SystemFieldsInput,
  type SystemFieldsValues,
} from "@/lib/system-schemas";
import { sa_updateSystem, type AdminSystemDetail } from "../actions";

const FIELDS = ["systemName", "systemVersion", "variant"] as const;
type FieldName = (typeof FIELDS)[number];
const isField = (name: string): name is FieldName => (FIELDS as readonly string[]).includes(name);

/**
 * The editor page's card for a system's own fields: name, version and
 * variant, the same three the New system dialog asks for. Saving has the
 * page redrawn (router.refresh), since the heading above and the label
 * every story card shows come from these.
 */
export function SystemDetailsForm({ system }: { system: AdminSystemDetail }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SystemFieldsInput, unknown, SystemFieldsValues>({
    resolver: zodResolver(systemFieldsSchema),
    defaultValues: {
      systemName: system.systemName,
      systemVersion: system.systemVersion ?? "",
      variant: system.variant ?? "",
    },
  });

  async function save(values: SystemFieldsValues) {
    try {
      const result = await sa_updateSystem(system.idSystem, values);
      if (!result.ok) {
        for (const [field, message] of Object.entries(result.errors)) {
          setError(isField(field) ? field : "root", { message });
        }
        return;
      }
      reset({
        systemName: values.systemName,
        systemVersion: values.systemVersion ?? "",
        variant: values.variant ?? "",
      });
      toaster.create({ title: "Details saved.", type: "success" });
      router.refresh();
    } catch {
      setError("root", { message: "The details could not be saved. Try again." });
    }
  }

  return (
    <Card.Root>
      <Card.Header>
        <Heading size="md">Details</Heading>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit(save)} noValidate>
          <Stack gap="4">
            {errors.root && (
              <Alert.Root role="alert" status="error" size="sm">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{errors.root.message}</Alert.Description>
                </Alert.Content>
              </Alert.Root>
            )}
            <HStack gap="4" align="flex-start" wrap="wrap">
              <Field.Root required invalid={!!errors.systemName} flex="2" minW="64">
                <Field.Label>Name</Field.Label>
                <Input autoComplete="off" {...register("systemName")} />
                <Field.ErrorText>{errors.systemName?.message}</Field.ErrorText>
              </Field.Root>
              <Field.Root invalid={!!errors.systemVersion} flex="1" minW="40">
                <Field.Label>Version (optional)</Field.Label>
                <Input autoComplete="off" placeholder="2e" {...register("systemVersion")} />
                <Field.ErrorText>{errors.systemVersion?.message}</Field.ErrorText>
              </Field.Root>
              <Field.Root invalid={!!errors.variant} flex="1" minW="40">
                <Field.Label>Variant (optional)</Field.Label>
                <Input autoComplete="off" placeholder="Numenera" {...register("variant")} />
                <Field.ErrorText>{errors.variant?.message}</Field.ErrorText>
              </Field.Root>
            </HStack>
            <HStack justify="flex-end">
              <Button type="submit" size="sm" loading={isSubmitting}>
                Save details
              </Button>
            </HStack>
          </Stack>
        </form>
      </Card.Body>
    </Card.Root>
  );
}
