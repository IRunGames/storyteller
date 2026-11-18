import { describe, it } from "node:test";
import { expect } from "expect";
import type { FieldValues, UseFormSetError } from "react-hook-form";
import { z } from "zod";
import { applyActionErrors, formErrors } from "./forms";

const schema = z.object({
  title: z.string().min(1, "Please give it a title.").max(3, "Too long."),
  stats: z.object({ str: z.number().min(1, "At least one.") }),
});

function failed(input: unknown) {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("expected the parse to fail");
  return parsed.error;
}

describe("formErrors", () => {
  it("keys each message by the issue's dotted path", () => {
    expect(formErrors(failed({ title: "", stats: { str: 0 } }))).toEqual({
      title: "Please give it a title.",
      "stats.str": "At least one.",
    });
  });

  it("keeps the first message for a field with more than one issue", () => {
    const twice = z.string().min(5, "First.").regex(/^a/, "Second.");
    const parsed = z.object({ word: twice }).safeParse({ word: "zz" });
    if (parsed.success) throw new Error("expected the parse to fail");
    expect(formErrors(parsed.error)).toEqual({ word: "First." });
  });

  it("puts an issue with no path on root", () => {
    const whole = z
      .object({ a: z.number(), b: z.number() })
      .refine((v) => v.a < v.b, "a before b.");
    const parsed = whole.safeParse({ a: 2, b: 1 });
    if (parsed.success) throw new Error("expected the parse to fail");
    expect(formErrors(parsed.error)).toEqual({ root: "a before b." });
  });

  it("puts the issues under a prefix when a nested schema was parsed alone", () => {
    const parsed = z.object({ str: z.number().min(1, "At least one.") }).safeParse({ str: 0 });
    if (parsed.success) throw new Error("expected the parse to fail");
    expect(formErrors(parsed.error, ["statBlocks", 5])).toEqual({
      "statBlocks.5.str": "At least one.",
    });
  });
});

describe("applyActionErrors", () => {
  // What the helper calls on a form, recorded; typed as react-hook-form
  // types setError so the call compiles the way a real form's would.
  function form() {
    const calls: [string, { message?: string }][] = [];
    const setError = ((name: string, error: { message?: string }) => {
      calls.push([name, error]);
    }) as UseFormSetError<FieldValues>;
    return { calls, setError };
  }

  it("sets each field the form knows, and puts root on root", () => {
    const f = form();
    applyActionErrors(f, { title: "Too long.", root: "Not yours." }, ["title", "notes"]);
    expect(f.calls).toEqual([
      ["title", { message: "Too long." }],
      ["root", { message: "Not yours." }],
    ]);
  });

  it("puts a key the form does not know on root, the first of them", () => {
    const f = form();
    applyActionErrors(f, { idStory: "Gone.", other: "Also gone." }, ["title"]);
    expect(f.calls).toEqual([["root", { message: "Gone." }]]);
  });

  it("lets root's own message win over an unknown key's", () => {
    const f = form();
    applyActionErrors(f, { idStory: "Gone.", root: "Not yours." }, ["title"]);
    expect(f.calls).toEqual([["root", { message: "Not yours." }]]);
  });

  it("takes a predicate for nested paths", () => {
    const f = form();
    applyActionErrors(f, { "stats.str": "At least one." }, (key) => key.startsWith("stats."));
    expect(f.calls).toEqual([["stats.str", { message: "At least one." }]]);
  });

  it("falls back to the given message on root when the action said nothing at all", () => {
    const f = form();
    applyActionErrors(f, {}, ["title"], "Could not save. Try again.");
    expect(f.calls).toEqual([["root", { message: "Could not save. Try again." }]]);
  });

  it("sets nothing for no errors and no fallback", () => {
    const f = form();
    applyActionErrors(f, {}, ["title"]);
    expect(f.calls).toEqual([]);
  });
});
