// What an action says when it refuses, gathered here so one refusal has one
// wording wherever it is given, and a wording is changed in one place. Each
// is a whole sentence the UI shows as it is, in a toast or on a form's root.
// The names say what was refused; two refusals that sound alike but are
// about different things (a scene not being played, a session not being
// played) keep separate names and their own words.

// The story, scene, session, element or picture named is not the caller's,
// or not where the caller says it is.
export const NOT_THIS_STORY = "That scene is not part of this story.";
export const NOT_THIS_STORYS_SESSION = "That session is not part of this story.";
export const NOT_THIS_STORYS_ELEMENT = "That element is not part of this story.";
export const NOT_THIS_STORYS_PICTURE = "That attachment is not a picture in this story.";
export const NOT_IN_THIS_SCENE = "That element is not in this scene.";
export const NOT_YOUR_SESSION = "That session is not one of your story's.";
export const SCENE_NOT_YOURS = "That scene is not one of your story's.";
export const STORY_NOT_YOURS = "That story is not yours to change.";
export const STORY_NOT_FOUND = "That story could not be found.";
export const NOT_A_PLAYER = "That is not a player of this story.";
export const ELEMENT_NOT_YOURS = "That element is not one of your story's.";
export const SESSION_NOT_AT_YOUR_TABLE = "This session is not at a table of yours.";
export const NOT_YOUR_LINE = "That is not a line of yours.";

// The table is not in a state the request fits.
export const SCENE_COMPLETE = "That scene is complete, so nothing in it can change.";
export const STATUS_REFUSED = "The database refused that change of status.";
export const COMPLETE_NEEDS_SESSION = "A complete scene was played in a session, so it keeps one.";
export const NO_SESSION_FOR_SCENE = "Start a session before choosing a scene.";
export const SESSION_NOT_BEING_PLAYED = "That session is not being played.";
export const SCENE_NOT_BEING_PLAYED = "That scene is not being played.";
export const NO_TABLE_TO_TALK_AT =
  "The story is not being played, so there is no table to talk at.";
export const NOT_AT_THIS_TABLE = "You are not at this story's table.";
export const NOT_TAPPED = "That element is not tapped.";
export const INFO_NOT_SHOWING = "That element's info is not showing.";
export const LINK_GONE = "This link does not lead to a table any more.";

// The request itself does not make sense.
export const NO_SUCH_STACK = "That stack is no longer one of the scene's tags.";
export const NOT_AN_ANSWER = "Whether the storyteller answered must be yes or no.";
export const NOT_A_PULSE = "That is not something the players' table answers.";
export const NO_SUCH_FIELD = "Choose the initial name, the name, the title or the label.";
export const NOTHING_TO_ROLL = "There is nothing to roll.";

// An annotated picture (components/annotations): the drawing a change would
// delete, a picture that cannot be drawn on, a drawing saved from elsewhere.
export const DRAWING_WOULD_BE_LOST =
  "The picture has fog and pen marks drawn on it. Confirm to delete them with it.";
export const NO_PICTURE_TO_ANNOTATE = "Only a picture uploaded to the story can be annotated.";
export const NOT_THIS_STORYS_ATTACHMENT = "That picture is not one of your story's.";
export const PICTURE_UNREADABLE = "The picture could not be read to annotate it.";
export const NO_DRAWING = "That picture has no drawing.";
export const DRAWING_CHANGED_ELSEWHERE =
  "The drawing was changed somewhere else, so it has been loaded again.";
export const DRAWING_TOO_LONG = "The drawing has as many steps as it can hold.";
// What the browser says when an action could not be reached at all: a
// network failure or a thrown error, where a refusal would have carried
// its own words. Shared by the controls that show a change before the
// action answers (hooks/use-optimistic-action.ts).
export const STATUS_CHANGE_FAILED = "That status could not be changed.";
export const CHANGE_FAILED = "That could not be changed. Try again.";
