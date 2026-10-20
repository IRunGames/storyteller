"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  chakra,
  Flex,
  Heading,
  HStack,
  IconButton,
  Menu,
  Portal,
  Stack,
  Text,
  Tooltip,
  type HeadingProps,
} from "@chakra-ui/react";
import { ChevronDown, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { PlayScene } from "@/lib/play-scene";
import { scenePreviewPath } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import type { SceneNeighbour } from "@/app/(app)/preview/scene/[id]/actions";
import { PlayHeader } from "./play-header";
import { PlaySpace } from "./play-space";

type Props = {
  idStory: number;
  /** The story the scene belongs to, shown in the header. */
  title: string;
  scene: PlayScene;
  /** The scenes played before and after this one, for the chevrons round the title; null at either end. */
  previous: SceneNeighbour | null;
  next: SceneNeighbour | null;
  /** Every scene of the story as the title's dropdown lists them; the chevrons step through this list. */
  scenes: SceneNeighbour[];
  /** The story_scenes workflow, for each scene's status as a word in the dropdown. */
  statusOptions: StatusOption[];
  /** The viewer tells the story: a pencil beside the title opens the scene's edit form. */
  canEdit: boolean;
};

/**
 * /preview/scene/[id]: one scene as the players' table shows the scene
 * being played, and nothing more. The tables' header with Preview in the
 * middle where the table has its panel toggles, then the play space read
 * only (PlaySpace readOnly): the pills' info and the scene's text open to
 * read, each pill's info ending with the element's History, and nothing on
 * the page writes. The scene's title is a dropdown of the story's scenes
 * (SceneTitleMenu), by sitting and scene, newest first, the one shown
 * marked, and chevrons either side of it step through that same list
 * (SceneChevron), the left to the entry below and the right to the entry
 * above, named in their tooltips, shut at either end. For the story's
 * owner a pencil after the info button opens the scene's edit form, the
 * board's own (/scenes/[id]/edit), told to come back here when it is
 * done, so the scene can be moved to another sitting from this tab. No
 * chat, no character space, no live connection: it is a look, not a seat
 * at the table.
 */
export function ScenePreview({
  idStory,
  title,
  scene,
  previous,
  next,
  scenes,
  statusOptions,
  canEdit,
}: Props) {
  const here = scene.scene ? scenePreviewPath(scene.scene.idStoryScene) : null;
  return (
    <Flex direction="column" h="100vh">
      <PlayHeader
        title={title}
        center={
          <Badge variant="subtle" colorPalette="orange" rounded="full" px="3">
            Preview
          </Badge>
        }
      />
      <Flex flex="1" minH="0" direction="column">
        <PlaySpace
          idStory={idStory}
          scene={scene}
          status="connected"
          readOnly
          withHistory
          titleStart={<SceneChevron direction="previous" scene={previous} />}
          titleEnd={
            <>
              {canEdit && scene.scene && here && (
                <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
                  <Tooltip.Trigger asChild>
                    <IconButton asChild size="xs" variant="ghost" rounded="full">
                      <NextLink
                        href={`/scenes/${scene.scene.idStoryScene}/edit?from=${encodeURIComponent(here)}`}
                        aria-label="Edit scene"
                      >
                        <Pencil />
                      </NextLink>
                    </IconButton>
                  </Tooltip.Trigger>
                  <Portal>
                    <Tooltip.Positioner>
                      <Tooltip.Content>Edit scene</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Portal>
                </Tooltip.Root>
              )}
              <SceneChevron direction="next" scene={next} />
            </>
          }
          renderTitle={(current, headingProps) => (
            <SceneTitleMenu
              current={scene.scene?.idStoryScene ?? null}
              title={current}
              scenes={scenes}
              statusOptions={statusOptions}
              headingProps={headingProps}
            />
          )}
          onTextChange={() => {}}
          onNotesChange={() => {}}
          onStatusChange={() => {}}
          previewIdElement={null}
          onPreviewClose={() => {}}
        />
      </Flex>
    </Flex>
  );
}

/**
 * One of the chevrons round the title: a link to the neighbouring scene's
 * preview in this same tab, its tooltip the scene's name. With no scene
 * that way it is shut; a disabled button opens no tooltip, so its own
 * title says why, as the scene selector's does.
 */
function SceneChevron({
  direction,
  scene,
}: {
  direction: "previous" | "next";
  scene: SceneNeighbour | null;
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  if (!scene) {
    const none = direction === "previous" ? "No earlier scene" : "No later scene";
    return (
      <IconButton aria-label={none} title={none} size="xs" variant="ghost" rounded="full" disabled>
        <Icon />
      </IconButton>
    );
  }
  const name = `${direction === "previous" ? "Previous" : "Next"} scene: ${scene.title}`;
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton asChild size="xs" variant="ghost" rounded="full">
          <NextLink href={scenePreviewPath(scene.idStoryScene)} aria-label={name}>
            <Icon />
          </NextLink>
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{scene.title}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

/**
 * The scene's title as a dropdown: the heading, set as the players' table
 * sets it, is the menu's trigger, with a caret saying so, and the menu
 * lists the story's scenes as given, each over the sitting it was played
 * in with its status at the right, the one shown marked. Choosing another
 * goes to its preview in this same tab.
 */
function SceneTitleMenu({
  current,
  title,
  scenes,
  statusOptions,
  headingProps,
}: {
  current: number | null;
  title: string;
  scenes: SceneNeighbour[];
  statusOptions: StatusOption[];
  headingProps: HeadingProps;
}) {
  const router = useRouter();
  const statusLabel = (status: string) =>
    statusOptions.find((option) => option.key === status)?.label ?? status;
  return (
    <Menu.Root
      positioning={{ placement: "bottom" }}
      onSelect={(details) => {
        const chosen = Number(details.value);
        if (chosen !== current) router.push(scenePreviewPath(chosen));
      }}
    >
      {/* The heading keeps its own name, the title, since the button inside
          it is named by the same words. */}
      <Heading {...headingProps} display="flex" justifyContent="center">
        <Menu.Trigger asChild>
          <chakra.button
            type="button"
            display="inline-flex"
            alignItems="center"
            gap="1"
            minW="0"
            maxW="full"
            cursor="pointer"
            rounded="sm"
            _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing" }}
          >
            <chakra.span truncate minW="0">
              {title}
            </chakra.span>
            <chakra.span display="inline-flex" flexShrink="0" aria-hidden>
              <ChevronDown />
            </chakra.span>
          </chakra.button>
        </Menu.Trigger>
      </Heading>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="xs">
            <Menu.RadioItemGroup value={current === null ? undefined : String(current)}>
              {scenes.map((scene) => (
                <Menu.RadioItem key={scene.idStoryScene} value={String(scene.idStoryScene)}>
                  <Menu.ItemIndicator />
                  <Menu.ItemText>
                    <HStack justify="space-between" gap="4" w="full" minW="0">
                      <Stack gap="0" minW="0">
                        <Text as="span" truncate>
                          {scene.title}
                        </Text>
                        <Text as="span" textStyle="xs" color="fg.muted" truncate>
                          {scene.sessionHeading ?? "Not played yet"}
                        </Text>
                      </Stack>
                      <Text as="span" textStyle="xs" color="fg.muted" flexShrink="0">
                        {statusLabel(scene.status)}
                      </Text>
                    </HStack>
                  </Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
