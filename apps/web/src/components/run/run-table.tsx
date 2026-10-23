"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Flex,
  Heading,
  HStack,
  SegmentGroup,
  Separator,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { Activity, BookOpen, MessageSquare, RefreshCw, Settings, UserRound } from "lucide-react";
import {
  DEFAULT_ATTACHMENT_SORT,
  DEFAULT_ELEMENT_SORT,
  elementIdOf,
  isAttachmentSort,
  isElementSort,
  playStacks,
  RUN_ADD_INVISIBLE,
  RUN_ADD_SHOW_INFO,
  RUN_LIBRARY_ATTACHMENT_SORT,
  RUN_LIBRARY_ELEMENT_SORT,
  RUN_LIBRARY_SCENE_ONLY,
  DEFAULT_ELEMENT_SHOWING,
  withShowing,
  type ElementDetail,
  type PlayItem,
  type RunLibrarySource,
  type RunPlaySpace,
  type RunScene,
  type RunSession,
} from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { EMPTY_SCENE_TEXT, SCENE_LOCKED_STATUS } from "@/lib/scenes";
import type { StackRename } from "@/lib/stack-schemas";
import { cssUrlValue, sessionHeading } from "@/lib/stories";
import {
  sa_getRunPlaySpace,
  sa_linkSceneElement,
  sa_setSceneText,
} from "@/app/(app)/run/[id]/actions";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { useUser } from "@/components/auth/user-provider";
import { toaster } from "@/components/ui/toaster";
import { canSeeDiagnostics } from "@/lib/diagnostics";
import { PlayCharacterSpace } from "@/components/play/play-character-space";
import { PlayChat } from "@/components/play/play-chat";
import { PlayDiagnostics } from "@/components/play/play-diagnostics";
import { PlayHeader } from "@/components/play/play-header";
import { PlayPanelToggle } from "@/components/play/play-panel-toggle";
import { SceneTextPopover } from "@/components/play/scene-text-popover";
import { useStoryChannel } from "@/components/play/use-story-channel";
import { RunLibrary } from "./run-library";
import { RunLibrarySortMenu } from "./run-library-sort-menu";
import { RunPlayStack } from "./run-play-stack";
import { RunSceneSelect } from "./run-scene-select";
import { RunSessionTitle } from "./run-session-title";
import { RunStackSelect } from "./run-stack-select";
import { RunManageStacksDialog } from "./run-manage-stacks-dialog";
import { PrepIconButton } from "@/components/prep/prep-icon-button";
import { StatusPill } from "@/components/status/status-pill";

// The storyteller's own preference keys, apart from a player's play.* ones:
// the two tables are laid out for different jobs, and the storyteller who
// also plays in someone else's story keeps each the way they left it. The
// library starts open, since it is what this table is for.
const SHOW_LIBRARY = "run.showLibrary";
const SHOW_CHAT = "run.showChat";
const SHOW_CHARACTER = "run.showCharacter";
const SHOW_DIAGNOSTICS = "run.showDiagnostics";

const LIBRARY_ID = "run-panel-library";
const CHAT_ID = "run-panel-chat";
const CHARACTER_ID = "run-panel-character";
const DIAGNOSTICS_ID = "run-panel-diagnostics";

// This table publishes and does not listen; nothing here changes on a
// message. The channel is opened for the diagnostics panel alone.
const ignoreEvent = () => {};

type Props = {
  idStory: number;
  /** The story being run, shown in the header. */
  title: string;
  /**
   * The story's cover, behind the play space while the table is on no scene
   * or on one without a cover of its own.
   */
  storyCoverUrl: string | null;
  /** The session being played, or null when there is none. */
  session: RunSession | null;
  /** The scene the table opens on, and what the play space holds for it. */
  initialSpace: RunPlaySpace;
  /** The story_scenes workflow, for the scene selector's statuses. */
  sceneStatusOptions: StatusOption[];
  /** The story_sessions workflow, for the chip beside the session's title. */
  sessionStatusOptions: StatusOption[];
};

