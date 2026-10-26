"use client";

import { Accordion, HStack, Image, List, Stack, Text } from "@chakra-ui/react";
import { ELEMENT_KIND_LABELS, type ElementKind } from "@/lib/elements";
import { formatSceneLength, type SceneElementInfo, type StorySceneDetail } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { sa_getStoryScene } from "@/app/(app)/(nav)/libraries/actions";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusPill } from "@/components/status/status-pill";
import { InfoPopover } from "@/components/popovers/info-popover";
import { LocalDate } from "@/components/dates/local-date";
import { StoryAttachmentPicker } from "@/components/uploads/story-attachment-picker";

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
// the sitting it was played in, everything the storyteller wrote about it
// — the NPCs in it and anything of note, which the card can only show the
// opening of — and the elements linked to it, folded away. InfoPopover owns the button, the panel and the fetch; the
// button beside the heading opens the same detail on /scenes/[id].
//
// The status is the one live thing in here, so the pill tells the column when
// it moves and the panel keeps showing what the card shows.
export function SceneInfoPopover({ idStoryScene, statusOptions, canEdit, onStatusChanged }: Props) {
  return (
    <InfoPopover<SceneInfo>
      label="Scene info"
      // The scene_elements workflow comes with the scene, so the Elements
      // fold's pills are drawn from the first render rather than after.
      load={async () => {
        const [detail, elementStatusOptions] = await Promise.all([
          sa_getStoryScene(idStoryScene),
          sa_listStatusOptions("scene_elements"),
        ]);
        return detail && { ...detail, elementStatusOptions };
      }}
      missingText="This scene is no longer here."
      errorText="Could not load the scene."
      heading={(detail) => detail?.title ?? "Scene"}
      popoutHref={`/scenes/${idStoryScene}`}
    >
      {(detail, setDetail) => (
        <SceneDetail
          detail={detail}
          statusOptions={statusOptions}
          elementStatusOptions={detail.elementStatusOptions}
          canEdit={canEdit}
          onStatusChanged={(status) => {
            setDetail((current) => (current ? { ...current, status } : current));
            onStatusChanged?.(status);
          }}
        />
      )}
    </InfoPopover>
  );
}

/** The scene as the popover loads it: the detail, and the workflow its elements' pills use. */
type SceneInfo = StorySceneDetail & { elementStatusOptions: StatusOption[] };

/**
 * The body of a scene's panel, shared by the popover and the scene's own page:
 * everything but the heading, which each of them draws in its own way.
 */
export function SceneDetail({
  detail,
  statusOptions,
  elementStatusOptions,
  canEdit,
  onStatusChanged,
}: {
  detail: StorySceneDetail;
  statusOptions: StatusOption[];
  /** The scene_elements workflow, for the pills in the Elements fold. */
  elementStatusOptions: StatusOption[];
  canEdit: boolean;
  onStatusChanged: (status: string) => void;
}) {
  return (
    <Stack gap="4">
      {detail.imageLink && (
        // Decoration beside a heading that already names the scene, so
        // the alt is empty and it reads as presentation.
        // Shown whole, at the panel's width and its own height, rather than
        // cropped to a strip: the panel scrolls when it runs long.
        <Image src={detail.imageLink} alt="" rounded="md" w="full" h="auto" />
      )}

      <Stack gap="2" align="start">
        <StatusPill
          table="story_scenes"
          id={detail.idStoryScene}
          status={detail.status}
          options={statusOptions}
          canEdit={canEdit}
          onChanged={onStatusChanged}
        />
        {/* Where it was played, for how long once it is finished, and the
            day it went into play. Only a number is a length: anything else
            and the time is left off. A scene not yet in a sitting says so
            and nothing more. */}
        <Text textStyle="sm" color="fg.muted">
          {detail.sessionHeading ?? "Not played yet."}
          {detail.sessionHeading !== null && (
            <>
              {typeof detail.length === "number" && ` · ${formatSceneLength(detail.length)}`}
              {detail.startedAt && (
                <>
                  {" on "}
                  <LocalDate value={detail.startedAt} />
                </>
              )}
            </>
          )}
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

      {detail.elements.length > 0 && (
        <SceneElementsFold elements={detail.elements} statusOptions={elementStatusOptions} />
      )}

      {/* The storyteller can bring the story's own attachments onto the
          scene from here; nobody else sees the fold. */}
      {canEdit && (
        <StoryAttachmentPicker
          idStory={detail.idStory}
          holder={{ kind: "STORY_SCENE", idExternal: detail.idStoryScene }}
        />
      )}
    </Stack>
  );
}

/**
 * The scene's elements, folded away as the session panel folds its scenes:
 * the panel is read for the scene's own text first. Each shows its status in
 * this scene, read only, since the run page is where a scene's elements are
 * moved, and whatever of it the action sent: everything for the
 * storyteller, what the players' table shows for a player.
 */
function SceneElementsFold({
  elements,
  statusOptions,
}: {
  elements: SceneElementInfo[];
  statusOptions: StatusOption[];
}) {
  return (
    <Accordion.Root collapsible size="sm" variant="enclosed">
      <Accordion.Item value="elements">
        <Accordion.ItemTrigger>
          <Text flex="1" textStyle="sm">
            Elements ({elements.length})
          </Text>
          <Accordion.ItemIndicator />
        </Accordion.ItemTrigger>
        <Accordion.ItemContent>
          <Accordion.ItemBody>
            <List.Root listStyleType="none" gap="3" aria-label="Elements in this scene">
              {elements.map((element) => (
                <List.Item key={element.idSceneElement}>
                  <Stack gap="1">
                    <HStack justify="space-between" align="start" gap="2">
                      <Stack gap="0" minW="0">
                        <Text textStyle="sm" fontWeight="medium">
                          {element.label}
                        </Text>
                        {element.detail && (
                          <Text textStyle="xs" color="fg.muted">
                            {element.detail}
                          </Text>
                        )}
                      </Stack>
                      <StatusPill
                        table="scene_elements"
                        id={element.idSceneElement}
                        status={element.status}
                        options={statusOptions}
                      />
                    </HStack>
                    <Text textStyle="xs" color="fg.muted">
                      {ELEMENT_KIND_LABELS[element.kind as ElementKind] ?? element.kind}
                    </Text>
                    {element.description && (
                      <Text textStyle="sm" whiteSpace="pre-line">
                        {element.description}
                      </Text>
                    )}
                  </Stack>
                </List.Item>
              ))}
            </List.Root>
          </Accordion.ItemBody>
        </Accordion.ItemContent>
      </Accordion.Item>
    </Accordion.Root>
  );
}
