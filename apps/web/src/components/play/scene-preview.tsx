"use client";

import { Badge, Flex } from "@chakra-ui/react";
import type { PlayScene } from "@/lib/play-scene";
import { PlayHeader } from "./play-header";
import { PlaySpace } from "./play-space";

type Props = {
  idStory: number;
  /** The story the scene belongs to, shown in the header. */
  title: string;
  scene: PlayScene;
};

/**
 * /preview/scene/[id]: one scene as the players' table shows the scene
 * being played, and nothing more. The tables' header with Preview in the
 * middle where the table has its panel toggles, then the play space read
 * only (PlaySpace readOnly): the pills' info and the scene's text open to
 * read, and nothing on the page writes. No chat, no character space, no
 * live connection: it is a look, not a seat at the table.
 */
export function ScenePreview({ idStory, title, scene }: Props) {
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
