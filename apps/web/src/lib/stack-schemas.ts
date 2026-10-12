import { z } from "zod";

// The run page's stacks are a scene's tags (story_scenes.tags), one stack
// each in the play space, in the order the array holds them.

/**
 * One stack's name as the storyteller types it: trimmed and short enough to
 * head a stack. Kept as typed, not lower-cased: the play space shows it in
 * capitals whatever its case, and the scene's existing tags are matched
 * exactly by the links filed under them.
 */
export const stackNameSchema = z
  .string()
  .trim()
  .min(1, "Please name the stack.")
  .max(40, "Keep a stack's name under 40 characters.")
  // Nothing a person types, and it keeps sa_setSceneStacks' rename
  // placeholder from ever being a stack's real name.
  .regex(/^\P{Cc}*$/u, "A stack's name cannot hold control characters.");

/**
 * A scene's stacks in order. Two that differ only in case would look the
 * same in the play space, so they count as one name. Empty is allowed: the
 * scene then shows its one Default stack.
 */
export const stacksSchema = z
  .array(stackNameSchema)
  .max(20, "That is too many stacks. Remove a few first.")
  .refine(
    (names) => new Set(names.map((name) => name.toLowerCase())).size === names.length,
    "Each stack needs its own name.",
  );

/**
 * Manage stacks: the scene's stacks, the ones renamed (each stack's name as
 * it was, and as it is now in `tags`), and whether new scenes in the story
 * start with them too. A rename carries the elements filed under the stack
 * with it; a stack taken away and one added are not renames.
 */
export const sceneStacksSchema = z
  .object({
    tags: stacksSchema,
    renames: z
      .array(z.object({ from: stackNameSchema, to: stackNameSchema }))
      .max(20)
      .default([]),
    saveForStory: z.boolean(),
  })
  .refine((value) => value.renames.every((rename) => value.tags.includes(rename.to)), {
    message: "A renamed stack must be one of the stacks.",
    path: ["tags"],
  });

export type SceneStacksValues = z.infer<typeof sceneStacksSchema>;

/** One stack renamed in Manage stacks: its name as it was, and as it is now. */
export type StackRename = { from: string; to: string };

/** The New stack dialog's one field. */
export const newStackSchema = z.object({ name: stackNameSchema });

export type NewStackValues = z.infer<typeof newStackSchema>;
