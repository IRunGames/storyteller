"use client";

import { useCallback, useState } from "react";
import NextLink from "next/link";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  HStack,
  IconButton,
  List,
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { LogIn, MessageSquare, Swords } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { PlayChatOverlay } from "@/components/play/play-chat-overlay";
import { SceneStateOverlay } from "@/components/play/scene-state-overlay";
import { usePlayScene, type ScenePulseEvent } from "@/components/play/use-play-scene";
import { useStoryChat } from "@/components/play/use-story-chat";
import type { ChannelStatus } from "@/components/play/use-story-channel";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";
import { toPlayItem, type PlayScene } from "@/lib/play-scene";
import { elementIdOf, playStacks } from "@/lib/run";
import { withRedirect } from "@/lib/safe-redirect";
import { cssUrlValue } from "@/lib/stories";
import { LogoMark } from "@/components/nav/brand-mark";
import { BackgroundToggle } from "@/components/play/background-toggle";
import { PassivePill } from "./passive-pill";

type Props = {
  idStory: number;
  /** The story being played. */
  title: string;
  /** The heading of the session being played, or null when there is none. */
  session: string | null;
  /** The scene as the page loaded it; the table keeps it up to date from there. */
  initialScene: PlayScene;
  /** The story's cover, behind the table when the scene has none. */
  storyCoverUrl: string | null;
  /** The viewer is the story's storyteller, putting the table up on a screen. */
  isOwner: boolean;
};

const CHAT_ID = "table-chat";

// Whether someone with an account has the chat's box to type in, a user
// preference as the play table's panels are, so a screen put up for the
// room stays without it from one visit to the next.
const SHOW_CHAT_BOX = "table.showChatBox";

// The halo PlaySpace sets its words in, so they read over any cover.
const HALO_COLOUR = "var(--chakra-colors-bg)";
const HALO = [1, 1, 2, 4, 8, 12].map((px) => `0 0 ${px}px ${HALO_COLOUR}`).join(", ");

// What the table says of a connection short of connected, as PlaySpace does.
const STATUS_NOTES: Partial<Record<ChannelStatus, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline: changes will show when the connection is back.",
  unavailable: "Live updates are off; reload to see changes.",
};

/**
 * The display table: the scene being played, put up to be read at a
 * distance, on a screen the table shares or by a guest who came in by the
 * join link. Nothing on it is pressed; the storyteller runs it from their
 * own table, and it follows over the story's MQTT topic as the players'
 * table does (usePlayScene).
 *
 * There is no header bar, so the scene's cover fills the window. Over it at
 * the top: the Storyteller logo, the scene's title with the story and session
 * under it, and one button, back to the storyteller's or the player's own
 * table, or, for a guest, to log in or sign up, which keeps their seat
 * (lib/auth.ts) and brings them back here.
 *
 * The elements are in the storyteller's stacks as on the players' table, as
 * large pills with no pictures (PassivePill). A picture the storyteller puts
 * up (preview.open) opens full size over everything until they take it down.
 * Someone with an account can also open an element's picture from its icon,
 * in the same preview, and open its info from the button beside the icon;
 * the preview is theirs alone, and the storyteller putting up
 * or taking down a picture replaces it, as on the players' table.
 *
 * The chat is the overlay chat the players' table offers as a layout, here
 * always: each line floats up in the lower right for a while and goes. A
 * guest only reads it; someone with an account has its small box to type in,
 * which the button beside the top-right one hides and shows again. Hidden,
 * the lines still float up.
 *
 * Someone with an account also has a small eye in the upper right
 * (BackgroundToggle) that puts everything away, the header, the stacks,
 * the chat and the cover's dimming, to show the cover alone until it is
 * pressed again. A picture the storyteller puts up still opens over it.
 */
