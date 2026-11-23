"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Box, CloseButton, Dialog, Portal, Spinner, Text } from "@chakra-ui/react";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { useLatest } from "@/hooks/use-latest";
import type { AnnotationMode, ShapeKind } from "@/lib/annotation-schemas";
import {
  BRUSH_SIZES,
  DEFAULT_OWN_FOG_OPACITY,
  DEFAULT_PEN_COLOR,
  PEN_COLORS,
  PEN_WIDTHS,
  brushRadiusPx,
  penWidthPx,
  type PictureAnnotation,
} from "@/lib/annotations";
import { standingWalls } from "@/lib/fog-walls";
import { ANNOTATION_PREFERENCE_KEYS } from "@/lib/preference-keys";
import { sa_openAnnotation } from "./actions";
import { AnnotatorStage, type AnnotationTool } from "./annotator-stage";
import { AnnotatorSaveState, AnnotatorToolbar } from "./annotator-toolbar";
import { useAnnotationSession } from "./use-annotation-session";
import { useWallDraft } from "./use-wall-draft";

/**
 * What Escape does in the annotator before closing it; true when it did
 * something, and stays open.
 */
type TakeEscape = RefObject<(() => boolean) | null>;

type Props = {
  /** The picture drawn on. */
  idAttachment: number;
  /** What is pictured: the dialog's title and the picture's alternative text. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The annotator has been left, what was waiting saved; see useAnnotationSession. */
  onLeave?: () => void;
};

/**
 * The annotator: a picture full screen, with the storyteller's drawing over
 * it and the toolbar to change it. The drawing is
 * read afresh each time it opens, made for a picture that has none
 * (sa_openAnnotation), saved as it is
 * drawn (useAnnotationSession), and what is waiting is saved as it closes:
 * the workspace is only mounted while the dialog is open, and leaving it
 * sends what it holds.
 *
 * Escape closes it, unless the wall pen is partway through a wall: then
 * Escape finishes the wall and the annotator stays open, and the next Escape
 * closes it. The dialog's own layer hears Escape on the document before
 * anything inside it can, so the workspace cannot catch the key itself; it
 * hands up what Escape should do first in `takeEscapeRef`, which the dialog
 * calls from its Escape handler, keeping the dialog open when it did
 * something.
 *
 * However it closes (its close button, Escape with no wall in progress, a
 * click outside it), a wall in progress is finished first, as Escape would,
 * so it is kept like everything else waiting. It is drawn into the session
 * before the dialog is told to close, while the workspace is still mounted:
 * the session takes the step at once, and its save as the workspace unmounts
 * carries it.
 */
