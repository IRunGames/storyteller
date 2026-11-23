import { z } from "zod";

// The drawing an annotated picture carries over itself
// (attachment_annotations.ops): an ordered list of steps, each a fog shape, a
// fog reset, a pen mark, a shape, an eraser's drag, an erasing of every
// annotation, a wall, a wall eraser's drag, or a flood. A wall is the
// storyteller's alone: it steers a flood and is never drawn into the players'
// copy. The order is the drawing: a later Cover over an earlier Reveal hides it again, and a Cover
// all or Clear all makes every fog step before it moot. Coordinates are in
// the picture's own pixels, as measured upright (attachment_annotations.width
// and height).
//
// The client sends steps and the server stores them, so every limit below is
// the server's guard against a drawing it cannot render in time or a row
// that grows without end; the annotator keeps well inside them in use.

/** The most steps a drawing may hold. */
export const MAX_ANNOTATION_OPS = 5000;

/** The most points one brush stroke or pen mark may hold. */
export const MAX_STROKE_POINTS = 2000;

/** The most steps one save may add, the annotator sending its changes as they come. */
export const MAX_APPENDED_OPS = 100;

/** The most marks one drag of the eraser may take away. */
export const MAX_ERASE_TARGETS = 500;

/** The most points one wall may hold. */
export const MAX_WALL_POINTS = 500;

/**
 * The most rings one flood may hold: the area it fills and the holes in it.
 * Set well past any map's rooms, since every closed room inside a flood is a
 * hole it must keep; the points below are what hold a flood to one save.
 */
export const MAX_FLOOD_RINGS = 2_000;

/** The most points one flood may hold across all its rings. */
export const MAX_FLOOD_POINTS = 10_000;

/** The shapes the shape tool draws, each from its centre out. */
export const SHAPE_KINDS = ["circle", "triangle", "square", "pentagon", "hexagon"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Whether a fog step lifts the fog (Reveal) or lays it down again (Cover). */
export const ANNOTATION_MODES = ["reveal", "cover"] as const;
export type AnnotationMode = (typeof ANNOTATION_MODES)[number];

const modeSchema = z.enum(ANNOTATION_MODES);

// A coordinate or a size: a finite number, any picture's pixels well inside
// the bound. Fractions are kept, the annotator rounding them to one place.
const coordinateSchema = z.number().min(-100_000).max(100_000);
const sizeSchema = z.number().gt(0).max(100_000);

// A stroke's points flat, x then y: [x1, y1, x2, y2, ...]. One point is a dot.
const pointsSchema = z
  .array(coordinateSchema)
  .min(2)
  .max(MAX_STROKE_POINTS * 2)
  .refine((points) => points.length % 2 === 0, { error: "A point needs both x and y." });

const brushOpSchema = z.object({
  t: z.literal("brush"),
  mode: modeSchema,
  radius: sizeSchema,
  points: pointsSchema,
});

const rectOpSchema = z.object({
  t: z.literal("rect"),
  mode: modeSchema,
  x: coordinateSchema,
  y: coordinateSchema,
  w: sizeSchema,
  h: sizeSchema,
});

/** Cover all (mode cover) or Clear all (mode reveal). */
const fogAllOpSchema = z.object({ t: z.literal("fogAll"), mode: modeSchema });

// A color is held to #rrggbb because it is written into SVG, on the
// storyteller's page and in the players' copy the server renders: nothing
// else may reach the attribute.
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "A color is #rrggbb.");

const penOpSchema = z.object({
  t: z.literal("pen"),
  color: colorSchema,
  width: sizeSchema,
  points: pointsSchema,
});

/**
 * A shape's outline, drawn with the pen's color and width from its centre
 * out to `r`: a circle of that radius, or a regular shape whose corners lie
 * on it. `angle` is which way the shape is turned: the direction from the
 * centre to the corner the drag ended on, in degrees from pointing right,
 * turning towards down (the picture's y runs down). Absent, a corner points
 * straight up.
 */
const shapeOpSchema = z.object({
  t: z.literal("shape"),
  shape: z.enum(SHAPE_KINDS),
  color: colorSchema,
  width: sizeSchema,
  cx: coordinateSchema,
  cy: coordinateSchema,
  r: sizeSchema,
  angle: z.number().min(-360).max(360).optional(),
});

/**
 * One drag of the eraser: the pen marks and shapes it took away, named by
 * where they stand in the drawing. A drawing only grows at its end and Undo
 * only takes its last step, so a mark's place never changes under the step
 * that names it; eraseRefusal holds each to a mark drawn before it.
 */
