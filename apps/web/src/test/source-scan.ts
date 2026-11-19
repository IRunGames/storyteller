// What the architecture tests share: the list of source files under src/ and
// a parse of one with TypeScript's own parser. The tests used to read the
// files with regular expressions, which missed every shape the expression
// had not been written for (a prop with nested braces, an action declared
// as an arrow function); the parser sees the file as the compiler does.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

export const SRC = join(process.cwd(), "src");

/** Every .ts and .tsx file under `dir`, tests left out, deepest first within a folder. */
export function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

export type Source = { file: string; path: string; text: string; sourceFile: ts.SourceFile };

/** The file parsed, with its path relative to src/ for messages. */
export function parse(file: string): Source {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return { file, path: relative(SRC, file), text, sourceFile };
}

/** Whether the file opens with the directive, as "use server" or "use client". */
export function hasDirective(source: Source, directive: "use server" | "use client"): boolean {
  const [first] = source.sourceFile.statements;
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === directive
  );
}

export function lineOf(source: Source, node: ts.Node): number {
  return source.sourceFile.getLineAndCharacterOfPosition(node.getStart(source.sourceFile)).line + 1;
}

export type ExportedFunction = {
  name: string;
  isAsync: boolean;
  /** The statements of the body; empty for an expression-bodied arrow function. */
  statements: readonly ts.Statement[];
  node: ts.Node;
};

/**
 * Every function the file exports by name, however it is written: a
 * declaration (`export async function f`), a variable holding an arrow or
 * function expression (`export const f = async () => {}`), or a declaration
 * named in a later `export { f }`. Re-exports from other modules are not
 * the file's own and are left out.
 */
export function exportedFunctions(source: Source): ExportedFunction[] {
  const { sourceFile } = source;
  const isExported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const named = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          named.add((element.propertyName ?? element.name).text);
        }
      }
    }
  }
  const found: ExportedFunction[] = [];
  const describe = (name: string, fn: ts.FunctionLikeDeclaration, node: ts.Node) => {
    const isAsync = (ts.getModifiers(fn) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    const statements = fn.body && ts.isBlock(fn.body) ? fn.body.statements : [];
    found.push({ name, isAsync, statements, node });
  };
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (isExported(statement) || named.has(statement.name.text)) {
        describe(statement.name.text, statement, statement);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const init = declaration.initializer;
        if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue;
        if (isExported(statement) || named.has(declaration.name.text)) {
          describe(declaration.name.text, init, declaration);
        }
      }
    }
  }
  return found;
}

/**
 * The module specifiers of every import that is still there at run time:
 * import declarations, `export … from` and `import()` calls, but not
 * `import type`, `export type`, or an import whose every name is marked
 * `type`, all of which the compiler removes.
 */
export function runtimeImports(source: Source): ts.StringLiteralLike[] {
  const found: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly && ts.isStringLiteralLike(node.moduleSpecifier))
        found.push(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      if (
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      ) {
        found.push(node.moduleSpecifier);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return found;
}

/**
 * The file under src/ that a specifier written in `from` names, through the
 * `@/` alias or a relative path, or undefined for a package or a file that
 * is not among `files`.
 */
export function resolveSource(from: string, specifier: string, files: Set<string>) {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(from), specifier);
  else return undefined;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => files.has(candidate));
}
