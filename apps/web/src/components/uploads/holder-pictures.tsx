"use client";

import { useState } from "react";
import { Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { Plus } from "lucide-react";
import { ATTACH_HOLDER_NOUNS, type AttachHolderKind, type Attachment } from "@/lib/attachments";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { toaster } from "@/components/ui/toaster";
import { sa_detachFromHolder } from "./actions";
import { AttachmentCard } from "./attachment-card";
import { AttachmentListField, type AttachmentRowsView } from "./attachment-list-field";
import { StoryAttachmentPicker } from "./story-attachment-picker";

export type HolderPicturesProps = {
  idStory: number;
  /** Whose pictures these are: a scene's, or an element's own. */
  holder: { kind: AttachHolderKind; idExternal: number };
  /**
   * The cover changed: the picture's address, or null for none. For a page
   * with the holder's cover behind it, so the picture follows at once.
   */
  onCoverChange?: (url: string | null) => void;
  /**
   * The pictures changed in any way: one added, taken off, or made the
   * cover. For a page that lists the same pictures somewhere else, such as
   * the live-edit page's library, to read them again.
   */
  onPicturesChange?: () => void;
  /** The heading's level: an h3 in a panel, an h2 as a column of an edit page. */
  headingLevel?: 2 | 3;
  /**
   * Each finished picture the app uploaded offers its annotation controls
   * (AnnotationControls): an element's pictures, whose cover its pill shows
   * the players.
   */
  canAnnotate?: boolean;
};

/**
 * A holder's pictures, as every editor of a scene's or an element's shows
 * them: the cover in an area of its own at the top, since it is the one
 * picture the holder's panel, card, pill and play space show and the one
 * worth finding at a glance, and the rest under it. The + beside the heading
 * opens the link input and dropzone; the fold at the bottom offers the
 * story's own pictures (StoryAttachmentPicker). Each picture is saved the
 * moment it is added, as on the story page, so a form around this has
 * nothing to save or to cancel for them.
 *
 * The rows, the uploads, the search and the cover are the field's
 * (AttachmentListField); this only draws its rows in two areas, through
 * renderRows, the way the run page's library lists them its own way. The
 * field is remounted when the picker attaches some of the story's pictures,
 * and when a card's trashcan takes one off, since it reads its rows once,
 * as it mounts.
 *
 * The trashcan on a card detaches the picture from the holder
 * (sa_detachFromHolder), as the run page's library takes a picture off a
 * scene; it does not delete the attachment, which the field's own remove
 * would. A holder's pictures are the story's, and a duplicated scene shares
 * them with its original, so deleting one here would take it from every
 * holder that shows it and from the story's library, its uploaded file with
 * it. The picture stays in the library to be attached again, its drawing
 * with it, since a drawing is the file's.
 */
export function HolderPictures({
  idStory,
  holder,
  onCoverChange,
  onPicturesChange,
  headingLevel = 3,
  canAnnotate = false,
}: HolderPicturesProps) {
  const noun = ATTACH_HOLDER_NOUNS[holder.kind];
  const [picturesKey, setPicturesKey] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  // The field reports its ids as it loads too, which is no change.
  const [hasLoaded, setHasLoaded] = useState(false);

  async function detach(row: Attachment) {
    try {
      const result = await sa_detachFromHolder(holder.kind, holder.idExternal, [row.idAttachment]);
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
        <IconButtonWithTooltip
          label="Add a picture"
          expanded={isAdding}
          onClick={() => setIsAdding((open) => !open)}
        >
          <Plus />
        </IconButtonWithTooltip>
      </HStack>
      <Text textStyle="xs" color="fg.muted">
        Saved as soon as they are added. Press Cover on the one the {noun} shows.
      </Text>
      <AttachmentListField
        key={picturesKey}
        kind={holder.kind}
        idExternal={holder.idExternal}
        showAdd={isAdding}
        onChange={() => {
          if (hasLoaded) onPicturesChange?.();
          else setHasLoaded(true);
        }}
        renderRows={(view) => (
          <Areas
            view={view}
            noun={noun}
            canAnnotate={canAnnotate}
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
        holder={holder}
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
  noun,
  canAnnotate,
  onCoverChange,
  onDetach,
}: {
  view: AttachmentRowsView;
  noun: string;
  canAnnotate: boolean;
  onCoverChange?: (url: string | null) => void;
  /** The card's trashcan: the picture leaves the holder. */
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
        removeDetachesFrom={noun}
        onCoverChange={async (isCover) => {
          const ok = await view.setCover(row.idAttachment, isCover);
          if (ok) onCoverChange?.(isCover ? row.url : null);
          return ok;
        }}
        onTagsChange={(tags) => view.setTags(row.idAttachment, tags)}
        onAnnotatedChange={
          canAnnotate ? (annotated) => view.setAnnotated(row.idAttachment, annotated) : undefined
        }
        onPictureChange={view.setPicture}
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
