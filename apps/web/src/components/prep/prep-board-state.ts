import type { StatusOption } from "@/lib/status";
import type { JsonValue } from "@/lib/user-preference-schemas";
import type { StatusSearchValue } from "@/components/status/status-search";
import { PREP_COLUMNS, type PrepColumnMode, type PrepColumnTitle } from "./prep-columns";

/**
 * The preference that holds one story's board as the storyteller left it:
 * which columns are hidden or expanded, and what each column's search box
 * and pills are narrowed to. One key per story, since the words typed into a
 * search box are about that story's rows and mean nothing on another's.
 */
export function prepBoardPreferenceKey(idStory: number): string {
  return `prep.board.${idStory}`;
}

export type PrepBoardState = {
  modes: Record<PrepColumnTitle, PrepColumnMode>;
  filters: Record<PrepColumnTitle, StatusSearchValue>;
};

const MODES: readonly PrepColumnMode[] = ["normal", "expanded", "hidden"];

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The board as stored, or as it starts when nothing is: every column at its
 * usual width, nothing typed, every status on.
 *
 * The stored value is checked piece by piece rather than trusted, because it
 * can outlive the code that wrote it: a column renamed, a status dropped from
 * its workflow, a mode a column no longer offers. Anything that no longer
 * fits falls back to where that piece starts, and the rest is kept.
 *
 * The pills are stored as the statuses switched off, not the ones left on,
 * so a status added to a workflow since shows up switched on, as it would on
 * a first visit, instead of being hidden by a list that never named it.
 */
export function readPrepBoardState(
  stored: JsonValue | undefined,
  statusOptions: Partial<Record<PrepColumnTitle, StatusOption[]>>,
): PrepBoardState {
  const storedModes = isObject(stored) && isObject(stored.modes) ? stored.modes : {};
  const storedFilters = isObject(stored) && isObject(stored.filters) ? stored.filters : {};

  const modes = {} as PrepBoardState["modes"];
  const filters = {} as PrepBoardState["filters"];
  let expanded = false;
  for (const column of PREP_COLUMNS) {
    const mode = storedModes[column.title];
    // Only one column is expanded at a time (PrepBoard's setMode), and a
    // column that does not expand never is.
    const fits =
      typeof mode === "string" &&
      MODES.includes(mode as PrepColumnMode) &&
      (mode !== "expanded" || (column.expandable && !expanded));
    modes[column.title] = fits ? (mode as PrepColumnMode) : "normal";
    if (modes[column.title] === "expanded") expanded = true;

    const filter = storedFilters[column.title];
    const query = isObject(filter) && typeof filter.query === "string" ? filter.query : "";
    const off = isObject(filter) && Array.isArray(filter.off) ? filter.off : [];
    filters[column.title] = {
      query,
      statuses: (statusOptions[column.title] ?? [])
        .filter((option) => !off.includes(option.key))
        .map((option) => option.key),
    };
  }
  return { modes, filters };
}

/**
 * What a column's list action is asked for, given what the column is
 * narrowed to: the words trimmed, and the statuses switched on, or undefined
 * while every one is. Undefined asks for no status filter at all, which is
 * how the page has always loaded a column's first page, and it still lists a
 * row whose status has since left the workflow.
 *
 * The page asks with this for the first page of a column whose board was
 * left filtered, so the column opens already narrowed rather than showing
 * every row and then reloading.
 */
export function prepColumnQuery(
  filter: StatusSearchValue,
  statusOptions: StatusOption[],
): { query: string; statuses: string[] | undefined } {
  const everyStatus = statusOptions.every((option) => filter.statuses.includes(option.key));
  return { query: filter.query.trim(), statuses: everyStatus ? undefined : filter.statuses };
}

/**
 * The board in the shape readPrepBoardState reads back. A column at its usual
 * width, with nothing typed and every pill on, is left out, so the stored
 * value only names what the storyteller changed.
 */
export function writePrepBoardState(
  state: PrepBoardState,
  statusOptions: Partial<Record<PrepColumnTitle, StatusOption[]>>,
): JsonValue {
  const modes: Record<string, JsonValue> = {};
  const filters: Record<string, JsonValue> = {};
  for (const column of PREP_COLUMNS) {
    const mode = state.modes[column.title];
    if (mode !== "normal") modes[column.title] = mode;

    const { query, statuses } = state.filters[column.title];
    const off = (statusOptions[column.title] ?? [])
      .filter((option) => !statuses.includes(option.key))
      .map((option) => option.key);
    if (query !== "" || off.length > 0) filters[column.title] = { query, off };
  }
  return { modes, filters };
}