export function PassiveTable({
  idStory,
  title,
  session,
  initialScene,
  storyCoverUrl,
  isOwner,
}: Props) {
  const user = useUser();
  const preferences = useUserPreferences();
  const showChatBox = !user.isAnonymous && preferences.get<boolean>(SHOW_CHAT_BOX, true);
  const [previewIdElement, setPreviewIdElement] = useState<number | null>(null);
  // The eye's choice, this page's alone: a reload brings the details back.
  const [showBackground, setShowBackground] = useState(false);
  const detailsHidden = !user.isAnonymous && showBackground;
  // An action this build does not know is left alone, as on the players' table.
  const onPulse = useCallback((event: ScenePulseEvent) => {
    if (event.custom.action === "preview.open") setPreviewIdElement(event.idElement);
    else if (event.custom.action === "preview.close") setPreviewIdElement(null);
  }, []);
  const chat = useStoryChat(idStory, true);
  const { scene, channel, setElementNotes } = usePlayScene(idStory, initialScene, onPulse, {
    onChat: chat.receive,
    onConnect: () => void chat.refresh(),
  });

  const items = scene.items.map(toPlayItem);
  const coverUrl = scene.coverUrl ?? storyCoverUrl;
  const note = STATUS_NOTES[channel.status];
  const shown =
    previewIdElement === null
      ? null
      : (items.find((item) => elementIdOf(item) === previewIdElement && item.imageUrl) ?? null);

  return (
    <Box position="relative" h="100vh" overflow="hidden" bg="bg">
      {coverUrl && (
        <>
          <Box
            aria-hidden
            data-testid="table-cover"
            position="absolute"
            inset="0"
            bgSize="cover"
            bgPos="center"
            style={{ backgroundImage: `url("${cssUrlValue(coverUrl)}")` }}
          />
          {!detailsHidden && <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />}
        </>
      )}

      {!user.isAnonymous && (
        // As tall as the header's buttons (size sm) and at their top, so the
        // eye sits in line with them at the end of their row, the gap after
        // them being the header's pe below. Outside the header so it stays
        // put while the header is put away.
        <Flex
          position="absolute"
          top="4"
          right={{ base: "4", md: "6" }}
          zIndex="1"
          h="9"
          align="center"
        >
          <BackgroundToggle
            isOn={showBackground}
            onToggle={() => setShowBackground(!showBackground)}
            controls="table-details"
          />
        </Flex>
      )}

      {/* Put away with display rather than taken out, so an open info
          popover or half-written notes are there when it comes back. */}
      <Flex
        id="table-details"
        position="relative"
        direction="column"
        h="full"
        display={detailsHidden ? "none" : undefined}
      >
        {/* The same three columns as PlayHeader, with equal outer ones so
            the scene's title stays centred on the window. */}
        <Grid
          as="header"
          templateColumns="minmax(0, 1fr) auto minmax(0, 1fr)"
          alignItems="start"
          gap="4"
          px={{ base: "4", md: "6" }}
          pt="4"
        >
          <HStack gap="3" textShadow={HALO} justifySelf="start">
            <LogoMark size="10" />
            <Text fontSize="2xl" fontWeight="bold" letterSpacing="-0.01em" whiteSpace="nowrap">
              Storyteller
            </Text>
          </HStack>

          <Stack gap="0" align="center" minW="0" textAlign="center">
            <Heading
              as="h1"
              textStyle={{ base: "3xl", md: "5xl" }}
              fontVariant="small-caps"
              letterSpacing="wide"
              textShadow={HALO}
              maxW="full"
              truncate
            >
              {scene.scene?.title ?? title}
            </Heading>
            <Text textStyle={{ base: "md", md: "xl" }} textShadow={HALO} maxW="full" truncate>
              {scene.scene ? `${title} — ${session ?? "No session"}` : (session ?? "No session")}
            </Text>
          </Stack>

          {/* Room after the buttons for the eye: its 24px and the row's gap. */}
          <Box justifySelf="end" pe={user.isAnonymous ? undefined : "8"}>
            <HStack gap="2">
              {!user.isAnonymous && (
                <ChatBoxToggle
                  isOn={showChatBox}
                  onToggle={() => preferences.set(SHOW_CHAT_BOX, !showChatBox)}
                />
              )}
              <TableButton idStory={idStory} isOwner={isOwner} isGuest={user.isAnonymous} />
            </HStack>
          </Box>
        </Grid>

        <Box flex="1" minH="0" overflowY="auto" px={{ base: "4", md: "8" }} py="6">
          {scene.idStorySession === null ? (
            <Text textStyle="2xl" textShadow={HALO} textAlign="center">
              No session is being played.
            </Text>
          ) : scene.scene === null ? (
            <Text textStyle="2xl" textShadow={HALO} textAlign="center">
              The storyteller has not chosen a scene yet.
            </Text>
          ) : (
            <Flex gap="6" wrap="wrap" align="flex-start" justify="space-between">
              {playStacks(scene.tags, items).map((stack) => (
                <Stack
                  key={stack.title}
                  as="section"
                  aria-label={stack.title}
                  gap="3"
                  w={{ base: "full", md: "30rem" }}
                  flexShrink="0"
                >
                  <Heading
                    as="h2"
                    textStyle="xl"
                    truncate
                    textShadow={HALO}
                    textTransform="uppercase"
                    letterSpacing="wider"
                    px="2"
                  >
                    {stack.title}
                  </Heading>
                  {stack.items.length > 0 && (
                    <List.Root listStyleType="none" gap="3">
                      {stack.items.map((item) => (
                        <List.Item key={item.key}>
                          <PassivePill
                            idStory={idStory}
                            item={item}
                            onPreview={
                              user.isAnonymous
                                ? undefined
                                : () => setPreviewIdElement(elementIdOf(item))
                            }
                            onNotesChange={user.isAnonymous ? undefined : setElementNotes}
                          />
                        </List.Item>
                      ))}
                    </List.Root>
                  )}
                </Stack>
              ))}
            </Flex>
          )}
        </Box>

        {note && (
          <Badge position="absolute" bottom="4" left="4" variant="subtle" colorPalette="orange">
            {note}
          </Badge>
        )}
      </Flex>

      {!detailsHidden && <SceneStateOverlay status={scene.scene?.status} />}

      {/* As on the players' table: keyed by the item, so a new picture is a
          fresh dialog rather than one whose image swaps under it. */}
      {shown && shown.imageUrl && (
        <AttachmentPreviewDialog
          key={shown.key}
          open
          onOpenChange={(open) => {
            if (!open) setPreviewIdElement(null);
          }}
          url={shown.imageUrl}
          label={shown.label}
          tags={[]}
          isCover={false}
          showTags={false}
        />
      )}

      {/* Taken out while the background shows, lines and box both; back,
          it shows only lines said after it returns (PlayChatOverlay). */}
      {!detailsHidden && (
        <PlayChatOverlay
          id={CHAT_ID}
          idStory={idStory}
          chat={chat}
          canPost={showChatBox}
          showLayoutPicker={false}
        />
      )}
    </Box>
  );
}

