"use client";

import { useEffect, useState } from "react";
import type { PictureState } from "@/lib/annotations";
import { sa_getScenePicture } from "./actions";
import { AnnotationControls } from "./annotation-controls";

type Props = {
  idStory: number;
  /** The pill's link to the scene, whose picture (its own, else its element's) is the one shown. */
  idSceneElement: number;
  /** What the pill shows the element as, for the annotator's title. */
  label: string;
  /** Told when the picture is annotated or no longer is, for the pill's fog mark. */
  onAnnotatedChange?: (annotated: boolean) => void;
  /** Told the picture as read back after a change, for the pill to show its copy. */
  onPictureChange?: (picture: PictureState) => void;
  /** False inside a dialog; see AnnotationControls. */
  portalled?: boolean;
};

/**
 * The annotation controls for the picture a pill shows, found as they mount
 * (sa_getScenePicture), so they act on the picture as it stands now rather
 * than as the page loaded it: drawn in the pill's preview, which mounts them
 * as it opens. Nothing while the picture is looked up, and nothing for one
 * that cannot be drawn on, such as a typed link.
 */
export function ScenePictureControls({
  idStory,
  idSceneElement,
  label,
  onAnnotatedChange,
  onPictureChange,
  portalled,
}: Props) {
  const [picture, setPicture] = useState<PictureState | null>(null);
  useEffect(() => {
    let live = true;
    sa_getScenePicture(idStory, idSceneElement)
      .then((found) => live && setPicture(found))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [idStory, idSceneElement]);

  if (!picture?.canAnnotate) return null;
  return (
    <AnnotationControls
      idAttachment={picture.idAttachment}
      label={label}
      isAnnotated={picture.isAnnotated}
      hasDrawing={picture.hasDrawing}
      onAnnotatedChange={(annotated) => {
        setPicture((shown) =>
          shown
            ? { ...shown, isAnnotated: annotated, hasDrawing: annotated || shown.hasDrawing }
            : shown,
        );
        onAnnotatedChange?.(annotated);
      }}
      onPictureChange={(read) => {
        setPicture(read);
        onPictureChange?.(read);
      }}
      portalled={portalled}
    />
  );
}
