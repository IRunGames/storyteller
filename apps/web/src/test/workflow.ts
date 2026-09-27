/**
 * Finding the status a test means in a workflow loaded from the database.
 *
 * Nothing here names a status. The keys live in s_statuses and will change —
 * they have already changed case once — so a test that writes "done" is a test
 * that breaks on a database edit it has nothing to do with. What does not
 * change is the shape of a workflow: it has a status rows start in, one they
 * end in, and, where a workflow lets a row be set down and picked up again, a
 * pair of statuses that lead into each other. Those are found here from the
 * transition lists, and a test asks for the one it means.
 *
 * Load the workflow with sa_listStatusOptions, which is what the app uses, and
 * hand the result to these.
 */

export type WorkflowStatus = {
  key: string;
  /** The statuses this one may be arrived at from; null means unchecked. */
  from: string[] | null;
};

/** The status a new row starts in: the one nothing leads into. */
export function initialStatus(statuses: WorkflowStatus[]): string {
  const start = statuses.find((status) => status.from !== null && status.from.length === 0);
  if (!start) throw new Error("This workflow has no status that nothing leads into.");
  return start.key;
}

/** The status a row ends in: the one nothing leads out of. */
export function terminalStatus(statuses: WorkflowStatus[]): string {
  const end = statuses.find((status) =>
    statuses.every((other) => other.key === status.key || !(other.from ?? []).includes(status.key)),
  );
  if (!end) throw new Error("This workflow has no status that nothing leads out of.");
  return end.key;
}

/**
 * The two statuses that lead into each other, in the order a row passes
 * through them: setting a row down and picking it up again. Throws for a
 * workflow with no such pair, which is the test being told it is asking the
 * wrong workflow.
 */
export function pausePair(statuses: WorkflowStatus[]): { pause: string; resume: string } {
  const start = initialStatus(statuses);
  for (const status of statuses) {
    for (const other of statuses) {
      if (other.key === status.key) continue;
      if ((status.from ?? []).includes(other.key) && (other.from ?? []).includes(status.key)) {
        // The one that can be reached from the start is the one entered first.
        return (status.from ?? []).includes(start)
          ? { pause: status.key, resume: other.key }
          : { pause: other.key, resume: status.key };
      }
    }
  }
  throw new Error("This workflow has no pair of statuses that lead into each other.");
}
