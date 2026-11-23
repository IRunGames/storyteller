import { describe, it } from "node:test";
import { expect } from "expect";

import {
  MAX_FLOOD_POINTS,
  MAX_FLOOD_RINGS,
  annotationOpSchema,
  type AnnotationOp,
} from "./annotation-schemas";
import { enclosedAreas, floodAt, insideRings, storytellerView, type Rings } from "./fog-areas";

const W = 1024,
  H = 512;
const split = [[512, 0, 512, 512]];

// Floods the area under each click, as a storyteller revealing every area would.
function floodAll(walls: number[][], clicks: number[][]): Rings[] {
  return clicks.map(([x, y]) => {
    const rings = floodAt(walls, W, H, x, y);
    expect(rings).not.toBeNull();
    return rings!;
  });
}

const inAny = (floods: Rings[], x: number, y: number) =>
  floods.some((rings) => insideRings(rings, x, y));

// The points of a half-pixel lattice within `radius` of a point that no flood covers.
function fogNear(floods: Rings[], [cx, cy]: number[], radius: number): number[][] {
  const fog: number[][] = [];
  for (let dx = -radius; dx <= radius; dx += 0.5) {
    for (let dy = -radius; dy <= radius; dy += 0.5) {
      const [x, y] = [cx + dx, cy + dy];
      if (Math.hypot(dx, dy) <= radius && !inAny(floods, x, y)) fog.push([x, y]);
    }
  }
  return fog;
}

const tenth = (value: number) => Math.round(value * 10) / 10;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

// A wall through (cx, cy) at `degrees`, from the picture's edge to its edge,
// its ends rounded to a tenth as a saved wall's are.
function edgeToEdge(cx: number, cy: number, degrees: number): number[] {
  const [dx, dy] = [Math.cos(radians(degrees)), Math.sin(radians(degrees))];
  const reach = (sx: number, sy: number) =>
    Math.min(
      sx > 0 ? (W - cx) / sx : sx < 0 ? cx / -sx : Infinity,
      sy > 0 ? (H - cy) / sy : sy < 0 ? cy / -sy : Infinity,
    );
  const [ahead, behind] = [reach(dx, dy), reach(-dx, -dy)];
  return [cx - behind * dx, cy - behind * dy, cx + ahead * dx, cy + ahead * dy].map(tenth);
}

// Where the lines through two walls' ends cross.
function crossing([ax, ay, bx, by]: number[], [cx, cy, dx, dy]: number[]): number[] {
  const [ex, ey, fx, fy] = [bx - ax, by - ay, dx - cx, dy - cy];
  const t = ((cx - ax) * fy - (cy - ay) * fx) / (ex * fy - ey * fx);
  return [ax + t * ex, ay + t * ey];
}

// Square rooms of `side` pixels, `step` apart, from (start, start) on, as closed walls.
function roomGrid(side: number, step: number, columns: number, rows: number, start: number) {
  const rooms: number[][] = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const [x, y] = [start + i * step, start + j * step];
      rooms.push([x, y, x + side, y, x + side, y + side, x, y + side, x, y]);
    }
  }
  return rooms;
}

// Square rooms as roomGrid's, every side zigzagging `depth` pixels in and out
// every `period` pixels. On a square picture 1024 pixels across a cell is a
// pixel, so the teeth are that many cells deep.
function toothedRooms(side: number, step: number, depth: number, period: number) {
  const rooms: number[][] = [];
  const teeth = side / period;
  const tooth = (k: number) => (k % 2 ? depth : 0);
  for (let x = 10; x + side < 1024; x += step) {
    for (let y = 10; y + side < 1024; y += step) {
      const room: number[] = [];
      for (let k = 0; k < teeth; k++) room.push(x + k * period, y + tooth(k));
      for (let k = 0; k < teeth; k++) room.push(x + side - tooth(k), y + k * period);
      for (let k = 0; k < teeth; k++) room.push(x + side - k * period, y + side - tooth(k));
      for (let k = 0; k < teeth; k++) room.push(x + tooth(k), y + side - k * period);
      room.push(x, y);
      rooms.push(room);
    }
  }
  return rooms;
}

