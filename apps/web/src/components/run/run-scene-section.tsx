"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Badge,
  Box,
  chakra,
  HStack,
  Popover,
  Portal,
  Stack,
  Text,
  Tooltip,
  Wrap,
} from "@chakra-ui/react";
import { Image as ImageIcon, Plus } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { attachmentLabel, type SceneLink } from "@/lib/run";
import type { SceneItem } from "@/lib/scene-elements";
import type { StatusOption } from "@/lib/status";
import { sa_setSceneElementShowInfo } from "@/components/scene-elements/actions";
import {
  sa_attachAsCover,
  sa_detachFromHolder,
  sa_listAttachments,
  sa_setAttachmentCover,
} from "@/components/uploads/actions";
import { toaster } from "@/components/ui/toaster";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import type { RollAs, StatBlockHolder } from "@/components/stat-blocks/actions";
import { ElementStatBlocks } from "@/components/stat-blocks/stat-block-view";
import { StatusPill } from "@/components/status/status-pill";
import { AnnotationControls } from "@/components/annotations/annotation-controls";
import { FogCoveredNote } from "@/components/annotations/fog-covered-note";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { pictureRow } from "@/components/uploads/attachment-list-field";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";
import { LocalDate } from "@/components/dates/local-date";
import { DetailSection, linkCell } from "./run-element-detail";
import { partBadgeProps, tagList } from "./run-detail-parts";
import { RunCoverStar } from "./run-cover-star";
import { RunElementImagePicker } from "./run-element-image-popover";
import { RunInfoToggle } from "./run-info-toggle";
import { RunPictureCell } from "./run-picture-cell";
import { RunSceneStacksMenu } from "./run-scene-stacks-menu";

type Props = {
  idStory: number;
  idStoryScene: number;
  /** What the element is called, to name the dialog and the buttons. */
  name: string;
  link: SceneLink;
  /** The scene is complete: everything is shown and nothing can be pressed. */
  locked: boolean;
  /** The scene_elements workflow, for the status pill. */
  sceneOptions: StatusOption[];
  /**
   * The scene's stacks, in order, which the stacks menu on the heading's
   * line offers. Left out where the holder does not know them; the tags are
   * then only shown.
   */
  sceneStacks?: string[];
  /** The stack of the pill the panel was opened from, which a move leaves; null from the library. */
  stackTag: string | null;
  /** The link, whose stat blocks are drawn and changed here. */
  holder: StatBlockHolder;
  /** How a die here rolls: as the pill names the element, quietly for an invisible one. */
  rollAs: RollAs;
  /** Whether the element itself carries a stat block, for the copy from it to be offered. */
  elementHasStats: boolean;
  /** The element's status in the scene has been moved from here. */
  onStatusChange: (status: string) => void;
  /** The info toggle has been pressed, or put back after a refusal. */
  onShowInfoChange: (showInfo: boolean) => void;
  /** The stacks menu has moved the element to another stack, as the pill now is. */
  onMoved: (item: SceneItem) => void;
  /**
   * The link's picture for this scene, as read on opening: its address, or
   * null for none, whether it is annotated, and whether that address is a
   * players' copy covered in fog, and whether it has fog on it anywhere.
   */
  onImageLoaded: (
    url: string | null,
    annotated: boolean,
    fogCovered: boolean,
    fogActive: boolean,
  ) => void;
  /**
   * The link's picture for this scene has been changed from here, or
   * annotated or no longer: its address, or null for none, whether it is
   * annotated, whether that address is a players' copy covered in fog, and
   * whether it has fog on it anywhere.
   */
  onImageChange: (
    url: string | null,
    annotated: boolean,
    fogCovered: boolean,
    fogActive: boolean,
  ) => void;
};

