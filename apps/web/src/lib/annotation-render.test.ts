import { afterEach, describe, it, mock } from "node:test";
import { expect } from "expect";
import sharp from "sharp";

import type { AnnotationOp } from "./annotation-schemas";
import {
  PLAYERS_COPY_LONG_SIDE,
  composePlayersCopy,
  fetchUploadedPicture,
  measurePicture,
} from "./annotation-render";
import { MAX_IMAGE_BYTES } from "./image-uploads";

const BLOB = "https://abc.public.blob.vercel-storage.com/uploads/u/map.png";

// A plain red picture, a colour the fog and the pen marks are told apart from.
function redPicture(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function pixelAt(image: Buffer, x: number, y: number) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

// WebP is lossy: a colour is near what was drawn, not exactly it.
function expectNear(actual: number[], expected: number[]) {
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(16));
}

describe("measurePicture", () => {
  it("measures a picture as it stands upright, after its camera's rotation", async () => {
    const turned = await sharp(await redPicture(100, 50))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(await measurePicture(turned)).toEqual({ width: 50, height: 100 });
  });
});

describe("composePlayersCopy", () => {
  it("fogs what is covered, shows what is revealed, and hides pen marks under the fog", async () => {
    const ops: AnnotationOp[] = [
      { t: "rect", mode: "reveal", x: 0, y: 0, w: 50, h: 50 },
      { t: "pen", color: "#0000ff", width: 6, points: [25, 10, 26, 10] },
      { t: "pen", color: "#0000ff", width: 6, points: [75, 10, 76, 10] },
    ];
    const copy = await composePlayersCopy(await redPicture(100, 50), {
      width: 100,
      height: 50,
      ops,
      fogOpacityPlayers: 100,
    });
    expect(await sharp(copy).metadata()).toMatchObject({ format: "webp", width: 100, height: 50 });
    // Revealed: the picture, and the pen mark on it.
    expectNear(await pixelAt(copy, 10, 40), [255, 0, 0]);
    expectNear(await pixelAt(copy, 25, 10), [0, 0, 255]);
    // Covered: the fog, over the pen mark too.
    expectNear(await pixelAt(copy, 90, 40), [0x1b, 0x1d, 0x23]);
    expectNear(await pixelAt(copy, 75, 10), [0x1b, 0x1d, 0x23]);
  });

  it("lets the picture through the fog as far as the players' opacity allows", async () => {
    const copy = await composePlayersCopy(await redPicture(100, 50), {
      width: 100,
      height: 50,
      ops: [],
      fogOpacityPlayers: 50,
    });
    expectNear(await pixelAt(copy, 50, 25), [
      Math.round((255 + 0x1b) / 2),
      Math.round(0x1d / 2),
      Math.round(0x23 / 2),
    ]);
  });

  it("draws the fog in the drawing's color", async () => {
    const copy = await composePlayersCopy(await redPicture(100, 50), {
      width: 100,
      height: 50,
      ops: [],
      fogOpacityPlayers: 100,
      fogColor: "#e9dcbf",
    });
    expectNear(await pixelAt(copy, 50, 25), [0xe9, 0xdc, 0xbf]);
  });

  it("scales a large picture down to the copy's long side, the drawing with it", async () => {
    const ops: AnnotationOp[] = [{ t: "rect", mode: "reveal", x: 0, y: 0, w: 1500, h: 1000 }];
    const copy = await composePlayersCopy(await redPicture(3000, 1000), {
      width: 3000,
      height: 1000,
      ops,
      fogOpacityPlayers: 100,
    });
    const { width, height } = await sharp(copy).metadata();
    expect(width).toBe(PLAYERS_COPY_LONG_SIDE);
    expect(height).toBe(Math.round((PLAYERS_COPY_LONG_SIDE * 1000) / 3000));
    expectNear(await pixelAt(copy, 100, 100), [255, 0, 0]);
    expectNear(await pixelAt(copy, PLAYERS_COPY_LONG_SIDE - 100, 100), [0x1b, 0x1d, 0x23]);
  });

  it("draws no wall and no enclosed area's blue into the players' copy", async () => {
    // A closed room: the players' copy must show the picture where its wall runs, and the
    // fog's own color, not the storyteller's blue, over the area it encloses.
    const room: AnnotationOp = { t: "wall", points: [10, 10, 100, 10, 100, 100, 10, 100, 10, 10] };
    const picture = await redPicture(400, 200);
    const clear = await composePlayersCopy(picture, {
      width: 400,
      height: 200,
      ops: [room],
      fogOpacityPlayers: 0,
    });
    expectNear(await pixelAt(clear, 55, 10), [255, 0, 0]);
    const fogged = await composePlayersCopy(picture, {
      width: 400,
      height: 200,
      ops: [room],
      fogOpacityPlayers: 100,
    });
    expectNear(await pixelAt(fogged, 55, 55), [0x1b, 0x1d, 0x23]);
    expectNear(await pixelAt(fogged, 55, 10), [0x1b, 0x1d, 0x23]);
  });
});

describe("fetchUploadedPicture", () => {
  afterEach(() => mock.restoreAll());

  it("refuses an address that is not one of the app's uploads, without fetching it", async () => {
    const fetched = mock.method(globalThis, "fetch", async () => new Response("x"));
    await expect(fetchUploadedPicture("https://example.com/map.png")).rejects.toThrow();
    await expect(fetchUploadedPicture("http://169.254.169.254/latest")).rejects.toThrow();
    expect(fetched.mock.callCount()).toBe(0);
  });

  it("fetches an upload, following no redirect", async () => {
    const fetched = mock.method(globalThis, "fetch", async () => new Response("png bytes"));
    const picture = await fetchUploadedPicture(BLOB);
    expect(picture.toString()).toBe("png bytes");
    expect(fetched.mock.calls[0].arguments[0]).toBe(BLOB);
    expect(fetched.mock.calls[0].arguments[1]).toMatchObject({ redirect: "error" });
  });

  it("refuses a failed answer and one larger than an upload may be", async () => {
    mock.method(globalThis, "fetch", async () => new Response("gone", { status: 404 }));
    await expect(fetchUploadedPicture(BLOB)).rejects.toThrow();
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(MAX_IMAGE_BYTES + 1)));
    await expect(fetchUploadedPicture(BLOB)).rejects.toThrow();
  });
});