describe("floodAt", () => {
  it("fills the whole picture when there are no walls", () => {
    const rings = floodAt([], W, H, 10, 10)!;
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(8);
    for (const [x, y] of [
      [0.5, 0.5],
      [1023.5, 511.5],
    ])
      expect(insideRings(rings, x, y)).toBe(true);
  });

  it("does nothing for a click on a wall", () => {
    expect(floodAt(split, W, H, 512, 256)).toBeNull();
  });

  it("reaches past a wall's middle line on both sides, and no further than a few pixels", () => {
    const left = floodAt(split, W, H, 100, 100)!;
    const right = floodAt(split, W, H, 900, 100)!;
    for (let y = 0.5; y < H; y += 0.5) {
      expect(insideRings(left, 512.5, y)).toBe(true);
      expect(insideRings(right, 511.5, y)).toBe(true);
    }
    expect(insideRings(left, 517, 256)).toBe(false);
    expect(insideRings(right, 507, 256)).toBe(false);
  });

  it("leaves no fog along a slanted wall when both sides are flooded, and draws it straight", () => {
    const slant = [[300, 0, 700, 512]];
    const left = floodAt(slant, W, H, 100, 256)!;
    const right = floodAt(slant, W, H, 900, 256)!;
    // Short of the picture's edges, where a point sits on the outline itself.
    for (let t = 0.001; t < 1; t += 0.001) {
      const [x, y] = [300 + 400 * t, 512 * t];
      expect(insideRings(left, x, y) && insideRings(right, x, y)).toBe(true);
    }
    // A staircase along a 650 px slant would be hundreds of corners.
    expect(left).toHaveLength(1);
    expect(left[0].length / 2).toBeLessThanOrEqual(8);
  });

  it("gives a square room a few corners, not a staircase", () => {
    const room = [[200, 100, 600, 100, 600, 400, 200, 400, 200, 100]];
    const rings = floodAt(room, W, H, 400, 250)!;
    expect(rings).toHaveLength(1);
    expect(rings[0].length / 2).toBeLessThanOrEqual(8);
  });

  it("fills the ring between a room and a room inside it, as an outline with a hole", () => {
    const rooms = [
      [100, 50, 900, 50, 900, 450, 100, 450, 100, 50],
      [400, 200, 600, 200, 600, 300, 400, 300, 400, 200],
    ];
    const rings = floodAt(rooms, W, H, 200, 100)!;
    expect(rings).toHaveLength(2);
    expect(insideRings(rings, 200, 100)).toBe(true);
    expect(insideRings(rings, 500, 250)).toBe(false);
    expect(insideRings(rings, 50, 25)).toBe(false);
  });

  // Review Focus 1: an end rounded to a tenth sits up to 0.07 px off the
  // wall it was snapped onto.
  it("does not leak past a wall end that stops just short of the wall it meets", () => {
    const walls = [
      [300, 0, 700, 512],
      [0, 256, 499.93, 256],
    ];
    const rings = floodAt(walls, W, H, 100, 100)!;
    expect(insideRings(rings, 100, 400)).toBe(false);
  });

  // Bands of walls this close merge wider than a fixed growth could cross
  // from both sides, which once left a strip of fog no click could lift.
  it("leaves no fog between two flooded areas where walls a few pixels apart merge", () => {
    const walls = [400, 404, 408].map((x) => [x, 0, x, H]);
    const floods = floodAll(walls, [
      [100, 256],
      [900, 256],
    ]);
    for (const y of [20, 128, 256, 384, 492]) {
      for (let x = 398; x <= 410; x += 0.5) expect(inAny(floods, x, y)).toBe(true);
    }
  });

  it("leaves no fog where many walls cross, once every area around the crossing is flooded", () => {
    const [cx, cy] = [W / 2, H / 2];
    const walls = [0, 30, 60, 90, 120, 150].map((degrees) => edgeToEdge(cx, cy, degrees));
    const clicks = Array.from({ length: 12 }, (_, k) => {
      const angle = radians(15 + 30 * k);
      return [cx + 100 * Math.cos(angle), cy + 100 * Math.sin(angle)];
    });
    expect(fogNear(floodAll(walls, clicks), [cx, cy], 10)).toEqual([]);
  });

  // Near a crossing, the two bands can cut off a free pocket of a cell or
  // two; as an area of its own it stayed fogged unless a click landed on that
  // very cell, a target no storyteller could be expected to find.
  it("leaves no speck of fog where two walls cross", () => {
    const walls = [
      [0, 156.5, 1024, 364],
      [304.3, 0, 712.2, 512],
    ];
    const clicks = [
      [100, 50],
      [900, 250],
      [100, 250],
      [900, 450],
    ];
    expect(fogNear(floodAll(walls, clicks), crossing(walls[0], walls[1]), 20)).toEqual([]);
  });

  it("leaves no speck of fog where two walls cross at any angle, off the grid's cells", () => {
    // The first wall a little off level, the second turned from it by each angle.
    const [cx, cy, first] = [512.3, 255.7, 11.5];
    for (const angle of [10, 25, 40, 65, 85]) {
      const walls = [first, first + angle].map((degrees) => edgeToEdge(cx, cy, degrees));
      // One click down the middle of each of the four areas.
      const middle = first + angle / 2;
      const clicks = [0, 90, 180, 270].map((turn) => [
        cx + 200 * Math.cos(radians(middle + turn)),
        cy + 200 * Math.sin(radians(middle + turn)),
      ]);
      expect(fogNear(floodAll(walls, clicks), [cx, cy], 20)).toEqual([]);
    }
  });

  // Bands merged wider than a fixed growth reaches, beside this area alone:
  // what the flood leaves of them is fog a click on them cannot lift.
  it("leaves no fog under a thick wall standing in the flooded area", () => {
    const stub = [400, 404, 408].map((x) => [x, 0, x, 300]);
    const rings = floodAt(stub, W, H, 100, 100)!;
    for (let y = 10; y <= 290; y += 10) {
      for (let x = 398; x <= 410; x += 0.5) expect(insideRings(rings, x, y)).toBe(true);
    }
  });

  it("leaves no fog where short walls cross in the middle of the flooded area", () => {
    const [cx, cy] = [600.3, 255.7];
    const asterisk = Array.from({ length: 8 }, (_, k) => {
      const [dx, dy] = [Math.cos(radians(22.5 * k)), Math.sin(radians(22.5 * k))];
      return [cx - 40 * dx, cy - 40 * dy, cx + 40 * dx, cy + 40 * dy].map(tenth);
    });
    expect(fogNear([floodAt(asterisk, W, H, 100, 100)!], [cx, cy], 10)).toEqual([]);
  });

  // Dropping a ring to fit a step would flood over a closed room and show it to the players.
  it("keeps every closed room around the flooded area a hole, past two hundred of them", () => {
    const rooms = roomGrid(12, 33, 30, 15, 20);
    const rings = floodAt(rooms, W, H, 5, 5)!;
    expect(annotationOpSchema.safeParse({ t: "flood", mode: "reveal", rings }).success).toBe(true);
    expect(insideRings(rings, 5, 5)).toBe(true);
    for (const [x, y] of rooms) expect(insideRings(rings, x + 6, y + 6)).toBe(false);
  });

  it("floods nothing when the outline would be past a flood step's caps", () => {
    const rooms = roomGrid(6, 12, 84, 42, 10);
    expect(rooms.length).toBeGreaterThan(MAX_FLOOD_RINGS);
    expect(floodAt(rooms, W, H, 2, 2)).toBeNull();
  });

  // Teeth two cells deep stay in an outline simplified at the usual tolerance
  // and go at two cells. Each room's hole is simplified alone, so one room
  // flooded round shows what every room's hole costs at the usual tolerance.
  it("fits an outline over the points cap at two cells, every room still a hole", () => {
    const rooms = toothedRooms(36, 45, 2, 4);
    const alone = floodAt([rooms[0]], 1024, 1024, 3, 3)!;
    const holePoints = Math.max(...alone.map((ring) => ring.length / 2));
    expect(holePoints * rooms.length).toBeGreaterThan(MAX_FLOOD_POINTS);

    const rings = floodAt(rooms, 1024, 1024, 3, 3)!;
    expect(rings).not.toBeNull();
    expect(annotationOpSchema.safeParse({ t: "flood", mode: "reveal", rings }).success).toBe(true);
    expect(insideRings(rings, 3, 3)).toBe(true);
    for (const [x, y] of rooms) expect(insideRings(rings, x + 18, y + 18)).toBe(false);
  });

  // Teeth three cells deep stay at two cells too; simplified coarser, an
  // outline cuts into the closed rooms it goes round and shows the players
  // what is inside them.
  it("floods nothing when the outline is past the points cap even at two cells", () => {
    const rooms = toothedRooms(30, 36, 3, 6);
    expect(rooms.length).toBeLessThan(MAX_FLOOD_RINGS);
    expect(floodAt(rooms, 1024, 1024, 3, 3)).toBeNull();
  });

  // Review Focus 5.
  it("answers on a large map in its pixels, within the step's caps", () => {
    const rings = floodAt([[5000, 0, 5000, 6000]], 10_000, 6000, 1000, 1000)!;
    const points = rings.reduce((sum, ring) => sum + ring.length / 2, 0);
    expect(points).toBeLessThanOrEqual(MAX_FLOOD_POINTS);
    expect(Math.max(...rings.flat())).toBeLessThanOrEqual(10_000);
    expect(insideRings(rings, 5000, 3000)).toBe(true);
    expect(insideRings(rings, 5100, 3000)).toBe(false);
  });
});

