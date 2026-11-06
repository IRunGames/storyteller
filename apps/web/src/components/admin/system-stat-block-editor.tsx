"use client";

import NextLink from "next/link";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Card,
  Code,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { Plus, Trash2 } from "lucide-react";
import {
  sa_setSystemStatBlockDefinition,
  type AdminSystemDetail,
} from "@/app/(app)/(nav)/admin/systems/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import {
  joinRack,
  splitRack,
  statBlockDefinitionFormSchema,
  type StatBlockDefinitionFormInput,
} from "@/lib/stat-block-schemas";
import {
  canConnect,
  STAT_TYPE_LABELS,
  STAT_TYPES,
  type StatBlockDefinition,
  type StatType,
} from "@/lib/stat-blocks";

type FormInput = StatBlockDefinitionFormInput;

/** The definition as the form holds it: each rack as the text of its field. */
function toForm(definition: StatBlockDefinition): FormInput {
  return {
    groups: definition.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: joinRack(stat.rack) })),
    })),
  };
}

/** The form's values as a definition, for the JSON tab; the schema does the same on save. */
function toDefinition(values: FormInput): StatBlockDefinition {
  return {
    groups: values.groups.map((group) => ({
      ...group,
      stats: group.stats.map((stat) => ({ ...stat, rack: splitRack(stat.rack) })),
    })),
  };
}

const EMPTY_STAT = {
  name: "",
  label: "",
  type: "display" as StatType,
  rack: "",
  connectedTo: "",
  computedAs: "",
};

/**
 * The editor of one system's stat block definition: its groups as cards,
 * each with its stats as rows, and a JSON tab that shows what the form
 * would save. Saving posts the whole definition; the rules the schema keeps
 * (names, references, cycles) come back on the field they name, in the
 * browser first and from the action again.
 */
