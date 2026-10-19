import { asc, desc, sql, type SQL } from "drizzle-orm";
import { schema } from "@/db";
import type { ElementSort } from "@/lib/elements";

const { elements } = schema;

/**
 * The ORDER BY for a list of elements sorted as the run page's library
 * asks (ELEMENT_SORT_KEYS), over the elements table: the story's own list
 * and the scene's both join it, so both order by the same columns. A name
 * sort puts the elements with none of that name last and breaks ties by
 * name; a date sort runs newest first. The id ends every order, so two
 * rows alike in every column still list the same way each time.
 */
export function elementOrderBy(sort: ElementSort): SQL[] {
  switch (sort) {
    case "name":
      return [asc(elements.name), asc(elements.idElement)];
    case "initial_name":
      return [
        sql`${elements.initialName} asc nulls last`,
        asc(elements.name),
        asc(elements.idElement),
      ];
    case "title":
      return [sql`${elements.title} asc nulls last`, asc(elements.name), asc(elements.idElement)];
    case "created":
      return [desc(elements.createdAt), desc(elements.idElement)];
    case "updated":
      return [desc(elements.updatedAt), desc(elements.idElement)];
  }
}