describe("enclosedAreas", () => {
  it("encloses a room, leaving its surroundings, and both sides of a wall from edge to edge", () => {
    const room = [[200, 100, 600, 100, 600, 400, 200, 400, 200, 100]];
    expect(insideRings(enclosedAreas(room, W, H), 400, 250)).toBe(true);
    expect(insideRings(enclosedAreas(room, W, H), 800, 450)).toBe(false);
    const side = enclosedAreas([[200, 0, 200, 512]], W, H);
    expect(insideRings(side, 100, 256)).toBe(true);
    expect(insideRings(side, 600, 256)).toBe(true);
    expect(enclosedAreas([], W, H)).toEqual([]);
  });

  it("leaves the outside of a room joined to the edge by one wall, which divides nothing", () => {
    const walls = [
      [200, 100, 600, 100, 600, 400, 200, 400, 200, 100],
      [0, 250, 200, 250],
    ];
    const enclosed = enclosedAreas(walls, W, H);
    expect(insideRings(enclosed, 400, 250)).toBe(true);
    expect(insideRings(enclosed, 800, 450)).toBe(false);
  });

  // Walls running out to the edges divide the map into areas that all touch
  // it; the largest of them is a room to the storyteller, not an outside.
  it("encloses every area when walls divide the map's edge, the largest included", () => {
    const walls = [
      [300, 0, 300, 512],
      [0, 300, 300, 300],
      [300, 200, 1024, 200],
    ];
    const enclosed = enclosedAreas(walls, W, H);
    for (const [x, y] of [
      [150, 150],
      [150, 400],
      [600, 100],
      [600, 400],
    ])
      expect(insideRings(enclosed, x, y)).toBe(true);
  });

  // A frame 2 px in from the picture's edge leaves no free cell on the edge,
  // so there is no outside, and no other area to stop the color under the split.
  it("colors all the way across a thick split between two framed rooms", () => {
    const frame = [2, 2, 1022, 2, 1022, 510, 2, 510, 2, 2];
    const split = [400, 404, 408].map((x) => [x, 2, x, 510]);
    const enclosed = enclosedAreas([frame, ...split], W, H);
    expect(insideRings(enclosed, 200, 256) && insideRings(enclosed, 800, 256)).toBe(true);
    for (let y = 20; y <= 490; y += 30) {
      for (let x = 398; x <= 410; x += 0.5) expect(insideRings(enclosed, x, y)).toBe(true);
    }
  });
});

