import { z } from "zod";

// A <select> posts "" for "not played yet" and a string for a sitting; the
// preprocess turns both into what story_scenes.id_story_session wants.
const idStorySession = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : Number(value)),
  z.number().int().min(-2147483648).max(2147483647).nullable(),
);

// One schema for creating and editing a scene: both forms post the same
// fields. The status is not among them; a new scene takes the workflow's
// default, and it moves by its pill from then on.
export const sceneSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please give the scene a title.")
    .max(200, "Keep the title under 200 characters."),
  description: z.string().trim().max(8000, "Keep the description under 8000 characters."),
  idStorySession,
});

export type SceneValues = z.infer<typeof sceneSchema>;

// The storyteller's table makes a scene for the session it is running, so
// its New scene form asks for the title and description only; the action
// puts the scene in that session.
export const runSceneSchema = sceneSchema.pick({ title: true, description: true });

export type RunSceneValues = z.infer<typeof runSceneSchema>;

// The panel behind the scene's title at either table: the description, as
// the scene forms bound it, and the notes beside it. Both may be empty.
export const sceneTextSchema = z.object({
  description: sceneSchema.shape.description,
  notes: z.string().trim().max(8000, "Keep the notes under 8000 characters."),
});

export type SceneTextValues = z.infer<typeof sceneTextSchema>;

// The same panel on a scene's live-edit page, which renames the scene too,
// so its title is bound as the scene forms bind it.
export const liveSceneTextSchema = sceneTextSchema.extend({ title: sceneSchema.shape.title });

export type LiveSceneTextValues = z.infer<typeof liveSceneTextSchema>;