// The storyteller's table, /run/[id]: the player's table (PlayTable) with the
// story's library down the left. It began as a copy of PlayTable rather than
// a mode of it, so that what only the storyteller may see lives in a page and
// a component a player never loads; the page proves the caller owns the
// story before drawing any of it.
//
// The play space opens with the scene the session is on and the elements
// brought into it (sa_getRunPlaySpace), in one stack per scene tag with the
// scene's cover behind them. A stack's + makes a new element filed under
// its tag, and the library's arrow links an element to the scene under the
// first stack's tag; both are saved, tag and all, so a reload puts each
// back in its stack. An element added with no scene at the table is kept
// in this page's state only, so it is the storyteller's alone; showing it
// to the players is for when the table has somewhere shared to keep it.
// The scene selector in the header, beside the session and its status chip,
// moves the table to another scene, which replaces the play space with that
// scene's; the scene's status chip sits beside the selector. The session's
// chip is a menu too: pausing or ending the session from it takes the
// table down and goes back to the story's page, which is where a paused
// session is resumed. The scene's title stands in the play space's upper
// right.
//
// Every change made here is published on the story's MQTT topic for the
// players' table (lib/realtime/publish-scene.ts). The diagnostics panel, in
// the chat's place as on the players' table, listens to that same topic so
// the storyteller can see each change go out.
export function RunTable({
  idStory,
  title,
  storyCoverUrl,
  session,
  initialSpace,
  sceneStatusOptions,
  sessionStatusOptions,
}: Props) {
  const user = useUser();
  const preferences = useUserPreferences();
  const diagnosticsOffered = canSeeDiagnostics(user.idUserType);
  const channel = useStoryChannel(idStory, ignoreEvent, ignoreEvent, diagnosticsOffered);
  const router = useRouter();
  const [scene, setScene] = useState<RunScene | null>(initialSpace.scene);
  // The library's tab, held here for the sort menu beside its heading.
  const [libraryTab, setLibraryTab] = useState<RunLibrarySource>("ATTACHMENT");
  // The session's status as its chip last moved it; the page loaded it.
  const [sessionStatus, setSessionStatus] = useState(session?.status ?? null);
  const [tags, setTags] = useState<string[]>(initialSpace.tags);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialSpace.coverUrl);
  const [inPlay, setInPlay] = useState<PlayItem[]>(initialSpace.inPlay);
  // The library's In select: the stack what the library adds goes in. Held
  // as a name and checked against the scene's stacks on every render, so a
  // new scene, or the chosen stack taken off this one, falls back to the
  // first stack without anything having to reset it.
  const [chosenStack, setChosenStack] = useState<string | null>(null);
  const inStack =
    chosenStack !== null && tags.includes(chosenStack) ? chosenStack : (tags[0] ?? null);
  const [managingStacks, setManagingStacks] = useState(false);
  // The pill whose picture the storyteller last put up on the players'
  // table from its tack, by key, or null for none. This page's alone: the
  // pulse that put it up was not written anywhere, so a reload starts from
  // none, and so does another scene.
  const [pictureUpKey, setPictureUpKey] = useState<string | null>(null);
  // A complete scene is the record of what was played: nothing goes into it
  // or comes out of it (the actions refuse too), and the play space says so.
  const isComplete = scene?.status === SCENE_LOCKED_STATUS;
  // What is behind the play space: the scene's cover, or the story's when
  // there is no scene or the scene has none, so the space is never bare
  // while the story has a picture. coverUrl stays the scene's alone, since
  // the library's Cover buttons set and clear it.
  const shownCoverUrl = coverUrl ?? storyCoverUrl;

  const loadSpace = (space: RunPlaySpace) => {
    setScene(space.scene);
    setTags(space.tags);
    setCoverUrl(space.coverUrl);
    setInPlay(space.inPlay);
    setPictureUpKey(null);
  };

  // The reload at the scene's title: the space read again as the database
  // holds it now, for a change made elsewhere (a player untapping a card,
  // another window) that the table has not heard of. Hidden while it is
  // out, so a second press cannot send it twice.
  const [reloading, setReloading] = useState(false);
  async function reloadSpace() {
    setReloading(true);
    try {
      loadSpace(await sa_getRunPlaySpace(idStory));
    } catch {
      toaster.create({ title: "The scene could not be reloaded. Try again.", type: "error" });
    } finally {
      setReloading(false);
    }
  }

  // Nothing can be played until a session is, so the storyteller is told as
  // the table opens. The ref keeps React's development double mount from
  // raising it twice.
  const toldNoSession = useRef(false);
  useEffect(() => {
    if (toldNoSession.current) return;
    if (session === null) {
      toldNoSession.current = true;
      toaster.create({ title: "There is no active session.", type: "error" });
    } else if (session.status === "SUSPENDED") {
      // A table opened on a pause: the session is there to resume from the
      // chip, so it is named as paused rather than missing.
      toldNoSession.current = true;
      toaster.create({ title: "This session is suspended.", type: "info" });
    }
  }, [session]);

  const showLibrary = preferences.get<boolean>(SHOW_LIBRARY, true);
  const showChat = preferences.get<boolean>(SHOW_CHAT, false);
  const showCharacter = preferences.get<boolean>(SHOW_CHARACTER, false);
  const showDiagnostics = diagnosticsOffered && preferences.get<boolean>(SHOW_DIAGNOSTICS, false);
  // The library's Add as invisible switch; a stack's + reads it too, for
  // where its new element starts.
  const addInvisible = preferences.get<boolean>(RUN_ADD_INVISIBLE, false);
  // The library's Add showing info switch, read the same two ways: whether
  // the players see a new element's description.
  const addShowInfo = preferences.get<boolean>(RUN_ADD_SHOW_INFO, false);
  // The library's All / Scene only switch, kept as a preference like the
  // one above. Only on while there is a scene to narrow to.
  const sceneOnly = preferences.get<boolean>(RUN_LIBRARY_SCENE_ONLY, false) && scene !== null;
  // The library's sorts, one for its Attachments tab and one for the element
  // tabs, each falling back to the default on a value the menu no longer
  // offers.
  const storedAttachmentSort = preferences.get<string>(RUN_LIBRARY_ATTACHMENT_SORT, "");
  const attachmentSort = isAttachmentSort(storedAttachmentSort)
    ? storedAttachmentSort
    : DEFAULT_ATTACHMENT_SORT;
  const storedElementSort = preferences.get<string>(RUN_LIBRARY_ELEMENT_SORT, "");
  const elementSort = isElementSort(storedElementSort) ? storedElementSort : DEFAULT_ELEMENT_SORT;

  // An item already in play stays where it is rather than going in twice.
  const put = (item: PlayItem) =>
    setInPlay((current) =>
      current.some((existing) => existing.key === item.key) ? current : [...current, item],
    );

  // The library's arrow. An element is linked to the scene first, under the
  // In select's stack, and goes in as the link came back, with whatever tags
  // it already had there.
  async function add(item: PlayItem) {
    if (isComplete || inPlay.some((existing) => existing.key === item.key)) return;
    if (scene === null) {
      put(item);
      return;
    }
    const idElement = elementIdOf(item);
    try {
      const result = await sa_linkSceneElement(idStory, scene.idStoryScene, idElement, {
        hidden: addInvisible,
        tag: inStack,
        showInfo: addShowInfo,
      });
      if (result.ok) put(result.item);
      else toaster.create({ title: result.error, type: "error" });
    } catch {
      toaster.create({ title: "The element could not be added. Try again.", type: "error" });
    }
  }
  const remove = (key: string) =>
    setInPlay((current) => current.filter((existing) => existing.key !== key));
  // An element taken out of the scene from the library's panel. Matched by
  // its id, as replace does, not by the library's key: that carries the kind
  // the library lists it under, which is not the pill's if the kind was
  // changed after the pill went into play.
  const removeElement = (idElement: number) =>
    setInPlay((current) =>
      current.filter(
        (existing) => existing.kind === "ATTACHMENT" || elementIdOf(existing) !== idElement,
      ),
    );
  // An item edited or moved from its info popover, in place. Matched by its
  // element id rather than its key, which carries the kind: an edit that
  // changes the kind comes back under a new key.
  const replace = (item: PlayItem) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === elementIdOf(item)
          ? item
          : existing,
      ),
    );
  // An element's picture changed from the library's info popover: its pill,
  // if it is in play, shows the new one.
  const setImage = (idElement: number, imageUrl: string | null) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.kind !== "ATTACHMENT" && elementIdOf(existing) === idElement
          ? { ...existing, imageUrl }
          : existing,
      ),
    );
  // An element edited from the library's info popover: its pill, if it is
  // in play, takes the new fields, keeps the field it was showing, and moves
  // under its new kind's key if the kind changed.
  const editElement = (element: ElementDetail) =>
    setInPlay((current) =>
      current.map((existing) => {
        if (existing.kind === "ATTACHMENT" || elementIdOf(existing) !== element.idElement) {
          return existing;
        }
        const moved: PlayItem = {
          ...existing,
          key: `${element.kind}:${element.idElement}`,
          kind: element.kind as PlayItem["kind"],
          imageUrl: element.imageUrl,
        };
        // Something the page alone holds has no fields to choose among.
        if (!existing.fields) return { ...moved, label: element.name, detail: element.title };
        return withShowing(
          {
            ...moved,
            fields: {
              initial_name: element.initialName,
              name: element.name,
              title: element.title,
            },
          },
          existing.showing ?? DEFAULT_ELEMENT_SHOWING,
        );
      }),
    );
  // Manage stacks saved: the scene's stacks as they now are. A renamed stack
  // takes its pills with it, as the action took their links, and the In
  // select follows a stack it had chosen; one taken away leaves its pills
  // filed under the old name, so they fall into the first stack.
  const saveStacks = (next: string[], renames: StackRename[]) => {
    const renamed = (tag: string) => renames.find((rename) => rename.from === tag)?.to ?? tag;
    setTags(next);
    if (renames.length > 0) {
      setInPlay((current) =>
        current.map((existing) =>
          existing.sceneTags
            ? { ...existing, sceneTags: existing.sceneTags.map(renamed) }
            : existing,
        ),
      );
      setChosenStack((current) => (current === null ? current : renamed(current)));
    }
  };
  const setStatus = (key: string, status: string) =>
    setInPlay((current) =>
      current.map((existing) =>
        existing.key === key ? { ...existing, sceneStatus: status } : existing,
      ),
    );
  // A pill's tack: the picture goes up, or comes down if it is the one up.
  // One picture is up on the players' table at a time (their preview is one
  // dialog, and a fresh open swaps it), so the one key says which pill
  // glows, and another's going up takes this glow with it.
  const setPictureUp = (key: string, up: boolean) =>
    setPictureUpKey((current) => (up ? key : current === key ? null : current));

  const toggles = (
    <HStack gap="1">
      <PlayPanelToggle
        label="Library"
        controls={LIBRARY_ID}
        isOpen={showLibrary}
        onToggle={() => preferences.set(SHOW_LIBRARY, !showLibrary)}
      >
        <BookOpen />
      </PlayPanelToggle>
      <PlayPanelToggle
        label="Character"
        controls={CHARACTER_ID}
        isOpen={showCharacter}
        onToggle={() => preferences.set(SHOW_CHARACTER, !showCharacter)}
      >
        <UserRound />
      </PlayPanelToggle>
      <PlayPanelToggle
        label="Chat"
        controls={CHAT_ID}
        isOpen={showChat}
        onToggle={() => preferences.set(SHOW_CHAT, !showChat)}
      >
        <MessageSquare />
      </PlayPanelToggle>
      {diagnosticsOffered && (
        <PlayPanelToggle
          label="Diagnostics"
          controls={DIAGNOSTICS_ID}
          isOpen={showDiagnostics}
          onToggle={() => preferences.set(SHOW_DIAGNOSTICS, !showDiagnostics)}
        >
          <Activity />
        </PlayPanelToggle>
      )}
    </HStack>
  );

  // Diagnostics stands in for the chat rather than beside it, as on the
  // players' table: the chat's preference is left as it is.
  const rightPanel = showDiagnostics ? (
    <PlayDiagnostics id={DIAGNOSTICS_ID} channel={channel} />
  ) : showChat ? (
    <PlayChat id={CHAT_ID} />
  ) : null;

  return (
    <Flex direction="column" h="100vh">
      <PlayHeader
        title={title}
        session={session ? sessionHeading(session) : null}
        sessionContent={session && <RunSessionTitle idStory={idStory} session={session} />}
        center={toggles}
        afterSession={
          <HStack gap="1" flexShrink="0">
            {/* The session's status as a chip beside its title, and the
                way to pause, resume or end it. Pausing keeps the storyteller
                at the table: a pause is a break in play, and the same chip
                resumes it. Ending asks first and takes the table down, since
                an ended session has nothing left to run, so the storyteller
                goes back to the story's page. */}
            {session && sessionStatus !== null && (
              <StatusPill
                table="story_sessions"
                id={session.idStorySession}
                status={sessionStatus}
                options={sessionStatusOptions}
                canEdit
                tooltip="Set session status"
                confirm={(next) => {
                  if (next === "DONE") {
                    return {
                      title: "End this session?",
                      body: "The session is over and the table closes. Carrying the story on means starting a new session from the story's page.",
                      confirmLabel: "End session",
                    };
                  }
                  if (next === "SUSPENDED") {
                    return {
                      title: "Suspend this session?",
                      body: "Play stops for a break. The table stays open, and this menu resumes the session.",
                      confirmLabel: "Suspend session",
                    };
                  }
                  return null;
                }}
                onChanged={(status) => {
                  setSessionStatus(status);
                  if (status === "DONE") router.push(`/stories/${idStory}`);
                }}
              />
            )}
            <RunSceneSelect
              idStory={idStory}
              scene={scene}
              hasSession={session !== null}
              statusOptions={sceneStatusOptions}
              onLoaded={loadSpace}
            />
            {/* The scene's status beside the selector. Keyed by the scene,
                so moving to another starts from that scene's status. It
                stays a menu on a complete scene, as the workflow allows:
                moving it back lifts the overlay and the locks, which all
                follow the status. Completing a scene and resuming one each
                ask first. */}
            {scene && (
              <StatusPill
                key={scene.idStoryScene}
                table="story_scenes"
                id={scene.idStoryScene}
                status={scene.status}
                options={sceneStatusOptions}
                canEdit
                tooltip="Set scene status"
                confirm={(next) => {
                  if (next === SCENE_LOCKED_STATUS) {
                    return {
                      title: "Complete this scene?",
                      body: "A complete scene is locked: nothing can be added to it or taken out of it. To carry on the story, start a new scene.",
                      confirmLabel: "Complete scene",
                    };
                  }
                  // Leaving complete undoes a scene the storyteller
                  // finished, so it asks too.
                  if (isComplete) {
                    const label =
                      sceneStatusOptions.find((option) => option.key === next)?.label ?? next;
                    return {
                      title: "Resume this scene?",
                      body: `This scene is complete. Resuming it makes it ${label.toLowerCase()} again, so its elements and stacks can be changed.`,
                      confirmLabel: "Resume scene",
                    };
                  }
                  return null;
                }}
                onChanged={(status) =>
                  setScene((current) => (current ? { ...current, status } : current))
                }
              />
            )}
          </HStack>
        }
      />

      {/* minH 0 all the way down, so each panel scrolls inside itself
          instead of stretching the page past the window. */}
      <Flex flex="1" minH="0">
        {showLibrary && (
          <Box
            as="section"
            id={LIBRARY_ID}
            aria-labelledby="run-library-heading"
            w={{ base: "72", md: "sm" }}
            flexShrink="0"
            minH="0"
            display="flex"
            flexDirection="column"
            gap="3"
            p="4"
            borderRightWidth="1px"
            bg="bg.subtle"
          >
            {/* The sort menu beside the heading, and All / Scene only at the
                far end: how and what the library lists. With no scene at the
                table there is only All. */}
            <HStack justify="space-between" gap="2">
              <HStack gap="1">
                <Heading id="run-library-heading" size="sm">
                  Library
                </Heading>
                <RunLibrarySortMenu
                  tab={libraryTab}
                  attachmentSort={attachmentSort}
                  elementSort={elementSort}
                  onAttachmentSortChange={(sort) =>
                    preferences.set(RUN_LIBRARY_ATTACHMENT_SORT, sort)
                  }
                  onElementSortChange={(sort) => preferences.set(RUN_LIBRARY_ELEMENT_SORT, sort)}
                />
              </HStack>
              <SegmentGroup.Root
                size="xs"
                aria-label="Which elements"
                value={sceneOnly ? "SCENE" : "ALL"}
                onValueChange={(details) =>
                  preferences.set(RUN_LIBRARY_SCENE_ONLY, details.value === "SCENE")
                }
              >
                <SegmentGroup.Indicator />
                <SegmentGroup.Items
                  items={[
                    { value: "ALL", label: "All" },
                    { value: "SCENE", label: "Scene only", disabled: scene === null },
                  ]}
                />
              </SegmentGroup.Root>
            </HStack>
            {/* A column, so the library takes the height left between the
                heading and the footer as a flex item rather than through a
                percentage height, and its results scroll inside it. */}
            <Box flex="1" minH="0" display="flex" flexDirection="column">
              <RunLibrary
                idStory={idStory}
                idStoryScene={scene?.idStoryScene ?? null}
                tab={libraryTab}
                onTabChange={setLibraryTab}
                attachmentSort={attachmentSort}
                elementSort={elementSort}
                sceneOnly={sceneOnly}
                onAdd={(item) => void add(item)}
                onRemovedFromScene={removeElement}
                onCreated={put}
                onImageChange={setImage}
                onElementEdited={editElement}
                onItemChange={replace}
                onSceneStatusChange={setStatus}
                stackTag={inStack}
                sceneStacks={tags}
                locked={isComplete}
                onSceneCoverChange={setCoverUrl}
              />
            </Box>
            {/* Below the list and outside its scroll, under a rule: the
                switch is about how anything goes into the scene, not about
                what the list shows, so it stays in reach however far the
                list has scrolled. */}
            <Stack gap="3" flexShrink="0">
              <Separator />
              {/* How and where the library adds: on the left hidden or not
                  and with or without its info, and on the right which stack,
                  with the gear beside it for the stacks themselves. The
                  stack controls need a scene. */}
              <HStack justify="space-between" gap="2" minW="0">
                <HStack gap="3" wrap="wrap" flexShrink="0">
                  <Switch.Root
                    checked={addInvisible}
                    onCheckedChange={(details) =>
                      preferences.set(RUN_ADD_INVISIBLE, details.checked)
                    }
                    size="sm"
                  >
                    {/* Chakra renders a checkbox input; role="switch" is the
                        ARIA pattern for an on/off toggle and what tests query. */}
                    <Switch.HiddenInput role="switch" />
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Label>Add as invisible</Switch.Label>
                  </Switch.Root>
                  <Switch.Root
                    checked={addShowInfo}
                    onCheckedChange={(details) =>
                      preferences.set(RUN_ADD_SHOW_INFO, details.checked)
                    }
                    size="sm"
                  >
                    <Switch.HiddenInput role="switch" />
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Label>Add showing info</Switch.Label>
                  </Switch.Root>
                </HStack>
                {scene !== null && !isComplete && (
                  <HStack gap="0" minW="0">
                    <RunStackSelect
                      idStory={idStory}
                      idStoryScene={scene.idStoryScene}
                      tags={tags}
                      value={inStack}
                      onChange={setChosenStack}
                      onTagsChange={setTags}
                    />
                    <PrepIconButton label="Manage stacks" onClick={() => setManagingStacks(true)}>
                      <Settings />
                    </PrepIconButton>
                    <RunManageStacksDialog
                      idStory={idStory}
                      idStoryScene={scene.idStoryScene}
                      tags={tags}
                      open={managingStacks}
                      onClose={() => setManagingStacks(false)}
                      onSaved={saveStacks}
                    />
                  </HStack>
                )}
              </HStack>
            </Stack>
          </Box>
        )}

        <Flex direction="column" flex="1" minW="0">
          {/* The cover sits behind the scrolling part, so it stays put while
              the stacks scroll over it. */}
          <Box
            as="section"
            aria-labelledby="play-space-heading"
            position="relative"
            flex="1"
            minH="0"
          >
            {shownCoverUrl && (
              <>
                <Box
                  aria-hidden
                  data-testid="play-space-cover"
                  position="absolute"
                  inset="0"
                  bgSize="cover"
                  bgPos="center"
                  style={{ backgroundImage: `url("${cssUrlValue(shownCoverUrl)}")` }}
                />
                <Box aria-hidden position="absolute" inset="0" bg="blackAlpha.400" />
              </>
            )}
            <Stack position="relative" h="full" overflowY="auto" gap="3" p="4">
              {/* With a scene loaded, the scene is what the space is about:
                  its title stands in the upper left, on the panel colour,
                  part see-through, as the pills are, so it reads over the
                  cover, with the reload before it and the chevron that
                  opens its description and notes after. The region's own
                  heading stays for a screen reader, which names the region
                  by it. */}
              {scene === null ? (
                <Heading id="play-space-heading" size="sm">
                  Play space
                </Heading>
              ) : (
                <>
                  <Heading id="play-space-heading" srOnly>
                    Play space
                  </Heading>
                  <HStack
                    gap="1"
                    alignSelf="flex-start"
                    maxW="full"
                    rounded="2xl"
                    bg="bg.panel/55"
                    backdropFilter="blur(6px)"
                    ps="1"
                    pe="1"
                    py="1"
                  >
                    {!reloading && (
                      <PrepIconButton label="Reload the scene" onClick={() => void reloadSpace()}>
                        <RefreshCw />
                      </PrepIconButton>
                    )}
                    <Heading as="h2" size="md" minW="0" truncate title={scene.title}>
                      {scene.title}
                    </Heading>
                    <SceneTextPopover
                      title={scene.title}
                      text={scene.text ?? EMPTY_SCENE_TEXT}
                      save={(values) => sa_setSceneText(idStory, scene.idStoryScene, values)}
                      onSaved={(text) =>
                        setScene((current) => (current ? { ...current, text } : current))
                      }
                      readOnly={isComplete}
                    />
                  </HStack>
                </>
              )}
              {/* space-between: the first stack against the left edge and
                  the rest spread across the width. */}
              <Flex gap="3" wrap="wrap" align="flex-start" justify="space-between">
                {playStacks(tags, inPlay).map((stack) => (
                  <RunPlayStack
                    key={stack.title}
                    idStory={idStory}
                    stack={stack}
                    sceneTags={tags}
                    idStoryScene={scene?.idStoryScene ?? null}
                    onCreated={put}
                    onRemove={remove}
                    onStatusChange={setStatus}
                    onItemChange={replace}
                    pictureUpKey={pictureUpKey}
                    onPictureUpChange={setPictureUp}
                    locked={isComplete}
                  />
                ))}
              </Flex>
            </Stack>
            {/* Over the stacks, saying so, but letting the pointer through:
                the pills' panels and the scene's text are still there to
                read, and the pills themselves (locked) offer nothing that
                changes the scene. */}
            {/* A suspended session says so in the same way, pale where the
                complete scene is dark, so the two read as different things.
                It takes the complete scene's place rather than stacking on
                it: the break in play is the more recent news. Nothing at the
                table changes while it is up (the actions refuse a paused
                session), and the chip that resumes it is in the header,
                outside the overlay. */}
            {sessionStatus === "SUSPENDED" ? (
              <Flex
                position="absolute"
                inset="0"
                align="center"
                justify="center"
                bg="whiteAlpha.500"
                pointerEvents="none"
                data-testid="session-suspended-overlay"
              >
                <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="gray.900">
                  SUSPENDED
                </Text>
              </Flex>
            ) : (
              isComplete && (
                <Flex
                  position="absolute"
                  inset="0"
                  align="center"
                  justify="center"
                  bg="blackAlpha.600"
                  pointerEvents="none"
                  data-testid="scene-complete-overlay"
                >
                  <Text fontSize="5xl" fontWeight="bold" letterSpacing="widest" color="white">
                    COMPLETE
                  </Text>
                </Flex>
              )
            )}
          </Box>

          {showCharacter && (
            <Box flexBasis="40%" flexShrink="0" minH="0" overflowY="auto" borderTopWidth="1px">
              <PlayCharacterSpace id={CHARACTER_ID} />
            </Box>
          )}
        </Flex>

        {rightPanel && (
          <Box
            w={{ base: "72", md: "sm" }}
            flexShrink="0"
            minH="0"
            borderLeftWidth="1px"
            bg="bg.subtle"
          >
            {rightPanel}
          </Box>
        )}
      </Flex>
    </Flex>
  );
}
