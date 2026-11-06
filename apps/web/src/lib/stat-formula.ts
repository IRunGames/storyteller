// The formula a computed stat is worked out with: arithmetic over the other
// stats of a block, written as text in the system's definition
// ("floor((stats.str.value - 10) / 2)") and read back here. A parser of our
// own rather than a dependency or eval: the language is a dozen rules, and a
// formula is typed by an administrator and run for every element at the
// table, so what it can do is exactly what is written below and nothing
// else. The parser is shared by the definition schema, which refuses a
// formula that does not parse or refers to a stat that is not there, and by
// the evaluator, which runs the tree against an element's values.
//
// Grammar, lowest precedence first:
//
//   comparison := additive (("<" | "<=" | ">" | ">=" | "==" | "!=") additive)?
//   additive   := term (("+" | "-") term)*
//   term       := unary (("*" | "/") unary)*
//   unary      := "-" unary | primary
//   primary    := number | reference | call | "(" comparison ")"
//   call       := name "(" comparison ("," comparison)* ")"
//   reference  := name "." name ("." part)?
//
// A comparison is 1 when true and 0 when not, which is what makes
// if(defense.sdc.value < defense.sdc.max / 2, …, …) say "while SDC is under
// half". A reference with no part means the stat's value.

/** The parts of a stat a formula may read: its value, or a pool's or stack's min and max. */
export const STAT_PARTS = ["value", "min", "max"] as const;
export type StatPart = (typeof STAT_PARTS)[number];

/** What a formula reaches for: a stat of a group, and which part of it. */
export type FormulaReference = { group: string; stat: string; part: StatPart };

export const FORMULA_FUNCTIONS = ["floor", "ceil", "round", "abs", "min", "max", "if"] as const;
export type FormulaFunction = (typeof FORMULA_FUNCTIONS)[number];

type ComparisonOp = "<" | "<=" | ">" | ">=" | "==" | "!=";
type ArithmeticOp = "+" | "-" | "*" | "/";

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "reference"; reference: FormulaReference }
  | { kind: "negate"; operand: FormulaNode }
  | { kind: "binary"; op: ArithmeticOp | ComparisonOp; left: FormulaNode; right: FormulaNode }
  | { kind: "call"; name: FormulaFunction; args: FormulaNode[] };

export type ParsedFormula =
  | { ok: true; tree: FormulaNode }
  | {
      ok: false;
      /** What is wrong, said for the person typing the formula. */
      message: string;
      /** Where in the text, as a character offset, for a caret. */
      position: number;
    };

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/** How many arguments each function takes; null for any number from one up. */
const ARITY: Record<FormulaFunction, number | null> = {
  floor: 1,
  ceil: 1,
  round: 1,
  abs: 1,
  min: null,
  max: null,
  if: 3,
};

type Token =
  | { type: "number"; value: number; position: number }
  | { type: "name"; value: string; position: number }
  | { type: "op"; value: string; position: number }
  | { type: "end"; position: number };
type OpToken = Extract<Token, { type: "op" }>;

class FormulaError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(message);
  }
}

