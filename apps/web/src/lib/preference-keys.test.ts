// The keys are what every user's saved preferences are stored under, so a
// value that drifts loses everyone's setting without an error anywhere.
// Each is written out here as it is stored; a failure means a stored key
// changed, which is never what a rename meant to do.
import { describe, it } from "node:test";
import { expect } from "expect";
import * as keys from "./preference-keys";

describe("preference keys", () => {
  it("keep the values users' preferences are stored under", () => {
    expect({
      THEME_KEY: keys.THEME_KEY,
      ADMIN_SYSTEMS_SHOW_EMPTY: keys.ADMIN_SYSTEMS_SHOW_EMPTY,
      STORIES_VIEW_KEY: keys.STORIES_VIEW_KEY,
      STORE_VIEW_KEY: keys.STORE_VIEW_KEY,
      CHAT_LAYOUT_KEY: keys.CHAT_LAYOUT_KEY,
      TABLE_SHOW_CHAT_BOX: keys.TABLE_SHOW_CHAT_BOX,
      RUN_SHOW_LIBRARY: keys.RUN_SHOW_LIBRARY,
      RUN_SHOW_STATS: keys.RUN_SHOW_STATS,
      RUN_ADD_INVISIBLE: keys.RUN_ADD_INVISIBLE,
      RUN_ADD_SHOW_INFO: keys.RUN_ADD_SHOW_INFO,
      RUN_LIBRARY_SCENE_ONLY: keys.RUN_LIBRARY_SCENE_ONLY,
      RUN_LIBRARY_ATTACHMENT_SORT: keys.RUN_LIBRARY_ATTACHMENT_SORT,
      RUN_LIBRARY_ELEMENT_SORT: keys.RUN_LIBRARY_ELEMENT_SORT,
      PROFILE_PREFERENCE_KEYS: keys.PROFILE_PREFERENCE_KEYS,
      ANNOTATION_PREFERENCE_KEYS: keys.ANNOTATION_PREFERENCE_KEYS,
      run: keys.tablePanelPreferenceKeys("run"),
      play: keys.tablePanelPreferenceKeys("play"),
      prepBoard: keys.prepBoardPreferenceKey(42),
    }).toEqual({
      THEME_KEY: "theme",
      ADMIN_SYSTEMS_SHOW_EMPTY: "admin.systems.showEmpty",
      STORIES_VIEW_KEY: "stories.view",
      STORE_VIEW_KEY: "store.view",
      CHAT_LAYOUT_KEY: "chat.layout",
      TABLE_SHOW_CHAT_BOX: "table.showChatBox",
      RUN_SHOW_LIBRARY: "run.showLibrary",
      RUN_SHOW_STATS: "run.showStats",
      RUN_ADD_INVISIBLE: "run.addInvisible",
      RUN_ADD_SHOW_INFO: "run.addShowInfo",
      RUN_LIBRARY_SCENE_ONLY: "run.librarySceneOnly",
      RUN_LIBRARY_ATTACHMENT_SORT: "run.libraryAttachmentSort",
      RUN_LIBRARY_ELEMENT_SORT: "run.libraryElementSort",
      PROFILE_PREFERENCE_KEYS: {
        color: "profile.color",
        avatarUrl: "profile.avatarUrl",
        status: "profile.status",
      },
      ANNOTATION_PREFERENCE_KEYS: {
        penColor: "annotation.penColor",
        penWidth: "annotation.penWidth",
        brushSize: "annotation.brushSize",
        ownFogOpacity: "annotation.ownFogOpacity",
      },
      run: {
        chat: "run.showChat",
        character: "run.showCharacter",
        diagnostics: "run.showDiagnostics",
      },
      play: {
        chat: "play.showChat",
        character: "play.showCharacter",
        diagnostics: "play.showDiagnostics",
      },
      prepBoard: "prep.board.42",
    });
  });

  it("are all named in the test above", () => {
    // A key added to the module without a line above would go unpinned.
    expect(Object.keys(keys).sort()).toEqual(
      [
        "ADMIN_SYSTEMS_SHOW_EMPTY",
        "ANNOTATION_PREFERENCE_KEYS",
        "CHAT_LAYOUT_KEY",
        "PROFILE_PREFERENCE_KEYS",
        "RUN_ADD_INVISIBLE",
        "RUN_ADD_SHOW_INFO",
        "RUN_LIBRARY_ATTACHMENT_SORT",
        "RUN_LIBRARY_ELEMENT_SORT",
        "RUN_LIBRARY_SCENE_ONLY",
        "RUN_SHOW_LIBRARY",
        "RUN_SHOW_STATS",
        "STORE_VIEW_KEY",
        "STORIES_VIEW_KEY",
        "TABLE_SHOW_CHAT_BOX",
        "THEME_KEY",
        "prepBoardPreferenceKey",
        "tablePanelPreferenceKeys",
      ].sort(),
    );
  });
});