/**
 * The one button on the display table, in its top right: back to the
 * table the viewer plays at, or, for a guest, to make an account, which
 * keeps their seat and brings them back here.
 */
function TableButton({
  idStory,
  isOwner,
  isGuest,
}: {
  idStory: number;
  isOwner: boolean;
  isGuest: boolean;
}) {
  if (isGuest) {
    return (
      <Button asChild size="sm" variant="solid">
        <NextLink href={withRedirect("/signup", `/table/${idStory}`)}>
          <LogIn />
          Log in / Sign up
        </NextLink>
      </Button>
    );
  }
  const href = isOwner ? `/run/${idStory}` : `/play/${idStory}`;
  return (
    <Button asChild size="sm" variant="subtle">
      <NextLink href={href}>
        <Swords />
        {isOwner ? "Back to the run table" : "Back to the play table"}
      </NextLink>
    </Button>
  );
}

/**
 * Shows or hides the chat's box to type in, for someone with an account; the
 * lines keep floating up either way. A toggle button, so aria-pressed says
 * whether the box is showing and the tooltip says what a press will do, as
 * the play table's panel toggles do.
 */
function ChatBoxToggle({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label="Chat box"
          aria-pressed={isOn}
          aria-controls={CHAT_ID}
          size="sm"
          variant={isOn ? "solid" : "subtle"}
          onClick={onToggle}
        >
          <MessageSquare />
        </IconButton>
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{isOn ? "Hide the chat box" : "Show the chat box"}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
