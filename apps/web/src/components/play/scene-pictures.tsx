"use client";

import { HolderPictures, type HolderPicturesProps } from "@/components/uploads/holder-pictures";

export type ScenePicturesProps = Omit<HolderPicturesProps, "holder" | "canAnnotate"> & {
  idStoryScene: number;
};

/**
 * A scene's pictures, as every scene editor shows them (SceneTextForm, and
 * the Edit scene page's middle column): the holder's pictures section
 * (HolderPictures) for the scene, its cover set apart and the rest under
 * it. A scene's pictures are shown to the players as they are, so they
 * carry no annotation controls; an element's carry them.
 */
export function ScenePictures({ idStoryScene, ...rest }: ScenePicturesProps) {
  return <HolderPictures holder={{ kind: "STORY_SCENE", idExternal: idStoryScene }} {...rest} />;
}
