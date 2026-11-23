"use client";

import { useState, type ReactNode } from "react";
import NextLink from "next/link";
import { useForm, useFieldArray, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Accordion, Box, Button, Code, Heading, HStack, Stack, Tabs, Text } from "@chakra-ui/react";
import { ChevronsDown, ChevronsUp, Plus } from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { FormError } from "@/components/forms/form-error";
import { statBlockDefinitionFormSchema } from "@/lib/stat-block-schemas";
import type { StatBlockDefinition } from "@/lib/stat-blocks";
import { applyActionErrors } from "@/lib/forms";
import { toDefinition, toForm, type FormInput } from "./stat-block-definition-form";
import { GroupItem } from "./stat-block-definition-group";
import { HealthIndicatorSelect } from "./stat-block-health-indicator-select";

/** What a save answers: done, or the schema's refusals keyed by the field they name, "root" for the rest. */
export type SaveDefinitionResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Stands in the open list for the group added last, whose field id is not
 * known until the field array has re-rendered: Add group puts this in, and
 * it is read as the last group's id when the accordion is drawn, so a new
 * group opens for its name to be typed. It is pinned to that id before
 * anything moves, removes or adds a group, so it does not follow the last
 * place to another group; the accordion itself reports real ids. A save
 * resets the form, which gives every group a new id, so the groups open at
 * the save are kept by place (atIndex) and read back to ids once the reset
 * has drawn.
 */
const NEWEST = "newest";
/** Stands in the open list for the group at a place, across a save's reset; see NEWEST. */
const atIndex = (g: number) => `#${g}`;

/**
 * The editor of a stat block definition: its groups as an accordion, each
 * closed to a line of its name, label and whether it repeats until it is
 * opened for its fields and its stats as rows, and a JSON tab that shows
 * what the form would save. Every group starts closed. Saving posts the
 * whole definition; the rules the schema keeps (names, references, cycles)
 * come back on the field they name, in the browser first and from the
 * action again, and a group with an error on it is opened so the message
 * can be seen. Whose definition it is, a system's or a story's copy, is the
 * caller's: it hands in the definition, the opening sentence that says
 * whose, the save that calls its own action, and where Back beside Save
 * goes, if the page wants one there, as DeleteButton's callers hand in
 * theirs.
 */
