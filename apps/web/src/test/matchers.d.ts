import type { expect } from "expect";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

export {};

// jest-dom ships augmentations for jest, vitest and bun, but not for the
// standalone `expect` package this repo uses. Same shape as its own
// types/jest-globals.d.ts, pointed at `expect` instead of `@jest/expect`.
declare module "expect" {
  // Interface merging requires the type parameters to match the original
  // declaration exactly, so `T` has to be repeated even though only `R` is
  // used, and contributing no members of its own is the entire point.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<
      ReturnType<typeof expect.stringContaining>,
      R
    > {}
}

declare global {
  // Set in src/test/setup.ts; React 19 reads it to allow `act`.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
