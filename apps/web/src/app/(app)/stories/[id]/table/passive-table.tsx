"use client";

import { useEffect, useState } from "react";
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
  Portal,
  Stack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { LogIn, MessageSquare, Swords } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { TABLE_SHOW_CHAT_BOX } from "@/lib/preference-keys";
import { PlayChatOverlay } from "@/components/play/play-chat-overlay";
import { SceneStateOverlay } from "@/components/table-shell/scene-state-overlay";
import { usePlayScene } from "@/components/play/use-play-scene";
import { useStoryChat } from "@/components/play/use-story-chat";
import { HALO } from "@/components/table-shell/halo";
import { PlayStackFrame } from "@/components/table-shell/play-stack-frame";
import { PulsedPicture, usePulsedPicture } from "@/components/table-shell/pulsed-picture";
import { STATUS_NOTES } from "@/components/table-shell/status-notes";
import { toPlayItem, type PlayScene } from "@/lib/play-scene";
import { isStackWide, playStacks } from "@/lib/scene-elements";
import { withRedirect } from "@/lib/safe-redirect";
import { LogoMark } from "@/components/nav/brand-mark";
import { BackgroundToggle } from "@/components/play/background-toggle";
import { authClient } from "@/lib/auth-client";
import { GuestLeaveButton } from "./guest-leave-button";
import { PassivePill } from "./passive-pill";
import { CoverBackdrop } from "@/components/covers/cover-backdrop";

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

// A guest is deleted when the storyteller ends the session they sat at
// (sa_setRowStatus), and the table's reload on that news then fails. If it
// failed because the guest's session is gone, rather than the network, there
// is no table left for them, and they go to the landing page.
async function leaveIfSignedOut() {
  const { data, error } = await authClient.getSession();
  if (!error && !data) window.location.assign("/");
}

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
 * (lib/auth.ts) and brings them back here. A guest also has Leave
 * (GuestLeaveButton), is taken out of the story shortly after closing the
 * page (useGuestDeparture), and is sent out when the storyteller ends the
 * session.
 *
 * The elements are in the storyteller's stacks as on the players' table
 * (PlayStackFrame, at the display size), as large pills with no pictures
 * (PassivePill). A picture the storyteller puts up (preview.open) opens
 * full size over everything until they take it down (usePulsedPicture).
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
  const showChatBox = !user.isAnonymous && preferences.get<boolean>(TABLE_SHOW_CHAT_BOX, true);
  const picture = usePulsedPicture();
  // The eye's choice, this page's alone: a reload brings the details back.
  const [showBackground, setShowBackground] = useState(false);
  const detailsHidden = !user.isAnonymous && showBackground;
  const chat = useStoryChat(idStory, true);
  const { scene, channel, setElementNotes } = usePlayScene(idStory, initialScene, picture.onPulse, {
    onChat: chat.receive,
    onConnect: () => void chat.refresh(),
    onReloadFailed: user.isAnonymous ? leaveIfSignedOut : undefined,
  });

  useGuestDeparture(idStory, user.isAnonymous);

  const items = scene.items.map(toPlayItem);
  const coverUrl = scene.coverUrl ?? storyCoverUrl;
  const note = STATUS_NOTES[channel.status];

  return (
    <Box position="relative" h="100vh" overflow="hidden" bg="bg">
      {coverUrl && (
        <CoverBackdrop
          url={coverUrl}
          scrim={detailsHidden ? "none" : "flat"}
          testId="table-cover"
        />
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
                  onToggle={() => preferences.set(TABLE_SHOW_CHAT_BOX, !showChatBox)}
                />
              )}
              {user.isAnonymous && <GuestLeaveButton idStory={idStory} title={title} />}
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
              {/* A stack the storyteller has widened takes the whole width
                  here too, its pills in columns as on their table, so the
                  room sees what they see. */}
              {playStacks(scene.tags, items).map((stack) => (
                <PlayStackFrame
                  key={stack.title}
                  title={stack.title}
                  size="display"
                  wide={isStackWide(scene.wideTags, stack.tag)}
                  items={stack.items}
                  renderItem={(item) => (
                    <PassivePill
                      idStory={idStory}
                      item={item}
                      onPreview={
                        user.isAnonymous
                          ? undefined
                          : () => picture.open(item.idSceneElement ?? null)
                      }
                      onNotesChange={user.isAnonymous ? undefined : setElementNotes}
                    />
                  )}
                />
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

      <PulsedPicture
        items={items}
        idSceneElement={picture.idSceneElement}
        onClose={picture.close}
      />

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
/**
 * For a guest, tells the server as the page goes (pagehide) that they may
 * have closed it, with a beacon, which the browser still sends as the page
 * unloads. The server waits a moment before taking them out of the story
 * (api/table/leave), since a reload sends the same event and comes straight
 * back. A page the browser kept whole for the back button (pageshow with
 * persisted) is loaded afresh when it returns, so the guest is seated again
 * rather than shown a table they were taken out of.
 */
function useGuestDeparture(idStory: number, isGuest: boolean) {
  useEffect(() => {
    if (!isGuest) return;
    const onHide = () => {
      const body = new Blob([JSON.stringify({ idStory })], { type: "application/json" });
      navigator.sendBeacon("/api/table/leave", body);
    };
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, [idStory, isGuest]);
}

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
        <NextLink href={withRedirect("/signup", `/stories/${idStory}/table`)}>
          <LogIn />
          Log in / Sign up
        </NextLink>
      </Button>
    );
  }
  const href = isOwner ? `/stories/${idStory}/run` : `/stories/${idStory}/play`;
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
