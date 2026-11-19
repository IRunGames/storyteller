"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Grid, HStack, Text } from "@chakra-ui/react";
import { Image as ImageIcon } from "lucide-react";
import type { SceneItem } from "@/lib/scene-elements";
import type { RunScene } from "@/lib/run";
import type { StatusOption } from "@/lib/status";
import { EMPTY_SCENE_TEXT, type SceneSessionOption } from "@/lib/scenes";
import { SCENE_LOCKED_STATUS } from "@/lib/status";
import { useWideStacks } from "@/components/run/use-wide-stacks";
import { SceneItemsProvider } from "@/components/table-shell/scene-items-context";
import { useSceneItems } from "@/components/table-shell/use-scene-items";
import { TableLibraryPanel } from "@/components/table-shell/table-library-panel";
import { TablePlaySpace, TableStacks } from "@/components/table-shell/table-play-space";
import { TableShell } from "@/components/table-shell/table-shell";
import { sa_clearLiveSceneCover } from "@/components/live/actions";
import { DeleteButton } from "@/components/confirm/delete-button";
import { PlayHeader } from "@/components/play/play-header";
import { SceneCompleteOverlay } from "@/components/table-shell/scene-state-overlay";
import { StoryTitleMenu } from "@/components/stories/story-title-menu";
import { SceneTextPopover } from "@/components/play/scene-text-popover";
import { StatusPill } from "@/components/status/status-pill";
import { LiveSceneSelect } from "./live-scene-select";
import { LiveSessionSelect } from "./live-session-select";
import { glass } from "@/theme";

const LIBRARY_ID = "live-panel-library";

type Props = {
  idStory: number;
  /** The story the scene belongs to, shown in the header. */
  title: string;
  /** The scene being edited, as sa_getScenePlaySpace read it. */
  scene: RunScene;
  /** The scene's stacks, its cover, and the elements brought into it. */
  initialTags: string[];
  initialCoverUrl: string | null;
  initialInPlay: SceneItem[];
  /** The stacks widened to the whole play space (story_scenes.wide_tags). */
  initialWideTags?: string[];
  /** The story's sittings, for the header's session select. */
  sessions: SceneSessionOption[];
  /** The sitting the scene was played in, or null for none. */
  idStorySession: number | null;
  /** The story_scenes workflow, for the scene's status chip. */
  sceneStatusOptions: StatusOption[];
};