/**
 * The element panel's scene part, at the top of the panel as a card on a
 * faint tint of its own: how the element stands in this scene, then its
 * pictures for this scene.
 *
 * Over the card, in place of a heading: a SCENE pill the width of the
 * panel (partBadgeProps), riding a little over the card's top edge, whose
 * tooltip says when the element was added, and at its end the stack the
 * element is in, as a menu that moves it to another
 * (RunSceneStacksMenu). The card's first line is the scene status pill and
 * the info toggle the pill has (RunInfoToggle), pressing the same way, and
 * at its right end a thumbnail of the link's cover for this scene, or a
 * placeholder for none, which opens the link's pictures in a popover. The
 * one row is Link. Under it, the link's
 * stat blocks (ElementStatBlocks), closed until pressed open, changed in
 * place as play goes, with a paste beside each block's pencil that writes
 * the element's own blocks over them (sa_copyStatBlocksFromElement) when
 * the element has any.
 *
 * In the popover: Cover, the element's picture for this scene alone (the
 * cover of its link's SCENE_ELEMENT uses), which its pill shows here instead
 * of the element's own picture. It is shown as the element rows show the
 * element's picture (RunPictureCell), with the picture's annotation
 * controls beside it when it is a file the app uploaded: its + opens the attachment picker in
 * place to make one of the story's or the scene's pictures the cover
 * (sa_attachAsCover), and its − takes the picture off the link
 * (sa_detachFromHolder). Under it, Other images lists the link's other
 * pictures, and its + opens the story attachment picker that the prep
 * board's scene page uses, to give the link more of them.
 *
 * Every picture carries a star in its corner (RunCoverStar): filled on the
 * cover, where pressing it moves the picture down among the other images
 * (sa_setAttachmentCover off, the use staying); empty on an other image,
 * where pressing it makes that picture the cover in the current one's place
 * (sa_attachAsCover, which only tags a picture the link already uses).
 *
 * The link's pictures are read as this mounts (sa_listAttachments) and
 * again after each change here. The cover is reported as read and as
 * changed, so the pill shows it.
 */