export function AnnotatorDialog({ idAttachment, label, open, onOpenChange, onLeave }: Props) {
  const takeEscapeRef = useRef<(() => boolean) | null>(null);
  return (
    <Dialog.Root
      size="full"
      open={open}
      onOpenChange={(details) => {
        if (!details.open) takeEscapeRef.current?.();
        onOpenChange(details.open);
      }}
      onEscapeKeyDown={(event) => {
        if (takeEscapeRef.current?.()) event.preventDefault();
      }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <AnnotatorBody
              idAttachment={idAttachment}
              label={label}
              onLeave={onLeave}
              takeEscapeRef={takeEscapeRef}
            />
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * The drawing loaded as the annotator opens: mounted only while the dialog
 * is open (unmountOnExit), so each opening reads the drawing afresh. A
 * picture that cannot be drawn on says why.
 */
function AnnotatorBody({
  idAttachment,
  label,
  onLeave,
  takeEscapeRef,
}: {
  idAttachment: number;
  label: string;
  onLeave?: () => void;
  takeEscapeRef: TakeEscape;
}) {
  // undefined while loading; a string when it could not be opened.
  const [loaded, setLoaded] = useState<PictureAnnotation | string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    sa_openAnnotation(idAttachment)
      .then((result) => live && setLoaded(result.ok ? result.annotation : result.error))
      .catch(() => live && setLoaded("The picture could not be opened. Try again."));
    return () => {
      live = false;
    };
  }, [idAttachment]);

  if (loaded === undefined) {
    return (
      <>
        <AnnotatorHeader label={label} />
        <Dialog.Body p="6" textAlign="center">
          <Spinner size="sm" />
        </Dialog.Body>
      </>
    );
  }
  if (typeof loaded === "string") {
    return (
      <>
        <AnnotatorHeader label={label} />
        <Dialog.Body p="6">
          <Text color="fg.muted">{loaded}</Text>
        </Dialog.Body>
      </>
    );
  }
  return (
    <AnnotatorWorkspace
      label={label}
      annotation={loaded}
      onLeave={onLeave}
      takeEscapeRef={takeEscapeRef}
    />
  );
}

/**
 * The annotator's title across the top, with what the drawing in it offers
 * at its far end (Undo and whether it is saved), clear of the close button
 * that floats over the corner.
 */
function AnnotatorHeader({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <Dialog.Header
      px="4"
      py="2"
      pe="12"
      borderBottomWidth="1px"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap="3"
    >
      <Dialog.Title fontSize="sm" fontWeight="semibold" truncate>
        Annotate {label}
      </Dialog.Title>
      {children}
    </Dialog.Header>
  );
}

const PEN_COLOR_VALUES: readonly string[] = PEN_COLORS.map((color) => color.value);

// A stored preference read back as the slider's whole number within its
// range, or the default for one never set or set to something since dropped.
function within(value: unknown, range: { min: number; max: number }, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max
    ? value
    : fallback;
}

/**
 * The toolbar and the picture, over one drawing. The tool, the shape, the
 * fog's mode and whether the fog is shown are this sitting's; the pen, the
 * brush and the storyteller's own fog are their preferences, the same over
 * every picture they draw on; the players' fog and the fog's color are the
 * drawing's, saved with it.
 *
 * It opens with the flood in hand on a drawing with walls, which at the
 * table is usually opened to flood it, and with the fog brush on one
 * without. The wall the wall pen is drawing is kept here (useWallDraft) and
 * becomes a step once it is finished: by the click that closes it, by
 * Escape, by Finish wall, by taking another tool, or by closing the
 * annotator (see AnnotatorDialog). While one is being drawn, Undo and Ctrl+Z
 * take back its last corner rather than the drawing's last step, and with
 * one corner left drop it.
 */
function AnnotatorWorkspace({
  label,
  annotation,
  onLeave,
  takeEscapeRef,
}: {
  label: string;
  annotation: PictureAnnotation;
  onLeave?: () => void;
  takeEscapeRef: TakeEscape;
}) {
  const preferences = useUserPreferences();
  const session = useAnnotationSession(annotation.idAttachment, annotation, { onLeave });
  const { width, height } = annotation;
  // The standing walls, without the one being drawn, which its clicks snap
  // onto and Escape's closing line stops at.
  const standing = useMemo(
    () => standingWalls(session.ops).map((wall) => wall.op.points),
    [session.ops],
  );
  const walls = useWallDraft(standing, width, height, (points) =>
    session.draw({ t: "wall", points }),
  );
  const [tool, setTool] = useState<AnnotationTool>(() =>
    standingWalls(annotation.ops).length > 0 ? "flood" : "brush",
  );
  const [shape, setShape] = useState<ShapeKind>("circle");
  const [mode, setMode] = useState<AnnotationMode>("reveal");
  const [fogShown, setFogShown] = useState(true);

  const storedColor = preferences.get(ANNOTATION_PREFERENCE_KEYS.penColor);
  const penColor =
    typeof storedColor === "string" && PEN_COLOR_VALUES.includes(storedColor)
      ? storedColor
      : DEFAULT_PEN_COLOR;
  const penWidth = within(
    preferences.get(ANNOTATION_PREFERENCE_KEYS.penWidth),
    PEN_WIDTHS,
    PEN_WIDTHS.initial,
  );
  const brushSize = within(
    preferences.get(ANNOTATION_PREFERENCE_KEYS.brushSize),
    BRUSH_SIZES,
    BRUSH_SIZES.initial,
  );
  const ownFog = within(
    preferences.get(ANNOTATION_PREFERENCE_KEYS.ownFogOpacity),
    { min: 0, max: 100 },
    DEFAULT_OWN_FOG_OPACITY,
  );
  const round1 = (value: number) => Math.round(value * 10) / 10;

  // Taking another tool partway through a wall finishes the wall as Escape
  // would; taking the wall pen again while it is in hand changes nothing.
  function chooseTool(next: AnnotationTool) {
    if (next !== tool) walls.finish();
    setTool(next);
  }

  // The last corner of the wall being drawn, or else the drawing's last step.
  function undoLast() {
    if (!walls.undo()) session.undo();
  }

  // Escape, or closing the annotator, finishes the wall being drawn, if there
  // is one (see AnnotatorDialog).
  const finishWall = useLatest(walls.finish);
  useEffect(() => {
    takeEscapeRef.current = () => finishWall.current();
    return () => {
      takeEscapeRef.current = null;
    };
  }, [takeEscapeRef, finishWall]);

  // Ctrl+Z (or Cmd+Z) undoes while the annotator is open, wherever focus is
  // in it; read through a ref so the listener is added once.
  const undo = useLatest(undoLast);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "z" || !(event.ctrlKey || event.metaKey) || event.shiftKey) {
        return;
      }
      event.preventDefault();
      undo.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  return (
    <>
      <AnnotatorHeader label={label}>
        <AnnotatorSaveState
          canUndo={session.canUndo || walls.draft !== null}
          onUndo={undoLast}
          status={session.status}
        />
      </AnnotatorHeader>
      <Dialog.Body p="0" display="flex" flexDirection="column" minH="0">
        <AnnotatorToolbar
          tool={tool}
          onToolChange={chooseTool}
          shape={shape}
          onShapeChange={setShape}
          mode={mode}
          onModeChange={setMode}
          brushSize={brushSize}
          onBrushSizeChange={(value) =>
            void preferences.set(ANNOTATION_PREFERENCE_KEYS.brushSize, value)
          }
          penWidth={penWidth}
          onPenWidthChange={(value) =>
            void preferences.set(ANNOTATION_PREFERENCE_KEYS.penWidth, value)
          }
          penColor={penColor}
          onPenColorChange={(color) =>
            void preferences.set(ANNOTATION_PREFERENCE_KEYS.penColor, color)
          }
          fogShown={fogShown}
          onFogShownChange={setFogShown}
          ownFog={ownFog}
          onOwnFogChange={(value) =>
            void preferences.set(ANNOTATION_PREFERENCE_KEYS.ownFogOpacity, value)
          }
          playersFog={session.fogOpacityPlayers}
          onPlayersFogChange={session.setFogOpacityPlayers}
          fogColor={session.fogColor}
          onFogColorChange={session.setFogColor}
          onCoverAll={() => session.draw({ t: "fogAll", mode: "cover" })}
          onClearAll={() => session.draw({ t: "fogAll", mode: "reveal" })}
          onEraseAll={() => session.draw({ t: "penClear" })}
          wallInProgress={walls.draft !== null}
          onFinishWall={() => void walls.finish()}
        />
        {/* A column, so the stage's area round the picture, which carries the
            padding and background, fills it however short the picture is. */}
        <Box flex="1" minH="0" overflow="auto" display="flex" flexDirection="column">
          <AnnotatorStage
            imageUrl={annotation.imageUrl}
            label={label}
            width={width}
            height={height}
            ops={session.ops}
            fogOpacity={fogShown ? ownFog : 0}
            fogColor={session.fogColor}
            tool={tool}
            shape={shape}
            mode={mode}
            brushRadius={round1(brushRadiusPx(brushSize, width, height))}
            penWidth={round1(penWidthPx(penWidth, width, height))}
            penColor={penColor}
            onDraw={session.draw}
            wallDraft={walls.draft}
            onWallCorner={walls.place}
          />
        </Box>
      </Dialog.Body>
    </>
  );
}
