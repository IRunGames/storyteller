"use client";

import { Image, Stack, Text } from "@chakra-ui/react";
import type { StorySceneDetail } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { sa_getStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { StatusPill } from "@/components/status/status-pill";
import { InfoPopover } from "@/components/popovers/info-popover";

type Props = {
  idStoryScene: number;
  /** The story_scenes workflow, so the panel's pill matches the card's. */
  statusOptions: StatusOption[];
  /** The viewer is the storyteller, so the panel's pill is a menu too. */
  canEdit: boolean;
  /** The new status, once the panel's pill has moved it. */
  onStatusChanged?: (status: string) => void;
};

// What the info button on a scene card opens: the scene's picture, its status,
// the sitting it was played in, and everything the storyteller wrote about it
// — the NPCs in it and anything of note, which the card can only show the
// opening of. InfoPopover owns the button, the panel and the fetch.
//
// The status is the one live thing in here, so the pill tells the column when
// it moves and the panel keeps showing what the card shows.
export function SceneInfoPopover({ idStoryScene, statusOptions, canEdit, onStatusChanged }: Props) {
  return (
    <InfoPopover<StorySceneDetail>
      label="Scene info"
      load={() => sa_getStoryScene(idStoryScene)}
      missingText="This scene is no longer here."
      errorText="Could not load the scene."
      heading={(detail) => detail?.title ?? "Scene"}
    >
      {(detail, setDetail) => (
        <Stack gap="4">
          {detail.imageLink && (
            // Decoration beside a heading that already names the scene, so
            // the alt is empty and it reads as presentation.
            <Image
              src={detail.imageLink}
              alt=""
              rounded="md"
              w="full"
              maxH="40"
              objectFit="cover"
            />
          )}

          <Stack gap="2" align="start">
            <StatusPill
              table="story_scenes"
              id={detail.idStoryScene}
              status={detail.status}
              options={statusOptions}
              canEdit={canEdit}
              onChanged={(status) => {
                setDetail((current) => (current ? { ...current, status } : current));
                onStatusChanged?.(status);
              }}
            />
            <Text textStyle="sm" color="fg.muted">
              {detail.sessionHeading ?? "Not played yet."}
            </Text>
          </Stack>

          {detail.description ? (
            // The line breaks are the storyteller's: the seed writes what
            // happened, then the NPCs, then what is of note, a line each, and
            // so will the form.
            <Text textStyle="sm" whiteSpace="pre-line">
              {detail.description}
            </Text>
          ) : (
            <Text textStyle="sm" color="fg.muted">
              Nothing written down yet.
            </Text>
          )}
        </Stack>
      )}
    </InfoPopover>
  );
}
