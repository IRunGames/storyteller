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
// detail in state so the pill's move shows without a reload. The story's
// players can open it too; whether the pill is a menu and the attachment
// picker shows is the detail's isStoryteller.
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
        canEdit={detail.isStoryteller}
        onStatusChanged={(status) => setDetail((current) => ({ ...current, status }))}
      />
    </Stack>
  );
}