export function SystemStatBlockEditor({ system }: { system: AdminSystemDetail }) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, StatBlockDefinition>({
    resolver: zodResolver(statBlockDefinitionFormSchema),
    defaultValues: toForm(system.definition),
  });
  const groups = useFieldArray({ control, name: "groups" });
  // The live values for the JSON tab: useWatch rather than watch(), which
  // the React Compiler cannot memoise safely.
  const live = useWatch({ control });

  async function onSubmit(definition: StatBlockDefinition) {
    let result: Awaited<ReturnType<typeof sa_setSystemStatBlockDefinition>>;
    try {
      result = await sa_setSystemStatBlockDefinition(system.idSystem, definition);
    } catch {
      setError("root", { message: "The definition could not be saved. Please try again." });
      return;
    }
    if (result.ok) {
      // What was saved is what the form now starts from, so the rack texts
      // read as they were split and nothing shows as changed.
      reset(toForm(definition));
      toaster.create({ title: "Stat block saved.", type: "success" });
      return;
    }
    for (const [path, message] of Object.entries(result.errors)) {
      setError(path === "root" ? "root" : (path as `groups.${number}.name`), { message });
    }
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="2xl">{system.label}</Heading>
        <Text color="fg.muted">
          The stat block every element run in this system can carry: its groups, and the stats in
          each. Formulas and connections name a stat as <Code>stat</Code> within its group or{" "}
          <Code>group.stat</Code>.
        </Text>
      </Stack>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap="4">
          {errors.root && (
            <Alert.Root role="alert" status="error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errors.root.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
          {/* The groups array's own message: too many, or too long in all. */}
          {errors.groups?.root && (
            <Alert.Root role="alert" status="error" size="sm">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errors.groups.root.message}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          <Tabs.Root defaultValue="form" variant="line" lazyMount>
            <Tabs.List>
              <Tabs.Trigger value="form">Form</Tabs.Trigger>
              <Tabs.Trigger value="json">JSON</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="form">
              <Stack gap="4">
                {groups.fields.map((group, g) => (
                  <Card.Root key={group.id} size="sm">
                    <Card.Header>
                      <HStack gap="3" align="flex-start">
                        <Field.Root invalid={!!errors.groups?.[g]?.name} flex="1">
                          <Field.Label>Group name</Field.Label>
                          <Input size="sm" autoComplete="off" {...register(`groups.${g}.name`)} />
                          <Field.ErrorText>{errors.groups?.[g]?.name?.message}</Field.ErrorText>
                        </Field.Root>
                        <Field.Root invalid={!!errors.groups?.[g]?.label} flex="1">
                          <Field.Label>Group label (optional)</Field.Label>
                          <Input size="sm" autoComplete="off" {...register(`groups.${g}.label`)} />
                          <Field.ErrorText>{errors.groups?.[g]?.label?.message}</Field.ErrorText>
                        </Field.Root>
                        <Box pt="6">
                          <PrepIconButton label="Remove group" onClick={() => groups.remove(g)}>
                            <Trash2 />
                          </PrepIconButton>
                        </Box>
                      </HStack>
                    </Card.Header>
                    <Card.Body>
                      <StatRows
                        control={control}
                        register={register}
                        errors={errors}

                        g={g}
                      />
                    </Card.Body>
                  </Card.Root>
                ))}
                <Box>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => groups.append({ name: "", label: "", stats: [] })}
                  >
                    <Plus /> Add group
                  </Button>
                </Box>
              </Stack>
            </Tabs.Content>
            <Tabs.Content value="json">
              {/* What the form would save, as the column will hold it. Read
                  from the live values, so it follows every keystroke. */}
              <Box as="pre" fontSize="sm" p="3" borderWidth="1px" rounded="md" overflowX="auto">
                {JSON.stringify(toDefinition(live as FormInput), null, 2)}
              </Box>
            </Tabs.Content>
          </Tabs.Root>

          <HStack gap="3">
            <Button type="submit" loading={isSubmitting}>
              Save stat block
            </Button>
            <Button asChild variant="ghost">
              <NextLink href="/admin/systems">Back to systems</NextLink>
            </Button>
          </HStack>
        </Stack>
      </form>
    </Stack>
  );
}

/**
 * One group's stats, each a row of fields with the ones its type uses. A
 * child component rather than a loop in the editor, since a field array
 * must be hooked per group: useFieldArray takes one name, and hooks cannot
 * run in a loop.
 */
function StatRows({
  control,
  register,
  errors,
  g,
}: {
  control: Control<FormInput, unknown, StatBlockDefinition>;
  register: UseFormRegister<FormInput>;
  errors: FieldErrors<FormInput>;
  g: number;
}) {
  const stats = useFieldArray({ control, name: `groups.${g}.stats` });
  const types = useWatch({ control, name: `groups.${g}.stats` });

  return (
    <Stack gap="3">
      {stats.fields.map((stat, s) => {
        const type = types?.[s]?.type ?? "display";
        const at = errors.groups?.[g]?.stats?.[s];
        return (
          <HStack key={stat.id} gap="3" align="flex-start" wrap="wrap">
            <Field.Root invalid={!!at?.name} w="40">
              <Field.Label>Name</Field.Label>
              <Input size="sm" autoComplete="off" {...register(`groups.${g}.stats.${s}.name`)} />
              <Field.ErrorText>{at?.name?.message}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={!!at?.label} w="40">
              <Field.Label>Label (optional)</Field.Label>
              <Input size="sm" autoComplete="off" {...register(`groups.${g}.stats.${s}.label`)} />
              <Field.ErrorText>{at?.label?.message}</Field.ErrorText>
            </Field.Root>
            <Field.Root invalid={!!at?.type} w="32">
              <Field.Label>Type</Field.Label>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field {...register(`groups.${g}.stats.${s}.type`)}>
                  {STAT_TYPES.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {STAT_TYPE_LABELS[candidate]}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Field.ErrorText>{at?.type?.message}</Field.ErrorText>
            </Field.Root>
            {type === "rack" && (
              <Field.Root invalid={!!at?.rack} flex="1" minW="48">
                <Field.Label>Rack entries</Field.Label>
                <Input
                  size="sm"
                  autoComplete="off"
                  placeholder="d4, d6, d8"
                  {...register(`groups.${g}.stats.${s}.rack`)}
                />
                <Field.ErrorText>{at?.rack?.message}</Field.ErrorText>
              </Field.Root>
            )}
            {canConnect(type) && (
              <Field.Root invalid={!!at?.connectedTo} w="48">
                <Field.Label>Connected to (optional)</Field.Label>
                <Input
                  size="sm"
                  autoComplete="off"
                  placeholder="stats.str"
                  {...register(`groups.${g}.stats.${s}.connectedTo`)}
                />
                <Field.ErrorText>{at?.connectedTo?.message}</Field.ErrorText>
              </Field.Root>
            )}
            {type === "computed" && (
              <Field.Root invalid={!!at?.computedAs} flex="1" minW="64">
                <Field.Label>Formula</Field.Label>
                <Input
                  size="sm"
                  autoComplete="off"
                  placeholder="floor((stats.str.value - 10) / 2)"
                  {...register(`groups.${g}.stats.${s}.computedAs`)}
                />
                <Field.ErrorText>{at?.computedAs?.message}</Field.ErrorText>
              </Field.Root>
            )}
            <Box pt="6">
              <PrepIconButton label="Remove stat" onClick={() => stats.remove(s)}>
                <Trash2 />
              </PrepIconButton>
            </Box>
          </HStack>
        );
      })}
      <Box>
        <Button type="button" size="xs" variant="outline" onClick={() => stats.append(EMPTY_STAT)}>
          <Plus /> Add stat
        </Button>
      </Box>
    </Stack>
  );
}
