"use client";

import { useId } from "react";
import { Accordion, Avatar, HStack, Image, List, Stack, Text } from "@chakra-ui/react";
import {
  formatSessionLength,
  sessionStatusText,
  sessionHeading,
  type StorySessionDetail,
} from "@/lib/stories";
import type { StatusOption } from "@/lib/status";
import { sa_getStorySession } from "@/app/(app)/(nav)/stories/actions";
import { sa_listStatusOptions } from "@/components/status/actions";
import { StatusPill } from "@/components/status/status-pill";
import { InfoPopover } from "@/components/popovers/info-popover";

type Props = {
  idStorySession: number;
  /** The button's colour; the story page passes its panel's muted text. */
  color?: string;
};

// The workflow travels with the detail rather than being state of its own, so
// the panel opens on both or neither and the scene pills never flash from
// uncoloured to coloured.
type Loaded = {
  detail: StorySessionDetail;
  /** The story_scenes workflow, for the pills in the scenes fold. */
  sceneStatusOptions: StatusOption[];
};

// What the info button on a session row opens: the session's image, heading,
// length, who came, its summary, and the notes and lingering questions folded
// into an accordion so a long entry does not push the rest out of sight.
// InfoPopover owns the button, the panel and the fetch; nothing in here
// changes while the page is up.
export function SessionInfoPopover({ idStorySession, color }: Props) {
  // The workflow is fetched here rather than threaded down from the page,
  // because this popover is opened from the story page too, which knows
  // nothing about scenes.
  async function load(): Promise<Loaded | null> {
    const detail = await sa_getStorySession(idStorySession);
    if (!detail) return null;
    // Only worth asking when there are scenes to colour, which is only ever
    // for the storyteller.
    const sceneStatusOptions =
      detail.scenes.length > 0 ? await sa_listStatusOptions("story_scenes") : [];
    return { detail, sceneStatusOptions };
  }

  return (
    <InfoPopover<Loaded>
      label="Session info"
      color={color}
      load={load}
      missingText="This session is no longer here."
      errorText="Could not load the session."
      heading={(loaded) => (loaded ? sessionHeading(loaded.detail) : "Session")}
    >
      {({ detail, sceneStatusOptions }) => (
        <SessionDetail detail={detail} sceneStatusOptions={sceneStatusOptions} />
      )}
    </InfoPopover>
  );
}

function SessionDetail({
  detail,
  sceneStatusOptions,
}: {
  detail: StorySessionDetail;
  sceneStatusOptions: StatusOption[];
}) {
  const playersId = useId();
  const folds = [
    { value: "notes", label: "Notes", text: detail.notes },
    { value: "questions", label: "Lingering questions", text: detail.lingeringQuestions },
  ].filter((fold) => fold.text);

  return (
    <Stack gap="4">
      {detail.imageLink && (
        // Decoration beside a heading that already names the session, so
        // the alt is empty and the image reads as presentation.
        <Image src={detail.imageLink} alt="" rounded="md" w="full" maxH="40" objectFit="cover" />
      )}

      {/* The length is generated once the session is done; before that the
          status says why there is none. */}
      <Text textStyle="sm" color="fg.muted">
        {detail.length === null
          ? sessionStatusText(detail.status)
          : formatSessionLength(detail.length)}
      </Text>

      <Stack gap="2">
        <Text id={playersId} textStyle="sm" fontWeight="semibold">
          Players
        </Text>
        {detail.players.length === 0 ? (
          <Text textStyle="sm" color="fg.muted">
            No players recorded.
          </Text>
        ) : (
          // Flowing, as on the story page: who came takes a line or two of
          // the panel rather than one line each.
          <List.Root
            aria-labelledby={playersId}
            listStyleType="none"
            display="flex"
            flexDirection="row"
            flexWrap="wrap"
            gap="2"
            columnGap="4"
          >
            {detail.players.map((player) => (
              <List.Item key={player.idUser}>
                <HStack gap="2">
                  <Avatar.Root size="xs">
                    <Avatar.Fallback name={player.name} />
                    {player.image && <Avatar.Image src={player.image} alt="" />}
                  </Avatar.Root>
                  <Text textStyle="sm" whiteSpace="nowrap">
                    {player.name}
                  </Text>
                </HStack>
              </List.Item>
            ))}
          </List.Root>
        )}
      </Stack>

      {detail.summary && <Text textStyle="sm">{detail.summary}</Text>}

      {(folds.length > 0 || detail.scenes.length > 0) && (
        <Accordion.Root collapsible multiple size="sm" variant="enclosed">
          {/* The scenes played in this sitting, folded away like the notes:
              a long session ran through a dozen of them and the panel is
              read for its summary first. Only the storyteller is given any,
              so for anyone else this fold is simply not there. */}
          {detail.scenes.length > 0 && (
            <Accordion.Item value="scenes">
              <Accordion.ItemTrigger>
                <Text flex="1" textStyle="sm">
                  Scenes ({detail.scenes.length})
                </Text>
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                <Accordion.ItemBody>
                  {/* Numbered as they were played, first to last: the
                      action orders them by the time each came up at the
                      table, so the number is the position in this list and
                      not anything stored on the scene. */}
                  <List.Root as="ol" listStyleType="none" gap="2">
                    {detail.scenes.map((scene, index) => (
                      <List.Item key={scene.idStoryScene}>
                        <HStack gap="2" justify="space-between" align="start">
                          <Text textStyle="sm">
                            {index + 1}. {scene.title}
                          </Text>
                          {/* Shown, not changed: this panel is opened from
                              the story page as well as the board, and a
                              scene is moved on the board where it lives. */}
                          <StatusPill
                            table="story_scenes"
                            id={scene.idStoryScene}
                            status={scene.status}
                            options={sceneStatusOptions}
                          />
                        </HStack>
                      </List.Item>
                    ))}
                  </List.Root>
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          )}
          {folds.map((fold) => (
            <Accordion.Item key={fold.value} value={fold.value}>
              <Accordion.ItemTrigger>
                <Text flex="1" textStyle="sm">
                  {fold.label}
                </Text>
                <Accordion.ItemIndicator />
              </Accordion.ItemTrigger>
              <Accordion.ItemContent>
                {/* The text keeps its line breaks: the seed writes one note
                    or question per line, and so will the form. */}
                <Accordion.ItemBody textStyle="sm" whiteSpace="pre-line">
                  {fold.text}
                </Accordion.ItemBody>
              </Accordion.ItemContent>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </Stack>
  );
}
