"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Center, IconButton, Portal, Spinner, Tooltip } from "@chakra-ui/react";
import { Eye } from "lucide-react";
import type { PlayScene } from "@/lib/play-scene";
import { sa_getStoryboardScene } from "@/app/(app)/(nav)/stories/[id]/storyboard/actions";
import { PlaySpace } from "@/components/play/play-space";
import { AttachmentPreviewDialog } from "@/components/uploads/attachment-preview";

type Props = {
  /** The DOM id the card's Elements button names in aria-controls. */
  id: string;
  idStory: number;
  idStoryScene: number;
  /** For the cover popover's name: the card's title, which the panel does not repeat. */
  title: string;
};

type Load =
  | { state: "loading" }
  | { state: "ready"; scene: PlayScene }
  // The action answered null (the scene is gone, or no longer the viewer's
  // to see) or threw; the panel says the same for both, since neither is
  // the viewer's to fix.
  | { state: "failed" };

/**
 * The lower half a scene card grows when its Elements button is pressed:
 * the scene as the players' table showed it, under the card's face. The
 * card mounts the panel only while it is open, so the panel loads the scene
 * as it mounts (sa_getStoryboardScene) rather than the board loading every
 * stack of every scene, and loads it afresh each time it is opened, as the
 * preview's page does, so a change at the table is seen without a reload.
 * Inside is the players' play space read only (PlaySpace readOnly): the
 * scene's cover behind the elements in their stacks, as the same pills the
 * play page draws, with nothing to press that writes. Without the space's
 * title row (withTitle false), since the card's face says the title and
 * holds the text; and without the table's word across a scene not in play,
 * since the card's status badge says that and the word would cover the
 * pills on every card of a player's board.
 *
 * A scene with a cover has a small eye in the panel's upper corner that
 * opens the picture full size in the same dialog a pill's thumbnail opens
 * (AttachmentPreviewDialog), since behind the stacks it is dimmed and
 * mostly covered; a scene without one has no eye. The table's eye
 * (BackgroundToggle) puts the stacks away instead, which in a panel this
 * tall would leave a strip of picture, so this one brings the picture out
 * to the reader.
 *
 * A fixed height, so the space has one to fill and scroll within, as it
 * does at the table, rather than growing the card down the page with a
 * long stack. The panel is a surface of the theme's own, not the card's
 * white-on-picture dressing, since the play space brings its own cover and
 * dimming and its pills are set for the theme's text.
 */
export function SceneElementsPanel({ id, idStory, idStoryScene, title }: Props) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [coverOpen, setCoverOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    sa_getStoryboardScene(idStoryScene)
      .then((loaded) => {
        if (cancelled) return;
        setLoad(loaded ? { state: "ready", scene: loaded } : { state: "failed" });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [idStoryScene]);

  const coverUrl = load.state === "ready" ? load.scene.coverUrl : null;

  return (
    <Box
      id={id}
      position="relative"
      h="26rem"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      bg="bg"
      color="fg"
    >
      {load.state === "loading" ? (
        <Center flex="1">
          <Spinner size="lg" />
        </Center>
      ) : load.state === "failed" ? (
        // role="alert", which Chakra's Alert does not set itself.
        <Alert.Root role="alert" status="error" m="4" w="auto">
          <Alert.Indicator />
          <Alert.Title>This scene cannot be shown right now.</Alert.Title>
        </Alert.Root>
      ) : (
        <PlaySpace
          idStory={idStory}
          scene={load.scene}
          status="connected"
          readOnly
          withStateOverlay={false}
          withTitle={false}
          onTextChange={() => {}}
          onNotesChange={() => {}}
          onStatusChange={() => {}}
          previewIdSceneElement={null}
          onPreviewClose={() => {}}
        />
      )}
      {coverUrl && (
        <>
          <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
            <Tooltip.Trigger asChild>
              {/* Above the space's own layers, whose cover and scrim are
                  positioned inside it. As faint as the table's eye, and
                  for the same reason: it sits on the picture. */}
              <IconButton
                type="button"
                aria-label="Show cover"
                size="2xs"
                variant="subtle"
                rounded="full"
                position="absolute"
                top="3"
                right="3"
                zIndex="1"
                opacity={0.6}
                backdropFilter="blur(6px)"
                _hover={{ opacity: 1 }}
                _focusVisible={{ opacity: 1 }}
                onClick={() => setCoverOpen(true)}
              >
                <Eye />
              </IconButton>
            </Tooltip.Trigger>
            <Portal>
              <Tooltip.Positioner>
                <Tooltip.Content>Show cover</Tooltip.Content>
              </Tooltip.Positioner>
            </Portal>
          </Tooltip.Root>
          {/* No tags: the cover's tags are the attachment's, not the scene's. */}
          <AttachmentPreviewDialog
            open={coverOpen}
            onOpenChange={setCoverOpen}
            url={coverUrl}
            label={title}
            tags={[]}
            isCover={false}
            showTags={false}
          />
        </>
      )}
    </Box>
  );
}
