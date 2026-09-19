// Loaded via --import before any test file. The jsdom registration must come
// first: Testing Library reads `document` off the global at import time.
import "global-jsdom/register";

import { afterEach } from "node:test";
import { expect } from "expect";
import * as jestDom from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

// This file compiles to CJS (the workspace is not "type": "module"), so the
// namespace object gains a synthetic `default` key that expect.extend rejects
// as a non-function matcher.
expect.extend(
  Object.fromEntries(
    Object.entries(jestDom).filter(([name]) => name !== "default"),
  ),
);

// React 19 refuses to run `act` outside an environment that opts in.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no media-query engine. next-themes calls this on mount to read
// the system colour scheme; report "no match" so tests get the light theme.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

// jsdom has no ResizeObserver. Chakra's floating layers (Menu, Tooltip,
// Popover) watch their trigger with one to keep the popup aligned; a no-op
// observer lets them open without ever repositioning.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// next-themes renders a <script> for flash-free theming, which React warns
// about on every client render. It is inert under jsdom and there is no prop
// to disable it, so drop this one exact message and let everything else
// through — a real React error must still be loud. Delete when next-themes
// stops rendering the script on the client.
const NEXT_THEMES_SCRIPT_WARNING = "Encountered a script tag while rendering";
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith(NEXT_THEMES_SCRIPT_WARNING)) return;
  consoleError(...args);
};

// node:test has no automatic DOM teardown, so without this every render
// stacks up in the same document and queries start matching the wrong tree.
afterEach(cleanup);