export function StatBlockDefinitionEditor({
  definition,
  intro,
  save,
  back,
}: {
  definition: StatBlockDefinition;
  /** The opening sentence: whose stat block this is, and what carries it. */
  intro: ReactNode;
  /** Saves the definition through the caller's action. */
  save: (definition: StatBlockDefinition) => Promise<SaveDefinitionResult>;
  /**
   * The link beside Save, back to where the editor was opened from; left out
   * where the page puts its own way back elsewhere (the Systems page, by the
   * system's name).
   */
  back?: { href: string; label: string };
}) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, StatBlockDefinition>({
    resolver: zodResolver(statBlockDefinitionFormSchema),
    defaultValues: toForm(definition),
  });
  const groups = useFieldArray({ control, name: "groups" });
  // The live values for the JSON tab: useWatch rather than watch(), which
  // the React Compiler cannot memoise safely.
  const live = useWatch({ control });
  // The open groups by field id, which travels with a group as it is moved.
  const [open, setOpen] = useState<string[]>([]);
  const lastId = groups.fields[groups.fields.length - 1]?.id;
  /** The open list with NEWEST read as the id it stands for right now. */
  const pinned = (current: string[]) =>
    current
      .map((id) =>
        id === NEWEST ? lastId : id.startsWith("#") ? groups.fields[Number(id.slice(1))]?.id : id,
      )
      .filter((id): id is string => id !== undefined);
  const openIds = pinned(open);

  function addGroup() {
    setOpen((current) => [...pinned(current), NEWEST]);
    groups.append({
      name: "",
      label: "",
      keyedBy: "",
      rollAll: false,
      canHaveMultiples: false,
      stats: [],
    });
  }
  function moveGroup(from: number, to: number) {
    setOpen(pinned);
    groups.move(from, to);
  }
  function removeGroup(g: number) {
    setOpen(pinned);
    groups.remove(g);
  }

  function openGroupsWithErrors(found: FieldErrors<FormInput>) {
    const ids = groups.fields.filter((_, g) => found.groups?.[g] !== undefined).map((f) => f.id);
    if (ids.length > 0) setOpen((current) => [...new Set([...current, ...ids])]);
  }

  async function onSubmit(posted: StatBlockDefinition) {
    let result: SaveDefinitionResult;
    try {
      result = await save(posted);
    } catch {
      setError("root", { message: "The definition could not be saved. Please try again." });
      return;
    }
    if (result.ok) {
      // What was saved is what the form now starts from, so the rack texts
      // read as they were split and nothing shows as changed. The groups
      // that were open stay open, found again by their place.
      const openAt = groups.fields.flatMap((field, g) =>
        openIds.includes(field.id) ? [atIndex(g)] : [],
      );
      reset(toForm(posted));
      setOpen(openAt);
      toaster.create({ title: "Stat block saved.", type: "success" });
      return;
    }
    applyActionErrors(
      { setError },
      result.errors,
      (path) => path.startsWith("groups.") || path === "healthIndicator",
    );
    // The groups holding an error open, found by the index in each path.
    const withErrors: FieldErrors<FormInput> = { groups: [] };
    for (const [path, message] of Object.entries(result.errors)) {
      const g = /^groups\.(\d+)\./.exec(path)?.[1];
      if (g !== undefined) (withErrors.groups as unknown[])[Number(g)] = { message };
    }
    openGroupsWithErrors(withErrors);
  }

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading size="lg">Stat Block Definitions</Heading>
        <Text color="fg.muted">
          {intro} Formulas name a stat as <Code>stat</Code> within its group or{" "}
          <Code>group.stat</Code>. A group that repeats by one of its stats holds a list of rows on
          each element, told apart by that stat. A stat that is not visible is filled in on the prep
          form and feeds formulas as any other, but the table does not show it. A number format
          holds a display to a number, as a pool and a stack always are, and number +/- writes the
          value with its sign at the table.
        </Text>
      </Stack>

      <form onSubmit={handleSubmit(onSubmit, openGroupsWithErrors)} noValidate>
        <Stack gap="4">
          <FormError message={errors.root?.message} />
          {/* The groups array's own message: too many, or too long in all. */}
          {errors.groups?.root && <FormError message={errors.groups.root.message} size="sm" />}
          <HealthIndicatorSelect control={control} register={register} errors={errors} />

          <Tabs.Root defaultValue="groups" variant="line" lazyMount>
            <Tabs.List>
              <Tabs.Trigger value="groups">Groups</Tabs.Trigger>
              {/* On the Groups tab's heading, for every group at once: the one
                  way to see the whole definition, or to fold it back up. Beside
                  the trigger rather than in it, since a button cannot hold
                  buttons. */}
              <HStack gap="0" mr="2" alignSelf="center">
                <IconButtonWithTooltip
                  label="Open all groups"
                  onClick={() => setOpen(groups.fields.map((group) => group.id))}
                >
                  <ChevronsDown />
                </IconButtonWithTooltip>
                <IconButtonWithTooltip label="Close all groups" onClick={() => setOpen([])}>
                  <ChevronsUp />
                </IconButtonWithTooltip>
              </HStack>
              <Tabs.Trigger value="json">JSON</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="groups">
              <Stack gap="4">
                {/* Plain, so each item draws its own boundary: a line, or a
                    double line for a group that repeats. Any number may be
                    open at once; closing the last one is allowed. */}
                <Accordion.Root
                  multiple
                  collapsible
                  variant="plain"
                  value={openIds}
                  onValueChange={(details) => setOpen(details.value)}
                >
                  <Stack gap="4">
                    {groups.fields.map((group, g) => (
                      <GroupItem
                        key={group.id}
                        id={group.id}
                        g={g}
                        count={groups.fields.length}
                        moveGroup={moveGroup}
                        removeGroup={removeGroup}
                        control={control}
                        register={register}
                        setValue={setValue}
                        errors={errors}
                      />
                    ))}
                  </Stack>
                </Accordion.Root>
                <Box>
                  <Button type="button" size="sm" variant="outline" onClick={addGroup}>
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
            {back && (
              <Button asChild variant="ghost">
                <NextLink href={back.href}>{back.label}</NextLink>
              </Button>
            )}
          </HStack>
        </Stack>
      </form>
    </Stack>
  );
}

/**
 * One group of the accordion. Closed, its trigger reads the group's name
 * with how many stats it holds, its label, and what it repeats by when it
 * does, set apart in italics, as they are being typed, with the move
 * arrows to its left and the trashcan to its right rather than in it, since
 * a button cannot hold buttons and a closed group is still moved and
 * removed. Open, the fields for those three, then the group's stats. A group
 * that repeats is drawn with a double boundary in the colour of its Repeats
 * by line, so the groups whose elements carry rows stand out from those that
 * carry one record. A child component, since the group's values are watched
 * per group.
 */
