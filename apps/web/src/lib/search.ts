// How long a search box waits after the last keystroke before it asks the
// database, in ms, so a word is one request rather than one a letter. Every
// box that searches as it is typed in goes through
// hooks/use-debounced-search.ts with one of these.

/** The pause the boards' columns, the pickers and the popovers take. */
export const SEARCH_DELAY_MS = 250;

/**
 * The longer pause of My Stories, whose answer re-pages the whole list and
 * redraws every card.
 */
export const STORY_SEARCH_DELAY_MS = 400;

/** The longest, for the administrators' Users page, which re-pages the whole table. */
export const USER_SEARCH_DELAY_MS = 500;
