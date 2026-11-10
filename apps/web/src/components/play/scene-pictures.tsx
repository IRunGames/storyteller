"use client";

import { useState } from "react";
import { Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import type { Attachment } from "@/lib/attachments";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { toaster } from "@/components/ui/toaster";
import { sa_detachFromHolder } from "@/components/uploads/actions";
import { AttachmentCard } from "@/components/uploads/attachment-card";
import {
  AttachmentListField,
  type AttachmentRowsView,
} from "@/components/uploads/attachment-list-field";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";

export type ScenePicturesProps = {
  idStory: number;
  idStoryScene: number;
  /**
   * The cover changed: the picture's address, or null for none. For a page
   * with the scene's cover behind it, so the picture follows at once.
   */
  onCoverChange?: (url: string | null) => void;
  /**
   * The scene's pictures changed in any way: one added, taken off, or made
   * the cover. For a page that lists the same pictures somewhere else, such
   * as the live-edit page's library, to read them again.
   */
  onPicturesChange?: () => void;
  /** The heading's level: an h3 in a panel, an h2 as a column of the Edit scene page. */
  headingLevel?: 2 | 3;
};

/**
 * A scene's pictures, as every scene editor shows them (SceneTextForm, and
 * the Edit scene page's middle column): the cover in an area of its own at
 * the top, since it is the one picture the scene's panel, card and play
 * space show and the one worth finding at a glance, and the rest under it.
 * The + beside the heading opens the link input and dropzone; the fold at
 * the bottom offers the story's own pictures (StoryAttachmentPicker). Each
 * picture is saved the moment it is added, as on the story page, so a form
 * around this has nothing to save or to cancel for them.
 *
 * The rows, the uploads, the search and the cover are the field's
 * (AttachmentListField); this only draws its rows in two areas, through
 * renderRows, the way the run page's library lists them its own way. The
 * field is remounted when the picker attaches some of the story's pictures,
 * and when a card's trashcan takes one off, since it reads its rows once,
 * as it mounts.
 *
 * The trashcan on a card detaches the picture from the scene
 * (sa_detachFromHolder), as the run page's library takes a picture off a
 * scene; it does not delete the attachment, which the field's own remove
 * would. A scene's pictures are the story's, and a duplicated scene shares
 * them with its original, so deleting one here would take it from every
 * scene that shows it and from the story's library, its uploaded file with
 * it. The picture stays in the library to be attached again.
 */
export function ScenePictures({
  idStory,
  idStoryScene,
  onCoverChange,
  onPicturesChange,
  headingLevel = 3,
}: ScenePicturesProps) {
  const [picturesKey, setPicturesKey] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  // The field reports its ids as it loads too, which is no change.
  const [hasLoaded, setHasLoaded] = useState(false);

  async function detach(row: Attachment) {
    try {
      const result = await sa_detachFromHolder("STORY_SCENE", idStoryScene, [row.idAttachment]);
      if (!result.ok) {
        toaster.create({ title: result.error, type: "error" });
        return;
      }
      if (row.isCover) onCoverChange?.(null);
      setPicturesKey((key) => key + 1);
      onPicturesChange?.();
    } catch {
      toaster.create({ title: "The picture could not be removed. Try again.", type: "error" });
    }
  }

  return (
    <Stack gap="2">
      <HStack gap="1" justify="space-between">
        {headingLevel === 2 ? (
          <Heading as="h2" size="md">
            Pictures
          </Heading>
        ) : (
          <Heading as="h3" textStyle="sm" fontWeight="medium">
            Pictures
          </Heading>
        )}
        <PrepIconButton
          label="Add a picture"
          expanded={isAdding}
          onClick={() => setIsAdding((open) => !open)}
        >
          <Plus />
        </PrepIconButton>
      </HStack>
      <Text textStyle="xs" color="fg.muted">
        Saved as soon as they are added. Press Cover on the one the scene shows.
      </Text>
      <AttachmentListField
        key={picturesKey}
        kind="STORY_SCENE"
        idExternal={idStoryScene}
        showAdd={isAdding}
        onChange={() => {
          if (hasLoaded) onPicturesChange?.();
          else setHasLoaded(true);
        }}
        renderRows={(view) => (
          <Areas
            view={view}
            onCoverChange={(url) => {
              onCoverChange?.(url);
              onPicturesChange?.();
            }}
            onDetach={(row) => void detach(row)}
          />
        )}
      />
      <StoryAttachmentPicker
        idStory={idStory}
        holder={{ kind: "STORY_SCENE", idExternal: idStoryScene }}
        onAttached={() => {
          setPicturesKey((key) => key + 1);
          onPicturesChange?.();
        }}
      />
    </Stack>
  );
}

/** The two areas: the cover, and every other picture. */
function Areas({
  view,
  onCoverChange,
  onDetach,
}: {
  view: AttachmentRowsView;
  onCoverChange?: (url: string | null) => void;
  /** The card's trashcan: the picture leaves the scene. */
  onDetach: (row: Attachment) => void;
}) {
  const cover = view.rows.find((row) => row.isCover);
  const others = view.rows.filter((row) => !row.isCover);

  function card(row: Attachment) {
    return (
      <AttachmentCard
        key={row.idAttachment}
        row={row}
        label={row.fileName ?? row.url ?? `Attachment ${row.idAttachment}`}
        placeholder={row.status === "ERROR" ? "Failed" : "Uploading…"}
        canTag
        onRetry={() => view.retry(row.idAttachment)}
        onRemove={() => onDetach(row)}
        removeDetaches
        onCoverChange={async (isCover) => {
          const ok = await view.setCover(row.idAttachment, isCover);
          if (ok) onCoverChange?.(isCover ? row.url : null);
          return ok;
        }}
        onTagsChange={(tags) => view.setTags(row.idAttachment, tags)}
      />
    );
  }

  return (
    <Stack gap="3">
      <Stack as="section" aria-label="Cover" gap="1">
        <Text textStyle="xs" fontWeight="medium" textTransform="uppercase" letterSpacing="wider">
          Cover
        </Text>
        {cover ? (
          <Grid role="list" aria-label="Cover picture" templateColumns="minmax(0, 13rem)">
            {card(cover)}
          </Grid>
        ) : (
          view.hasLoaded && (
            <Text textStyle="sm" color="fg.muted">
              No cover yet. Press Cover on a picture below.
            </Text>
          )
        )}
      </Stack>
      <Stack as="section" aria-label="Other pictures" gap="1">
        <Text textStyle="xs" fontWeight="medium" textTransform="uppercase" letterSpacing="wider">
          Other pictures
        </Text>
        {others.length > 0 ? (
          // auto-fill, so the cards fill the row and wrap to as many columns
          // as the width holds, as the field's own grid does.
          <Grid
            role="list"
            aria-label="Other pictures"
            w="full"
            gap="3"
            templateColumns="repeat(auto-fill, minmax(13rem, 1fr))"
          >
            {others.map(card)}
          </Grid>
        ) : (
          view.hasLoaded && (
            <Text textStyle="sm" color="fg.muted">
              No other pictures yet.
            </Text>
          )
        )}
      </Stack>
    </Stack>
  );
}