const eraseOpSchema = z.object({
  t: z.literal("erase"),
  targets: z.array(z.int().min(0)).min(1).max(MAX_ERASE_TARGETS),
});

/** Erase all annotations: every pen mark and shape before it is gone. */
const penClearOpSchema = z.object({ t: z.literal("penClear") });

/**
 * A fog wall, drawn on the fog by the storyteller: a line a flood stops at.
 * Points are flat, x then y, as a pen mark's are.
 */
const wallOpSchema = z.object({
  t: z.literal("wall"),
  points: z
    .array(coordinateSchema)
    .min(4)
    .max(MAX_WALL_POINTS * 2)
    .refine((points) => points.length % 2 === 0, { error: "A point needs both x and y." }),
});

/** One drag of the wall eraser: the walls it took away, named like an eraser's marks. */
const wallEraseOpSchema = z.object({
  t: z.literal("wallErase"),
  targets: z.array(z.int().min(0)).min(1).max(MAX_ERASE_TARGETS),
});

// A flood's rings are the outlines of the area it fills and of the holes in
// it, each flat x then y. Each ring is bounded alone so one cannot be
// enormous, and the rings together are held to the step's total.
const ringSchema = z
  .array(coordinateSchema)
  .min(6)
  .max(MAX_FLOOD_POINTS * 2)
  .refine((ring) => ring.length % 2 === 0, { error: "A point needs both x and y." });

/** A flood: fog lifted (reveal) or laid down (cover) over the area the click reached. */
const floodOpSchema = z.object({
  t: z.literal("flood"),
  mode: modeSchema,
  rings: z
    .array(ringSchema)
    .min(1)
    .max(MAX_FLOOD_RINGS)
    .refine((rings) => rings.reduce((sum, ring) => sum + ring.length / 2, 0) <= MAX_FLOOD_POINTS, {
      error: "A flood has too many points.",
    }),
});

export const annotationOpSchema = z.discriminatedUnion("t", [
  brushOpSchema,
  rectOpSchema,
  fogAllOpSchema,
  penOpSchema,
  shapeOpSchema,
  eraseOpSchema,
  penClearOpSchema,
  wallOpSchema,
  wallEraseOpSchema,
  floodOpSchema,
]);
export type AnnotationOp = z.infer<typeof annotationOpSchema>;
export type WallOp = Extract<AnnotationOp, { t: "wall" }>;
export type FloodOp = Extract<AnnotationOp, { t: "flood" }>;

export const annotationOpsSchema = z.array(annotationOpSchema).max(MAX_ANNOTATION_OPS);

/** A fog's opacity as a whole percentage. */
export const fogOpacitySchema = z.int().min(0).max(100);

/** The fog's color, the drawing's own, as #rrggbb. */
export const fogColorSchema = colorSchema;

/** What a drawing's annotations are: the steps an eraser may take away. */
export const isMark = (op: AnnotationOp) => op.t === "pen" || op.t === "shape";

/** The steps that concern walls: a wall drawn, or walls taken away. */
export const isWallStep = (op: AnnotationOp) => op.t === "wall" || op.t === "wallErase";

/**
 * Why a drawing's erasers may not stand, or null when they may: each eraser
 * must name only pen marks and shapes drawn before it, and each wall eraser
 * only walls drawn before it. Checked on the drawing whole, as a save makes
 * it, since an eraser names steps by their places.
 */
export function eraseRefusal(ops: readonly AnnotationOp[]): string | null {
  for (let at = 0; at < ops.length; at++) {
    const op = ops[at];
    if (op.t === "erase") {
      for (const target of op.targets) {
        if (target >= at || !isMark(ops[target])) {
          return "An eraser can only take away a mark drawn before it.";
        }
      }
    } else if (op.t === "wallErase") {
      for (const target of op.targets) {
        if (target >= at || ops[target].t !== "wall") {
          return "A wall eraser can only take away a wall drawn before it.";
        }
      }
    }
  }
  return null;
}

/**
 * One save from the annotator: keep the first `keep` steps of the drawing as
 * saved at `baseRevision`, then add `append`. Drawing is keep = all and a new
 * step; Undo is keep = all but one and nothing; both at once is a step
 * undone and another drawn before the save went. The players' opacity and
 * the fog's color ride along when they changed.
 */
export const saveAnnotationSchema = z.object({
  baseRevision: z.int().min(0),
  keep: z.int().min(0),
  append: z.array(annotationOpSchema).max(MAX_APPENDED_OPS),
  fogOpacityPlayers: fogOpacitySchema.optional(),
  fogColor: fogColorSchema.optional(),
});
export type SaveAnnotationInput = z.infer<typeof saveAnnotationSchema>;
