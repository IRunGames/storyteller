import type { AnnotationOp } from "./annotation-schemas";

// What the annotator and the players' copy share about an annotated
// picture's drawing that is not the steps themselves: the pen's colors, the
// sizes on offer, the fog's color and opacities, and what the storyteller's
// page holds of a drawing. The steps are lib/annotation-schemas.ts's; how
// they are drawn is lib/annotation-drawing.ts's.

/**
 * The pen's colors, picked from swatches. Light and dark both, since a
 * picture may be either; each is #rrggbb, the only form a pen step takes.
 */
export const PEN_COLORS = [
  { value: "#e53935", label: "Red" },
  { value: "#fb8c00", label: "Orange" },
  { value: "#fdd835", label: "Yellow" },
  { value: "#43a047", label: "Green" },
  { value: "#1e88e5", label: "Blue" },
  { value: "#8e24aa", label: "Purple" },
  { value: "#ffffff", label: "White" },
  { value: "#000000", label: "Black" },
] as const;

export const DEFAULT_PEN_COLOR = PEN_COLORS[0].value;

// The pen's width and the brush's size are sliders over small whole numbers,
// turned into the picture's pixels by its long side, so a mark comes out the
// same share of any picture, a small scan or a large map: a pen width of n
// is n tenths of a percent of the long side, a brush size of n is a radius
// of n percent.
export const PEN_WIDTHS = { min: 1, max: 20, initial: 4 } as const;
export const BRUSH_SIZES = { min: 1, max: 20, initial: 4 } as const;

const longSide = (width: number, height: number) => Math.max(width, height);

/** The pen's width in the picture's pixels, for a width chosen on its slider. */
export function penWidthPx(value: number, width: number, height: number): number {
  return (longSide(width, height) * value) / 1000;
}

/** The brush's radius in the picture's pixels, for a size chosen on its slider. */
export function brushRadiusPx(value: number, width: number, height: number): number {
  return (longSide(width, height) * value) / 100;
}

/**
 * The fog's color, the same dark slate in every theme and in the players'
 * copy: it stands for what is not yet seen on the picture, not for the page
 * around it.
 */
export const FOG_COLOR = "#1b1d23";

/**
 * The fog's colors, picked from swatches: the drawing's own, so the players'
 * copy is drawn in it too. Dark and light both, for a map that is either.
 * Each is #rrggbb, the only form the fog's color takes.
 */
export const FOG_COLORS = [
  { value: FOG_COLOR, label: "Slate" },
  { value: "#000000", label: "Black" },
  { value: "#4a5160", label: "Storm" },
  { value: "#16233d", label: "Night" },
  { value: "#1d3324", label: "Forest" },
  { value: "#cfd4dc", label: "Mist" },
  { value: "#e9dcbf", label: "Parchment" },
  { value: "#ffffff", label: "White" },
] as const;

/** How thick the storyteller's own fog is until they choose, light enough to draw through. */
export const DEFAULT_OWN_FOG_OPACITY = 50;

/** How thick the players' fog is until the storyteller chooses: solid, hiding what it covers. */
export const DEFAULT_PLAYERS_FOG_OPACITY = 100;

/**
 * How long one players' copy render keeps catching up with the drawing
 * before it stops starting new renders (lib/players-copy.ts), and how long
 * its claim on the drawing holds before another render may take it, the
 * first presumed gone (db/attachment-annotations.ts). The catching up stops
 * well short of the claim, so a render still at work is never taken for
 * gone; the pages the annotator saves from let their function run as long
 * as the claim (maxDuration), since the render runs after the save's answer.
 */
export const CATCH_UP_MS = 40_000;
export const RENDER_CLAIM_SECONDS = 60;

/**
 * A picture's drawing as the storyteller's page holds it, with the raw
 * picture it is drawn over. Never handed to a player: what they see is the
 * players' copy.
 */
export type PictureAnnotation = {
  idAttachment: number;
  /** The picture as it is, which only the storyteller is given. */
  imageUrl: string;
  /** Whether the picture is annotated: players are given the players' copy. */
  isActive: boolean;
  /** The picture's size upright, in its own pixels, which the steps' coordinates are in. */
  width: number;
  height: number;
  ops: AnnotationOp[];
  /** The save this is, which the next save names so two pages cannot write over each other. */
  revision: number;
  fogOpacityPlayers: number;
  /** The fog's color, #rrggbb, the same in the storyteller's view and the players' copy. */
  fogColor: string;
};

/**
 * A picture as its annotation controls need it: which file, how it is shown,
 * whether the server can draw on it (one the app uploaded, not a typed link, which no
 * server fetches), and its drawing: whether there is one, and whether it is
 * on, the players then being given the players' copy.
 */
export type PictureState = {
  idAttachment: number;
  /**
   * The picture as the storyteller is shown it: its players' copy while it
   * is annotated and one has been rendered, so they see what the players
   * see, else the picture itself.
   */
  shownUrl: string | null;
  canAnnotate: boolean;
  hasDrawing: boolean;
  isAnnotated: boolean;
};

/**
 * What the annotator's next save carries: how many of the saved steps it
 * keeps and the steps after them. The annotator's own list starts as the
 * saved one and changes by undoing steps from its end and drawing new ones
 * onto it, so the two share a start; steps are told apart by identity, the
 * annotator never copying one, which keeps this cheap over long strokes.
 */
export function pendingChange(
  saved: readonly AnnotationOp[],
  local: readonly AnnotationOp[],
): { keep: number; append: AnnotationOp[] } {
  let keep = 0;
  while (keep < saved.length && keep < local.length && saved[keep] === local[keep]) keep++;
  return { keep, append: local.slice(keep) };
}
