"use client";

import { chakra } from "@chakra-ui/react";
import { Droplet } from "lucide-react";

/**
 * A pill's health drop, beside the name: how full the template's health
 * indicator is on the element's link (SceneItem.health, 0 to 100), as a drop
 * filled white when full and darkening to dark red at 0 (run.healthEmpty),
 * mixed in oklab so the steps between read evenly. Outlined in fg.muted, so a
 * full, white drop still shows on a light theme. Drawn the same on the
 * storyteller's pills and the players'; a screen reader is told the level,
 * which is no more than the color says.
 */
export function HealthDrop({ level }: { level: number }) {
  const fill = `color-mix(in oklab, white ${level}%, var(--chakra-colors-run-health-empty))`;
  return (
    <chakra.span display="inline-flex" flexShrink="0" role="img" aria-label={`Health ${level}%`}>
      <Droplet
        size={18}
        fill={fill}
        color="var(--chakra-colors-fg-muted)"
        strokeWidth={1.5}
        aria-hidden
      />
    </chakra.span>
  );
}