export function RunSceneSection({
  idStory,
  idStoryScene,
  name,
  link,
  locked,
  sceneOptions,
  sceneStacks,
  holder,
  rollAs,
  elementHasStats,
  onStatusChange,
  onShowInfoChange,
  stackTag,
  onMoved,
  onImageLoaded,
  onImageChange,
}: Props) {
  // The link's attachments, null until read; `loads` is bumped to read again.
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [loads, setLoads] = useState(0);
  const [pickingCover, setPickingCover] = useState(false);
  const [removingCover, setRemovingCover] = useState(false);
  const [addingImages, setAddingImages] = useState(false);

  useEffect(() => {
    let live = true;
    sa_listAttachments("SCENE_ELEMENT", link.idSceneElement)
      .then((rows) => {
        if (!live) return;
        setAttachments(rows);
        const cover = coverOf(rows);
        onImageLoaded(
          shown(cover),
          cover?.drawing?.isActive === true,
          covered(cover),
          fogActiveOf(cover),
        );
      })
      .catch(() => live && setAttachments([]));
    return () => {
      live = false;
    };
    // Read for the link, and again on `loads`; the callback is the panel's
    // setter, which does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.idSceneElement, loads]);

  const reload = () => setLoads((count) => count + 1);

  const pictures = (attachments ?? []).filter(isPicture);
  const cover = coverOf(attachments ?? []);
  const others = pictures.filter((row) => !row.isCover);

  // The info toggle: pressed at once and back if the action refuses, as the
  // pill's is.
  async function toggleInfo() {
    const next = !link.showInfo;
    onShowInfoChange(next);
    try {
      const result = await sa_setSceneElementShowInfo(
        idStory,
        idStoryScene,
        link.idSceneElement,
        next,
      );
      if (result.ok) return;
      onShowInfoChange(link.showInfo);
      toaster.create({ title: result.error, type: "error" });
    } catch {
      onShowInfoChange(link.showInfo);
      toaster.create({ title: "That could not be changed. Try again.", type: "error" });
    }
  }

  async function pickCover(attachment: Attachment) {
    try {
      const result = await sa_attachAsCover(
        "SCENE_ELEMENT",
        link.idSceneElement,
        attachment.idAttachment,
      );
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      setPickingCover(false);
      onImageChange(
        attachment.shownUrl ?? result.url,
        attachment.drawing?.isActive === true,
        covered(attachment),
        fogActiveOf(attachment),
      );
      reload();
    } catch {
      toaster.create({ title: "The picture could not be added. Try again.", type: "error" });
    }
  }

  // The cover's star: the picture stays the link's, among the other images.
  async function demoteCover() {
    if (!cover) return;
    try {
      await sa_setAttachmentCover("SCENE_ELEMENT", link.idSceneElement, cover.idAttachment, false);
      onImageChange(null, false, false, false);
      reload();
    } catch {
      toaster.create({ title: "The cover could not be changed. Try again.", type: "error" });
    }
  }

  // The − takes the picture off the link altogether, as the element's own
  // − does, rather than leaving it among the other images.
  async function removeCover() {
    if (!cover) return;
    setRemovingCover(true);
    try {
      const result = await sa_detachFromHolder("SCENE_ELEMENT", link.idSceneElement, [
        cover.idAttachment,
      ]);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      onImageChange(null, false, false, false);
      reload();
    } catch {
      toaster.create({ title: "The picture could not be removed. Try again.", type: "error" });
    } finally {
      setRemovingCover(false);
    }
  }

  // The stacks at the end of the SCENE pill: a menu while they can be
  // chosen; where they cannot, or the holder does not know the scene's
  // stacks, plain text.
  const stacksCell =
    !locked && sceneStacks ? (
      <RunSceneStacksMenu
        idStory={idStory}
        idStoryScene={idStoryScene}
        idSceneElement={link.idSceneElement}
        name={name}
        stacks={sceneStacks}
        tags={link.tags}
        stackTag={stackTag}
        onMoved={onMoved}
      />
    ) : (
      <Text as="span" fontSize="xs" color={link.tags.length > 0 ? "fg.muted" : "fg.subtle"}>
        {tagList(link.tags) ?? "No stacks"}
      </Text>
    );

  const coverCell =
    attachments === null ? (
      <Text as="span" color="fg.muted">
        Loading…
      </Text>
    ) : (
      <RunPictureCell
        imageUrl={shown(cover)}
        fogCovered={covered(cover)}
        fogActive={fogActiveOf(cover)}
        label={cover ? attachmentLabel(cover) : name}
        addLabel="Add cover"
        removeLabel="Remove cover"
        picking={pickingCover}
        onPickingChange={setPickingCover}
        onRemove={removingCover ? undefined : () => void removeCover()}
        canChange={!locked}
        size="14"
        actions={
          cover?.isUploaded && cover.status === "READY" ? (
            <AnnotationControls
              idAttachment={cover.idAttachment}
              label={name}
              isAnnotated={cover.drawing?.isActive === true}
              onAnnotatedChange={(annotated) => {
                setAttachments(
                  (rows) =>
                    rows?.map((row) =>
                      row.idAttachment === cover.idAttachment
                        ? { ...row, drawing: { isActive: annotated } }
                        : row,
                    ) ?? rows,
                );
                onImageChange(shown(cover), annotated, covered(cover), fogActiveOf(cover));
              }}
              onPictureChange={(picture) => {
                setAttachments(
                  (rows) =>
                    rows?.map((row) =>
                      row.idAttachment === picture.idAttachment
                        ? { ...row, ...pictureRow(picture) }
                        : row,
                    ) ?? rows,
                );
                onImageChange(
                  picture.shownUrl,
                  picture.isAnnotated,
                  picture.fogCovered,
                  picture.fogActive,
                );
              }}
            />
          ) : null
        }
        corner={
          cover &&
          !locked && (
            <RunCoverStar
              label={attachmentLabel(cover)}
              isCover
              onToggle={() => void demoteCover()}
            />
          )
        }
      />
    );

  // The link's other pictures, with their + for more, drawn in the popover.
  const otherImages = (
    <DetailSection
      title="Other images"
      action={
        !locked && (
          <IconButtonWithTooltip
            label="Add images"
            expanded={addingImages}
            onClick={() => setAddingImages((open) => !open)}
            outlined
          >
            <Plus />
          </IconButtonWithTooltip>
        )
      }
      rows={[]}
    >
      {/* None says nothing: the heading and its + are the whole of it. */}
      {attachments === null ? (
        <Text color="fg.muted">Loading…</Text>
      ) : others.length === 0 ? null : (
        <Wrap gap="2" role="list" aria-label="Other images">
          {others.map((row) => (
            // Each opens full size; these are the link's own pictures, so
            // their tags are shown. The star in the corner makes it the
            // cover.
            <Box
              key={row.idAttachment}
              role="listitem"
              position="relative"
              boxSize="14"
              flexShrink="0"
              rounded="sm"
              overflow="hidden"
              bg="bg.muted"
            >
              <AttachmentPreview
                url={shown(row)!}
                label={attachmentLabel(row)}
                tags={row.tags}
                isCover={false}
                fogCovered={covered(row)}
                fogActive={fogActiveOf(row)}
              />
              {!locked && (
                <RunCoverStar
                  label={attachmentLabel(row)}
                  isCover={false}
                  onToggle={() => void pickCover(row)}
                />
              )}
            </Box>
          ))}
        </Wrap>
      )}
      {addingImages && !locked && (
        <StoryAttachmentPicker
          idStory={idStory}
          holder={{ kind: "SCENE_ELEMENT", idExternal: link.idSceneElement }}
          onAttached={reload}
          defaultOpen
        />
      )}
    </DetailSection>
  );

  // The thumbnail that opens the pictures: the cover, or a placeholder,
  // small enough to sit at the end of the status line.
  const picturesCell = (
    <Popover.Root positioning={{ placement: "bottom-start" }} lazyMount unmountOnExit>
      <Popover.Trigger asChild>
        <chakra.button
          type="button"
          aria-label="Pictures in this scene"
          // Positioned only to hold the note over a cover covered in fog.
          position={covered(cover) ? "relative" : undefined}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          boxSize="7"
          flexShrink="0"
          rounded="sm"
          overflow="hidden"
          borderWidth="1px"
          bg="bg.muted"
          color="fg.muted"
          cursor="pointer"
          _hover={{ borderColor: "border.emphasized" }}
          _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
        >
          {cover ? (
            <>
              <chakra.img
                src={shown(cover)!}
                alt=""
                boxSize="full"
                objectFit="cover"
                data-testid="scene-pictures-cover"
              />
              {covered(cover) && <FogCoveredNote />}
            </>
          ) : (
            <ImageIcon size={14} aria-hidden />
          )}
        </chakra.button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="sm" aria-label="Pictures in this scene">
            <Popover.Arrow />
            <Popover.Body>
              <Stack gap="4">
                <DetailSection title="Cover" rows={[["Cover", coverCell]]}>
                  {pickingCover && !cover && !locked && (
                    <Box borderWidth="1px" rounded="md" p="2" bg="bg.panel">
                      <RunElementImagePicker
                        idStory={idStory}
                        idStoryScene={idStoryScene}
                        onChosen={(attachment) => void pickCover(attachment)}
                      />
                    </Box>
                  )}
                </DetailSection>
                {otherImages}
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );

  const rows: [string, ReactNode][] = [["Link", linkCell(link)]];

  // SCENE, riding over the card's top edge; when the element was added is
  // its tooltip, and it can be focused so the keyboard reaches that too.
  const badge = (
    <Badge
      {...partBadgeProps}
      tabIndex={link.createdAt ? 0 : undefined}
      data-testid="element-panel-scene"
    >
      SCENE
    </Badge>
  );
  const where = link.createdAt ? (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{badge}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>
            Added <LocalDate value={new Date(link.createdAt)} withTime />
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  ) : (
    badge
  );

  return (
    <Stack gap="0" data-testid="scene-card">
      {/* The pill's negative margin pulls the card up under it; the stacks
          menu at its end stays on the pill's line. */}
      <HStack gap="2" align="center">
        {where}
        {stacksCell}
      </HStack>
      {/* A card on a faint tint and nothing more, so the scene's part stands
          apart from the element's rows under it; its top padded for what
          rides over its edge. */}
      <Stack gap="4" bg="bg.subtle" rounded="md" px="3" pb="3" pt="5">
        <HStack justify="space-between" gap="2">
          <HStack gap="2" wrap="wrap">
            <StatusPill
              table="scene_elements"
              id={link.idSceneElement}
              status={link.status}
              options={sceneOptions}
              canEdit={!locked}
              onChanged={onStatusChange}
            />
            <RunInfoToggle
              showInfo={link.showInfo}
              onToggle={locked ? undefined : () => void toggleInfo()}
            />
          </HStack>
          {picturesCell}
        </HStack>
        <DetailSection rows={rows} />
        {/* The link's stat blocks, closed to start, as play changes them;
            the paste beside the pencil starts them again from what the
            element was prepared with. */}
        <ElementStatBlocks
          holder={holder}
          canEdit={!locked}
          rollAs={rollAs}
          copyFromElement={elementHasStats}
          folded
        />
      </Stack>
    </Stack>
  );
}

// Only a finished picture can be shown or made the cover.
const isPicture = (row: Attachment) => row.status === "READY" && row.url !== null;

/** The link's cover among its attachments, or null for none. */
/** A picture as the storyteller is shown it: as the players see it, once annotated and rendered. */
function shown(row: Attachment | null): string | null {
  return row ? (row.shownUrl ?? row.url) : null;
}

/** Whether a picture as it is shown (shown) is a players' copy covered in fog. */
function covered(row: Attachment | null): boolean {
  return row?.fogCovered === true;
}

/** Whether a picture as it is shown (shown) is a players' copy with fog on it anywhere. */
function fogActiveOf(row: Attachment | null): boolean {
  return row?.fogActive === true;
}

function coverOf(rows: Attachment[]): Attachment | null {
  return rows.find((row) => isPicture(row) && row.isCover) ?? null;
}
