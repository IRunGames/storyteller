"use client";

import { useState } from "react";
import type { StatusOption } from "@/lib/status";
import type { StorySessionDetail } from "@/lib/stories";
import { SessionDetail } from "./session-info-popover";

type Props = {
  initial: StorySessionDetail;
  sessionStatusOptions: StatusOption[];
  sceneStatusOptions: StatusOption[];
};

// The session's own page, under its heading: the popover's body, holding the
// detail in state so the pill's move shows without a reload. Whether the
// pill is a menu is the detail's isStoryteller, as in the popover.
export function SessionPageDetail({ initial, sessionStatusOptions, sceneStatusOptions }: Props) {
  const [detail, setDetail] = useState(initial);
  return (
    <SessionDetail
      detail={detail}
      sessionStatusOptions={sessionStatusOptions}
      sceneStatusOptions={sceneStatusOptions}
      onStatusChanged={(status) => setDetail((current) => ({ ...current, status }))}
    />
  );
}
