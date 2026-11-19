// The rules in docs/standards.md that a reviewer would otherwise have to
// check by eye, read off the source with TypeScript's parser. Each is cheap
// and fails with the file and the name that broke it.
import { describe, it } from "node:test";
import { expect } from "expect";
import ts from "typescript";
import { join } from "node:path";
import {
  exportedFunctions,
  hasDirective,
  lineOf,
  parse,
  resolveSource,
  runtimeImports,
  SRC,
  sourceFiles,
} from "./source-scan";

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

describe("lib/env", () => {
  // lib/env.ts hands out the server's secrets, so it must never be bundled
  // for the browser. Next bundles a client component together with
  // everything it imports, and everything those import in turn, so a
  // direct-import check is not enough: the walk follows every import that
  // survives compilation. It stops at a "use server" module, since a client
  // file that imports an action gets a reference to call over the network,
  // not the action's code.
  const ENV = join(SRC, "lib/env.ts");
  const bySourceFile = new Map(sources.map((source) => [source.file, source]));
  const files = new Set(bySourceFile.keys());

  /** The chain of files from `file` to lib/env.ts, or null when it never gets there. */
  function pathToEnv(file: string, seen: Set<string>): string[] | null {
    if (file === ENV) return [file];
    if (seen.has(file)) return null;
    seen.add(file);
    const source = bySourceFile.get(file);
    if (!source || hasDirective(source, "use server")) return null;
    for (const specifier of runtimeImports(source)) {
      const next = resolveSource(file, specifier.text, files);
      const rest = next && pathToEnv(next, seen);
      if (rest) return [file, ...rest];
    }
    return null;
  }

  it("exists, so the walk below has something to look for", () => {
    expect(files.has(ENV)).toBe(true);
  });

  it("is reached by no client component, directly or through its imports", () => {
    const leaks = sources
      .filter((source) => hasDirective(source, "use client"))
      .map((source) => pathToEnv(source.file, new Set()))
      .filter((chain): chain is string[] => chain !== null)
      .map((chain) => chain.map((file) => bySourceFile.get(file)?.path ?? file).join(" → "));
    expect(leaks).toEqual([]);
  });
});

describe("components", () => {
  // components/ holds what more than one page uses; a route's own files sit
  // beside its page.tsx (docs/standards.md). A component that imports from
  // app/ is leaning on one route's file, so either the file it reaches for
  // is shared and belongs in components/ too, or the component is that
  // route's own and belongs beside its page. Every module specifier counts:
  // an import, an export from, an import() and a type import alike.
  it("import nothing from @/app/", () => {
    const leaks = sources
      .filter((source) => source.path.startsWith("components/"))
      .flatMap((source) => {
        const found: string[] = [];
        const visit = (node: ts.Node) => {
          const specifier =
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
              ? node.moduleSpecifier
              : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
                ? node.arguments[0]
                : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
                  ? node.argument.literal
                  : undefined;
          if (
            specifier &&
            ts.isStringLiteralLike(specifier) &&
            specifier.text.startsWith("@/app/")
          ) {
            found.push(`${source.path}:${lineOf(source, specifier)} ${specifier.text}`);
          }
          ts.forEachChild(node, visit);
        };
        visit(source.sourceFile);
        return found;
      });
    expect(leaks).toEqual([]);
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
