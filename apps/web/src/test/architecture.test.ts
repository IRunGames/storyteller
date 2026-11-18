// The rules in docs/standards.md that a reviewer would otherwise have to
// check by eye, read off the source with TypeScript's parser. Each is cheap
// and fails with the file and the name that broke it.
import { describe, it } from "node:test";
import { expect } from "expect";
import ts from "typescript";
import { exportedFunctions, hasDirective, lineOf, parse, sourceFiles } from "./source-scan";

const sources = sourceFiles().map(parse);

describe("server action modules", () => {
  const actionModules = sources.filter((source) => hasDirective(source, "use server"));

  it("exist", () => {
    expect(actionModules.length).toBeGreaterThan(10);
  });

  // Next turns every export of a "use server" file into an endpoint, so
  // anything exported that is not an async function is either unreachable
  // (a value) or a build error; and the sa_ prefix is how a call site and a
  // mock.module show that the call crosses the network (docs/standards.md).
  it("export only async functions, every one named sa_…", () => {
    const wrong = actionModules.flatMap((source) =>
      exportedFunctions(source)
        .filter((fn) => !fn.isAsync || !/^sa_[a-z]/i.test(fn.name))
        .map((fn) => `${source.path}:${lineOf(source, fn.node)} ${fn.name}`),
    );
    expect(wrong).toEqual([]);
  });

  it("export no values, only functions and types", () => {
    const values = actionModules.flatMap((source) =>
      source.sourceFile.statements
        .filter(
          (statement) =>
            ts.isVariableStatement(statement) &&
            (ts.getModifiers(statement) ?? []).some(
              (m) => m.kind === ts.SyntaxKind.ExportKeyword,
            ) &&
            statement.declarationList.declarations.some(
              (d) =>
                !d.initializer ||
                (!ts.isArrowFunction(d.initializer) && !ts.isFunctionExpression(d.initializer)),
            ),
        )
        .map((statement) => `${source.path}:${lineOf(source, statement)}`),
    );
    expect(values).toEqual([]);
  });
});

describe("client components", () => {
  // Two stat-block fields roll dice in the browser through lib/dice, which
  // pulls the dice-roller library into the client bundle. Plan item A7 moves
  // the roll to the server; until then they are the known exceptions.
  const DICE_IN_CLIENT = new Set([
    "components/stat-blocks/dice-input.tsx",
    "components/stat-blocks/stat-block-fields.tsx",
  ]);
  const SERVER_ONLY = new Set(["@/db", "@/lib/dice"]);

  // The database client and the dice roller run on the server only: a
  // client file importing either would pull them, and their connection
  // string, into the browser bundle, or fail the build trying.
  it("import neither @/db nor @/lib/dice", () => {
    const leaks = sources
      .filter((source) => hasDirective(source, "use client"))
      .flatMap((source) =>
        source.sourceFile.statements
          .filter(
            (statement): statement is ts.ImportDeclaration =>
              ts.isImportDeclaration(statement) &&
              ts.isStringLiteral(statement.moduleSpecifier) &&
              (SERVER_ONLY.has(statement.moduleSpecifier.text) ||
                statement.moduleSpecifier.text.startsWith("@/db/")) &&
              !(statement.moduleSpecifier.text === "@/lib/dice" && DICE_IN_CLIENT.has(source.path)),
          )
          .map(
            (statement) =>
              `${source.path}:${lineOf(source, statement)} ${(statement.moduleSpecifier as ts.StringLiteral).text}`,
          ),
      );
    expect(leaks).toEqual([]);
  });

  it("name the dice exceptions that still exist", () => {
    const paths = new Set(sources.map((source) => source.path));
    expect([...DICE_IN_CLIENT].filter((path) => !paths.has(path))).toEqual([]);
  });
});

describe("components/ui", () => {
  // Chakra's generated snippets, added with `npx @chakra-ui/cli snippet add`
  // (docs/standards.md), edited where the app needs it and nothing of our
  // own beside them; what is ours lives in components/providers.
  const SNIPPETS = new Set(["color-mode.tsx", "provider.tsx", "toaster.tsx"]);

  it("holds only Chakra snippets", () => {
    const strangers = sources
      .filter((source) => source.path.startsWith("components/ui/"))
      .map((source) => source.path.slice("components/ui/".length))
      .filter((name) => !SNIPPETS.has(name));
    expect(strangers).toEqual([]);
  });
});
