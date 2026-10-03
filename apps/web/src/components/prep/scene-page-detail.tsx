"use client";

import { useState } from "react";
import { Heading, Stack } from "@chakra-ui/react";
import type { StorySceneDetail } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";
import { SceneDetail } from "./scene-info-popover";

type Props = {
  initial: StorySceneDetail;
  statusOptions: StatusOption[];
};

// The scene's own page: its heading and the popover's body, holding the
// detail in state so the pill's move shows without a reload. Only the
// storyteller ever gets this far, so the pill is always a menu.
export function ScenePageDetail({ initial, statusOptions }: Props) {
  const [detail, setDetail] = useState(initial);
  return (
    <Stack gap="6">
      <Heading as="h1" size="2xl">
        {detail.title}
      </Heading>
      <SceneDetail
        detail={detail}
        statusOptions={statusOptions}
        canEdit
        onStatusChanged={(status) => setDetail((current) => ({ ...current, status }))}
      />
    </Stack>
  );
}
