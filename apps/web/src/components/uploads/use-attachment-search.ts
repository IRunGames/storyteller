import { useState } from "react";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import type { AttachmentKind } from "@/lib/attachments";
import { SEARCH_DELAY_MS } from "@/lib/search";
import { sa_searchAttachments } from "./actions";

type Options = {
  /** False asks nothing: a fold not yet opened. */
  enabled?: boolean;
  /** True asks at once on a change of holder, waiting only for keystrokes. */
  atOnceOnHolderChange?: boolean;
};

/**
 * The search box over a holder's attachments, as every list of them has it:
 * what is typed goes to the database (attachments.search_text: the address,
 * the file name and every tag) a pause after the last keystroke, and the
 * answer is which ids matched. An empty box matches everything, with nothing
 * to ask, which `shownIds` says as null. The list already holds every row
 * and only narrows what it draws.
 */
export function useAttachmentSearch(
  kind: AttachmentKind,
  idExternal: number,
  query: string,
  { enabled = true, atOnceOnHolderChange = false }: Options = {},
) {
  const [matchedIds, setMatchedIds] = useState<ReadonlySet<number> | null>(null);
  const needle = query.trim();
  const search = useDebouncedSearch(() => sa_searchAttachments(kind, idExternal, needle), {
    key: `${kind}|${idExternal}|${needle}`,
    typed: atOnceOnHolderChange ? needle : undefined,
    delay: SEARCH_DELAY_MS,
    enabled: enabled && needle !== "",
    onResult: (ids) => setMatchedIds(new Set(ids)),
  });
  return { shownIds: needle === "" ? null : matchedIds, isSearching: search.isSearching };
}