// Longest operators first, so "<=" is not read as "<" then "=".
const OPERATORS = ["<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "(", ")", ",", "."];

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(text[i + 1] ?? ""))) {
      const match = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(i))!;
      tokens.push({ type: "number", value: Number(match[0]), position: i });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      const match = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(text.slice(i))!;
      tokens.push({ type: "name", value: match[0], position: i });
      i += match[0].length;
      continue;
    }
    const op = OPERATORS.find((candidate) => text.startsWith(candidate, i));
    if (!op) throw new FormulaError(`Unexpected "${char}".`, i);
    tokens.push({ type: "op", value: op, position: i });
    i += op.length;
  }
  tokens.push({ type: "end", position: text.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const tree = this.comparison();
    const token = this.peek();
    if (token.type !== "end") {
      throw new FormulaError(`Unexpected "${describe(token)}".`, token.position);
    }
    return tree;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private takeOp(...values: string[]): OpToken | null {
    const token = this.peek();
    if (token.type === "op" && values.includes(token.value)) {
      this.index += 1;
      return token;
    }
    return null;
  }

  private expectOp(value: string, what: string): void {
    if (!this.takeOp(value)) {
      const token = this.peek();
      throw new FormulaError(`Expected ${what}.`, token.position);
    }
  }

  private comparison(): FormulaNode {
    const left = this.additive();
    const op = this.takeOp("<", "<=", ">", ">=", "==", "!=");
    if (!op) return left;
    const right = this.additive();
    return { kind: "binary", op: op.value as ComparisonOp, left, right };
  }

  private additive(): FormulaNode {
    let left = this.term();
    for (let op = this.takeOp("+", "-"); op; op = this.takeOp("+", "-")) {
      left = { kind: "binary", op: op.value as ArithmeticOp, left, right: this.term() };
    }
    return left;
  }

  private term(): FormulaNode {
    let left = this.unary();
    for (let op = this.takeOp("*", "/"); op; op = this.takeOp("*", "/")) {
      left = { kind: "binary", op: op.value as ArithmeticOp, left, right: this.unary() };
    }
    return left;
  }

  private unary(): FormulaNode {
    if (this.takeOp("-")) return { kind: "negate", operand: this.unary() };
    return this.primary();
  }

  private primary(): FormulaNode {
    const token = this.peek();
    if (token.type === "number") {
      this.index += 1;
      return { kind: "number", value: token.value };
    }
    if (token.type === "op" && token.value === "(") {
      this.index += 1;
      const inner = this.comparison();
      this.expectOp(")", "a closing parenthesis");
      return inner;
    }
    if (token.type === "name") {
      this.index += 1;
      if (this.takeOp("(")) return this.call(token);
      return this.reference(token);
    }
    throw new FormulaError(
      token.type === "end" ? "The formula ends too soon." : `Unexpected "${describe(token)}".`,
      token.position,
    );
  }

  private call(nameToken: Token & { type: "name" }): FormulaNode {
    const name = nameToken.value;
    if (!(FORMULA_FUNCTIONS as readonly string[]).includes(name)) {
      throw new FormulaError(
        `"${name}" is not a function. Use ${FORMULA_FUNCTIONS.join(", ")}.`,
        nameToken.position,
      );
    }
    const args: FormulaNode[] = [this.comparison()];
    while (this.takeOp(",")) args.push(this.comparison());
    this.expectOp(")", "a closing parenthesis");
    const arity = ARITY[name as FormulaFunction];
    if (arity !== null && args.length !== arity) {
      throw new FormulaError(
        `${name}() takes ${arity} argument${arity === 1 ? "" : "s"}.`,
        nameToken.position,
      );
    }
    return { kind: "call", name: name as FormulaFunction, args };
  }

  private reference(groupToken: Token & { type: "name" }): FormulaNode {
    const group = groupToken.value;
    if (!this.takeOp(".")) {
      throw new FormulaError(
        `"${group}" needs a group and a stat, as in stats.str or stats.str.value.`,
        groupToken.position,
      );
    }
    const statToken = this.peek();
    if (statToken.type !== "name") {
      throw new FormulaError(`Expected a stat name after "${group}.".`, statToken.position);
    }
    this.index += 1;
    let part: StatPart = "value";
    if (this.takeOp(".")) {
      const partToken = this.peek();
      if (
        partToken.type !== "name" ||
        !(STAT_PARTS as readonly string[]).includes(partToken.value)
      ) {
        throw new FormulaError(
          `A stat's part is one of ${STAT_PARTS.join(", ")}.`,
          partToken.position,
        );
      }
      this.index += 1;
      part = partToken.value as StatPart;
    }
    for (const [name, token] of [
      [group, groupToken],
      [statToken.value, statToken],
    ] as const) {
      if (!IDENTIFIER.test(name)) {
        throw new FormulaError(
          `"${name}" is not a name: lower-case letters, digits and underscores only.`,
          token.position,
        );
      }
    }
    return { kind: "reference", reference: { group, stat: statToken.value, part } };
  }
}

function describe(token: Token): string {
  switch (token.type) {
    case "number":
      return String(token.value);
    case "name":
    case "op":
      return token.value;
    case "end":
      return "end";
  }
}

/** Reads a formula's text into its tree, or says what is wrong with it and where. */
export function parseFormula(text: string): ParsedFormula {
  try {
    const tree = new Parser(tokenize(text)).parse();
    return { ok: true, tree };
  } catch (error) {
    if (error instanceof FormulaError) {
      return { ok: false, message: error.message, position: error.position };
    }
    throw error;
  }
}

/** Every stat a formula reads, in the order it reads them; a stat read twice is listed twice. */
export function formulaReferences(tree: FormulaNode): FormulaReference[] {
  switch (tree.kind) {
    case "number":
      return [];
    case "reference":
      return [tree.reference];
    case "negate":
      return formulaReferences(tree.operand);
    case "binary":
      return [...formulaReferences(tree.left), ...formulaReferences(tree.right)];
    case "call":
      return tree.args.flatMap(formulaReferences);
  }
}

/**
 * What a reference reads: the part's number, or anything else (a display
 * holding a word, a part the stat does not have, a stat with no value yet),
 * which makes the whole formula NaN rather than a number that means nothing.
 */
export type FormulaLookup = (reference: FormulaReference) => number | string | null | undefined;

/**
 * Runs a tree against an element's values. NaN, rather than a throw, for
 * anything that cannot be a number: the block shows "—" for that stat and
 * the rest of the block still shows. Division by zero is NaN too, for the
 * same reason an Infinity on a character sheet would be.
 */
export function evaluateFormula(tree: FormulaNode, lookup: FormulaLookup): number {
  switch (tree.kind) {
    case "number":
      return tree.value;
    case "reference": {
      const found = lookup(tree.reference);
      return typeof found === "number" && Number.isFinite(found) ? found : NaN;
    }
    case "negate":
      return -evaluateFormula(tree.operand, lookup);
    case "binary": {
      const left = evaluateFormula(tree.left, lookup);
      const right = evaluateFormula(tree.right, lookup);
      switch (tree.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? NaN : left / right;
        case "<":
          return Number(left < right);
        case "<=":
          return Number(left <= right);
        case ">":
          return Number(left > right);
        case ">=":
          return Number(left >= right);
        case "==":
          return Number(left === right);
        case "!=":
          return Number(left !== right);
      }
    }
    case "call": {
      // if() reads only the branch it takes, so a NaN in the other branch
      // does not spoil the answer.
      if (tree.name === "if") {
        const condition = evaluateFormula(tree.args[0], lookup);
        if (Number.isNaN(condition)) return NaN;
        return evaluateFormula(tree.args[condition !== 0 ? 1 : 2], lookup);
      }
      const args = tree.args.map((arg) => evaluateFormula(arg, lookup));
      switch (tree.name) {
        case "floor":
          return Math.floor(args[0]);
        case "ceil":
          return Math.ceil(args[0]);
        case "round":
          return Math.round(args[0]);
        case "abs":
          return Math.abs(args[0]);
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
      }
    }
  }
}
