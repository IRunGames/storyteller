import sharp from "sharp";

import type { AnnotationOp } from "./annotation-schemas";
import { annotationTree, toSvgString } from "./annotation-drawing";
import { MAX_IMAGE_BYTES, isUploadedBlobUrl } from "./image-uploads";

// The server's half of an annotated picture: fetching the raw picture,
// measuring it, and rendering the players' copy, the picture with the
// drawing laid over it at the players' fog (lib/players-copy.ts uploads it).
// The drawing comes from lib/annotation-drawing.ts, the same tree the
// storyteller's annotator draws, so the two agree.

/** The players' copy's longest side in pixels: plenty for a screen, small enough to send quickly. */
export const PLAYERS_COPY_LONG_SIDE = 2560;

// The most pixels sharp will decode. An upload is held to MAX_IMAGE_BYTES,
// but a small file can still claim a vast size; this refuses one before it
// is decoded into memory.
const MAX_INPUT_PIXELS = 100_000_000;

const FETCH_TIMEOUT_MS = 15_000;

/** The drawing as the render needs it: the picture's size and the steps over it. */
export type PlayersCopyDrawing = {
  width: number;
  height: number;
  ops: readonly AnnotationOp[];
  fogOpacityPlayers: number;
  /** The fog's color; the slate when left out. */
  fogColor?: string;
};

/**
 * The raw picture's bytes, fetched only from the app's own Blob store. A
 * typed link is any address someone entered, and fetching it from the server
 * would let them point the server at a network it can reach and they cannot;
 * so the address must parse as an upload's, and no redirect is followed off
 * it. The size is held to what an upload may be, as it arrives and after.
 */
export async function fetchUploadedPicture(url: string): Promise<Buffer> {
  if (!isUploadedBlobUrl(url)) throw new Error("Only an uploaded picture can be annotated.");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`The picture could not be fetched (${response.status}).`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new Error("The picture is larger than an upload may be.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("The picture is larger than an upload may be.");
  }
  return bytes;
}

// autoOrient turns a phone's sideways photo upright, as a browser does when
// it shows it: the annotator's coordinates are in the upright picture's
// pixels, so the server must read the picture the same way round.
const open = (picture: Buffer) =>
  sharp(picture, { autoOrient: true, limitInputPixels: MAX_INPUT_PIXELS });

/** The picture's size as it stands upright, which the drawing's coordinates are in. */
export async function measurePicture(picture: Buffer): Promise<{ width: number; height: number }> {
  const { autoOrient } = await open(picture).metadata();
  return { width: autoOrient.width, height: autoOrient.height };
}

/**
 * The players' copy as WebP: the picture, scaled so its long side is at most
 * PLAYERS_COPY_LONG_SIDE, with the drawing over it. The SVG is written at the
 * copy's size with a viewBox in the picture's own pixels, so the drawing is
 * scaled with the picture and lands where it was drawn.
 */
export async function composePlayersCopy(
  picture: Buffer,
  drawing: PlayersCopyDrawing,
): Promise<Buffer> {
  const scale = Math.min(1, PLAYERS_COPY_LONG_SIDE / Math.max(drawing.width, drawing.height));
  const outWidth = Math.max(1, Math.round(drawing.width * scale));
  const outHeight = Math.max(1, Math.round(drawing.height * scale));
  const svg = toSvgString(
    annotationTree(drawing.ops, {
      width: drawing.width,
      height: drawing.height,
      outWidth,
      outHeight,
      fogOpacity: drawing.fogOpacityPlayers,
      fogColor: drawing.fogColor,
      maskId: "fog",
    }),
  );
  return open(picture)
    .resize({ width: outWidth, height: outHeight, fit: "fill" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
}
