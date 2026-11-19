// Every key a setting is kept under in the user's preferences
// (user_preferences.preferences, through useUserPreferences), in one place
// so a new one can be checked against the rest. The strings are what each
// user's row already holds: a value changed here reads as a setting never
// made, and every user loses theirs without a word, so a constant may be
// renamed but its value never changed. preference-keys.test.ts pins them.

/** The theme the user chose (lib/themes.ts), which the provider hands to next-themes. */
export const THEME_KEY = "theme";

/** Where the Stories page keeps its view, among the user's preferences. */
export const STORIES_VIEW_KEY = "stories.view";

/** The Store's Icon view or List view, kept as the user's preference as the Stories page's is. */
export const STORE_VIEW_KEY = "store.view";

/** How the table chat is drawn (CHAT_LAYOUTS in play-chat-layout.tsx). */
export const CHAT_LAYOUT_KEY = "chat.layout";

// Whether someone with an account has the chat's box to type in, a user
// preference as the play table's panels are, so a screen put up for the
// room stays without it from one visit to the next.
export const TABLE_SHOW_CHAT_BOX = "table.showChatBox";

// The storyteller's own preference keys for the panes the run table alone
// has; the chat's, the character's and the diagnostics' are
// tablePanelPreferenceKeys's, under the same `run.` prefix. The library
// starts open, since it is what that table is for.
export const RUN_SHOW_LIBRARY = "run.showLibrary";
export const RUN_SHOW_STATS = "run.showStats";

/**
 * Whether each panel round a play space is open, the chat, the character
 * space and the diagnostics (useTableChat). The storyteller's run table and
 * the players' table keep theirs apart (`run.*` and `play.*`), since they
 * are laid out for different jobs and a storyteller who also plays in
 * someone else's story keeps each the way they left it.
 */
export function tablePanelPreferenceKeys(table: "run" | "play") {
  return {
    chat: `${table}.showChat`,
    character: `${table}.showCharacter`,
    diagnostics: `${table}.showDiagnostics`,
  };
}

/**
 * The preference behind the library's Add as invisible switch: elements the
 * storyteller adds to the scene start hidden from the players.
 */
export const RUN_ADD_INVISIBLE = "run.addInvisible";

/**
 * The preference behind the library's Add showing info switch: elements the
 * storyteller adds to the scene start with their description shown to the
 * players (scene_elements.show_info). Off unless chosen: what the players
 * are to know of an element is the storyteller's to give out.
 */
export const RUN_ADD_SHOW_INFO = "run.addShowInfo";

/**
 * The preference behind the library's All / Scene only switch: whether its
 * element tabs list every element in the story or only the ones linked to
 * the scene the table is on.
 */
export const RUN_LIBRARY_SCENE_ONLY = "run.librarySceneOnly";

/**
 * The preferences behind the library's sort menu, one for the Attachments
 * tab and one shared by the element tabs, since the two offer different
 * sorts. Each holds a key from ATTACHMENT_SORT_KEYS or ELEMENT_SORT_KEYS;
 * an unknown value (a sort since dropped) falls back to the default.
 */
export const RUN_LIBRARY_ATTACHMENT_SORT = "run.libraryAttachmentSort";
export const RUN_LIBRARY_ELEMENT_SORT = "run.libraryElementSort";

/**
 * The user_preferences keys the profile card keeps. The card's colour, picture
 * and status live in the preference map rather than on s_users because they
 * are how the user dresses their profile, not facts about the account.
 */
export const PROFILE_PREFERENCE_KEYS = {
  color: "profile.color",
  avatarUrl: "profile.avatarUrl",
  status: "profile.status",
} as const;

/**
 * The annotator's settings (components/annotations), the storyteller's own
 * and the same over every picture they draw on: the pen's color and width,
 * the fog brush's size, and how thick the fog is drawn for them. The players'
 * fog is the drawing's own (attachment_annotations.fog_opacity_players), since
 * the players' copy is rendered with it; the storyteller's is only how their
 * screen shows it, so it is kept here and changing it renders nothing.
 */
export const ANNOTATION_PREFERENCE_KEYS = {
  penColor: "annotation.penColor",
  penWidth: "annotation.penWidth",
  brushSize: "annotation.brushSize",
  ownFogOpacity: "annotation.ownFogOpacity",
} as const;

/**
 * The preference that holds one story's board as the storyteller left it:
 * which columns are hidden or expanded, and what each column's search box
 * and pills are narrowed to. One key per story, since the words typed into a
 * search box are about that story's rows and mean nothing on another's.
 */
export function prepBoardPreferenceKey(idStory: number): string {
  return `prep.board.${idStory}`;
}
