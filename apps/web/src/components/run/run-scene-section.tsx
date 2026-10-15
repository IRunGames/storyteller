"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box, chakra, Stack, Text, Wrap } from "@chakra-ui/react";
import { Plus } from "lucide-react";
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
import { StatusPill } from "@/components/status/status-pill";
import { AttachmentPreview } from "@/components/uploads/attachment-preview";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";
import { LocalDate } from "@/components/dates/local-date";
import { DetailSection, linkCell, tagList } from "./run-element-detail";
import { RunCoverStar } from "./run-cover-star";
import { RunElementImagePicker } from "./run-element-image-popover";
import { RunInfoToggle } from "./run-info-toggle";
import { RunPictureCell } from "./run-picture-cell";
import { RunSceneElementStacksDialog } from "./run-scene-element-stacks-dialog";

type Props = {
  idStory: number;
  idStoryScene: number;
  idElement: number;
  /** What the element is called, to name the dialog and the buttons. */
  name: string;
  link: SceneLink;
  /** The scene is complete: everything is shown and nothing can be pressed. */
  locked: boolean;
  /** The scene_elements workflow, for the status pill. */
  sceneOptions: StatusOption[];
  /**
   * The scene's stacks, in order, which the Stack row's dialog offers. Left
   * out where the holder does not know them; the tags are then only shown.
   */
  sceneStacks?: string[];
  /** The − beside the heading, drawn by the panel, which owns the removal. */
  action: ReactNode;
  /** The element's status in the scene has been moved from here. */
  onStatusChange: (status: string) => void;
  /** The info toggle has been pressed, or put back after a refusal. */
  onShowInfoChange: (showInfo: boolean) => void;
  /** The stacks dialog has saved, as the pill now is. */
  onTagsChange: (item: PlayItem) => void;
  /** The link's picture for this scene, as read on opening: its address, or null for none. */
  onImageLoaded: (url: string | null) => void;
  /** The link's picture for this scene has been changed from here: its address, or null for none. */
  onImageChange: (url: string | null) => void;
};

/**
 * The element panel's In this scene part, at the top of the panel as a card
 * on a faint tint of its own: how the element stands in this scene, then
 * its pictures for this scene.
 *
 * The heading carries the scene status pill and the − that takes the
 * element out, and its tooltip says when the element was added. The rows:
 * Stack, which pressed opens the stacks dialog (RunSceneElementStacksDialog)
 * for choosing the stacks the element is filed under; the info toggle,
 * pressing the same way as the pill's; and Cover, the element's picture for
 * this scene alone (the cover of its link's SCENE_ELEMENT uses), which its
 * pill shows here instead of the element's own picture. It is shown as the
 * element rows show the element's picture (RunPictureCell): its + opens the
 * attachment picker in place to make one of the story's or the scene's
 * pictures the cover (sa_attachAsCover), and its − takes the picture off the
 * link (sa_detachFromHolder). Under them, Other images lists the link's
 * other pictures, and its + opens the story attachment picker that the prep
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
  idElement,
  name,
  link,
  locked,
  sceneOptions,
  sceneStacks,
  action,
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
  const [editingTags, setEditingTags] = useState(false);

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
      const result = await sa_setSceneElementShowInfo(idStory, idStoryScene, idElement, next);
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

  const tags = tagList(link.tags);
  // The Stack row is a button while the stacks can be chosen; where they
  // cannot, or the holder does not know the scene's stacks, plain text.
  const tagsCell =
    !locked && sceneStacks ? (
      <chakra.button
        type="button"
        cursor="pointer"
        textAlign="start"
        rounded="sm"
        color={tags ? undefined : "fg.subtle"}
        textDecoration="underline"
        textDecorationStyle="dotted"
        textUnderlineOffset="3px"
        aria-label={`Stacks for ${name}`}
        onClick={() => setEditingTags(true)}
        _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
      >
        {tags ?? "No stacks"}
      </chakra.button>
    ) : (
      tags
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

  const rows: [string, ReactNode][] = [
    ["Stack", tagsCell],
    [
      "Info",
      <RunInfoToggle
        key="info"
        showInfo={link.showInfo}
        onToggle={locked ? undefined : () => void toggleInfo()}
      />,
    ],
    ["Cover", coverCell],
    ["Link", linkCell(link)],
  ];

  return (
    // A card at the top of the panel, on a faint tint and nothing more, so
    // the scene's part stands apart from the element's rows under it.
    <Stack gap="4" bg="bg.subtle" rounded="md" p="3">
      <DetailSection
        title="In this scene"
        hint={
          link.createdAt ? (
            <>
              Added <LocalDate value={new Date(link.createdAt)} withTime />
            </>
          ) : undefined
        }
        beside={
          <StatusPill
            table="scene_elements"
            id={link.idSceneElement}
            status={link.status}
            options={sceneOptions}
            canEdit={!locked}
            onChanged={onStatusChange}
          />
        }
        action={action}
        rows={rows}
      >
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
        {attachments === null ? (
          <Text color="fg.muted">Loading…</Text>
        ) : others.length === 0 ? (
          <Text color="fg.muted">No other images in this scene.</Text>
        ) : (
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
      {sceneStacks && (
        <RunSceneElementStacksDialog
          idStory={idStory}
          idStoryScene={idStoryScene}
          idElement={idElement}
          name={name}
          stacks={sceneStacks}
          tags={link.tags}
          open={editingTags}
          onClose={() => setEditingTags(false)}
          onSaved={onTagsChange}
        />
      )}
    </Stack>
  );
}

// Only a finished picture can be shown or made the cover.
const isPicture = (row: Attachment) => row.status === "READY" && row.url !== null;

/** The link's cover among its attachments, or null for none. */
function coverOf(rows: Attachment[]): Attachment | null {
  return rows.find((row) => isPicture(row) && row.isCover) ?? null;
}