describe("storytellerView", () => {
  it("takes the enclosed areas' color off a room whose shape an open wall touches", () => {
    const room: AnnotationOp = {
      t: "wall",
      points: [200, 100, 600, 100, 600, 400, 200, 400, 200, 100],
    };
    const spur: AnnotationOp = { t: "wall", points: [600, 250, 800, 250] };
    const closed = storytellerView([room], W, H);
    expect(closed.walls).toEqual([{ op: room, closed: true }]);
    expect(insideRings(closed.enclosed, 400, 250)).toBe(true);
    const open = storytellerView([room, spur], W, H);
    expect(open.walls.map((wall) => wall.closed)).toEqual([false, false]);
    expect(open.enclosed).toEqual([]);
  });

  it("colors every area when closed walls divide the map's edge", () => {
    const ops: AnnotationOp[] = [
      { t: "wall", points: [300, 0, 300, 512] },
      { t: "wall", points: [0, 300, 300, 300] },
      { t: "wall", points: [300, 200, 1024, 200] },
    ];
    const view = storytellerView(ops, W, H);
    expect(view.walls.map((wall) => wall.closed)).toEqual([true, true, true]);
    for (const [x, y] of [
      [150, 150],
      [150, 400],
      [600, 100],
      [600, 400],
    ])
      expect(insideRings(view.enclosed, x, y)).toBe(true);
  });
});
