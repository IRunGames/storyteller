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
