// Runs the web app's tests in two passes: everything that does not touch the
// database in parallel, then the tests that do, one file at a time.
//
// The database tests share one Postgres. Run side by side, one suite's
// fixtures land in another's lists mid-test: a story inserted or touched by
// one file moves a row between the pages another is reading, and a fixture
// user turns up in another's search. Serialising only those files keeps the
// rest of the suite fast.
//
// A test file is a database test when it mentions DATABASE_URL: each one
// skips itself when it is unset (docs/standards.md), and nothing else has
// reason to name it. Arguments after `npm test --` go to both passes, so
// `just test --test-name-pattern X` works as before.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const NODE_ARGS = [
  "--import",
  "tsx",
  "--disable-warning=ExperimentalWarning",
  "--experimental-test-module-mocks",
  "--import",
  "./src/test/setup.ts",
  "--test",
];

function testFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// node --test reads every path it is given as a glob, so the brackets of a
// dynamic route (play/[id]) would make a character class and match nothing:
// the file would silently not run. "[[]" is a literal "[".
const asLiteralGlob = (file) => file.replace(/\[/g, "[[]");

const files = testFiles("src").sort();
const usesDb = (file) => readFileSync(file, "utf8").includes("DATABASE_URL");
const passes = [
  { name: "unit", files: files.filter((f) => !usesDb(f)), concurrency: [] },
  { name: "database", files: files.filter(usesDb), concurrency: ["--test-concurrency=1"] },
];

const extra = process.argv.slice(2);
let failed = false;
for (const pass of passes) {
  if (pass.files.length === 0) continue;
  console.log(`\n# ${pass.name} tests (${pass.files.length} files)`);
  const result = spawnSync(
    process.execPath,
    [...NODE_ARGS, ...pass.concurrency, ...extra, ...pass.files.map(asLiteralGlob)],
    { stdio: "inherit" },
  );
  // Both passes run whatever the first gave, so one red run shows every
  // failure rather than stopping halfway.
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
