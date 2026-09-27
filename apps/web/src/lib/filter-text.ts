/**
 * Whether a row's text satisfies a search box: a case-insensitive substring
 * match, with the query trimmed so a stray space hides nothing. A blank query
 * matches everything, which is what an untouched box should do.
 */
export function matchesFilter(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return text.toLowerCase().includes(needle);
}

/**
 * A query as an ILIKE "contains" pattern, with anything ILIKE would read as a
 * pattern escaped: a storyteller who types "%" or "_" is looking for those
 * characters, not for everything. The backslash is the escape character
 * Postgres uses by default, so it is escaped too.
 */
export function likeContains(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
