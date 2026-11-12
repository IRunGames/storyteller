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
import { attachmentLabel, type PlayItem, type SceneLink } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { sa_setSceneElementShowInfo } from "@/app/(app)/run/[id]/actions";
import {
  sa_attachAsCover,
  sa_detachFromHolder,
  sa_listAttachments,
  sa_setAttachmentCover,
} from "@/components/uploads/actions";
import { toaster } from "@/components/ui/toaster";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import type { RollAs, StatBlockHolder } from "@/components/stat-blocks/actions";
import { ElementStatBlocks } from "@/components/stat-blocks/stat-block-view";
import { StatusPill } from "@/components/status/status-pill";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";
import { LocalDate } from "@/components/dates/local-date";
import { DetailSection, linkCell, partBadgeProps, tagList } from "./run-element-detail";
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
  /** The stacks menu has saved a tick, as the pill now is. */
  onTagsChange: (item: PlayItem) => void;
  /** The link's picture for this scene, as read on opening: its address, or null for none. */
  onImageLoaded: (url: string | null) => void;
  /** The link's picture for this scene has been changed from here: its address, or null for none. */
  onImageChange: (url: string | null) => void;
};

/**
 * The element panel's scene part, at the top of the panel as a card on a
 * faint tint of its own: how the element stands in this scene, then its
 * pictures for this scene.
 *
 * Over the card, in place of a heading: a SCENE pill the width of the
 * panel (partBadgeProps), riding a little over the card's top edge, whose
 * tooltip says when the element was added, and at its end the stacks the
 * element is filed under as a menu that saves each tick
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
 * element's picture (RunPictureCell): its + opens the attachment picker in
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
  onTagsChange,
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
        onImageLoaded(coverOf(rows)?.url ?? null);
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
      onImageChange(result.url);
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
      onImageChange(null);
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
      onImageChange(null);
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
        onSaved={onTagsChange}
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
        imageUrl={cover?.url ?? null}
        label={cover ? attachmentLabel(cover) : name}
        addLabel="Add cover"
        removeLabel="Remove cover"
        picking={pickingCover}
        onPickingChange={setPickingCover}
        onRemove={removingCover ? undefined : () => void removeCover()}
        canChange={!locked}
        size="14"
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
          <PrepIconButton
            label="Add images"
            expanded={addingImages}
            onClick={() => setAddingImages((open) => !open)}
            outlined
          >
            <Plus />
          </PrepIconButton>
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
                url={row.url!}
                label={attachmentLabel(row)}
                tags={row.tags}
                isCover={false}
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
            <chakra.img
              src={cover.url!}
              alt=""
              boxSize="full"
              objectFit="cover"
              data-testid="scene-pictures-cover"
            />
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
function coverOf(rows: Attachment[]): Attachment | null {
  return rows.find((row) => isPicture(row) && row.isCover) ?? null;
}