// A scene's live-edit page, /stories/[id]/scenes/[idScene], behind the
// pencil on the library's scene cards: the run page's table (RunTable) for
// one scene, so a scene is prepared with the very library, stacks and pills
// it is played with, and each change is saved and published as the run
// page's are. The frame, the library and the play space are the shared
// table's (components/table-shell).
//
// What makes it a page for one scene rather than a table to play at: it is
// opened on that scene, and the scene's status chip sits beside its title in
// the play space. The header's middle is a scene selector of its own
// (LiveSceneSelect): status pills, a Sessions filter, a box to type a scene's
// name into, and a + beside it. Choosing a scene opens its live-edit page, and
// the + makes one to prepare and opens it, the session left where it was
// either way. The header's session is a select of the story's sittings, for
// the one the scene was played in, rather than the session being played,
// and no session need be running to open it. The panels a table has for
// play (the character sheet, the chat, the diagnostics) and the toggles that
// opened them are gone, and the library is always open. The panel behind the
// scene's title renames the scene too, and says under Notes that the
// players write there as well. There is no reload: nothing moves the scene
// from under this page but the storyteller's own changes here. The pills'
// thumbnails have no tack either: putting a picture up on the players' table
// is done at the run page's table, not while a scene is being edited.
export function LiveTable({
  idStory,
  title,
  scene: initialScene,
  initialTags,
  initialCoverUrl,
  initialInPlay,
  initialWideTags,
  sessions,
  idStorySession,
  sceneStatusOptions,
}: Props) {
  const router = useRouter();
  const openScene = (idStoryScene: number) =>
    router.push(`/stories/${idStory}/scenes/${idStoryScene}`);
  const [scene, setScene] = useState<RunScene>(initialScene);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  // Bumped when the scene's pictures change outside the library, from the
  // editor's Pictures or the cover icon, so the library reads them again.
  const [picturesVersion, setPicturesVersion] = useState(0);
  const picturesChanged = () => setPicturesVersion((version) => version + 1);
  // What is in the play space and every way it changes, handed down to the
  // stacks, the pills and the library through SceneItemsProvider.
  const sceneItems = useSceneItems(initialInPlay);
  // The stacks widened to the whole space, the scene's own, so every table
  // draws them the same (useWideStacks).
  const wideStacks = useWideStacks(idStory, scene.idStoryScene, initialWideTags);
  // A complete scene is the record of what was played: nothing goes into it
  // or comes out of it (the actions refuse too), and the play space says so.
  const isComplete = scene.status === SCENE_LOCKED_STATUS;

  return (
    <SceneItemsProvider value={sceneItems}>
      <TableShell
        header={
          <PlayHeader
            title={title}
            titleContent={
              <StoryTitleMenu
                idStory={idStory}
                title={title}
                isStoryteller
                as="span"
                size="lg"
                fontWeight="medium"
              />
            }
            // A string so the header draws its session slot; the select is
            // what shows in it.
            session=""
            sessionContent={
              <LiveSessionSelect
                idStory={idStory}
                idStoryScene={scene.idStoryScene}
                sessions={sessions}
                initial={idStorySession}
                locked={isComplete}
              />
            }
            center={
              <LiveSceneSelect
                idStory={idStory}
                scene={scene}
                sessions={sessions}
                statusOptions={sceneStatusOptions}
                onChoose={openScene}
              />
            }
          />
        }
        left={
          <TableLibraryPanel
            id={LIBRARY_ID}
            width="md"
            idStory={idStory}
            scene={scene}
            tags={tags}
            onTagsChange={setTags}
            locked={isComplete}
            onCoverChange={setCoverUrl}
            attachmentsVersion={picturesVersion}
          />
        }
      >
        {/* Over the stacks, saying so, but letting the pointer through:
            the pills' panels and the scene's text are still there to
            read, and the status chip to move the scene back. */}
        <TablePlaySpace coverUrl={coverUrl} overlay={isComplete && <SceneCompleteOverlay />}>
          {/* The top line: the scene's title at the start on the panel
              colour, part see-through, as the run page has it, with its
              status chip after it and the chevron that opens its title,
              description and notes at the end; and PREVIEWING in the
              middle of the line, on the same colour, since this page
              shows the scene as the players' table will without being
              that table, and a storyteller with both open should never
              mistake one for the other. A grid of three columns rather
              than a row, so the word sits at the centre of the line
              whatever the title's length, which the first column truncates
              as before. The chip stays a menu on a complete scene, as the
              workflow allows: moving it back lifts the overlay and the
              locks, which all follow the status. */}
          <Grid templateColumns="1fr auto 1fr" alignItems="center" gap="3">
            <HStack
              gap="1"
              justifySelf="start"
              maxW="full"
              minW="0"
              rounded="2xl"
              css={glass}
              ps="3"
              pe="1"
              py="1"
            >
              {/* The title is the popover's own trigger, the chevron after
                  it, so the chip follows them. */}
              <SceneTextPopover
                asTitle
                idStory={idStory}
                idStoryScene={scene.idStoryScene}
                title={scene.title}
                text={scene.text ?? EMPTY_SCENE_TEXT}
                saver="live"
                onSaved={(text, savedTitle) =>
                  setScene((current) => ({
                    ...current,
                    text,
                    title: savedTitle ?? current.title,
                  }))
                }
                readOnly={isComplete}
                editTitle
                notesHint="The players can edit this box too."
                pictures={{
                  idStory,
                  idStoryScene: scene.idStoryScene,
                  onCoverChange: setCoverUrl,
                  onPicturesChange: picturesChanged,
                }}
              />
              {/* A little room before the chip, so it stands apart from the title. */}
              <Box mx="1.5" flexShrink="0">
                <StatusPill
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
                        body: "A complete scene is locked: nothing can be added to it or taken out of it.",
                        confirmLabel: "Complete scene",
                      };
                    }
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
                  onChanged={(status) => setScene((current) => ({ ...current, status }))}
                />
              </Box>
            </HStack>
            <Text
              rounded="2xl"
              css={glass}
              px="3"
              py="1"
              fontSize="sm"
              fontWeight="semibold"
              letterSpacing="widest"
            >
              PREVIEWING
            </Text>
            {/* At the end of the line, the cover's icon, there only while
                the scene has a cover and is not complete, since a complete
                scene's pictures are locked with the rest of it. It asks
                first (DeleteButton, as everything taken away does), then
                takes the cover off the scene; the picture stays among the
                scene's pictures. On the same panel colour as the title,
                since it sits on the very picture it removes. */}
            {coverUrl && !isComplete && (
              <Box justifySelf="end" rounded="full" css={glass} p="0.5">
                <DeleteButton
                  thing="the cover image"
                  label="Remove cover image"
                  verb="Remove"
                  icon={<ImageIcon />}
                  onDelete={() => sa_clearLiveSceneCover(idStory, scene.idStoryScene)}
                  onDeleted={() => {
                    setCoverUrl(null);
                    picturesChanged();
                  }}
                  done="The cover image has been removed."
                  failed="The cover image could not be removed. Try again."
                >
                  The scene will show no cover until another is chosen from its pictures. The
                  picture itself stays among them.
                </DeleteButton>
              </Box>
            )}
          </Grid>
          <TableStacks
            idStory={idStory}
            idStoryScene={scene.idStoryScene}
            tags={tags}
            items={sceneItems.items}
            locked={isComplete}
            wideStacks={wideStacks}
          />
        </TablePlaySpace>
      </TableShell>
    </SceneItemsProvider>
  );
}
