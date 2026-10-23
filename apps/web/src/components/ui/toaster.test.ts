import { afterEach, describe, it } from "node:test";
import { expect } from "expect";

import { toaster } from "./toaster";

// The durations the toasts are created with. Zag fills in its own default
// (5s) later, when the toast's machine starts, so anything but a success
// toast leaves it unset here.
const durationOf = (id: string) =>
  toaster.getVisibleToasts().find((toast) => toast.id === id)?.duration;

describe("toaster", () => {
  afterEach(() => toaster.remove());

  it("shows a success toast for 3s and leaves the rest to the 5s default", () => {
    expect(durationOf(toaster.create({ title: "Saved.", type: "success" }))).toBe(3000);
    expect(durationOf(toaster.create({ title: "Failed.", type: "error" }))).toBeUndefined();
    expect(durationOf(toaster.create({ title: "Note.", type: "info" }))).toBeUndefined();
  });

  it("lets a call name its own duration", () => {
    expect(
      durationOf(toaster.create({ title: "Saved.", type: "success", duration: 8000 })),
    ).toBe(8000);
  });
});
