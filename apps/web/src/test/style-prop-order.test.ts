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
// This test parses every component and fails when two elements carry the
// same literal style props in different orders, so the order chosen once is
// the order used everywhere. Only string-valued props are compared; an
// expression in braces is not a literal the cache would see twice. The
// elements are found with TypeScript's parser rather than a regular
// expression, which never matched an element with a nested-brace prop
// (`w={{ base, md }}`, `css={{ … }}`) or a `chakra.span` tag, so the Boxes
// in the tables and the pill markers went unchecked.
import { describe, it } from "node:test";
import { expect } from "expect";
import ts from "typescript";
import { lineOf, parse, sourceFiles } from "./source-scan";

// Props that carry content or behaviour rather than style.
const NOT_STYLE = new Set([
  "key",
  "id",
  "href",
  "as",
  "asChild",
  "role",
  "value",
  "name",
  "title",
  "src",
  "alt",
  "htmlFor",
  "type",
  "placeholder",
  "label",
  "size",
  "variant",
  "colorPalette",
]);

/** Whether the tag is a component (Box, Popover.Content) or a `chakra.span` factory element. */
function isStyled(tagName: ts.JsxTagNameExpression): boolean {
  if (ts.isIdentifier(tagName)) return /^[A-Z]/.test(tagName.text);
  if (ts.isPropertyAccessExpression(tagName)) {
    let root: ts.Expression = tagName;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    return ts.isIdentifier(root) && (/^[A-Z]/.test(root.text) || root.text === "chakra");
  }
  return false;
}

describe("Chakra style prop order", () => {
  it("is the same wherever the same style props appear together", () => {
    const uses = new Map<string, { order: string; where: string }[]>();

    for (const file of sourceFiles()) {
      if (!file.endsWith(".tsx")) continue;
      const source = parse(file);
      const visit = (node: ts.Node) => {
        if (
          (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
          isStyled(node.tagName)
        ) {
          const props = node.attributes.properties.flatMap((attribute) => {
            if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) return [];
            const key = attribute.name.text;
            if (NOT_STYLE.has(key) || key.startsWith("aria") || key.startsWith("data")) return [];
            const initializer = attribute.initializer;
            if (!initializer || !ts.isStringLiteral(initializer)) return [];
            return [{ key, value: initializer.text }];
          });
          if (props.length >= 2) {
            const set = props
              .map(({ key, value }) => `${key}=${value}`)
              .sort()
              .join(" ");
            const list = uses.get(set) ?? [];
            list.push({
              order: props.map(({ key }) => key).join(" "),
              where: `${source.path}:${lineOf(source, node)}`,
            });
            uses.set(set, list);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source.sourceFile);
    }

    const clashes = [...uses.entries()]
      .filter(([, list]) => new Set(list.map(({ order }) => order)).size > 1)
      .map(
        ([set, list]) =>
          `${set}\n${list.map(({ order, where }) => `  ${order} — ${where}`).join("\n")}`,
      );

    expect(clashes).toEqual([]);
  });
});
