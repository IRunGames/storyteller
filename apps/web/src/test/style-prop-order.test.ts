// Chakra caches the CSS it generates for a set of style props under a key
// built from the props sorted by name (simpleHash in its utils/memo.js), so
// <Text textStyle="lg" color="fg.muted"> and <Text color="fg.muted"
// textStyle="lg"> share one entry. The entry keeps the property order of
// whichever was rendered first, and the class name is a hash of that order.
// The server's cache lives as long as its process and the browser's starts
// empty on every load, so two elements with the same styles in different
// orders give the server and the browser different class names: a hydration
// mismatch, seen only in the dev overlay, on whichever page loses the race.
//
// This test reads every component and fails when two elements carry the same
// literal style props in different orders, so the order chosen once is the
// order used everywhere. Only string-valued props are compared; an
// expression in braces is not a literal the cache would see twice.
import { describe, it } from "node:test";
import { expect } from "expect";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");

// Props that carry content or behaviour rather than style.
const NOT_STYLE = new Set([
  "key", "id", "href", "as", "asChild", "role", "value", "name", "title", "src", "alt",
  "htmlFor", "type", "placeholder", "label", "size", "variant", "colorPalette",
]);

const TAG = /<([A-Z][\w.]*)\b((?:[^<>{}]|\{[^{}]*\})*?)\/?>/g;
const PROP = /(\w+)="([^"]*)"/g;

function components(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return components(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

describe("Chakra style prop order", () => {
  it("is the same wherever the same style props appear together", () => {
    const uses = new Map<string, { order: string; where: string }[]>();

    for (const file of components(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const tag of text.matchAll(TAG)) {
        const props = [...tag[2].matchAll(PROP)]
          .map(([, key, value]) => ({ key, value }))
          .filter(({ key }) => !NOT_STYLE.has(key) && !key.startsWith("aria") && !key.startsWith("data"));
        if (props.length < 2) continue;

        const set = props.map(({ key, value }) => `${key}=${value}`).sort().join(" ");
        const line = text.slice(0, tag.index).split("\n").length;
        const list = uses.get(set) ?? [];
        list.push({ order: props.map(({ key }) => key).join(" "), where: `${relative(SRC, file)}:${line}` });
        uses.set(set, list);
      }
    }

    const clashes = [...uses.entries()]
      .filter(([, list]) => new Set(list.map(({ order }) => order)).size > 1)
      .map(([set, list]) => `${set}\n${list.map(({ order, where }) => `  ${order} — ${where}`).join("\n")}`);

    expect(clashes).toEqual([]);
  });
});
